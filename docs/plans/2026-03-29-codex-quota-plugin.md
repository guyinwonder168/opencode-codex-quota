# OpenCode Codex Quota Plugin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an OpenCode plugin that queries ChatGPT Plus/Pro Codex subscription quota and displays it as rich Markdown in the TUI via a single `/codex_quota` command.

**Architecture:** Component-Service pattern — `AuthReader` reads `~/.local/share/opencode/auth.json`, parses JWT for account_id + email. `ApiClient` calls `chatgpt.com/backend-api/wham/usage` with OAuth token. `Formatter` transforms the typed response into raw Markdown string. Plugin entry point wires them together as a single tool.

**Tech Stack:** TypeScript (strict), Bun runtime, `bun test`, `@opencode-ai/plugin` SDK (Zod-based `tool.schema`), zero runtime dependencies beyond the SDK.

**PRD:** `docs/codex-quota-prd.md` — authoritative source for all requirements, types, API spec, error scenarios, output format.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
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
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.3.5"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.3.5",
    "typescript": "^5.7.0",
    "@types/bun": "^1.2.0",
    "bun-types": "^1.2.0"
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
    "types": ["bun-types"],
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

**Step 3: Create `.gitignore`**

```
node_modules/
dist/
.tmp/
*.tgz
```

**Step 4: Install dependencies**

Run: `bun install`
Expected: `node_modules/` created, lock file generated

**Step 5: Verify TypeScript compiles (empty project)**

Run: `bun run typecheck`
Expected: PASS (no source files yet, but config is valid)

**Step 6: Commit**

```bash
git init
git add package.json tsconfig.json .gitignore
git commit -m "chore: project scaffolding with bun + typescript config"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types.ts`
- Create: `src/services/auth-reader.ts` (empty placeholder)
- Create: `src/services/api-client.ts` (empty placeholder)
- Create: `src/formatter/markdown.ts` (empty placeholder)

**Step 1: Create `src/types.ts` with all interfaces from PRD §8.1**

```typescript
// src/types.ts

export interface AuthInfo {
  token: string
  accountId: string
  email: string
  expiresAt: number
}

export interface WindowInfo {
  used_percent: number
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
}

export interface RateLimitInfo {
  allowed: boolean
  limit_reached: boolean
  primary_window: WindowInfo | null
  secondary_window: WindowInfo | null
}

export interface CreditsInfo {
  has_credits: boolean
  unlimited: boolean
  balance: string
  approx_local_messages: [number, number]
  approx_cloud_messages: [number, number]
}

export interface QuotaResponse {
  user_id: string
  account_id: string
  email: string
  plan_type: string
  rate_limit: RateLimitInfo
  code_review_rate_limit: RateLimitInfo
  additional_rate_limits: unknown
  credits: CreditsInfo
  spend_control: { reached: boolean }
  promo: unknown | null
}

export type DisplayMode = "compact" | "full"
```

**Step 2: Create empty placeholder files (just exports for barrel)**

Create directories:
```bash
mkdir -p src/services src/formatter
```

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

**Step 3: Verify types compile**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add TypeScript type definitions for API + auth"
```

---

## Task 3: AuthReader Service

**Files:**
- Modify: `src/services/auth-reader.ts`
- Create: `tests/auth-reader.test.ts`

**Reference:** PRD §7.2 (Auth Flow), slkiser/opencode-quota `src/lib/opencode-auth.ts` + `src/lib/openai.ts`

**Step 1: Write failing tests for AuthReader**

`tests/auth-reader.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { readAuth, parseJwt } from "../src/services/auth-reader"

