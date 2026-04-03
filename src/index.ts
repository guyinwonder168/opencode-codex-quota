// OpenCode Codex Quota Plugin — Entry Point
// Wires auth-reader → api-client → formatter into a single /codex_quota tool.
// PRD §8.4 (Display Mode Trigger), §8.5 (Plugin API Contract), §11.1, §11.3

import { type Plugin, tool } from "@opencode-ai/plugin";
import { formatError } from "./formatter/errors.js";
import { formatQuota } from "./formatter/markdown.js";
import { queryQuota } from "./services/api-client.js";
import { readAuth } from "./services/auth-reader.js";
import type { DisplayMode } from "./types.js";

export const CodexQuotaPlugin: Plugin = async (_input) => {
  return {
    tool: {
      codex_quota: tool({
        description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
        args: {
          mode: tool.schema
            .string()
            .optional()
            .describe("Display mode: 'compact' or 'full'. Default: 'full'"),
        },
        async execute(args, _context) {
          const mode: DisplayMode =
            args.mode === "compact" ? "compact" : "full";

          // Step 1: Read auth credentials
          const authResult = await readAuth();
          if (!authResult.ok) {
            return formatError(authResult.error);
          }

          // Step 2: Query the ChatGPT usage API
          const apiResult = await queryQuota(
            authResult.value.token,
            authResult.value.accountId,
          );
          if (!apiResult.ok) {
            return formatError(apiResult.error);
          }

          // Step 3: Format and return
          return formatQuota(apiResult.value, mode);
        },
      }),
    },
  };
};
