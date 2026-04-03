# OpenCode Codex Quota Plugin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an OpenCode plugin that queries ChatGPT Plus/Pro Codex subscription quota and displays it as rich Markdown in the TUI via a single `/codex_quota` command.

**Architecture:** Component-Service pattern — `AuthReader` reads `~/.local/share/opencode/auth.json`, parses JWT for account_id + email. `ApiClient` calls `chatgpt.com/backend-api/wham/usage` with OAuth token. `Formatter` transforms the typed response into raw Markdown string. Plugin entry point wires them together as a single tool.

**Tech Stack:** TypeScript (strict), Node.js, `vitest`, `@opencode-ai/plugin` SDK (Zod-based `tool.schema`), `biome` for linting, zero runtime dependencies beyond the SDK.

**PRD:** `docs/codex-quota-prd.md` (802 lines, updated 2026-04-02) — authoritative source for all requirements, types, API spec, error scenarios, output format.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `.gitignore`

**Step 1: Create `package.json`**

```json
{
  "name": "opencode-codex-quota",
  "version": "0.1.0",
  "description": "OpenCode plugin to display ChatGPT Plus/Pro Codex subscription quota",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "npx @biomejs/biome check src/",
    "lint:fix": "npx @biomejs/biome check --fix src/"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.3.5"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.3.5",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "@biomejs/biome": "^1.9.0"
  },
  "keywords": ["opencode", "plugin", "codex", "quota", "chatgpt"],
  "license": "MIT"
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"
      },
      "complexity": {
        "noBannedImports": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
dist/
.tmp/
coverage/
*.tgz
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

**Step 6: Verify TypeScript compiles (empty project)**

Run: `npm run typecheck`
Expected: PASS (no source files yet, but config is valid)

**Step 7: Verify biome runs (empty project)**

Run: `npm run lint`
Expected: PASS or "no files to check" (acceptable for empty src/)

**Step 8: Commit**

```bash
git add package.json tsconfig.json biome.json .gitignore package-lock.json
git commit -m "chore: project scaffolding with node.js, typescript, biome config"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types.ts`
- Create: `src/services/auth-reader.ts` (empty placeholder)
- Create: `src/services/api-client.ts` (empty placeholder)
- Create: `src/formatter/markdown.ts` (empty placeholder)
- Create: `src/formatter/errors.ts` (empty placeholder)

**Step 1: Create `src/types.ts` with all interfaces from PRD 8.1**

Note: `code_review_rate_limit` is OPTIONAL (`?`), `additional_rate_limits` is OPTIONAL. All timestamp fields are Unix SECONDS.

```typescript
// src/types.ts

export interface AuthInfo {
  token: string           // OAuth access token (from auth.json "access" field)
  accountId: string       // Extracted from JWT chatgpt_account_id claim
  email: string           // Extracted from JWT email claim
  expiresAt: number       // Unix timestamp in SECONDS (from auth.json "expires" field)
}

export interface WindowInfo {
  used_percent: number          // 0–100 (may exceed 100 from API — clamp to 100 for display)
  limit_window_seconds: number  // Window duration in seconds (e.g., 18000 = 5h)
  reset_after_seconds: number   // Seconds until reset
  reset_at: number              // Unix timestamp in SECONDS for when the window resets
}

export interface RateLimitInfo {
  allowed: boolean              // REQUIRED — whether the request is allowed
  limit_reached: boolean        // REQUIRED — whether any limit is reached
  primary_window: WindowInfo | null   // REQUIRED field, but WindowInfo contents may be null
  secondary_window: WindowInfo | null // Optional — Plus accounts have this
}

export interface CreditsInfo {
  has_credits: boolean          // REQUIRED
  unlimited: boolean            // REQUIRED
  balance: string               // REQUIRED — numeric string (e.g., "0", "50")
  approx_local_messages: [number, number]  // REQUIRED — [min, max] range
  approx_cloud_messages: [number, number]  // REQUIRED — [min, max] range
}

export interface QuotaResponse {
  // === REQUIRED fields (must be present or trigger E7 partial data) ===
  user_id: string
  account_id: string
  email: string
  plan_type: string             // "plus" | "pro" | unknown string
  rate_limit: RateLimitInfo
  credits: CreditsInfo
  spend_control: { reached: boolean }
  // === OPTIONAL fields (gracefully handled if missing) ===
  code_review_rate_limit?: RateLimitInfo  // OPTIONAL — may be absent
  additional_rate_limits?: unknown        // OPTIONAL — ignored in v1.0 display
  promo?: unknown | null                  // OPTIONAL — displayed when non-null
}

export type DisplayMode = "compact" | "full"
```

**Step 2: Create directories**

```bash
mkdir -p src/services src/formatter
```

**Step 3: Create empty placeholder files**

`src/services/auth-reader.ts`:
```typescript
// Will implement in Task 3
```

`src/services/api-client.ts`:
```typescript
// Will implement in Task 4
```

`src/formatter/markdown.ts`:
```typescript
// Will implement in Task 5
```

`src/formatter/errors.ts`:
```typescript
// Will implement in Task 6
```

**Step 4: Verify types compile**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: add TypeScript type definitions for API + auth"
```

---

## Task 3: AuthReader Service

**Files:**
- Modify: `src/services/auth-reader.ts`
- Create: `tests/auth-reader.test.ts`

**Reference:** PRD 7.2 (Auth Flow), 10.1 (E1, E2, E3, E9, E10, E11), 8.1 (AuthInfo type)

**Step 1: Write failing tests for AuthReader**

`tests/auth-reader.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { readAuth, parseJwt } from "../src/services/auth-reader"

function makeFakeJwt(payload: object): string {
  const encoded = btoa(JSON.stringify(payload))
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`
}

function makeValidPayload(accountId = "acct_12345", email = "user@example.com") {
  return {
    "https://api.openai.com/auth": { "chatgpt_account_id": accountId },
    "https://api.openai.com/profile": { email },
  }
}

describe("parseJwt", () => {
  test("parses valid JWT payload with account_id and email", () => {
    const jwt = makeFakeJwt(makeValidPayload())
    const result = parseJwt(jwt)
    expect(result.accountId).toBe("acct_12345")
    expect(result.email).toBe("user@example.com")
  })

  test("handles base64url encoding (hyphens and underscores)", () => {
    // Create a payload that when base64url-encoded uses - and _
    const payload = makeValidPayload("acct_test", "a@b.co")
    const encoded = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    const jwt = `header.${encoded}.sig`
    const result = parseJwt(jwt)
    expect(result.accountId).toBe("acct_test")
  })

  test("throws on malformed JWT (no dots)", () => {
    expect(() => parseJwt("not-a-jwt")).toThrow()
  })

  test("throws on non-JSON payload", () => {
    const jwt = "header.bm90LWpzb24.signature" // "not-json" base64
    expect(() => parseJwt(jwt)).toThrow()
  })

  test("throws when chatgpt_account_id missing", () => {
    const payload = { "https://api.openai.com/profile": { email: "u@e.com" } }
    const jwt = makeFakeJwt(payload)
    expect(() => parseJwt(jwt)).toThrow(/account_id/i)
  })

  test("throws when email missing", () => {
    const payload = { "https://api.openai.com/auth": { "chatgpt_account_id": "acct_1" } }
    const jwt = makeFakeJwt(payload)
    expect(() => parseJwt(jwt)).toThrow(/email/i)
  })
})

