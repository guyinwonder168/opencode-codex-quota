import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { formatError } from "../src/formatter/errors";
import { formatQuota } from "../src/formatter/markdown";
import { queryQuota } from "../src/services/api-client";
import { readAuth } from "../src/services/auth-reader";
import type { QuotaResponse } from "../src/types";

function makeFakeJwt(accountId = "acct_1", email = "test@example.com"): string {
  const payload = {
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    "https://api.openai.com/profile": { email },
  };
  return `head.${btoa(JSON.stringify(payload))}.sig`;
}

const validApiPayload: QuotaResponse = {
  user_id: "u1",
  account_id: "acct_1",
  email: "test@example.com",
  plan_type: "plus",
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 10,
      limit_window_seconds: 18000,
      reset_after_seconds: 5400,
      reset_at: Math.floor(Date.now() / 1000) + 5400,
    },
    secondary_window: {
      used_percent: 30,
      limit_window_seconds: 604800,
      reset_after_seconds: 259200,
      reset_at: Math.floor(Date.now() / 1000) + 259200,
    },
  },
  code_review_rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 5,
      limit_window_seconds: 604800,
      reset_after_seconds: 604800,
      reset_at: Math.floor(Date.now() / 1000) + 604800,
    },
    secondary_window: null,
  },
  credits: {
    has_credits: true,
    unlimited: false,
    balance: "25",
    approx_local_messages: [50, 100],
    approx_cloud_messages: [20, 50],
  },
  spend_control: { reached: false },
  promo: null,
};

describe("Integration — full pipeline", () => {
  const originalFetch = globalThis.fetch;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `integration-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  // --- Error paths ---
  test("E1 pipeline: missing auth.json → error markdown", async () => {
    const authResult = await readAuth(
      join(tempDir, "nonexistent", "auth.json"),
    );
    expect(authResult.ok).toBe(false);
    if (!authResult.ok) {
      const output = formatError(authResult.error);
      expect(output).toContain("⚠️");
      expect(output).toContain("auth.json");
    }
  });

  test("E5 pipeline: invalid token → API 401 → error markdown", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

    const apiResult = await queryQuota("bad-token", "acct");
    expect(apiResult.ok).toBe(false);
    if (!apiResult.ok) {
      const output = formatError(apiResult.error);
      expect(output).toContain("Token Expired");
    }
  });

  test("E4 pipeline: network error → error markdown", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const apiResult = await queryQuota("tok", "acct");
    expect(apiResult.ok).toBe(false);
    if (!apiResult.ok) {
      const output = formatError(apiResult.error);
      expect(output).toContain("Connection Error");
    }
  });

  // --- Happy paths ---
  test("happy path: full mode pipeline produces valid markdown", async () => {
    // 1. Setup auth file
    const fakeJwt = makeFakeJwt();
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );

    // 2. Mock API
    globalThis.fetch = async () =>
      new Response(JSON.stringify(validApiPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    // 3. Execute pipeline
    const authResult = await readAuth(authFile);
    expect(authResult.ok).toBe(true);

    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : "",
    );
    expect(apiResult.ok).toBe(true);

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "full");
      // Verify all sections present
      expect(output).toContain("OpenAI Codex Subscription");
      expect(output).toContain("Plus");
      expect(output).toContain("test@example.com");
      expect(output).toContain("Quota Limits");
      expect(output).toContain("Primary (5h)");
      expect(output).toContain("10%");
      expect(output).toContain("Weekly");
      expect(output).toContain("Code Review Quota");
      expect(output).toContain("Credits");
      expect(output).toContain("25");
      expect(output).toContain("Spend Control");
      expect(output).toContain("Within limit");
      expect(output).toContain("Updated:");
      // No code block wrapping
      expect(output).not.toMatch(/^```\n/);
    }
  });

  test("happy path: compact mode pipeline produces concise markdown", async () => {
    const fakeJwt = makeFakeJwt();
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify(validApiPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const authResult = await readAuth(authFile);
    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : "",
    );

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "compact");
      expect(output).toContain("### Codex Quota");
      expect(output).toContain("| 5h |");
      expect(output).toContain("| Weekly |");
      expect(output).not.toContain("Code Review");
      expect(output).not.toContain("Credits");
      expect(output).not.toContain("Spend Control");
    }
  });

  test("high usage: full mode shows warning banners", async () => {
    const fakeJwt = makeFakeJwt();
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );

    const highUsagePayload = {
      ...validApiPayload,
      rate_limit: {
        ...validApiPayload.rate_limit,
        primary_window: validApiPayload.rate_limit.primary_window
          ? { ...validApiPayload.rate_limit.primary_window, used_percent: 92 }
          : null,
        limit_reached: true,
        allowed: false,
      },
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(highUsagePayload), { status: 200 });

    const authResult = await readAuth(authFile);
    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : "",
    );

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "full");
      expect(output).toContain("⚠️");
      expect(output).toContain("92%");
    }
  });
});
