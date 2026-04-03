import type { Part } from "@opencode-ai/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { QuotaResponse } from "../src/types";

// Mock the service modules — formatters are left real to verify integration
vi.mock("../src/services/auth-reader", () => ({
  readAuth: vi.fn(),
}));
vi.mock("../src/services/api-client", () => ({
  queryQuota: vi.fn(),
}));

import codexQuotaPlugin from "../src/index";
import { queryQuota } from "../src/services/api-client";
import { readAuth } from "../src/services/auth-reader";

const mockedReadAuth = vi.mocked(readAuth);
const mockedQueryQuota = vi.mocked(queryQuota);

// Minimal valid QuotaResponse for testing
const validQuotaResponse: QuotaResponse = {
  user_id: "user_abc",
  account_id: "acct_123",
  email: "test@example.com",
  plan_type: "plus",
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 30,
      limit_window_seconds: 18000,
      reset_after_seconds: 5400,
      reset_at: Math.floor(Date.now() / 1000) + 5400,
    },
    secondary_window: {
      used_percent: 15,
      limit_window_seconds: 604800,
      reset_after_seconds: 172800,
      reset_at: Math.floor(Date.now() / 1000) + 172800,
    },
  },
  credits: {
    has_credits: false,
    unlimited: false,
    balance: "0",
    approx_local_messages: [0, 0],
    approx_cloud_messages: [0, 0],
  },
  spend_control: { reached: false },
};

// Factory for auth success values — avoids repeating the same object 11 times
function mockAuthSuccess(
  overrides?: Partial<{
    token: string;
    accountId: string;
    email: string;
    expiresAt: number;
  }>,
) {
  return {
    ok: true as const,
    value: {
      token: "valid-token",
      accountId: "acct_123",
      email: "test@example.com",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    },
  };
}

// Stub plugin input (unused by our plugin but required by Plugin signature)
const mockInput = {} as Parameters<typeof codexQuotaPlugin.server>[0];

// Stub tool context
const mockContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: vi.fn(),
  ask: vi.fn(),
};

async function getToolExecute() {
  const hooks = await codexQuotaPlugin.server(mockInput);
  expect(hooks.tool).toBeDefined();
  const toolDef = hooks.tool?.codex_quota;
  expect(toolDef).toBeDefined();
  // After the assertion above, toolDef is guaranteed to exist
  return (toolDef as NonNullable<typeof toolDef>).execute;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Plugin export shape ─────────────────────────────────────────────

describe("codexQuotaPlugin — export shape", () => {
  test("default export includes id and server", () => {
    expect(codexQuotaPlugin.id).toBe("opencode-codex-quota");
    expect(typeof codexQuotaPlugin.server).toBe("function");
  });

  test("server returns hooks with tool.codex_quota", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);
    expect(hooks).toHaveProperty("tool");
    expect(hooks.tool).toHaveProperty("codex_quota");
  });

  test("codex_quota tool has description, args, and execute", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);
    const t = hooks.tool?.codex_quota;
    expect(t).toBeDefined();
    expect(typeof t?.description).toBe("string");
    expect(t?.description).toContain("quota");
    expect(t?.args).toHaveProperty("mode");
    expect(typeof t?.execute).toBe("function");
  });

  test("returns hooks with config function", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);
    expect(hooks).toHaveProperty("config");
    expect(typeof hooks.config).toBe("function");
  });

  test("config hook registers /codex_quota command with empty template", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);
    expect(hooks.config).toBeDefined();

    // Mock opencodeConfig object
    const opencodeConfig: {
      command?: Record<
        string,
        { template: string; description: string; subtask: boolean }
      >;
    } = {};

    // Call config hook
    await (hooks.config as (cfg: typeof opencodeConfig) => Promise<void>)(
      opencodeConfig,
    );

    // Verify command was registered with empty template and subtask execution
    expect(opencodeConfig.command).toBeDefined();
    expect(opencodeConfig.command).toHaveProperty("codex_quota");
    expect(opencodeConfig.command?.codex_quota).toEqual({
      template: "",
      description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
      subtask: true,
    });
  });

  test("config hook preserves existing commands", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);

    // Mock opencodeConfig with existing command
    const opencodeConfig: {
      command?: Record<
        string,
        { template: string; description: string; subtask?: boolean }
      >;
    } = {
      command: {
        existing: { template: "test", description: "Existing command" },
      },
    };

    // Call config hook
    await (hooks.config as (cfg: typeof opencodeConfig) => Promise<void>)(
      opencodeConfig,
    );

    // Verify existing command is preserved
    expect(opencodeConfig.command).toHaveProperty("existing");
    expect(opencodeConfig.command?.existing).toEqual({
      template: "test",
      description: "Existing command",
    });
    // And codex_quota is added
    expect(opencodeConfig.command).toHaveProperty("codex_quota");
  });

  test("returns hooks with command.execute.before function", async () => {
    const hooks = await codexQuotaPlugin.server(mockInput);
    expect(hooks).toHaveProperty("command.execute.before");
    expect(typeof hooks["command.execute.before"]).toBe("function");
  });
});