describe("readAuth", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `codex-quota-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // --- E1: auth.json not found ---
  test("E1: returns error when auth.json not found", async () => {
    const result = await readAuth(join(tempDir, "nonexistent", "auth.json"))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E1")
  })

  // --- E2: no matching provider key ---
  test("E2: returns error when no matching provider key", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({ github: { type: "oauth", access: "tok" } }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E2")
  })

  // --- E3: token expired ---
  test("E3: returns error when token expired", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload())
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) - 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E3")
  })

  // --- E9: JWT parse failure ---
  test("E9: returns error on JWT parse failure", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: "not-a-valid-jwt", expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E9")
  })

  // --- E10: wrong auth type (not "oauth") ---
  test("E10: returns error when auth type is not 'oauth'", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "api_key", key: "sk-xxx" }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E10")
  })

  // --- E11: empty access token ---
  test("E11: returns error when access token is empty string", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: "", expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E11")
  })

  test("E11: returns error when access token is whitespace-only", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: "   ", expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E11")
  })

  test("E11: returns error when access field is missing", async () => {
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E11")
  })

  // --- Happy path ---
  test("returns AuthInfo on valid credentials (codex key)", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload("acct_abc", "test@example.com"))
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.accountId).toBe("acct_abc")
      expect(result.value.email).toBe("test@example.com")
      expect(result.value.token).toBe(fakeJwt)
    }
  })

  test("first-match-wins: tries provider keys in order codex → openai → chatgpt → opencode", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload("acct_xyz", "z@test.com"))
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      opencode: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.accountId).toBe("acct_xyz")
  })

  test("skips non-matching keys and finds valid one later in order", async () => {
    const fakeJwt = makeFakeJwt(makeValidPayload("acct_late", "late@test.com"))
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "api_key", key: "sk-bad" },   // E10 — skip
      openai: { type: "oauth", access: "", expires: Math.floor(Date.now() / 1000) + 3600 }, // E11 — skip
      chatgpt: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 } // valid
    }))
    const result = await readAuth(authFile)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.accountId).toBe("acct_late")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth-reader.test.ts`
Expected: FAIL — `parseJwt` and `readAuth` don't exist yet

**Step 3: Implement AuthReader**

`src/services/auth-reader.ts`:

```typescript
import { readFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"
import type { AuthInfo } from "../types"

type AuthResult = { ok: true; value: AuthInfo } | { ok: false; error: string }

interface JwtPayload {
  "https://api.openai.com/auth"?: {
    "chatgpt_account_id"?: string
  }
  "https://api.openai.com/profile"?: {
    "email"?: string
  }
}

export function parseJwt(token: string): { accountId: string; email: string } {
  const parts = token.split(".")
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format: expected 3 parts")
  }

  let payload: JwtPayload
  try {
    // Handle base64url encoding (replace - with + and _ with /)
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    while (base64.length % 4 !== 0) {
      base64 += "="
    }
    const decoded = atob(base64)
    payload = JSON.parse(decoded)
  } catch {
    throw new Error("Failed to decode JWT payload")
  }

  const accountId = payload["https://api.openai.com/auth"]?.["chatgpt_account_id"]
  if (!accountId) {
    throw new Error("Missing chatgpt_account_id in JWT")
  }

  const email = payload["https://api.openai.com/profile"]?.["email"]
  if (!email) {
    throw new Error("Missing email in JWT")
  }

  return { accountId, email }
}

const DEFAULT_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json")

const PROVIDER_KEYS = ["codex", "openai", "chatgpt", "opencode"] as const

export async function readAuth(authFilePath = DEFAULT_AUTH_PATH): Promise<AuthResult> {
  // E1: File not found
  let content: string
  try {
    content = await readFile(authFilePath, "utf-8")
  } catch {
    return { ok: false, error: "E1" }
  }

  // Parse auth.json
  let authData: Record<string, { type?: string; access?: string; expires?: number }>
  try {
    authData = JSON.parse(content)
  } catch {
    return { ok: false, error: "E9" }
  }

  // Scan provider keys in priority order — first-match-wins (PRD 7.2)
  for (const key of PROVIDER_KEYS) {
    const entry = authData[key]
    if (!entry) continue

    // E10: Wrong auth type
    if (entry.type !== "oauth") {
      return { ok: false, error: "E10" }
    }

    // E11: Empty or missing access token
    if (!entry.access || entry.access.trim() === "") {
      return { ok: false, error: "E11" }
    }

    // E3: Token expired (Unix seconds)
    if (entry.expires !== undefined && entry.expires < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: "E3" }
    }

    // E9: Parse JWT
    let jwtResult: { accountId: string; email: string }
    try {
      jwtResult = parseJwt(entry.access)
    } catch {
      return { ok: false, error: "E9" }
    }

    return {
      ok: true,
      value: {
        token: entry.access,
        accountId: jwtResult.accountId,
        email: jwtResult.email,
        expiresAt: entry.expires ?? 0,
      },
    }
  }

  // E2: No matching provider key found
  return { ok: false, error: "E2" }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth-reader.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/services/auth-reader.ts tests/auth-reader.test.ts
git commit -m "feat: AuthReader service — read auth.json, parse JWT, handle E1-E11 errors"
```

---

## Task 4: ApiClient Service

**Files:**
- Modify: `src/services/api-client.ts`
- Create: `tests/api-client.test.ts`

**Reference:** PRD 7.1 (API Endpoint), 8.1 (Validation Rules), 10.1 (E4, E5, E6, E7, E8), NF1 (10s timeout)

**Step 1: Write failing tests for ApiClient**

`tests/api-client.test.ts`:

```typescript
import { describe, test, expect, afterEach } from "vitest"
import { queryQuota } from "../src/services/api-client"
import type { QuotaResponse } from "../src/types"

describe("queryQuota", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(response: { status: number; body: unknown }): void {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
  }

  function mockFetchError(error: Error): void {
    globalThis.fetch = async () => { throw error }
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
  }

  // --- Happy path ---
  test("returns QuotaResponse on successful API call", async () => {
    mockFetch({ status: 200, body: validResponse })
    const result = await queryQuota("test-token", "acct_1")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.plan_type).toBe("plus")
      expect(result.value.rate_limit.primary_window?.used_percent).toBe(25)
    }
  })

  test("sends correct Authorization and ChatGPT-Account-Id headers", async () => {
    let capturedUrl: string | null = null
    let capturedHeaders: Record<string, string> = {}

    globalThis.fetch = async (input, init) => {
      capturedUrl = input.toString()
      capturedHeaders = Object.fromEntries((init?.headers as Headers).entries())
      return new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    await queryQuota("my-token", "acct_99")

    expect(capturedUrl).toBe("https://chatgpt.com/backend-api/wham/usage")
    expect(capturedHeaders["authorization"]).toBe("Bearer my-token")
    expect(capturedHeaders["chatgpt-account-id"]).toBe("acct_99")
  })

  // --- E4: Network failure (timeout, DNS, SSL, connection refused) ---
  test("E4: returns error on AbortError (timeout)", async () => {
    mockFetchError(new DOMException("The operation was aborted", "AbortError"))
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E4")
  })

  test("E4: returns error on generic network error", async () => {
    mockFetchError(new TypeError("fetch failed"))
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E4")
  })

  // --- E5: Auth errors ---
  test("E5: returns auth error on 401", async () => {
    mockFetch({ status: 401, body: { error: "unauthorized" } })
    const result = await queryQuota("bad-token", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E5")
  })

  test("E5: returns auth error on 403", async () => {
    mockFetch({ status: 403, body: { error: "forbidden" } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E5")
  })

  // --- E6: Rate limited ---
  test("E6: returns rate limit error on 429", async () => {
    mockFetch({ status: 429, body: { error: "rate limited" } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E6")
  })

  // --- E8: Server error ---
  test("E8: returns server error on 500", async () => {
    mockFetch({ status: 500, body: { error: "internal" } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E8")
  })

  // --- E7: Validation failures (per 8.1 validation rules) ---
  test("E7: returns error when response is not JSON object", async () => {
    mockFetch({ status: 200, body: "not-json" })
    // Note: JSON.stringify("not-json") is '"not-json"' which is valid JSON but not an object
    // We need to test with actual non-object response
    globalThis.fetch = async () =>
      new Response('"not an object"', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E7")
  })

  test("E7: returns error when rate_limit is missing", async () => {
    mockFetch({ status: 200, body: { plan_type: "plus", credits: {}, spend_control: {} } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E7")
  })

  test("E7: returns error when rate_limit is not an object", async () => {
    mockFetch({ status: 200, body: { plan_type: "plus", rate_limit: "bad", credits: {}, spend_control: {} } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("E7")
  })

  test("accepts response without code_review_rate_limit (it is OPTIONAL)", async () => {
    const response = { ...validResponse }
    delete (response as Record<string, unknown>).code_review_rate_limit
    mockFetch({ status: 200, body: response })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(true)
  })

  test("accepts response with plan_type as empty string (displays as Unknown later)", async () => {
    mockFetch({ status: 200, body: { ...validResponse, plan_type: "" } })
    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.plan_type).toBe("")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api-client.test.ts`
Expected: FAIL — `queryQuota` doesn't exist yet

**Step 3: Implement ApiClient**

`src/services/api-client.ts`:

```typescript
import type { QuotaResponse } from "../types"

type ApiResult = { ok: true; value: QuotaResponse } | { ok: false; error: string }

const API_URL = "https://chatgpt.com/backend-api/wham/usage"
const TIMEOUT_MS = 10_000

/**
 * Validates the API response against required fields per PRD 8.1.
 * code_review_rate_limit is OPTIONAL — its absence is not an error.
 */
function validateResponse(data: unknown): data is QuotaResponse {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>

  // Required string fields
  if (typeof d.plan_type !== "string") return false

  // Required: rate_limit must be a non-null object
  if (typeof d.rate_limit !== "object" || d.rate_limit === null) return false

  // Required: credits must be a non-null object
  if (typeof d.credits !== "object" || d.credits === null) return false

  // Required: spend_control must be a non-null object
  if (typeof d.spend_control !== "object" || d.spend_control === null) return false

  return true
}

export async function queryQuota(token: string, accountId: string): Promise<ApiResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "ChatGPT-Account-Id": accountId,
      },
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "E5" }
    }

    if (response.status === 429) {
      return { ok: false, error: "E6" }
    }

    if (response.status >= 500) {
      return { ok: false, error: "E8" }
    }

    const data = await response.json()

    if (!validateResponse(data)) {
      return { ok: false, error: "E7" }
    }

    return { ok: true, value: data }
  } catch {
    // E4: All network errors (timeout, DNS, SSL, connection refused)
    return { ok: false, error: "E4" }
  } finally {
    clearTimeout(timeout)
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api-client.test.ts`
Expected: ALL PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: ALL PASS (auth-reader + api-client)

**Step 6: Commit**

```bash
git add src/services/api-client.ts tests/api-client.test.ts
git commit -m "feat: ApiClient service — query wham/usage with timeout, validation, E4-E8 errors"
```

### Task 4 — Implementation Improvements (Code Quality Review)

After spec compliance review (PASS), a code quality review identified 4 issues that were fixed:

1. **🔴 HIGH — Deeper `validateResponse()`**: Original only checked top-level types (`typeof "object"` for nested fields). Fixed to validate all required nested fields:
   - Top-level: `user_id`, `account_id`, `email`, `plan_type` must be strings
   - `rate_limit`: `allowed` and `limit_reached` must be booleans
   - `primary_window` / `secondary_window`: when present, validates `used_percent`, `limit_window_seconds`, `reset_after_seconds`, `reset_at` as numbers
   - `credits`: `has_credits`, `unlimited` booleans, `balance` string
   - `spend_control`: `reached` boolean

2. **🟡 MEDIUM — Unhandled HTTP status codes**: Added catch-all for non-2xx status codes not explicitly handled (e.g., 400, 404, 422). Returns E8.

3. **🟡 MEDIUM — Missing edge-case tests**: Added 4 new tests (17 total):
   - Non-JSON 200 response body → E4
   - Empty token string → E5
   - Empty accountId string → E5
   - Unhandled 404 status → E8

4. **🟡 MEDIUM — Empty input guard**: `queryQuota` now early-returns E5 for empty/whitespace `token` or `accountId` before making network calls.

**Final stats**: 17 tests, 35 total suite, `tsc --noEmit` clean, `biome check` clean.

---

## Task 5: Formatter — Markdown Output

**Files:**
- Modify: `src/formatter/markdown.ts`
- Create: `tests/markdown.test.ts`

**Reference:** PRD 8.2 (Progress Bar with clamping), 8.3 (Time Formatting), 9.1–9.5 (Output Spec), 9.2 (Compact mode), 9.3 (Full mode), 9.4 (Conditional Sections), 9.5 (Edge Cases)

**Step 1: Write failing tests for Formatter**

`tests/markdown.test.ts`:

```typescript
import { describe, test, expect } from "vitest"
import { formatQuota, buildProgressBar, formatTime } from "../src/formatter/markdown"
import type { QuotaResponse } from "../src/types"

// Helper to create a base response for tests
function createBaseResponse(overrides?: Partial<QuotaResponse>): QuotaResponse {
  return {
    user_id: "u1",
    account_id: "acct_1",
    email: "user@example.com",
    plan_type: "plus",
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 25,
        limit_window_seconds: 18000,
        reset_after_seconds: 3600,
        reset_at: 1743272400,
      },
      secondary_window: {
        used_percent: 16,
        limit_window_seconds: 604800,
        reset_after_seconds: 86400,
        reset_at: 1743877200,
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
    ...overrides,
  }
}

// === buildProgressBar ===
describe("buildProgressBar", () => {
  test("0% → empty bar", () => {
    expect(buildProgressBar(0)).toBe("░░░░░░░░░░░░")
  })

  test("100% → full bar", () => {
    expect(buildProgressBar(100)).toBe("████████████")
  })

  test("50% → half filled", () => {
    expect(buildProgressBar(50)).toBe("██████░░░░░░")
  })

  test("25% → 3 filled", () => {
    expect(buildProgressBar(25)).toBe("███░░░░░░░░░")
  })

  test("75% → 9 filled", () => {
    expect(buildProgressBar(75)).toBe("█████████░░░")
  })

  test("8% → 1 filled (rounds 0.96 → 1)", () => {
    expect(buildProgressBar(8)).toBe("█░░░░░░░░░░░")
  })

  test("clamps >100% to full bar (12 chars)", () => {
    expect(buildProgressBar(105)).toBe("████████████")
  })
})

// === formatTime ===
describe("formatTime", () => {
  test("0 seconds → now", () => {
    expect(formatTime(0)).toBe("now")
  })

  test("45 seconds → 45s", () => {
    expect(formatTime(45)).toBe("45s")
  })

  test("125 seconds → 2m 5s", () => {
    expect(formatTime(125)).toBe("2m 5s")
  })

  test("3600 seconds → 1h 0m", () => {
    expect(formatTime(3600)).toBe("1h 0m")
  })

  test("90061 seconds → 1d 1h", () => {
    expect(formatTime(90061)).toBe("1d 1h")
  })

  test("86400 seconds → 1d 0h", () => {
    expect(formatTime(86400)).toBe("1d 0h")
  })
})

// === Full Mode ===
describe("formatQuota — full mode", () => {
  test("includes plan type and email in header", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).toContain("**Plan:** Plus")
    expect(result).toContain("**Account:** user@example.com")
  })

  test("includes primary window with progress bar and percentage", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).toContain("**Primary (5h)**")
    expect(result).toContain("25%")
    expect(result).toContain("███░░░░░░░░░")
  })

  test("includes secondary window when present", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).toContain("**Weekly**")
    expect(result).toContain("16%")
  })

  test("skips secondary window row when null", () => {
    const noSecondary = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_after_seconds: 3600, reset_at: 1743272400 },
        secondary_window: null,
      },
    })
    const result = formatQuota(noSecondary, "full")
    expect(result).not.toContain("**Weekly**")
  })

  test("shows code review section when primary_window is not null", () => {
    const withCodeReview = createBaseResponse({
      code_review_rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: 0, limit_window_seconds: 604800, reset_after_seconds: 604800, reset_at: 1743877200 },
        secondary_window: null,
      },
    })
    const result = formatQuota(withCodeReview, "full")
    expect(result).toContain("## Code Review Quota")
  })

  test("hides code review section when primary_window is null", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).not.toContain("## Code Review Quota")
  })

  test("shows credits when has_credits is true", () => {
    const withCredits = createBaseResponse({
      credits: { has_credits: true, unlimited: false, balance: "50", approx_local_messages: [10, 20], approx_cloud_messages: [5, 15] },
    })
    const result = formatQuota(withCredits, "full")
    expect(result).toContain("## Credits")
    expect(result).toContain("50")
    expect(result).toContain("10 — 20")
    expect(result).toContain("5 — 15")
  })

  test("hides credits when has_credits is false and unlimited is false", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).not.toContain("## Credits")
  })

  test("shows spend control status — within limit", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).toContain("✅ Within limit")
  })

  test("shows spend control status — limit reached", () => {
    const result = formatQuota(createBaseResponse({ spend_control: { reached: true } }), "full")
    expect(result).toContain("🚫 Limit reached")
  })

  test("shows warning banner (blockquote) when usage >= 80%", () => {
    const highUsage = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: 85, limit_window_seconds: 18000, reset_after_seconds: 3600, reset_at: 1743272400 },
        secondary_window: null,
      },
    })
    const result = formatQuota(highUsage, "full")
    expect(result).toContain("⚠️")
  })

  test("shows limit reached banner at 100%", () => {
    const atLimit = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: { used_percent: 100, limit_window_seconds: 18000, reset_after_seconds: 0, reset_at: 1743272400 },
        secondary_window: null,
      },
    })
    const result = formatQuota(atLimit, "full")
    expect(result).toContain("🚫")
  })

  test("clamps >100% to full bar but shows actual value", () => {
    const overLimit = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: { used_percent: 105, limit_window_seconds: 18000, reset_after_seconds: 0, reset_at: 1743272400 },
        secondary_window: null,
      },
    })
    const result = formatQuota(overLimit, "full")
    expect(result).toContain("████████████")
    expect(result).toContain("105%")
  })

  test("includes Updated timestamp footer in italic", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).toMatch(/\*Updated:.*\*/)
  })

  test("does NOT wrap output in code blocks", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).not.toMatch(/^```\n/)
    expect(result).not.toMatch(/\n```$/)
  })

  test("shows promo section when promo is non-null", () => {
    const withPromo = createBaseResponse({ promo: { description: "2x rate limits" } })
    const result = formatQuota(withPromo, "full")
    expect(result).toContain("Promotional quota active")
  })

  test("hides promo section when promo is null", () => {
    const result = formatQuota(createBaseResponse(), "full")
    expect(result).not.toContain("Promotional")
  })

  test("unknown plan_type displays capitalized", () => {
    const result = formatQuota(createBaseResponse({ plan_type: "enterprise" }), "full")
    expect(result).toContain("Enterprise")
  })

  test("plan_type empty string displays as Unknown", () => {
    const result = formatQuota(createBaseResponse({ plan_type: "" }), "full")
    expect(result).toContain("Unknown")
  })

  test("null primary_window shows N/A", () => {
    const noPrimary = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: null,
        secondary_window: null,
      },
    })
    const result = formatQuota(noPrimary, "full")
    expect(result).toContain("N/A")
  })

  test("approx messages [0,0] shows 0 not '0 — 0'", () => {
    const withCredits = createBaseResponse({
      credits: { has_credits: true, unlimited: false, balance: "0", approx_local_messages: [0, 0], approx_cloud_messages: [0, 0] },
    })
    const result = formatQuota(withCredits, "full")
    expect(result).not.toContain("0 — 0")
  })
})

// === Compact Mode ===
describe("formatQuota — compact mode", () => {
  test("uses h3 header with capitalized plan type", () => {
    const result = formatQuota(createBaseResponse(), "compact")
    expect(result).toContain("### Codex Quota — Plus")
  })

  test("shows only primary and secondary windows", () => {
    const result = formatQuota(createBaseResponse(), "compact")
    expect(result).toContain("| 5h |")
    expect(result).toContain("| Weekly |")
  })

  test("does NOT show code review, credits, spend control, promo", () => {
    const result = formatQuota(createBaseResponse(), "compact")
    expect(result).not.toContain("Code Review")
    expect(result).not.toContain("Credits")
    expect(result).not.toContain("Spend Control")
    expect(result).not.toContain("Promotional")
  })

  test("shows status line only when usage >= 50%", () => {
    const highUsage = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: { used_percent: 55, limit_window_seconds: 18000, reset_after_seconds: 3600, reset_at: 1743272400 },
        secondary_window: null,
      },
    })
    const result = formatQuota(highUsage, "compact")
    expect(result).toContain("**Status**")
  })

  test("does NOT show status line when all usage < 50%", () => {
    const result = formatQuota(createBaseResponse(), "compact")
    expect(result).not.toContain("**Status**")
  })

  test("most severe status wins: 🚫 over ⚠️ over ✅", () => {
    const mixed = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: { used_percent: 100, limit_window_seconds: 18000, reset_after_seconds: 0, reset_at: 1743272400 },
        secondary_window: { used_percent: 60, limit_window_seconds: 604800, reset_after_seconds: 86400, reset_at: 1743877200 },
      },
    })
    const result = formatQuota(mixed, "compact")
    expect(result).toContain("🚫")
    expect(result).not.toContain("✅")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/markdown.test.ts`
Expected: FAIL — functions don't exist yet

**Step 3: Implement Formatter**

`src/formatter/markdown.ts`:

```typescript
import type { QuotaResponse, DisplayMode, WindowInfo } from "../types"

const BAR_LENGTH = 12
const FILL = "█"
const EMPTY = "░"

/**
 * Build a 12-character progress bar. Clamps values > 100 to full bar.
 * PRD 8.2: Math.round(Math.min(used_percent, 100) / 100 * 12)
 */
export function buildProgressBar(usedPercent: number): string {
  const clamped = Math.min(usedPercent, 100)
  const filled = Math.round((clamped / 100) * BAR_LENGTH)
  return FILL.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled)
}

/**
 * Format seconds to human-readable string. PRD 8.3.
 */
export function formatTime(seconds: number): string {
  if (seconds <= 0) return "now"

  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function capitalize(s: string): string {
  if (!s) return "Unknown"
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatMessageRange(range: [number, number]): string {
  if (range[0] === 0 && range[1] === 0) return "0"
  return `${range[0]} — ${range[1]}`
}

function windowRow(label: string, window: WindowInfo | null): string {
  if (!window) return `| **${label}** | N/A | N/A | N/A |`
  const bar = buildProgressBar(window.used_percent)
  const time = formatTime(window.reset_after_seconds)
  return `| **${label}** | ${window.used_percent}% | \`${bar}\` ${window.used_percent}% | ${time} |`
}

