---
source: GitHub (slkiser/opencode-quota, guyinwonder168/opencode-glm-quota)
library: @opencode-ai/plugin
package: @opencode-ai/plugin
topic: Reference plugin implementations
fetched: 2026-03-29T12:00:00Z
official_docs: https://opencode.ai/docs/plugins
---

# Reference Plugin Implementations

---

## 1. guyinwonder168/opencode-glm-quota — src/index.ts

**Pattern: Single-file plugin with tool definition**

This is the cleanest reference for a tool-only plugin. Key patterns:

### Import paths

```typescript
import { type Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
```

> **CRITICAL**: `tool` is imported from `@opencode-ai/plugin/tool` (subpath export),
> while `Plugin` type is from `@opencode-ai/plugin`.

### Tool definition with empty args

```typescript
export const GlmQuotaPlugin: Plugin = async () => {
  return {
    tool: {
      glm_quota: tool({
        description: 'Query Z.ai GLM Coding Plan usage statistics including quota limits, model usage, and MCP tool usage',
        args: {},
        async execute() {
          try {
            const credentials = await getCredentials();

            if (!credentials) {
              return createCredentialError();
            }

            return await queryAllUsage(credentials);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.trim().startsWith('╔') && errorMessage.includes('╚')) {
              return errorMessage;
            }

            return createBoxedError(errorMessage);
          }
        }
      })
    }
  }
};

export default GlmQuotaPlugin;
```

### Key observations from glm-quota:
1. **Named export + default export**: Both `export const GlmQuotaPlugin` and `export default GlmQuotaPlugin`
2. **`args: {}`** for tools with no arguments
3. **Return value is a formatted string** — can include Unicode box-drawing characters (╔═╗║╚╝)
4. **`execute()` receives no args when `args: {}`**
5. **Error handling** returns formatted error strings, not thrown errors

---

## 2. slkiser/opencode-quota — src/index.ts (entry point)

**Pattern: Re-export only plugin functions from entry point**

```typescript
/**
 * OpenCode Quota Plugin
 * @packageDocumentation
 */

// Main plugin export - ONLY export plugin functions from the main entry point
// OpenCode's plugin loader iterates over all exports and calls them as functions
export { QuotaToastPlugin } from "./plugin.js";

// Re-export types for consumers (types are erased at runtime, so safe to export)
export type {
  QuotaToastConfig,
  GoogleModelId,
  PricingSnapshotSource,
  CopilotEnterpriseUsageResult,
  CopilotOrganizationUsageResult,
  CopilotQuotaResult,
  GoogleQuotaResult,
  GoogleModelQuota,
} from "./lib/types.js";

// NOTE: DEFAULT_CONFIG is NOT exported here because OpenCode's plugin loader
// would try to call it as a function. Import from "./lib/types.js" directly if needed.
```

### Key observations from opencode-quota:
1. **OpenCode's plugin loader iterates over ALL exports and calls them as functions**
   - This means DO NOT export non-function values (objects, arrays, strings) from entry point
   - Only export: plugin functions, types (type-only exports), and other functions
2. **Re-export pattern**: Main plugin is in a separate file, re-exported from index.ts
3. **`export type`** is safe because types are erased at runtime
4. **Constants are NOT exported** from entry point (DEFAULT_CONFIG) to avoid being called

---

## 3. slkiser/opencode-quota — src/plugin.ts (main plugin)

