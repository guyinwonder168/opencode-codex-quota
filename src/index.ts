// OpenCode Codex Quota Plugin — Entry Point
// Wires auth-reader → api-client → formatter into a single /codex_quota tool.
// PRD §8.4 (Display Mode Trigger), §8.5 (Plugin API Contract), §11.1, §11.3

import { type Plugin, type PluginModule, tool } from "@opencode-ai/plugin";
import { formatError } from "./formatter/errors.js";
import { formatQuota } from "./formatter/markdown.js";
import { queryQuota } from "./services/api-client.js";
import { readAuth } from "./services/auth-reader.js";
import type { DisplayMode } from "./types.js";

const CODEX_QUOTA_COMMAND_TEMPLATE =
  "Call the codex_quota tool now. Use mode=compact only if the user explicitly requested compact output; otherwise use mode=full. Present the tool result directly.";

const resolveDisplayMode = (mode?: string): DisplayMode =>
  mode === "compact" ? "compact" : "full";

const codexQuotaServer: Plugin = async (_input) => {
  return {
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command.codex_quota = {
        template: CODEX_QUOTA_COMMAND_TEMPLATE,
        description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
      };
    },

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
          const mode = resolveDisplayMode(args.mode);

          const authResult = await readAuth();
          if (!authResult.ok) {
            return formatError(authResult.error);
          }

          const apiResult = await queryQuota(
            authResult.value.token,
            authResult.value.accountId,
          );
          if (!apiResult.ok) {
            return formatError(apiResult.error);
          }

          return formatQuota(apiResult.value, mode);
        },
      }),
    },
  };
};

const plugin: PluginModule = {
  id: "opencode-codex-quota",
  server: codexQuotaServer,
};

export default plugin;