// ─── Command hook routing ────────────────────────────────────────────

type CommandExecuteBefore = (
  input: { command: string; sessionID: string; arguments: string },
  output: { parts: Part[] },
) => Promise<void>;

async function getCommandHook(): Promise<CommandExecuteBefore> {
  const hooks = await codexQuotaPlugin.server(mockInput);
  const hook = hooks["command.execute.before"];
  expect(hook).toBeDefined();
  return hook as CommandExecuteBefore;
}

const textPart = (text: string): Part => ({ type: "text", text }) as Part;

const createCommandOutput = (parts: Part[] = []): { parts: Part[] } => ({
  parts,
});

const getText = (part: Part): string => {
  expect(part.type).toBe("text");
  return (part as Part & { text: string }).text;
};

describe("command.execute.before hook", () => {
  test("compact argument → injects compact-specific instruction", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "compact",
    };
    const output = createCommandOutput();

    await hook(input, output);

    expect(output.parts).toHaveLength(1);
    const instruction = getText(output.parts[0]);
    expect(instruction).toContain(
      "Call the codex_quota tool now with mode=compact",
    );
    expect(instruction).toContain("VERBATIM");
  });

  test("empty argument → injects full-mode instruction", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "",
    };
    const output = createCommandOutput();

    await hook(input, output);

    expect(output.parts).toHaveLength(1);
    const instruction = getText(output.parts[0]);
    expect(instruction).toContain(
      "Call the codex_quota tool now with mode=full",
    );
    expect(instruction).toContain("VERBATIM");
  });

  test("full argument → injects full-mode instruction", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "full",
    };
    const output = createCommandOutput();

    await hook(input, output);

    expect(output.parts).toHaveLength(1);
    const instruction = getText(output.parts[0]);
    expect(instruction).toContain(
      "Call the codex_quota tool now with mode=full",
    );
  });

  test("unknown argument → defaults to full-mode instruction", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "unknown_arg",
    };
    const output = createCommandOutput();

    await hook(input, output);

    expect(output.parts).toHaveLength(1);
    const instruction = getText(output.parts[0]);
    expect(instruction).toContain(
      "Call the codex_quota tool now with mode=full",
    );
  });

  test("mixed-case compact → works correctly", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "Compact",
    };
    const output = createCommandOutput();

    await hook(input, output);

    expect(getText(output.parts[0])).toContain("mode=compact");
  });

  test("ignores other commands", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "some_other_command" as const,
      sessionID: "test-session",
      arguments: "compact",
    };
    const output = createCommandOutput();

    await hook(input, output);

    // Should not modify output for non-codex_quota commands
    expect(output.parts).toHaveLength(0);
  });

  test("clears existing parts before injecting", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "compact",
    };
    const output = createCommandOutput([textPart("existing content")]);

    await hook(input, output);

    expect(output.parts).toHaveLength(1);
    const instruction = getText(output.parts[0]);
    expect(instruction).not.toContain("existing content");
    expect(instruction).toContain("mode=compact");
  });

  test("instruction contains anti-summarization warning", async () => {
    const hook = await getCommandHook();
    const input = {
      command: "codex_quota" as const,
      sessionID: "test-session",
      arguments: "",
    };
    const output = createCommandOutput();

    await hook(input, output);

    const instruction = getText(output.parts[0]);
    expect(instruction).toContain("Do NOT convert clock times");
    expect(instruction).toContain("04:06:26");
    expect(instruction).toContain("~4h 6m");
  });
});

