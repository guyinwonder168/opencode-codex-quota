// src/types.ts
// Type definitions for the Codex Quota Plugin
// Based on PRD §8.1 and ChatGPT backend-api/wham/usage response shape

export interface AuthInfo {
  token: string; // OAuth access token (from auth.json "access" field)
  accountId: string; // Extracted from JWT chatgpt_account_id claim
  email: string; // Extracted from JWT email claim
  expiresAt: number; // Unix timestamp in SECONDS (from auth.json "expires" field)
}

export interface WindowInfo {
  used_percent: number; // 0–100 (may exceed 100 from API — clamp to 100 for display)
  limit_window_seconds: number; // Window duration in seconds (e.g., 18000 = 5h)
  reset_after_seconds: number; // Seconds until reset
  reset_at: number; // Unix timestamp in SECONDS for when the window resets
}

export interface RateLimitInfo {
  allowed: boolean; // REQUIRED — whether the request is allowed
  limit_reached: boolean; // REQUIRED — whether any limit is reached
  primary_window: WindowInfo | null; // REQUIRED field, but WindowInfo contents may be null
  secondary_window: WindowInfo | null; // Optional — Plus accounts have this
}

export interface CreditsInfo {
  has_credits: boolean; // REQUIRED
  unlimited: boolean; // REQUIRED
  balance: string; // REQUIRED — numeric string (e.g., "0", "50")
  approx_local_messages: [number, number]; // REQUIRED — [min, max] range
  approx_cloud_messages: [number, number]; // REQUIRED — [min, max] range
}

export interface QuotaResponse {
  // === REQUIRED fields (must be present or trigger E7 partial data) ===
  user_id: string;
  account_id: string;
  email: string;
  plan_type: string; // "plus" | "pro" | unknown string
  rate_limit: RateLimitInfo;
  credits: CreditsInfo;
  spend_control: { reached: boolean };
  // === OPTIONAL fields (gracefully handled if missing) ===
  code_review_rate_limit?: RateLimitInfo; // OPTIONAL — may be absent
  additional_rate_limits?: unknown; // OPTIONAL — ignored in v1.0 display
  promo?: unknown; // OPTIONAL — displayed when non-null
}

export type DisplayMode = "compact" | "full";