type WarningLevel = "none" | "advisory" | "warning" | "critical"

function getWarningLevel(window: WindowInfo | null): WarningLevel {
  if (!window) return "none"
  if (window.used_percent >= 100) return "critical"
  if (window.used_percent >= 80) return "warning"
  if (window.used_percent >= 50) return "advisory"
  return "none"
}

const severityOrder: Record<WarningLevel, number> = {
  critical: 3,
  warning: 2,
  advisory: 1,
  none: 0,
}

function getMostSevereStatus(response: QuotaResponse): WarningLevel {
  const levels: WarningLevel[] = [
    getWarningLevel(response.rate_limit.primary_window),
    getWarningLevel(response.rate_limit.secondary_window),
  ]
  return levels.reduce((worst, level) =>
    severityOrder[level] > severityOrder[worst] ? level : worst
  , "none" as WarningLevel)
}

function formatWarnings(response: QuotaResponse): string {
  const lines: string[] = []
  const windows = [
    { name: "Primary (5h)", window: response.rate_limit.primary_window },
    { name: "Weekly", window: response.rate_limit.secondary_window },
  ]

  for (const { name, window } of windows) {
    if (!window) continue
    if (window.used_percent >= 100) {
      lines.push(`> 🚫 ${name} — limit reached. Resets in ${formatTime(window.reset_after_seconds)}.`)
    } else if (window.used_percent >= 80) {
      lines.push(`> ⚠️ ${name} at ${window.used_percent}% — approaching limit.`)
    }
  }

  // Advisory notes (50-79%)
  for (const { name, window } of windows) {
    if (!window) continue
    if (window.used_percent >= 50 && window.used_percent < 80) {
      lines.push(`> ⚠️ ${name} at ${window.used_percent}% — consider pacing your usage.`)
    }
  }

  return lines.join("\n\n")
}

