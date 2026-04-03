// src/services/auth-reader.ts
// Reads and validates auth.json for the Codex Quota Plugin.
// Scans provider keys in priority order (codex → openai → chatgpt → opencode).
// Error codes follow PRD §10.1: E1 (file not found), E2 (no matching key),
// E3 (expired), E9 (JWT parse failure), E10 (wrong type), E11 (empty token).

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthInfo } from "../types.js";

export type AuthResult =
  | { ok: true; value: AuthInfo }
  | { ok: false; error: string };

interface JwtClaims {
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
  "https://api.openai.com/profile"?: {
    email?: string;
  };
}

/**
 * Decode and validate a JWT token, extracting the OpenAI account ID and email.
 * Handles standard base64 and base64url encodings.
 */
export function parseJwt(token: string): {
  accountId: string;
  email: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: expected 3 dot-separated parts");
  }

  let payload: JwtClaims;
  try {
    // Convert base64url → standard base64
    let base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    // Pad to a multiple of 4
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const decoded = atob(base64);
    payload = JSON.parse(decoded) as JwtClaims;
  } catch {
    throw new Error("Failed to decode JWT payload");
  }

  const accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id;
  if (!accountId) {
    throw new Error("Missing chatgpt_account_id in JWT");
  }

  const email = payload["https://api.openai.com/profile"]?.email;
  if (!email) {
    throw new Error("Missing email in JWT");
  }

  return { accountId, email };
}

const DEFAULT_AUTH_PATH = join(
  homedir(),
  ".local",
  "share",
  "opencode",
  "auth.json",
);

/** Provider keys scanned in priority order (PRD §7.2 first-match-wins). */
const PROVIDER_KEYS = ["codex", "openai", "chatgpt", "opencode"] as const;

interface AuthEntry {
  type?: string;
  access?: string;
  expires?: number;
}

type AuthFile = Record<string, AuthEntry>;

/**
 * Read auth.json and return validated credentials, or a typed error code.
 *
 * Skippable errors (E10 wrong type, E11 empty token) record the error and
 * continue to the next provider key. Fatal errors (E3 expired, E9 JWT failure)
 * return immediately. If no valid entry is found, the last skippable error is
 * returned, or E2 if no provider key matched at all.
 */
export async function readAuth(
  authFilePath = DEFAULT_AUTH_PATH,
): Promise<AuthResult> {
  // E1: File not found
  let content: string;
  try {
    content = await readFile(authFilePath, "utf-8");
  } catch {
    return { ok: false, error: "E1" };
  }

  // Parse JSON (malformed file → E9)
  let authData: AuthFile;
  try {
    authData = JSON.parse(content) as AuthFile;
  } catch {
    return { ok: false, error: "E9" };
  }

  // Scan provider keys in priority order
  let lastSkippableError: string | null = null;

  for (const key of PROVIDER_KEYS) {
    const entry = authData[key];
    if (!entry) continue;

    // E10: Wrong auth type — skippable
    if (entry.type !== "oauth") {
      lastSkippableError = "E10";
      continue;
    }

    // E11: Empty or missing access token — skippable
    if (!entry.access || entry.access.trim() === "") {
      lastSkippableError = "E11";
      continue;
    }

    // E3: Token expired — fatal (return immediately)
    if (
      entry.expires !== undefined &&
      entry.expires < Math.floor(Date.now() / 1000)
    ) {
      return { ok: false, error: "E3" };
    }

    // E9: JWT parse failure — fatal (return immediately)
    let jwtResult: { accountId: string; email: string };
    try {
      jwtResult = parseJwt(entry.access);
    } catch {
      return { ok: false, error: "E9" };
    }

    // Success — return parsed credentials
    return {
      ok: true,
      value: {
        token: entry.access,
        accountId: jwtResult.accountId,
        email: jwtResult.email,
        expiresAt: entry.expires ?? 0,
      },
    };
  }

  // Return last recorded skippable error, or E2 if no provider key matched
  return { ok: false, error: lastSkippableError ?? "E2" };
}
