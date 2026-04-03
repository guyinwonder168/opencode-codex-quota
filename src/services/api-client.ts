// src/services/api-client.ts
// Queries the ChatGPT backend-api/wham/usage endpoint for quota data.
// Error codes follow PRD §10.1: E4 (network), E5 (auth), E6 (rate limit),
// E7 (invalid response), E8 (server error).

import type { QuotaResponse } from "../types.js";

export type ApiResult =
  | { ok: true; value: QuotaResponse }
  | { ok: false; error: string };

const API_URL = "https://chatgpt.com/backend-api/wham/usage";
const TIMEOUT_MS = 10_000;

/**
 * Validates that parsed JSON data has the required QuotaResponse shape.
 * Checks both top-level and nested required fields for type safety.
 * `code_review_rate_limit` is OPTIONAL and not checked here.
 */
function validateResponse(data: unknown): data is QuotaResponse {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;

  // Top-level required strings
  if (typeof d.user_id !== "string") return false;
  if (typeof d.account_id !== "string") return false;
  if (typeof d.email !== "string") return false;
  if (typeof d.plan_type !== "string") return false;

  // rate_limit — must be non-null object with boolean fields
  if (typeof d.rate_limit !== "object" || d.rate_limit === null) return false;
  const rl = d.rate_limit as Record<string, unknown>;
  if (typeof rl.allowed !== "boolean") return false;
  if (typeof rl.limit_reached !== "boolean") return false;
  // primary_window: required but nullable — validate shape if present
  if (rl.primary_window !== null && rl.primary_window !== undefined) {
    if (typeof rl.primary_window !== "object") return false;
    const pw = rl.primary_window as Record<string, unknown>;
    if (typeof pw.used_percent !== "number") return false;
    if (typeof pw.limit_window_seconds !== "number") return false;
    if (typeof pw.reset_after_seconds !== "number") return false;
    if (typeof pw.reset_at !== "number") return false;
  }
  // secondary_window: optional, validate shape if present
  if (rl.secondary_window !== null && rl.secondary_window !== undefined) {
    if (typeof rl.secondary_window !== "object") return false;
    const sw = rl.secondary_window as Record<string, unknown>;
    if (typeof sw.used_percent !== "number") return false;
    if (typeof sw.limit_window_seconds !== "number") return false;
    if (typeof sw.reset_after_seconds !== "number") return false;
    if (typeof sw.reset_at !== "number") return false;
  }

  // credits — must be non-null object with required fields
  if (typeof d.credits !== "object" || d.credits === null) return false;
  const cr = d.credits as Record<string, unknown>;
  if (typeof cr.has_credits !== "boolean") return false;
  if (typeof cr.unlimited !== "boolean") return false;
  if (typeof cr.balance !== "string") return false;

  // spend_control — must be non-null object with boolean field
  if (typeof d.spend_control !== "object" || d.spend_control === null)
    return false;
  const sc = d.spend_control as Record<string, unknown>;
  if (typeof sc.reached !== "boolean") return false;

  return true;
}

/**
 * Query the ChatGPT usage API for quota information.
 *
 * Sends an authenticated GET request with a 10-second timeout.
 * Returns a discriminated union: `{ ok: true, value }` on success,
 * or `{ ok: false, error }` with an error code on failure.
 *
 * Error codes:
 * - E4: Network failure (timeout, DNS, SSL, connection refused)
 * - E5: Auth errors (HTTP 401, 403)
 * - E6: Rate limited (HTTP 429)
 * - E7: Invalid/partial response data
 * - E8: Server error (HTTP 500+)
 */
export async function queryQuota(
  token: string,
  accountId: string,
): Promise<ApiResult> {
  // Guard: reject empty/whitespace token or accountId early
  if (!token || token.trim() === "") {
    return { ok: false, error: "E5" };
  }
  if (!accountId || accountId.trim() === "") {
    return { ok: false, error: "E5" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "ChatGPT-Account-Id": accountId,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "E5" };
    }
    if (response.status === 429) {
      return { ok: false, error: "E6" };
    }
    if (response.status >= 500) {
      return { ok: false, error: "E8" };
    }
    // Catch-all: any other non-2xx status is treated as a server error
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: "E8" };
    }

    const data: unknown = await response.json();
    if (!validateResponse(data)) {
      return { ok: false, error: "E7" };
    }

    return { ok: true, value: data };
  } catch {
    return { ok: false, error: "E4" };
  } finally {
    clearTimeout(timeout);
  }
}
