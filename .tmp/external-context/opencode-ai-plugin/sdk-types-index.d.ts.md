---
source: unpkg.com (npm @opencode-ai/plugin@1.3.5)
library: @opencode-ai/plugin
package: @opencode-ai/plugin
topic: SDK TypeScript types (index.d.ts)
fetched: 2026-03-29T12:00:00Z
official_docs: https://opencode.ai/docs/plugins
---

# @opencode-ai/plugin — index.d.ts (v1.3.5)

```typescript
import type { Event, createOpencodeClient, Project, Model, Provider, Permission, UserMessage, Message, Part, Auth, Config as SDKConfig } from "@opencode-ai/sdk";
import type { BunShell } from "./shell.js";
import { type ToolDefinition } from "./tool.js";
export * from "./tool.js";

// ============================================================================
// Provider Context
// ============================================================================

export type ProviderContext = {
    source: "env" | "config" | "custom" | "api";
    info: Provider;
    options: Record<string, any>;
};

// ============================================================================
// Plugin Input (passed to plugin function)
// ============================================================================

export type PluginInput = {
    client: ReturnType<typeof createOpencodeClient>;
    project: Project;
    directory: string;
    worktree: string;
    serverUrl: URL;
    $: BunShell;
};

export type PluginOptions = Record<string, unknown>;

// ============================================================================
// Config
// ============================================================================

export type Config = Omit<SDKConfig, "plugin"> & {
    plugin?: Array<string | [string, PluginOptions]>;
};

// ============================================================================
// Plugin Type (the main export type)
// ============================================================================

export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>;

export type PluginModule = {
    id?: string;
    server: Plugin;
    tui?: never;
};

// ============================================================================
// Auth Hook Types
// ============================================================================

type Rule = {
    key: string;
    op: "eq" | "neq";
    value: string;
};

export type AuthHook = {
    provider: string;
    loader?: (auth: () => Promise<Auth>, provider: Provider) => Promise<Record<string, any>>;
    methods: ({
        type: "oauth";
        label: string;
        prompts?: Array<{
            type: "text";
            key: string;
            message: string;
            placeholder?: string;
            validate?: (value: string) => string | undefined;
            /** @deprecated Use `when` instead */
            condition?: (inputs: Record<string, string>) => boolean;
            when?: Rule;
        } | {
            type: "select";
            key: string;
            message: string;
            options: Array<{
                label: string;
                value: string;
                hint?: string;
            }>;
            /** @deprecated Use `when` instead */
            condition?: (inputs: Record<string, string>) => boolean;
            when?: Rule;
        }>;
        authorize(inputs?: Record<string, string>): Promise<AuthOAuthResult>;
    } | {
        type: "api";
        label: string;
        prompts?: Array<{
            type: "text";
            key: string;
            message: string;
            placeholder?: string;
            validate?: (value: string) => string | undefined;
            /** @deprecated Use `when` instead */
            condition?: (inputs: Record<string, string>) => boolean;
            when?: Rule;
        } | {
            type: "select";
            key: string;
            message: string;
            options: Array<{
                label: string;
                value: string;
                hint?: string;
            }>;
            /** @deprecated Use `when` instead */
            condition?: (inputs: Record<string, string>) => boolean;
            when?: Rule;
        }>;
        authorize?(inputs?: Record<string, string>): Promise<{
            type: "success";
            key: string;
            provider?: string;
        } | {
            type: "failed";
        }>;
    })[];
};

export type AuthOAuthResult = {
    url: string;
    instructions: string;
} & ({
    method: "auto";
    callback(): Promise<({
        type: "success";
        provider?: string;
    } & ({
        refresh: string;
        access: string;
        expires: number;
        accountId?: string;
        enterpriseUrl?: string;
    } | {
        key: string;
    })) | {
        type: "failed";
    }>;
} | {
    method: "code";
    callback(code: string): Promise<({
        type: "success";
        provider?: string;
    } & ({
        refresh: string;
        access: string;
        expires: number;
        accountId?: string;
        enterpriseUrl?: string;
    } | {
        key: string;
    })) | {
        type: "failed";
    }>;
});

/** @deprecated Use AuthOAuthResult instead. */
export type AuthOuathResult = AuthOAuthResult;

// ============================================================================
// Hooks Interface (return type of Plugin function)
// ============================================================================

export interface Hooks {
    event?: (input: {
        event: Event;
    }) => Promise<void>;
    config?: (input: Config) => Promise<void>;
    tool?: {
        [key: string]: ToolDefinition;
    };
    auth?: AuthHook;
    /**
     * Called when a new message is received
     */
    "chat.message"?: (input: {
        sessionID: string;
        agent?: string;
        model?: {
            providerID: string;
            modelID: string;
        };
        messageID?: string;
        variant?: string;
    }, output: {
        message: UserMessage;
        parts: Part[];
    }) => Promise<void>;
    /**
     * Modify parameters sent to LLM
     */
    "chat.params"?: (input: {
        sessionID: string;
        agent: string;
        model: Model;
        provider: ProviderContext;
        message: UserMessage;
    }, output: {
        temperature: number;
        topP: number;
        topK: number;
        options: Record<string, any>;
    }) => Promise<void>;
    "chat.headers"?: (input: {
        sessionID: string;
        agent: string;
        model: Model;
        provider: ProviderContext;
        message: UserMessage;
    }, output: {
        headers: Record<string, string>;
    }) => Promise<void>;
    "permission.ask"?: (input: Permission, output: {
        status: "ask" | "deny" | "allow";
    }) => Promise<void>;
    "command.execute.before"?: (input: {
        command: string;
        sessionID: string;
        arguments: string;
    }, output: {
        parts: Part[];
    }) => Promise<void>;
    "tool.execute.before"?: (input: {
        tool: string;
        sessionID: string;
        callID: string;
    }, output: {
        args: any;
    }) => Promise<void>;
    "shell.env"?: (input: {
        cwd: string;
        sessionID?: string;
        callID?: string;
    }, output: {
        env: Record<string, string>;
    }) => Promise<void>;
    "tool.execute.after"?: (input: {
        tool: string;
        sessionID: string;
        callID: string;
        args: any;
    }, output: {
        title: string;
        output: string;
        metadata: any;
    }) => Promise<void>;
    "experimental.chat.messages.transform"?: (input: {}, output: {
        messages: {
            info: Message;
            parts: Part[];
        }[];
    }) => Promise<void>;
    "experimental.chat.system.transform"?: (input: {
        sessionID?: string;
        model: Model;
    }, output: {
        system: string[];
    }) => Promise<void>;
    /**
     * Called before session compaction starts. Allows plugins to customize
     * the compaction prompt.
     *
     * - `context`: Additional context strings appended to the default prompt
     * - `prompt`: If set, replaces the default compaction prompt entirely
     */
    "experimental.session.compacting"?: (input: {
        sessionID: string;
    }, output: {
        context: string[];
        prompt?: string;
    }) => Promise<void>;
    "experimental.text.complete"?: (input: {
        sessionID: string;
        messageID: string;
        partID: string;
    }, output: {
        text: string;
    }) => Promise<void>;
    /**
     * Modify tool definitions (description and parameters) sent to LLM
     */
    "tool.definition"?: (input: {
        toolID: string;
    }, output: {
        description: string;
        parameters: any;
    }) => Promise<void>;
}
```