function formatFull(response: QuotaResponse): string {
  const sections: string[] = []

  // Header
  const planDisplay = capitalize(response.plan_type)
  sections.push(
    `# OpenAI Codex Subscription\n\n**Plan:** ${planDisplay} | **Account:** ${response.email}`
  )

  // Quota Limits (always shown)
  let quotaTable = `## Quota Limits\n\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|`

  if (response.rate_limit.primary_window) {
    quotaTable += `\n${windowRow("Primary (5h)", response.rate_limit.primary_window)}`
  } else {
    quotaTable += `\n${windowRow("Primary (5h)", null)}`
  }

  if (response.rate_limit.secondary_window) {
    quotaTable += `\n${windowRow("Weekly", response.rate_limit.secondary_window)}`
  }

  sections.push(quotaTable)

  // Warnings
  const warnings = formatWarnings(response)
  if (warnings) {
    sections.push(warnings)
  }

  // Code Review Quota — only when primary_window is not null (9.4)
  if (response.code_review_rate_limit?.primary_window) {
    const crTable = `## Code Review Quota\n\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|\n${windowRow("Weekly", response.code_review_rate_limit.primary_window)}`
    sections.push(crTable)
  }

  // Credits — only when has_credits or unlimited (9.4)
  if (response.credits.has_credits || response.credits.unlimited) {
    const creditsTable = `## Credits\n\n| Metric | Value |\n|--------|-------|\n` +
      `| **Balance** | ${response.credits.unlimited ? "Unlimited" : response.credits.balance} |\n` +
      `| **Approx. Local Messages** | ${formatMessageRange(response.credits.approx_local_messages)} |\n` +
      `| **Approx. Cloud Messages** | ${formatMessageRange(response.credits.approx_cloud_messages)} |`
    sections.push(creditsTable)
  }

  // Spend Control (always shown)
  const spendStatus = response.spend_control.reached ? "🚫 Limit reached" : "✅ Within limit"
  sections.push(`## Spend Control\n\n**Status:** ${spendStatus}`)

  // Promo — only when non-null (9.4)
  if (response.promo !== null && response.promo !== undefined) {
    sections.push("## Promotional\n\n🎁 Promotional quota active")
  }

  // Timestamp footer
  sections.push(`*Updated: ${new Date().toISOString()}*`)

  return sections.join("\n\n---\n\n")
}