**Pattern: Complex plugin with multiple hooks + tools**

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
```

> Note: This plugin imports `tool` directly from `@opencode-ai/plugin` (not the `/tool` subpath).

### Plugin with tool + multiple hooks

```typescript
export const QuotaToastPlugin: Plugin = async ({ client }) => {
  const typedClient = client as unknown as OpencodeClient;
  // ... initialization code ...

  return {
    // Event hook — subscribe to all events
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await showQuotaToast(event.properties.sessionID, "idle");
      }
      if (event.type === "session.compacted") {
        await showQuotaToast(event.properties.sessionID, "compacted");
      }
    },

    // Tool execute after hook — trigger on question tool completion
    "tool.execute.after": async (input, output) => {
      if (input.tool === "question") {
        // ... process completion ...
      }
    },

    // Custom tools (token report commands as tools)
    tool: {
      tokens_today: tool({
        description: "Token + deterministic cost summary for today",
        args: {},
        async execute(_args, context) {
          // ...
          return report;
        }
      }),
      // ... more tools ...
    },

    // Config hook — register slash commands
    config: async (input) => {
      if (input.command) {
        input.command["quota"] = {
          template: "/quota",
          description: "Show current quota status",
        };
      }
    },
  };
};
```

### injectRawOutput() — Display text without LLM invocation

```typescript
async function injectRawOutput(sessionID: string, output: string): Promise<void> {
  try {
    await typedClient.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        // ignored=true keeps this out of future model context
        // while still showing it to the user in the transcript
        parts: [{ type: "text", text: sanitizeDisplayText(output), ignored: true }],
      },
    });
  } catch (err) {
    // Log but don't fail
  }
}
```

### Toast display

```typescript
await typedClient.tui.showToast({
  body: {
    message: sanitizeDisplayText(message),
    variant: "info",  // "info" | "success" | "warning" | "error"
    duration: config.toastDurationMs,
  },
});
```

---

## 4. slkiser/opencode-quota — src/lib/opencode-auth.ts

**Pattern: Reading OpenCode's auth.json for credentials**

```typescript
import { readFile } from "fs/promises";
import { join } from "path";

// Auth file location: ~/.local/share/opencode/auth.json (Linux)
// OpenCode stores auth at `${Global.Path.data}/auth.json`

export async function readAuthFile(): Promise<AuthData | null> {
  const paths = getAuthPaths();

  for (const path of paths) {
    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as AuthData;
    } catch {
      // Try next path
    }
  }
  return null;
}

// With caching for frequently triggered code paths
export async function readAuthFileCached(params?: { maxAgeMs?: number }): Promise<AuthData | null> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? 5000);
  const now = Date.now();

  if (authCache && now - authCache.timestamp <= maxAgeMs) {
    return authCache.value;
  }
  // ... in-flight deduplication pattern ...
}
```

---

## 5. slkiser/opencode-quota — src/lib/openai.ts

**Pattern: Using auth.json OAuth tokens for API calls**

```typescript
// Auth shape from auth.json
type OpenAIOAuth = {
  type: "oauth";
  access: string;
  refresh?: string;
  expires?: number;
};

async function readOpenAIAuth(): Promise<OpenAIOAuth | null> {
  const auth = await readAuthFile();
  // Check all keys that provider recognizes
  const openai = auth?.codex ?? auth?.openai ?? auth?.chatgpt ?? auth?.opencode;
  if (!openai || openai.type !== "oauth" || !openai.access) return null;
  return openai as OpenAIOAuth;
}

// Usage: Bearer token in API calls
const headers: Record<string, string> = {
  Authorization: `Bearer ${auth.access}`,
  "User-Agent": "OpenCode-Quota-Toast/1.0",
};
```

---

## Import Path Summary

| What | Import Path |
|------|-------------|
| `Plugin` type | `import type { Plugin } from "@opencode-ai/plugin"` |
| `tool` function | `import { tool } from "@opencode-ai/plugin"` OR `import { tool } from "@opencode-ai/plugin/tool"` |
| `ToolDefinition` type | `import type { ToolDefinition } from "@opencode-ai/plugin"` |
| `Hooks` type | `import type { Hooks } from "@opencode-ai/plugin"` |
| `PluginInput` type | `import type { PluginInput } from "@opencode-ai/plugin"` |
| `ToolContext` type | `import type { ToolContext } from "@opencode-ai/plugin"` |

---

## Critical Gotchas

1. **OpenCode's plugin loader calls ALL named exports as functions**
   - Never export non-function values from your entry point
   - Use `export type` for type re-exports
   - Constants like `DEFAULT_CONFIG` must NOT be exported from index.ts

2. **`tool.schema` is the full Zod library**
   - `tool.schema.string()`, `tool.schema.number()`, `tool.schema.object({})`, etc.
   - `tool.schema.string().optional()` for optional args
   - `tool.schema.string().describe("...")` for descriptions visible to AI

3. **`execute()` must return `Promise<string>`**
   - The string is rendered in the TUI transcript
   - Can include Unicode box-drawing characters for formatted output
   - Errors should be returned as formatted error strings, not thrown

4. **Custom tools override built-in tools with same name**

5. **Plugin function receives `(input, options?)`**
   - `input` is destructured as `{ client, project, directory, worktree, serverUrl, $ }`
   - `options` is the optional `PluginOptions` from config
