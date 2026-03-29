---
source: unpkg.com (npm @opencode-ai/plugin@1.3.5)
library: @opencode-ai/plugin
package: @opencode-ai/plugin
topic: Tool type signatures (tool.d.ts)
fetched: 2026-03-29T12:00:00Z
official_docs: https://opencode.ai/docs/plugins
---

# @opencode-ai/plugin — tool.d.ts (v1.3.5)

```typescript
import { z } from "zod";

// ============================================================================
// Tool Context (passed to execute())
// ============================================================================

export type ToolContext = {
    sessionID: string;
    messageID: string;
    agent: string;
    /**
     * Current project directory for this session.
     * Prefer this over process.cwd() when resolving relative paths.
     */
    directory: string;
    /**
     * Project worktree root for this session.
     * Useful for generating stable relative paths (e.g. path.relative(worktree, absPath)).
     */
    worktree: string;
    abort: AbortSignal;
    metadata(input: {
        title?: string;
        metadata?: {
            [key: string]: any;
        };
    }): void;
    ask(input: AskInput): Promise<void>;
};

type AskInput = {
    permission: string;
    patterns: string[];
    always: string[];
    metadata: {
        [key: string]: any;
    };
};

// ============================================================================
// tool() function signature
// ============================================================================

export declare function tool<Args extends z.ZodRawShape>(input: {
    description: string;
    args: Args;
    execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
}): {
    description: string;
    args: Args;
    execute(args: z.infer<z.ZodObject<Args>>, context: ToolContext): Promise<string>;
};

// ============================================================================
// tool.schema — re-exported Zod namespace
// ============================================================================

export declare namespace tool {
    var schema: typeof z;
}

// ============================================================================
// ToolDefinition type alias
// ============================================================================

export type ToolDefinition = ReturnType<typeof tool>;

export {};
```

## Key Insights

### 1. `tool.schema` IS `zod`
The `tool.schema` namespace is the ENTIRE Zod library re-exported:

```typescript
tool.schema.string()           // z.string()
tool.schema.number()           // z.number()
tool.schema.string().optional() // z.string().optional()
tool.schema.object({})         // z.object({})
```

### 2. Optional string args pattern

```typescript
args: {
  requiredArg: tool.schema.string(),
  optionalArg: tool.schema.string().optional(),
  describedArg: tool.schema.string().describe("A description for the AI"),
  optionalWithDefault: tool.schema.string().optional().default("hello"),
}
```

### 3. `execute()` returns `Promise<string>`
The return value is a **string** that gets rendered in the TUI as-is (markdown-like rendering in the transcript).

### 4. `ToolDefinition` is the return type of `tool()`
Useful for typing individual tools:

```typescript
const myTool: ToolDefinition = tool({ ... });
```

### 5. `tool.context.metadata()` can set title and metadata
```typescript
context.metadata({
  title: "My Tool Output",
  metadata: { key: "value" }
});
```
