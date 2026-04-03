import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseJwt, readAuth } from "../src/services/auth-reader";

function makeFakeJwt(payload: object): string {
  const encoded = btoa(JSON.stringify(payload));
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`;
}

function makeValidPayload(
  accountId = "acct_12345",
  email = "user@example.com",
) {
  return {
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
    "https://api.openai.com/profile": { email },
  };
}

describe("parseJwt", () => {
  test("parses valid JWT payload with account_id and email", () => {
    const jwt = makeFakeJwt(makeValidPayload());
    const result = parseJwt(jwt);
    expect(result.accountId).toBe("acct_12345");
    expect(result.email).toBe("user@example.com");
  });

  test("handles base64url encoding (hyphens and underscores)", () => {
    // Create a payload that when base64url-encoded uses - and _
    const payload = makeValidPayload("acct_test", "a@b.co");
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const jwt = `header.${encoded}.sig`;
    const result = parseJwt(jwt);
    expect(result.accountId).toBe("acct_test");
  });

  test("throws on malformed JWT (no dots)", () => {
    expect(() => parseJwt("not-a-jwt")).toThrow();
  });

  test("throws on non-JSON payload", () => {
    const jwt = "header.bm90LWpzb24.signature"; // "not-json" base64
    expect(() => parseJwt(jwt)).toThrow();
  });

  test("throws when chatgpt_account_id missing", () => {
    const payload = { "https://api.openai.com/profile": { email: "u@e.com" } };
    const jwt = makeFakeJwt(payload);
    expect(() => parseJwt(jwt)).toThrow(/account_id/i);
  });

  test("throws when email missing", () => {
    const payload = {
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" },
    };
    const jwt = makeFakeJwt(payload);
    expect(() => parseJwt(jwt)).toThrow(/email/i);
  });
});

describe("readAuth", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `codex-quota-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // --- E1: auth.json not found ---
  test("E1: returns error when auth.json not found", async () => {
    const result = await readAuth(join(tempDir, "nonexistent", "auth.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E1");
  });

  // --- E2: no matching provider key ---
  test("E2: returns error when no matching provider key", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({ github: { type: "oauth", access: "tok" } }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E2");
  });

  // --- E3: token expired ---
  test("E3: returns error when token expired", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload());
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) - 3600,
        },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E3");
  });

  // --- E9: JWT parse failure ---
  test("E9: returns error on JWT parse failure", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: "not-a-valid-jwt",
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E9");
  });

  test("E9: returns error when auth.json contains malformed JSON", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(authFile, "not json at all");
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E9");
  });

  // --- E10: wrong auth type (not "oauth") ---
  test("E10: returns error when auth type is not 'oauth'", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: { type: "api_key", key: "sk-xxx" },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E10");
  });

  // --- E11: empty access token ---
  test("E11: returns error when access token is empty string", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: "",
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E11");
  });

  test("E11: returns error when access token is whitespace-only", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: "   ",
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E11");
  });

  test("E11: returns error when access field is missing", async () => {
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: { type: "oauth", expires: Math.floor(Date.now() / 1000) + 3600 },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("E11");
  });

  // --- Happy path ---
  test("returns AuthInfo on valid credentials (codex key)", async () => {
    const fakeJwt = makeFakeJwt(
      makeValidPayload("acct_abc", "test@example.com"),
    );
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
    const result = await readAuth(authFile);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accountId).toBe("acct_abc");
      expect(result.value.email).toBe("test@example.com");
      expect(result.value.token).toBe(fakeJwt);
    }
  });

  test("first-match-wins: tries provider keys in order codex → openai → chatgpt → opencode", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload("acct_xyz", "z@test.com"));
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        opencode: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.accountId).toBe("acct_xyz");
  });

  test("skips non-matching keys and finds valid one later in order", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload("acct_late", "late@test.com"));
    const authFile = join(tempDir, "auth.json");
    await writeFile(
      authFile,
      JSON.stringify({
        codex: { type: "api_key", key: "sk-bad" }, // E10 — skip
        openai: {
          type: "oauth",
          access: "",
          expires: Math.floor(Date.now() / 1000) + 3600,
        }, // E11 — skip
        chatgpt: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        }, // valid
      }),
    );
    const result = await readAuth(authFile);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.accountId).toBe("acct_late");
  });
});
