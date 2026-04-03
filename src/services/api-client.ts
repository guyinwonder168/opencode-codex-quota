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

/** Check that value is a non-null record with all required string fields. */
function hasStrings(v: unknown, ...keys: string[]): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === "string");
}

/** Check that value is a non-null record with all required boolean fields. */
function hasBooleans(v: unknown, ...keys: string[]): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === "boolean");
}

/** Check that value is a non-null record with all required number fields. */
function hasNumbers(v: unknown, ...keys: string[]): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === "number");
}

/** Validate optional window object (nullable, but shape-checked if present). */
function isValidWindow(w: unknown): boolean {
  if (w === null || w === undefined) return true;
  return hasNumbers(
    w,
    "used_percent",
    "limit_window_seconds",
    "reset_after_seconds",
    "reset_at",
  );
}

/**
 * Validates that parsed JSON data has the required QuotaResponse shape.
 * Checks both top-level and nested required fields for type safety.
 * `code_review_rate_limit` is OPTIONAL and not checked here.
 */
function validateResponse(data: unknown): data is QuotaResponse {
  if (!hasStrings(data, "user_id", "account_id", "email", "plan_type"))
    return false;
  const d = data as Record<string, unknown>;

  // rate_limit — must be non-null object with boolean fields + windows
  if (!hasBooleans(d.rate_limit, "allowed", "limit_reached")) return false;
  const rl = d.rate_limit as Record<string, unknown>;
  if (!isValidWindow(rl.primary_window)) return false;
  if (!isValidWindow(rl.secondary_window)) return false;

  // credits — must be non-null object with required fields
  if (!hasBooleans(d.credits, "has_credits", "unlimited")) return false;
  if (!hasStrings(d.credits, "balance")) return false;

  // spend_control — must be non-null object with boolean field
  if (!hasBooleans(d.spend_control, "reached")) return false;

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