function formatCompact(response: QuotaResponse): string {
  const lines: string[] = []

  const planDisplay = capitalize(response.plan_type)
  lines.push(`### Codex Quota — ${planDisplay}`)
  lines.push("")
  lines.push("| Window | Usage | Progress | Reset |")
  lines.push("|--------|-------|----------|-------|")

  if (response.rate_limit.primary_window) {
    const w = response.rate_limit.primary_window
    const bar = buildProgressBar(w.used_percent)
    const time = formatTime(w.reset_after_seconds)
    lines.push(`| 5h | ${w.used_percent}% | \`${bar}\` | ${time} |`)
  }

  if (response.rate_limit.secondary_window) {
    const w = response.rate_limit.secondary_window
    const bar = buildProgressBar(w.used_percent)
    const time = formatTime(w.reset_after_seconds)
    lines.push(`| Weekly | ${w.used_percent}% | \`${bar}\` | ${time} |`)
  }

  // Compact status — most severe wins (PRD 9.2: 🚫 > ⚠️ > ✅)
  const status = getMostSevereStatus(response)
  if (status === "critical") {
    lines.push(`\n**Status**: 🚫 Limit reached`)
  } else if (status === "warning") {
    lines.push(`\n**Status**: ⚠️ Approaching limit`)
  } else if (status === "advisory") {
    lines.push(`\n**Status**: ✅ Within limits`)
  }
  // status === "none" → omit status line entirely

  return lines.join("\n")
}