describe("parseJwt", () => {
  test("parses valid JWT payload", () => {
    // Create a fake JWT: header.payload.signature
    const payload = {
      "https://api.openai.com/auth": {
        "chatgpt_account_id": "acct_12345"
      },
      "https://api.openai.com/profile": {
        "email": "user@example.com"
      }
    }
    const encoded = btoa(JSON.stringify(payload))
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`

    const result = parseJwt(jwt)
    expect(result.accountId).toBe("acct_12345")
    expect(result.email).toBe("user@example.com")
  })

  test("throws on malformed JWT (no dots)", () => {
    expect(() => parseJwt("not-a-jwt")).toThrow()
  })

  test("throws on non-JSON payload", () => {
    const jwt = "header.bm90LWpzb24.signature" // "not-json" base64
    expect(() => parseJwt(jwt)).toThrow()
  })

  test("throws when chatgpt_account_id missing", () => {
    const payload = {
      "https://api.openai.com/profile": {
        "email": "user@example.com"
      }
    }
    const encoded = btoa(JSON.stringify(payload))
    const jwt = `header.${encoded}.signature`
    expect(() => parseJwt(jwt)).toThrow(/account_id/i)
  })

  test("throws when email missing", () => {
    const payload = {
      "https://api.openai.com/auth": {
        "chatgpt_account_id": "acct_12345"
      }
    }
    const encoded = btoa(JSON.stringify(payload))
    const jwt = `header.${encoded}.signature`
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

  test("E1: returns error when auth.json not found", async () => {
    const result = await readAuth(join(tempDir, "nonexistent", "auth.json"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E1")
    }
  })

  test("E2: returns error when no matching provider key", async () => {
    const authData = { github: { type: "oauth", access: "tok" } }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E2")
    }
  })

  test("E3: returns error when token expired", async () => {
    const payload = {
      "https://api.openai.com/auth": { "chatgpt_account_id": "acct_123" },
      "https://api.openai.com/profile": { "email": "u@e.com" }
    }
    const encoded = btoa(JSON.stringify(payload))
    const fakeJwt = `head.${encoded}.sig`

    const authData = {
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) - 3600 }
    }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E3")
    }
  })

  test("E9: returns error on JWT parse failure", async () => {
    const authData = {
      codex: { type: "oauth", access: "not-a-valid-jwt-at-all", expires: Math.floor(Date.now() / 1000) + 3600 }
    }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E9")
    }
  })

  test("returns AuthInfo on valid credentials (codex key)", async () => {
    const payload = {
      "https://api.openai.com/auth": { "chatgpt_account_id": "acct_abc" },
      "https://api.openai.com/profile": { "email": "test@example.com" }
    }
    const encoded = btoa(JSON.stringify(payload))
    const fakeJwt = `head.${encoded}.sig`

    const authData = {
      codex: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.accountId).toBe("acct_abc")
      expect(result.value.email).toBe("test@example.com")
      expect(result.value.token).toBe(fakeJwt)
    }
  })

  test("tries provider keys in order: codex → openai → chatgpt → opencode", async () => {
    const payload = {
      "https://api.openai.com/auth": { "chatgpt_account_id": "acct_xyz" },
      "https://api.openai.com/profile": { "email": "z@test.com" }
    }
    const encoded = btoa(JSON.stringify(payload))
    const fakeJwt = `head.${encoded}.sig`

    const authData = {
      opencode: { type: "oauth", access: fakeJwt, expires: Math.floor(Date.now() / 1000) + 3600 }
    }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.accountId).toBe("acct_xyz")
    }
  })

  test("rejects non-oauth type entries", async () => {
    const authData = {
      codex: { type: "api", key: "sk-xxx" }
    }
    const authFile = join(tempDir, "auth.json")
    await writeFile(authFile, JSON.stringify(authData))

    const result = await readAuth(authFile)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E2")
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/auth-reader.test.ts`
Expected: FAIL — `parseJwt` and `readAuth` don't exist yet

**Step 3: Implement AuthReader**

`src/services/auth-reader.ts`:

```typescript
import { readFile } from "fs/promises"
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
    // Pad with = if needed
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

export async function readAuth(authFilePath: string): Promise<AuthResult> {
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

  // E2: Find matching provider key in priority order
  const providerKeys = ["codex", "openai", "chatgpt", "opencode"]
  let entry: { type?: string; access?: string; expires?: number } | undefined
  for (const key of providerKeys) {
    if (authData[key]) {
      entry = authData[key]
      break
    }
  }

  if (!entry || entry.type !== "oauth" || !entry.access) {
    return { ok: false, error: "E2" }
  }

  // E3: Check expiration
  if (entry.expires && entry.expires < Math.floor(Date.now() / 1000)) {
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
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/auth-reader.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/services/auth-reader.ts tests/auth-reader.test.ts
git commit -m "feat: AuthReader service — read auth.json, parse JWT, extract account_id + email"
```

---

## Task 4: ApiClient Service

**Files:**
- Modify: `src/services/api-client.ts`
- Create: `tests/api-client.test.ts`

**Reference:** PRD §7.1 (API Endpoint), NF1 (10s timeout)

**Step 1: Write failing tests for ApiClient**

`tests/api-client.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { queryQuota } from "../src/services/api-client"
import type { QuotaResponse } from "../src/types"

// We mock fetch via Bun's global fetch override
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
        reset_at: Date.now() / 1000 + 3600,
      },
      secondary_window: {
        used_percent: 16,
        limit_window_seconds: 604800,
        reset_after_seconds: 86400,
        reset_at: Date.now() / 1000 + 86400,
      },
    },
    code_review_rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 0,
        limit_window_seconds: 604800,
        reset_after_seconds: 604800,
        reset_at: Date.now() / 1000 + 604800,
      },
      secondary_window: null,
    },
    additional_rate_limits: null,
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

  test("returns QuotaResponse on successful API call", async () => {
    mockFetch({ status: 200, body: validResponse })

    const result = await queryQuota("test-token", "acct_1")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.plan_type).toBe("plus")
      expect(result.value.rate_limit.primary_window?.used_percent).toBe(25)
    }
  })

  test("sends correct headers", async () => {
    let capturedRequest: Request | null = null
    globalThis.fetch = async (input, init) => {
      capturedRequest = new Request(input as URL, init)
      return new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    await queryQuota("my-token", "acct_99")

    expect(capturedRequest).not.toBeNull()
    expect(capturedRequest!.headers.get("Authorization")).toBe("Bearer my-token")
    expect(capturedRequest!.headers.get("ChatGPT-Account-Id")).toBe("acct_99")
  })

  test("E4: returns timeout error when fetch times out", async () => {
    // Simulate AbortError
    mockFetchError(new DOMException("The operation was aborted", "AbortError"))

    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E4")
    }
  })

  test("E5: returns auth error on 401", async () => {
    mockFetch({ status: 401, body: { error: "unauthorized" } })

    const result = await queryQuota("bad-token", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E5")
    }
  })

  test("E5: returns auth error on 403", async () => {
    mockFetch({ status: 403, body: { error: "forbidden" } })

    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E5")
    }
  })

  test("E6: returns rate limit error on 429", async () => {
    mockFetch({ status: 429, body: { error: "rate limited" } })

    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E6")
    }
  })

  test("E8: returns server error on 5xx", async () => {
    mockFetch({ status: 500, body: { error: "internal" } })

    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E8")
    }
  })

  test("E7: returns partial data error when response missing required fields", async () => {
    mockFetch({ status: 200, body: { plan_type: "plus" } })

    const result = await queryQuota("tok", "acct")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("E7")
    }
  })
})
```

> Note: Add `import { afterEach } from "bun:test"` at the top if not already imported.

**Step 2: Run tests to verify they fail**

Run: `bun test tests/api-client.test.ts`
Expected: FAIL — `queryQuota` doesn't exist yet

**Step 3: Implement ApiClient**

`src/services/api-client.ts`:

```typescript
import type { QuotaResponse } from "../types"

type ApiResult = { ok: true; value: QuotaResponse } | { ok: false; error: string }

const API_URL = "https://chatgpt.com/backend-api/wham/usage"
const TIMEOUT_MS = 10_000

function validateResponse(data: unknown): data is QuotaResponse {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.plan_type === "string" &&
    typeof d.rate_limit === "object" &&
    d.rate_limit !== null &&
    typeof d.code_review_rate_limit === "object" &&
    d.code_review_rate_limit !== null &&
    typeof d.credits === "object" &&
    d.credits !== null &&
    typeof d.spend_control === "object" &&
    d.spend_control !== null
  )
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
        "Content-Type": "application/json",
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
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "E4" }
    }
    // Generic network error → E4
    return { ok: false, error: "E4" }
  } finally {
    clearTimeout(timeout)
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/api-client.test.ts`
Expected: ALL PASS

**Step 5: Run all tests**

Run: `bun test`
Expected: ALL PASS (auth-reader + api-client)

**Step 6: Commit**

```bash
git add src/services/api-client.ts tests/api-client.test.ts
git commit -m "feat: ApiClient service — query wham/usage endpoint with timeout + error mapping"
```

---

## Task 5: Formatter — Markdown Output

**Files:**
- Modify: `src/formatter/markdown.ts`
- Create: `tests/markdown.test.ts`

**Reference:** PRD §8.2 (Progress Bar), §8.3 (Time Formatting), §9.1–9.5 (Output Spec), §9.2 (Compact), §9.3 (Full)

**Step 1: Write failing tests for Formatter**

`tests/markdown.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { formatQuota, buildProgressBar, formatTime } from "../src/formatter/markdown"
import type { QuotaResponse, DisplayMode } from "../src/types"

describe("buildProgressBar", () => {
  test("0% → empty bar", () => {
    expect(buildProgressBar(0)).toBe("░░░░░░░░░░░░")
  })

  test("50% → half filled", () => {
    expect(buildProgressBar(50)).toBe("██████░░░░░░")
  })

  test("100% → full bar", () => {
    expect(buildProgressBar(100)).toBe("████████████")
  })

  test("25% → 3 filled", () => {
    expect(buildProgressBar(25)).toBe("███░░░░░░░░░")
  })

  test("75% → 9 filled", () => {
    expect(buildProgressBar(75)).toBe("█████████░░░")
  })

  test("rounds correctly at 8%", () => {
    // 8/100 * 12 = 0.96 → round → 1
    expect(buildProgressBar(8)).toBe("█░░░░░░░░░░░")
  })
})

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

  test("7259 seconds → 2h 0m", () => {
    expect(formatTime(7259)).toBe("2h 0m")
  })
})

describe("formatQuota — full mode", () => {
  const baseResponse: QuotaResponse = {
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
    code_review_rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: null,
      secondary_window: null,
    },
    additional_rate_limits: null,
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

  test("includes plan type and email in header", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).toContain("**Plan:** plus")
    expect(result).toContain("**Account:** user@example.com")
  })

  test("includes primary window with progress bar", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).toContain("**Primary (5h)**")
    expect(result).toContain("25%")
    expect(result).toContain("███░░░░░░░░░")
  })

  test("includes secondary window when present", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).toContain("**Weekly**")
    expect(result).toContain("16%")
  })

  test("skips secondary window when null", () => {
    const noSecondary = {
      ...baseResponse,
      rate_limit: {
        ...baseResponse.rate_limit,
        secondary_window: null,
      },
    }
    const result = formatQuota(noSecondary, "full")
    expect(result).not.toContain("**Weekly**")
  })

  test("shows code review section when primary_window present", () => {
    const withCodeReview = {
      ...baseResponse,
      code_review_rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 604800,
          reset_after_seconds: 604800,
          reset_at: 1743877200,
        },
        secondary_window: null,
      },
    }
    const result = formatQuota(withCodeReview, "full")
    expect(result).toContain("## Code Review Quota")
  })

  test("hides code review section when primary_window is null", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).not.toContain("## Code Review Quota")
  })

  test("shows credits when has_credits is true", () => {
    const withCredits = {
      ...baseResponse,
      credits: {
        has_credits: true,
        unlimited: false,
        balance: "50",
        approx_local_messages: [10, 20],
        approx_cloud_messages: [5, 15],
      },
    }
    const result = formatQuota(withCredits, "full")
    expect(result).toContain("## Credits")
    expect(result).toContain("50")
    expect(result).toContain("10 — 20")
    expect(result).toContain("5 — 15")
  })

  test("hides credits when has_credits is false and unlimited is false", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).not.toContain("## Credits")
  })

  test("shows spend control status", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).toContain("✅ Within limit")
  })

  test("shows spend control reached", () => {
    const reached = {
      ...baseResponse,
      spend_control: { reached: true },
    }
    const result = formatQuota(reached, "full")
    expect(result).toContain("🚫 Limit reached")
  })

  test("shows warning banner when usage >= 80%", () => {
    const highUsage = {
      ...baseResponse,
      rate_limit: {
        ...baseResponse.rate_limit,
        primary_window: {
          ...baseResponse.rate_limit.primary_window!,
          used_percent: 85,
        },
      },
    }
    const result = formatQuota(highUsage, "full")
    expect(result).toContain("⚠️")
  })

  test("shows limit reached banner at 100%", () => {
    const atLimit = {
      ...baseResponse,
      rate_limit: {
        ...baseResponse.rate_limit,
        primary_window: {
          ...baseResponse.rate_limit.primary_window!,
          used_percent: 100,
        },
        limit_reached: true,
      },
    }
    const result = formatQuota(atLimit, "full")
    expect(result).toContain("🚫")
  })

  test("includes timestamp footer", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).toMatch(/Updated:/)
  })

  test("does NOT wrap output in code blocks", () => {
    const result = formatQuota(baseResponse, "full")
    expect(result).not.toMatch(/^```\n/)
    expect(result).not.toMatch(/\n```$/)
  })
})

describe("formatQuota — compact mode", () => {
  const baseResponse: QuotaResponse = {
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
    code_review_rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: null,
      secondary_window: null,
    },
    additional_rate_limits: null,
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

  test("uses h3 header with plan type", () => {
    const result = formatQuota(baseResponse, "compact")
    expect(result).toContain("### Codex Quota — Plus")
  })

  test("shows only primary and secondary windows", () => {
    const result = formatQuota(baseResponse, "compact")
    expect(result).toContain("| 5h |")
    expect(result).toContain("| Weekly |")
  })

  test("does NOT show code review, credits, spend control", () => {
    const result = formatQuota(baseResponse, "compact")
    expect(result).not.toContain("Code Review")
    expect(result).not.toContain("Credits")
    expect(result).not.toContain("Spend Control")
  })

  test("shows status line only when usage >= 50%", () => {
    const highUsage = {
      ...baseResponse,
      rate_limit: {
        ...baseResponse.rate_limit,
        primary_window: {
          ...baseResponse.rate_limit.primary_window!,
          used_percent: 55,
        },
      },
    }
    const result = formatQuota(highUsage, "compact")
    expect(result).toContain("**Status**")
  })

  test("does NOT show status line when all usage < 50%", () => {
    const result = formatQuota(baseResponse, "compact")
    expect(result).not.toContain("**Status**")
  })

  test("shows ✅ when limits are fine", () => {
    const highUsage = {
      ...baseResponse,
      rate_limit: {
        ...baseResponse.rate_limit,
        primary_window: {
          ...baseResponse.rate_limit.primary_window!,
          used_percent: 55,
        },
      },
    }
    const result = formatQuota(highUsage, "compact")
    expect(result).toContain("✅ Within limits")
  })
})

describe("formatQuota — edge cases", () => {
  test("unknown plan_type displays capitalized", () => {
    const custom = {
      ...createBaseResponse(),
      plan_type: "enterprise",
    }
    const result = formatQuota(custom, "full")
    expect(result).toContain("Enterprise")
  })

  test("approx messages [0,0] shows '0' not '0 — 0'", () => {
    const withCredits = {
      ...createBaseResponse(),
      credits: {
        has_credits: true,
        unlimited: false,
        balance: "0",
        approx_local_messages: [0, 0] as [number, number],
        approx_cloud_messages: [0, 0] as [number, number],
      },
    }
    const result = formatQuota(withCredits, "full")
    expect(result).not.toContain("0 — 0")
    expect(result).toContain(">0<") // "0" in table cell — exact matching is flexible
  })

  test("null primary_window shows N/A", () => {
    const noPrimary = {
      ...createBaseResponse(),
      rate_limit: {
        ...createBaseResponse().rate_limit,
        primary_window: null,
      },
    }
    const result = formatQuota(noPrimary, "full")
    expect(result).toContain("N/A")
  })

  test("promo not null shows promo section", () => {
    const withPromo = {
      ...createBaseResponse(),
      promo: { description: "2x rate limits", expires: "2026-04-01" },
    }
    const result = formatQuota(withPromo, "full")
    expect(result).toContain("Promotional quota active")
  })
})

function createBaseResponse(): QuotaResponse {
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
      secondary_window: null,
    },
    code_review_rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: null,
      secondary_window: null,
    },
    additional_rate_limits: null,
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
}
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/markdown.test.ts`
Expected: FAIL — functions don't exist yet

**Step 3: Implement Formatter**

`src/formatter/markdown.ts`:

```typescript
import type { QuotaResponse, DisplayMode, WindowInfo } from "../types"

const BAR_LENGTH = 12
const FILL = "█"
const EMPTY = "░"

export function buildProgressBar(usedPercent: number): string {
  const filled = Math.round((usedPercent / 100) * BAR_LENGTH)
  return FILL.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled)
}

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

function getWarningLevel(window: WindowInfo | null): "none" | "advisory" | "warning" | "critical" {
  if (!window) return "none"
  if (window.used_percent >= 100) return "critical"
  if (window.used_percent >= 80) return "warning"
  if (window.used_percent >= 50) return "advisory"
  return "none"
}

function getOverallStatus(response: QuotaResponse): "ok" | "advisory" | "warning" | "critical" {
  const levels = [
    getWarningLevel(response.rate_limit.primary_window),
    getWarningLevel(response.rate_limit.secondary_window),
  ]
  if (levels.includes("critical")) return "critical"
  if (levels.includes("warning")) return "warning"
  if (levels.includes("advisory")) return "advisory"
  return "ok"
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

  return lines.join("\n\n")
}

function formatFull(response: QuotaResponse): string {
  const sections: string[] = []

  // Header
  sections.push(
    `# OpenAI Codex Subscription\n\n` +
    `**Plan:** ${capitalize(response.plan_type)} | **Account:** ${response.email}`
  )

  // Quota Limits
  sections.push(`## Quota Limits\n` +
    `\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|`
  )

  sections.push(windowRow("Primary (5h)", response.rate_limit.primary_window))
  if (response.rate_limit.secondary_window) {
    sections.push(windowRow("Weekly", response.rate_limit.secondary_window))
  }

  // Warnings
  const warnings = formatWarnings(response)
  if (warnings) {
    sections.push(warnings)
  }

  // Advisory notes (50-79%)
  const advisoryWindows = [
    { name: "Primary (5h)", window: response.rate_limit.primary_window },
    { name: "Weekly", window: response.rate_limit.secondary_window },
  ].filter(w => w.window && w.window.used_percent >= 50 && w.window.used_percent < 80)

  if (advisoryWindows.length > 0) {
    const advisoryLines = advisoryWindows.map(
      w => `> ⚠️ ${w.name} at ${w!.window!.used_percent}% — consider pacing your usage.`
    )
    sections.push(advisoryLines.join("\n"))
  }

  // Code Review Quota
  if (response.code_review_rate_limit.primary_window) {
    sections.push(
      `## Code Review Quota\n` +
      `\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|`
    )
    sections.push(windowRow("Weekly", response.code_review_rate_limit.primary_window))
  }

  // Credits
  if (response.credits.has_credits || response.credits.unlimited) {
    sections.push(
      `## Credits\n` +
      `\n| Metric | Value |\n|--------|-------|\n` +
      `| **Balance** | ${response.credits.unlimited ? "Unlimited" : response.credits.balance} |\n` +
      `| **Approx. Local Messages** | ${formatMessageRange(response.credits.approx_local_messages)} |\n` +
      `| **Approx. Cloud Messages** | ${formatMessageRange(response.credits.approx_cloud_messages)} |`
    )
  }

  // Spend Control
  const spendStatus = response.spend_control.reached ? "🚫 Limit reached" : "✅ Within limit"
  sections.push(`## Spend Control\n\n**Status:** ${spendStatus}`)

  // Promo
  if (response.promo !== null) {
    sections.push(`## Promotional\n\nPromotional quota active`)
  }

  // Timestamp
  sections.push(`*Updated: ${new Date().toISOString()}*`)

  return sections.join("\n\n---\n\n")
}

function formatCompact(response: QuotaResponse): string {
  const lines: string[] = []

  lines.push(`### Codex Quota — ${capitalize(response.plan_type)}\n`)
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

  const status = getOverallStatus(response)
  if (status !== "ok") {
    if (status === "critical") {
      lines.push(`\n**Status**: 🚫 Limit reached`)
    } else if (status === "warning") {
      lines.push(`\n**Status**: ⚠️ Approaching limit`)
    } else {
      lines.push(`\n**Status**: ✅ Within limits`)
    }
  }

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

Run: `bun test tests/markdown.test.ts`
Expected: ALL PASS (some tests may need minor adjustments — fix them)

**Step 5: Run all tests**

Run: `bun test`
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

**Reference:** PRD §10.1–10.2 (Error Scenarios E1–E9 with exact Markdown output)

**Step 1: Write failing tests for error formatter**

`tests/errors.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
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

  test("E4 — network timeout", () => {
    const result = formatError("E4")
    expect(result).toContain("Connection Error")
    expect(result).toContain("10s")
  })

  test("E5 — auth error (401/403)", () => {
    const result = formatError("E5")
    expect(result).toContain("Token Expired")
    expect(result).toContain("opencode auth login")
  })

  test("E6 — rate limited", () => {
    const result = formatError("E6")
    expect(result).toContain("Rate Limited")
  })

  test("E7 — unexpected schema (with partial data)", () => {
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

  test("all errors use ⚠️ icon", () => {
    const codes = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"]
    for (const code of codes) {
      expect(formatError(code as any)).toContain("⚠️")
    }
  })

  test("all errors are Markdown (not code blocks)", () => {
    const codes = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"]
    for (const code of codes) {
      const result = formatError(code as any)
      expect(result).not.toMatch(/^```\n/)
      expect(result).not.toMatch(/\n```$/)
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/errors.test.ts`
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
        `Could not reach OpenAI (timeout after 10s).`,
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
        partialData ? `\`\`\`\n${JSON.stringify(partialData, null, 2)}\n\`\`\`` : "(no data)",
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

Run: `bun test tests/errors.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/formatter/errors.ts tests/errors.test.ts
git commit -m "feat: error formatter — Markdown output for all E1–E9 scenarios"
```

---

## Task 7: Plugin Entry Point

**Files:**
- Create: `src/index.ts`

**Reference:** PRD §11.1 (Architecture), §8.4 (Display Mode Trigger), ExternalScout findings on SDK API

**Step 1: Implement plugin entry point**

`src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin/tool"
import { readAuth } from "./services/auth-reader"
import { queryQuota } from "./services/api-client"
import { formatQuota } from "./formatter/markdown"
import { formatError } from "./formatter/errors"
import type { DisplayMode } from "./types"

const AUTH_PATH = `${process.env.HOME}/.local/share/opencode/auth.json`

export const CodexQuotaPlugin: Plugin = async () => {
  return {
    tool: {
      codex_quota: tool({
        description:
          "Query ChatGPT Plus/Pro Codex subscription quota and display usage limits",
        args: {
          mode: tool.schema
            .string()
            .optional()
            .describe(
              "Display mode: 'compact' for agent subtask, 'full' for user command. Default: 'full'"
            ),
        },
        async execute(args) {
          const mode: DisplayMode =
            args.mode === "compact" ? "compact" : "full"

          // Step 1: Read auth
          const authResult = await readAuth(AUTH_PATH)
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

export default CodexQuotaPlugin
```

**Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: PASS (may need to fix any import issues)

**Step 3: Build**

Run: `bun run build`
Expected: `dist/` directory created with compiled JS + `.d.ts` files

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: plugin entry point — codex_quota tool with compact/full modes"
```

---

## Task 8: Integration Test

**Files:**
- Create: `tests/integration.test.ts`

**Reference:** PRD §13.2 (Success Criteria)

**Step 1: Write integration test**

`tests/integration.test.ts`:

```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { mkdir, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { readAuth } from "../src/services/auth-reader"
import { queryQuota } from "../src/services/api-client"
import { formatQuota } from "../src/formatter/markdown"
import { formatError } from "../src/formatter/errors"
import type { QuotaResponse, DisplayMode } from "../src/types"

// Integration test: wire all components together without real network
describe("Integration — full pipeline", () => {
  const originalFetch = globalThis.fetch
  let tempDir: string

  afterEach(async () => {
    globalThis.fetch = originalFetch
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

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
        reset_at: Date.now() / 1000 + 5400,
      },
      secondary_window: {
        used_percent: 30,
        limit_window_seconds: 604800,
        reset_after_seconds: 259200,
        reset_at: Date.now() / 1000 + 259200,
      },
    },
    code_review_rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 5,
        limit_window_seconds: 604800,
        reset_after_seconds: 604800,
        reset_at: Date.now() / 1000 + 604800,
      },
      secondary_window: null,
    },
    additional_rate_limits: null,
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

  test("E1 pipeline: missing auth.json → error markdown", async () => {
    const authResult = await readAuth("/nonexistent/path/auth.json")
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

  test("happy path: full mode pipeline produces valid markdown", async () => {
    // 1. Setup auth file
    tempDir = join(tmpdir(), `integration-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    const payload = {
      "https://api.openai.com/auth": { "chatgpt_account_id": "acct_1" },
      "https://api.openai.com/profile": { "email": "test@example.com" },
    }
    const encoded = btoa(JSON.stringify(payload))
    const fakeJwt = `head.${encoded}.sig`

    const authFile = join(tempDir, "auth.json")
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      })
    )

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
    tempDir = join(tmpdir(), `integration-test-compact-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    const payload = {
      "https://api.openai.com/auth": { "chatgpt_account_id": "acct_1" },
      "https://api.openai.com/profile": { "email": "test@example.com" },
    }
    const encoded = btoa(JSON.stringify(payload))
    const fakeJwt = `head.${encoded}.sig`

    const authFile = join(tempDir, "auth.json")
    await writeFile(
      authFile,
      JSON.stringify({
        codex: {
          type: "oauth",
          access: fakeJwt,
          expires: Math.floor(Date.now() / 1000) + 3600,
        },
      })
    )

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
    }
  })
})
```

**Step 2: Run integration tests**

Run: `bun test tests/integration.test.ts`
Expected: ALL PASS

**Step 3: Run ALL tests**

Run: `bun test`
Expected: ALL PASS (auth-reader + api-client + markdown + errors + integration)

**Step 4: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: integration tests — full pipeline from auth through API to markdown output"
```

---

## Task 9: Final Verification + Build Validation

**Files:**
- No new files — verification only

**Step 1: Run full test suite**

Run: `bun test`
Expected: ALL tests pass, 0 failures

**Step 2: Run TypeScript type check**

Run: `bun run typecheck`
Expected: 0 errors

**Step 3: Build the plugin**

Run: `bun run build`
Expected: `dist/` created with `index.js`, `index.d.ts`, `services/`, `formatter/`

**Step 4: Verify dist output structure**

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

**Step 5: Verify no credential leakage in output**

Run: `grep -r "access\|token\|Bearer\|secret" dist/ --include="*.js" || echo "CLEAN"`
Expected: No hardcoded tokens/secrets. The string "Bearer" should only appear in the API call header construction — verify it's in a template literal, not hardcoded.

**Step 6: Check guardrail compliance**

Verify each guardrail from PRD §6:

| Guardrail | Check | Result |
|-----------|-------|--------|
| G1: No env var auth | `grep -r "process.env" src/` should only find HOME | |
| G2: No multi-provider | Only OpenAI endpoint | |
| G3: No monolithic | Multiple files in services/ + formatter/ | |
| G4: No polling | No intervals, no setTimeout loops | |
| G5: No caching | No localStorage, no Map caches | |
| G6: Read-only | No POST/PUT/PATCH | |
| G7: No credential logging | No console.log of tokens | |
| G8: No ASCII box | No ╔╗║╚╝ in formatter | |
| G9: No code blocks | formatQuota returns raw Markdown | |
| G10: No toast | No showToast calls | |
| G11: No retry | No retry loops in ApiClient | |

**Step 7: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address verification findings"
```

---

## Task 10: README Documentation

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
# opencode-codex-quota

OpenCode plugin to display ChatGPT Plus/Pro Codex subscription quota.

## Install

Add to your OpenCode config (`~/.config/opencode/config.json`):

```json
{
  "plugin": ["opencode-codex-quota"]
}
```

Or install via CLI:

```bash
opencode plugin install opencode-codex-quota
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
- Expired token → re-auth instructions
- Network timeout → connection guidance
- API errors → appropriate error messages

## Development

```bash
bun install
bun test
bun run build
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
Task 1: Scaffolding          → no deps
Task 2: Types                → depends on Task 1
Task 3: AuthReader           → depends on Task 1, 2
Task 4: ApiClient            → depends on Task 1, 2
Task 5: Formatter (markdown) → depends on Task 2
Task 6: Error formatter      → depends on Task 2
Task 7: Plugin entry point   → depends on Task 3, 4, 5, 6
Task 8: Integration tests    → depends on Task 7
Task 9: Verification         → depends on Task 8
Task 10: README              → depends on Task 9
```

**Parallelizable:** Tasks 3 + 4 + 5 + 6 can run in parallel after Task 2.

## Commit Strategy

1. `chore: project scaffolding with bun + typescript config`
2. `feat: add TypeScript type definitions for API + auth`
3. `feat: AuthReader service — read auth.json, parse JWT, extract account_id + email`
4. `feat: ApiClient service — query wham/usage endpoint with timeout + error mapping`
5. `feat: Formatter — Markdown output with compact/full modes, progress bars, time formatting`
6. `feat: error formatter — Markdown output for all E1–E9 scenarios`
7. `feat: plugin entry point — codex_quota tool with compact/full modes`
8. `test: integration tests — full pipeline from auth through API to markdown output`
9. (fixes if needed)
10. `docs: add README with installation, usage, and development instructions`
