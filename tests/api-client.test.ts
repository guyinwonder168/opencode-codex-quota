import { afterEach, describe, expect, test } from "vitest";
import { queryQuota } from "../src/services/api-client";
import type { QuotaResponse } from "../src/types";

describe("queryQuota", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: { status: number; body: unknown }): void {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
  }

  function mockFetchError(error: Error): void {
    globalThis.fetch = async () => {
      throw error;
    };
  }

  const validResponse: QuotaResponse = {
    user_id: "u1",
    account_id: "acct_1",
    email: "test@example.com",
    plan_type: "plus",
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 25,
        limit_window_seconds: 18000,
        reset_after_seconds: 3600,
        reset_at: Math.floor(Date.now() / 1000) + 3600,
      },
      secondary_window: {
        used_percent: 16,
        limit_window_seconds: 604800,
        reset_after_seconds: 86400,
        reset_at: Math.floor(Date.now() / 1000) + 86400,
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
    promo: null,
  };

  // --- Happy path ---
  test("returns QuotaResponse on successful API call", async () => {
    mockFetch({ status: 200, body: validResponse });
    const result = await queryQuota("test-token", "acct_1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plan_type).toBe("plus");
      expect(result.value.rate_limit.primary_window?.used_percent).toBe(25);
    }
  });

  test("sends correct Authorization and ChatGPT-Account-Id headers", async () => {
    let capturedUrl: string | null = null;
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (input, init) => {
      capturedUrl = input.toString();
      const h = init?.headers;
      if (h instanceof Headers) {
        capturedHeaders = Object.fromEntries(h.entries());
      } else if (h && typeof h === "object") {
        capturedHeaders = h as Record<string, string>;
      }
      return new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await queryQuota("my-token", "acct_99");

    expect(capturedUrl).toBe("https://chatgpt.com/backend-api/wham/usage");
    expect(capturedHeaders.Authorization).toBe("Bearer my-token");
    expect(capturedHeaders["ChatGPT-Account-Id"]).toBe("acct_99");
  });

  // --- E4: Network failure ---
  test("E4: returns error on AbortError (timeout)", async () => {
    mockFetchError(new DOMException("The operation was aborted", "AbortError"));
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E4");
  });

  test("E4: returns error on generic network error", async () => {
    mockFetchError(new TypeError("fetch failed"));
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E4");
  });

  // --- E5: Auth errors ---
  test("E5: returns auth error on 401", async () => {
    mockFetch({ status: 401, body: { error: "unauthorized" } });
    const result = await queryQuota("bad-token", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E5");
  });

  test("E5: returns auth error on 403", async () => {
    mockFetch({ status: 403, body: { error: "forbidden" } });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E5");
  });

  // --- E6: Rate limited ---
  test("E6: returns rate limit error on 429", async () => {
    mockFetch({ status: 429, body: { error: "rate limited" } });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E6");
  });

  // --- E8: Server error ---
  test("E8: returns server error on 500", async () => {
    mockFetch({ status: 500, body: { error: "internal" } });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E8");
  });

  // --- E7: Validation failures ---
  test("E7: returns error when response is not JSON object", async () => {
    globalThis.fetch = async () =>
      new Response('"not an object"', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E7");
  });

  test("E7: returns error when rate_limit is missing", async () => {
    mockFetch({
      status: 200,
      body: { plan_type: "plus", credits: {}, spend_control: {} },
    });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E7");
  });

  test("E7: returns error when rate_limit is not an object", async () => {
    mockFetch({
      status: 200,
      body: {
        plan_type: "plus",
        rate_limit: "bad",
        credits: {},
        spend_control: {},
      },
    });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E7");
  });

  test("accepts response without code_review_rate_limit (it is OPTIONAL)", async () => {
    const { code_review_rate_limit: _, ...response } = validResponse;
    mockFetch({ status: 200, body: response });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(true);
  });

  test("accepts response with plan_type as empty string (displays as Unknown later)", async () => {
    mockFetch({ status: 200, body: { ...validResponse, plan_type: "" } });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.plan_type).toBe("");
  });

  // --- E4: Non-JSON 200 response body ---
  test("E4: returns error when 200 response body is not parseable JSON", async () => {
    globalThis.fetch = async () =>
      new Response("not json at all", { status: 200 });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E4");
  });

  // --- Empty token / accountId guard ---
  test("E5: returns error when token is empty string", async () => {
    const result = await queryQuota("", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E5");
  });

  test("E5: returns error when accountId is empty string", async () => {
    const result = await queryQuota("tok", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E5");
  });

  // --- Unhandled 4xx catch-all ---
  test("E8: returns error on unhandled 4xx status (e.g. 404)", async () => {
    mockFetch({ status: 404, body: { error: "not found" } });
    const result = await queryQuota("tok", "acct");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E8");
  });
});