export function formatQuota(response: QuotaResponse, mode: DisplayMode): string {
  if (mode === "compact") {
    return formatCompact(response)
  }
  return formatFull(response)
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/markdown.test.ts`
Expected: ALL PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/formatter/markdown.ts tests/markdown.test.ts
git commit -m "feat: Formatter — Markdown output with compact/full modes, progress bars, time formatting"
```

---

## Task 6: Error Formatter

**Files:**
- Create: `src/formatter/errors.ts`
- Create: `tests/errors.test.ts`

**Reference:** PRD 10.1 (Error Scenarios E1–E11), 10.2 (Error Output Design with exact Markdown)

**Step 1: Write failing tests for error formatter**

`tests/errors.test.ts`:

```typescript
import { describe, test, expect } from "vitest"
import { formatError } from "../src/formatter/errors"

describe("formatError", () => {
  test("E1 — auth.json not found", () => {
    const result = formatError("E1")
    expect(result).toContain("Not Configured")
    expect(result).toContain("auth.json")
    expect(result).toContain("opencode auth login")
  })

  test("E2 — no matching provider", () => {
    const result = formatError("E2")
    expect(result).toContain("No OpenAI Credentials")
    expect(result).toContain("codex")
    expect(result).toContain("opencode auth login")
  })

  test("E3 — token expired", () => {
    const result = formatError("E3")
    expect(result).toContain("Token Expired")
    expect(result).toContain("opencode auth login")
  })

  test("E4 — network error (generic, not timeout-specific)", () => {
    const result = formatError("E4")
    expect(result).toContain("Connection Error")
    expect(result).toContain("internet connection")
  })

  test("E5 — auth error 401/403", () => {
    const result = formatError("E5")
    expect(result).toContain("Token Expired")
    expect(result).toContain("opencode auth login")
  })

  test("E6 — rate limited", () => {
    const result = formatError("E6")
    expect(result).toContain("Rate Limited")
  })

  test("E7 — unexpected schema with partial data", () => {
    const result = formatError("E7", { plan_type: "plus" })
    expect(result).toContain("Partial Data")
    expect(result).toContain("unexpected data format")
  })

  test("E8 — server error", () => {
    const result = formatError("E8")
    expect(result).toContain("Service Unavailable")
    expect(result).toContain("server error")
  })

  test("E9 — JWT parse failure", () => {
    const result = formatError("E9")
    expect(result).toContain("Invalid Token Format")
    expect(result).toContain("opencode auth login")
  })

  test("E10 — wrong auth type (not OAuth)", () => {
    const result = formatError("E10")
    expect(result).toContain("Incompatible Auth Method")
    expect(result).toContain("OAuth")
    expect(result).toContain("opencode auth login")
  })

  test("E11 — empty access token", () => {
    const result = formatError("E11")
    expect(result).toContain("Incomplete Credentials")
    expect(result).toContain("access token")
    expect(result).toContain("opencode auth login")
  })

  test("all E1–E11 errors use ⚠️ icon", () => {
    const codes = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11"]
    for (const code of codes) {
      expect(formatError(code)).toContain("⚠️")
    }
  })

  test("all errors are raw Markdown (not code block wrapped)", () => {
    const codes = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11"]
    for (const code of codes) {
      const result = formatError(code)
      expect(result).not.toMatch(/^```\n/)
      expect(result).not.toMatch(/\n```$/)
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/errors.test.ts`
Expected: FAIL — `formatError` doesn't exist yet

**Step 3: Implement error formatter**

`src/formatter/errors.ts`:

```typescript
export function formatError(code: string, partialData?: unknown): string {
  switch (code) {
    case "E1":
      return [
        `## ⚠️ Codex Quota — Not Configured`,
        ``,
        `OpenCode auth file not found at:`,
        `\`~/.local/share/opencode/auth.json\``,
        ``,
        `**Setup:**`,
        `1. Run \`opencode auth login\``,
        `2. Select **ChatGPT Plus/Pro (Codex Subscription)**`,
        `3. Complete OAuth flow`,
        `4. Run \`/codex_quota\` again`,
      ].join("\n")

    case "E2":
      return [
        `## ⚠️ Codex Quota — No OpenAI Credentials`,
        ``,
        `No OpenAI/ChatGPT credentials found in auth file.`,
        `Looked for keys: \`codex\`, \`openai\`, \`chatgpt\`, \`opencode\``,
        ``,
        `**Setup:**`,
        `1. Run \`opencode auth login\``,
        `2. Select **ChatGPT Plus/Pro (Codex Subscription)**`,
        `3. Complete OAuth flow`,
        `4. Run \`/codex_quota\` again`,
      ].join("\n")

    case "E3":
    case "E5":
      return [
        `## ⚠️ Codex Quota — Token Expired`,
        ``,
        `Your OpenAI token has expired.`,
        ``,
        `**Fix:** Run \`opencode auth login\` to refresh your credentials.`,
      ].join("\n")

    case "E4":
      return [
        `## ⚠️ Codex Quota — Connection Error`,
        ``,
        `Could not reach OpenAI servers.`,
        ``,
        `**Check:** Your internet connection and try again.`,
      ].join("\n")

    case "E6":
      return [
        `## ⚠️ Codex Quota — Rate Limited`,
        ``,
        `Too many requests to the quota endpoint. Try again in a few seconds.`,
      ].join("\n")

    case "E7":
      return [
        `## ⚠️ Codex Quota — Partial Data`,
        ``,
        `OpenAI returned unexpected data format. Showing what's available:`,
        ``,
        partialData ? JSON.stringify(partialData, null, 2) : "(no data)",
        ``,
        `> The API response structure may have changed. Consider updating the plugin.`,
      ].join("\n")

    case "E8":
      return [
        `## ⚠️ Codex Quota — Service Unavailable`,
        ``,
        `OpenAI returned a server error (5xx). Try again later.`,
      ].join("\n")

    case "E9":
      return [
        `## ⚠️ Codex Quota — Invalid Token Format`,
        ``,
        `Could not parse the stored token.`,
        ``,
        `**Fix:** Run \`opencode auth login\` to re-authenticate.`,
      ].join("\n")

    case "E10":
      return [
        `## ⚠️ Codex Quota — Incompatible Auth Method`,
        ``,
        `Found credentials but they are not OAuth-based (got \`api_key\` type).`,
        `Codex quota requires an OAuth session.`,
        ``,
        `**Fix:** Run \`opencode auth login\` and select **ChatGPT Plus/Pro (Codex Subscription)**.`,
      ].join("\n")

    case "E11":
      return [
        `## ⚠️ Codex Quota — Incomplete Credentials`,
        ``,
        `Found OAuth credentials but the access token is empty or missing.`,
        ``,
        `**Fix:** Run \`opencode auth login\` to re-authenticate.`,
      ].join("\n")

    default:
      return [
        `## ⚠️ Codex Quota — Unknown Error`,
        ``,
        `An unexpected error occurred: ${code}`,
      ].join("\n")
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/errors.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/formatter/errors.ts tests/errors.test.ts
git commit -m "feat: error formatter — Markdown output for all E1–E11 scenarios"
```

---

## Task 7: Plugin Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

**Reference:** PRD 8.4 (Display Mode Trigger), 8.5 (Plugin API Contract), 11.1 (Architecture), 11.3 (Plugin Lifecycle)

**Step 1: Write failing test for the plugin entry point**

`tests/index.test.ts`:

```typescript
import { describe, test, expect, afterEach, beforeEach } from "vitest"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