// ─── Happy path (full mode) ──────────────────────────────────────────

describe("codexQuotaPlugin — happy path (full mode)", () => {
  test("returns formatted markdown for valid data with mode='full'", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("OpenAI Codex Subscription");
    expect(result).toContain("**Plan:** Plus");
    expect(result).toContain("test@example.com");
    expect(result).toContain("Quota Limits");
    expect(result).toContain("30%");
  });

  test("calls readAuth once and queryQuota with correct args", async () => {
    mockedReadAuth.mockResolvedValueOnce(
      mockAuthSuccess({
        token: "tok-abc",
        accountId: "acct_xyz",
        email: "u@e.com",
      }),
    );
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    await execute({ mode: "full" }, mockContext);

    expect(mockedReadAuth).toHaveBeenCalledOnce();
    expect(mockedQueryQuota).toHaveBeenCalledWith("tok-abc", "acct_xyz");
  });
});

// ─── Happy path (compact mode) ───────────────────────────────────────

describe("codexQuotaPlugin — happy path (compact mode)", () => {
  test("returns compact formatted output", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    const result = await execute({ mode: "compact" }, mockContext);

    expect(result).toContain("Codex Quota");
    expect(result).toContain("Plus");
    expect(result).toContain("5h");
    expect(result).toContain("30%");
  });
});

// ─── Auth failure ────────────────────────────────────────────────────

describe("codexQuotaPlugin — auth failure", () => {
  test("returns error markdown when readAuth fails (E1)", async () => {
    mockedReadAuth.mockResolvedValueOnce({ ok: false, error: "E1" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Not Configured");
    expect(mockedQueryQuota).not.toHaveBeenCalled();
  });

  test("returns error markdown for E3 (expired token)", async () => {
    mockedReadAuth.mockResolvedValueOnce({ ok: false, error: "E3" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Token Expired");
    expect(mockedQueryQuota).not.toHaveBeenCalled();
  });

  test("returns error markdown for E2 (no credentials)", async () => {
    mockedReadAuth.mockResolvedValueOnce({ ok: false, error: "E2" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("No OpenAI Credentials");
  });
});

// ─── API failure ─────────────────────────────────────────────────────

describe("codexQuotaPlugin — API failure", () => {
  test("returns error markdown when queryQuota fails (E4 network)", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({ ok: false, error: "E4" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Connection Error");
  });

  test("returns error markdown for E5 (auth error from API)", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({ ok: false, error: "E5" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Token Expired");
  });

  test("returns error markdown for E8 (server error)", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({ ok: false, error: "E8" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Service Unavailable");
  });

  test("returns error markdown for E6 (rate limited)", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({ ok: false, error: "E6" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Rate Limited");
  });

  test("returns error markdown for E7 (invalid response)", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({ ok: false, error: "E7" });

    const execute = await getToolExecute();
    const result = await execute({ mode: "full" }, mockContext);

    expect(result).toContain("Partial Data");
  });
});

// ─── Default / invalid mode ──────────────────────────────────────────

describe("codexQuotaPlugin — mode handling", () => {
  test("undefined mode defaults to 'full' output", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    const result = await execute({ mode: undefined }, mockContext);

    // Full mode has the top-level "# OpenAI Codex Subscription" heading
    expect(result).toContain("# OpenAI Codex Subscription");
  });

  test("invalid mode string treated as 'full'", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    const result = await execute({ mode: "unknown" }, mockContext);

    expect(result).toContain("# OpenAI Codex Subscription");
  });

  test("no mode arg at all defaults to 'full'", async () => {
    mockedReadAuth.mockResolvedValueOnce(mockAuthSuccess());
    mockedQueryQuota.mockResolvedValueOnce({
      ok: true,
      value: validQuotaResponse,
    });

    const execute = await getToolExecute();
    // Empty args — mode is optional, so this simulates no arg passed
    const result = await execute({}, mockContext);

    expect(result).toContain("# OpenAI Codex Subscription");
  });
});