// Test the CodexQuotaPlugin export exists and has the right shape
describe("CodexQuotaPlugin", () => {
  test("exports a named const that is a function", async () => {
    const mod = await import("../src/index")
    expect(typeof mod.CodexQuotaPlugin).toBe("function")
  })

  test("calling the plugin returns an object with tool.codex_quota", async () => {
    const mod = await import("../src/index")
    const result = await mod.CodexQuotaPlugin({} as never)
    expect(result).toHaveProperty("tool")
    expect(result.tool).toHaveProperty("codex_quota")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `src/index.ts` is empty

**Step 3: Implement plugin entry point**

`src/index.ts`:

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"
import { readAuth } from "./services/auth-reader"
import { queryQuota } from "./services/api-client"
import { formatQuota } from "./formatter/markdown"
import { formatError } from "./formatter/errors"
import type { DisplayMode } from "./types"

export const CodexQuotaPlugin: Plugin = async () => {
  return {
    tool: {
      codex_quota: tool({
        description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
        args: {
          mode: tool.schema.optional(
            tool.schema.string().describe("Display mode: 'compact' or 'full'. Default: 'full'")
          ),
        },
        async execute(args) {
          // Invalid or missing mode → treat as "full" (PRD 8.4)
          const mode: DisplayMode = args.mode === "compact" ? "compact" : "full"

          // Step 1: Read auth — fresh read on each call (PRD 11.3)
          const authResult = await readAuth()
          if (!authResult.ok) {
            return formatError(authResult.error)
          }

          // Step 2: Query API
          const apiResult = await queryQuota(
            authResult.value.token,
            authResult.value.accountId
          )
          if (!apiResult.ok) {
            return formatError(apiResult.error)
          }

          // Step 3: Format output
          return formatQuota(apiResult.value, mode)
        },
      }),
    },
  }
}
```

**Step 4: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS (may need to adjust import paths based on actual `@opencode-ai/plugin` exports)

**Step 5: Run tests**

Run: `npx vitest run tests/index.test.ts`
Expected: ALL PASS

**Step 6: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: plugin entry point — codex_quota tool with compact/full modes"
```

---

## Task 8: Integration Tests

**Files:**
- Create: `tests/integration.test.ts`

**Reference:** PRD 11.2 (Data Flow), 13.2 (Success Criteria)

**Step 1: Write integration tests**

`tests/integration.test.ts`:

```typescript
import { describe, test, expect, afterEach, beforeEach } from "vitest"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { readAuth } from "../src/services/auth-reader"
import { queryQuota } from "../src/services/api-client"
import { formatQuota } from "../src/formatter/markdown"
import { formatError } from "../src/formatter/errors"
import type { QuotaResponse } from "../src/types"

function makeFakeJwt(accountId = "acct_1", email = "test@example.com"): string {
  const payload = {
    "https://api.openai.com/auth": { "chatgpt_account_id": accountId },
    "https://api.openai.com/profile": { email },
  }
  return `head.${btoa(JSON.stringify(payload))}.sig`
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
}

describe("Integration — full pipeline", () => {
  const originalFetch = globalThis.fetch
  let tempDir: string

  beforeEach(async () => {
    tempDir = join(tmpdir(), `integration-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    await rm(tempDir, { recursive: true, force: true })
  })

  // --- Error paths ---
  test("E1 pipeline: missing auth.json → error markdown", async () => {
    const authResult = await readAuth(join(tempDir, "nonexistent", "auth.json"))
    expect(authResult.ok).toBe(false)
    if (!authResult.ok) {
      const output = formatError(authResult.error)
      expect(output).toContain("⚠️")
      expect(output).toContain("auth.json")
    }
  })

  test("E5 pipeline: invalid token → API 401 → error markdown", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })

    const apiResult = await queryQuota("bad-token", "acct")
    expect(apiResult.ok).toBe(false)
    if (!apiResult.ok) {
      const output = formatError(apiResult.error)
      expect(output).toContain("Token Expired")
    }
  })

  test("E4 pipeline: network error → error markdown", async () => {
    globalThis.fetch = async () => { throw new TypeError("fetch failed") }

    const apiResult = await queryQuota("tok", "acct")
    expect(apiResult.ok).toBe(false)
    if (!apiResult.ok) {
      const output = formatError(apiResult.error)
      expect(output).toContain("Connection Error")
    }
  })

  // --- Happy paths ---
  test("happy path: full mode pipeline produces valid markdown", async () => {
    // 1. Setup auth file
    const fakeJwt = makeFakeJwt()
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }))

    // 2. Mock API
    globalThis.fetch = async () =>
      new Response(JSON.stringify(validApiPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })

    // 3. Execute pipeline
    const authResult = await readAuth(authFile)
    expect(authResult.ok).toBe(true)

    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : ""
    )
    expect(apiResult.ok).toBe(true)

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "full")
      // Verify all sections present
      expect(output).toContain("OpenAI Codex Subscription")
      expect(output).toContain("Plus")
      expect(output).toContain("test@example.com")
      expect(output).toContain("Quota Limits")
      expect(output).toContain("Primary (5h)")
      expect(output).toContain("10%")
      expect(output).toContain("Weekly")
      expect(output).toContain("Code Review Quota")
      expect(output).toContain("Credits")
      expect(output).toContain("25")
      expect(output).toContain("Spend Control")
      expect(output).toContain("Within limit")
      expect(output).toContain("Updated:")
      // No code block wrapping
      expect(output).not.toMatch(/^```\n/)
    }
  })

  test("happy path: compact mode pipeline produces concise markdown", async () => {
    const fakeJwt = makeFakeJwt()
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }))

    globalThis.fetch = async () =>
      new Response(JSON.stringify(validApiPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })

    const authResult = await readAuth(authFile)
    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : ""
    )

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "compact")
      expect(output).toContain("### Codex Quota")
      expect(output).toContain("| 5h |")
      expect(output).toContain("| Weekly |")
      expect(output).not.toContain("Code Review")
      expect(output).not.toContain("Credits")
      expect(output).not.toContain("Spend Control")
    }
  })

  test("high usage: full mode shows warning banners", async () => {
    const fakeJwt = makeFakeJwt()
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify({
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }))

    const highUsagePayload = {
      ...validApiPayload,
      rate_limit: {
        ...validApiPayload.rate_limit,
        primary_window: { ...validApiPayload.rate_limit.primary_window!, used_percent: 92 },
        limit_reached: true,
        allowed: false,
      },
    }

    globalThis.fetch = async () =>
      new Response(JSON.stringify(highUsagePayload), { status: 200 })

    const authResult = await readAuth(authFile)
    const apiResult = await queryQuota(
      authResult.ok ? authResult.value.token : "",
      authResult.ok ? authResult.value.accountId : ""
    )

    if (apiResult.ok) {
      const output = formatQuota(apiResult.value, "full")
      expect(output).toContain("⚠️")
      expect(output).toContain("92%")
    }
  })
})
```

**Step 2: Run integration tests**

Run: `npx vitest run tests/integration.test.ts`
Expected: ALL PASS

**Step 3: Run ALL tests**

Run: `npm test`
Expected: ALL PASS (auth-reader + api-client + markdown + errors + index + integration)

**Step 4: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: integration tests — full pipeline from auth through API to markdown output"
```

---

## Task 9: Final Verification + Build Validation

**Files:**
- No new files — verification only

**Reference:** PRD 13.3 (Final Verification Wave), 6 (Guardrails G1–G11)

**Step 1: Run full test suite with coverage**

Run: `npm run test:coverage`
Expected: ALL tests pass, >90% coverage reported

**Step 2: Run TypeScript type check**

Run: `npm run typecheck`
Expected: 0 errors

**Step 3: Run linter**

Run: `npm run lint`
Expected: PASS — no issues

**Step 4: Build the plugin**

Run: `npm run build`
Expected: `dist/` directory created with compiled JS + `.d.ts` files

**Step 5: Verify dist output structure**

Run: `ls -R dist/`
Expected:
```
dist/
  index.js
  index.d.ts
  index.d.ts.map
  index.js.map
  services/
    auth-reader.js
    auth-reader.d.ts
    api-client.js
    api-client.d.ts
    ...
  formatter/
    markdown.js
    markdown.d.ts
    errors.js
    errors.d.ts
    ...
```

**Step 6: Check guardrail compliance (PRD 6)**

Run: `grep -r "process.env" src/ || echo "CLEAN"`
Expected: Only `process.env.HOME` usage for auth path (if any) — verify no env var auth

Verify each guardrail:
| Guardrail | Check |
|-----------|-------|
| G1: No env var auth | No `process.env` for tokens/keys |
| G2: No multi-provider | Only OpenAI endpoint in api-client |
| G3: No monolithic | Multiple files in services/ + formatter/ |
| G4: No polling | No intervals, no setTimeout loops |
| G5: No caching | No Map/cache state |
| G6: Read-only | No POST/PUT/PATCH |
| G7: No credential logging | No console.log of tokens |
| G8: No ASCII box | No ╔╗║╚╝ in formatter |
| G9: No code blocks | formatQuota returns raw Markdown |
| G10: No toast | No toast calls |
| G11: No retry | No retry loops in ApiClient |

**Step 7: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address verification findings"
```

---

## Task 10: README Documentation

**Files:**
- Create: `README.md`

**Reference:** PRD 11.4 (Plugin Installation)

**Step 1: Write README**

```markdown
# opencode-codex-quota

OpenCode plugin to display ChatGPT Plus/Pro Codex subscription quota.

## Install

Add to your `opencode.json` config:

```json
{
  "plugin": ["opencode-codex-quota"]
}
```

## Usage

### User Command (Full Mode)

```
/codex_quota
```

Shows complete quota details: plan type, primary 5h window, weekly window,
code review quota, credits, spend control, and promotional info.

### Agent Subtask (Compact Mode)

The tool can be called by AI agents with compact mode for concise output:

```
/codex_quota mode=compact
```

## Requirements

- OpenCode with ChatGPT Plus/Pro subscription
- OAuth credentials stored via `opencode auth login`

## Error Handling

The plugin shows user-friendly Markdown messages for common issues:

- Missing auth → setup instructions
- Wrong auth type → OAuth setup instructions
- Empty token → re-auth instructions
- Expired token → re-auth instructions
- Network error → connection guidance
- API errors → appropriate error messages

## Development

```bash
npm install
npm test
npm run build
npm run lint
```

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation, usage, and development instructions"
```

---

## Dependency Summary

```
Task 1:  Scaffolding              → no deps
Task 2:  Types                    → depends on Task 1
Task 3:  AuthReader               → depends on Task 1, 2
Task 4:  ApiClient                → depends on Task 1, 2
Task 5:  Formatter (markdown)     → depends on Task 2
Task 6:  Error formatter          → depends on Task 2
Task 7:  Plugin entry point       → depends on Task 3, 4, 5, 6
Task 8:  Integration tests        → depends on Task 7
Task 9:  Verification + build     → depends on Task 8
Task 10: README                   → depends on Task 9
```

**Parallelizable:** Tasks 3 + 4 + 5 + 6 can run in parallel after Task 2.

## Commit Strategy

1. `chore: project scaffolding with node.js, typescript, biome config`
2. `feat: add TypeScript type definitions for API + auth`
3. `feat: AuthReader service — read auth.json, parse JWT, handle E1-E11 errors`
4. `feat: ApiClient service — query wham/usage with timeout, validation, E4-E8 errors`
5. `feat: Formatter — Markdown output with compact/full modes, progress bars, time formatting`
6. `feat: error formatter — Markdown output for all E1-E11 scenarios`
7. `feat: plugin entry point — codex_quota tool with compact/full modes`
8. `test: integration tests — full pipeline from auth through API to markdown output`
9. (fixes if needed from verification)
10. `docs: add README with installation, usage, and development instructions`
