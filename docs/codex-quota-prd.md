# OpenCode Codex Quota Plugin — Product Requirements Document

**Status**: Approved
**Date**: 2026-03-29 
**Author**: brainstorming session (user + agent)
**Target**: ChatGPT Plus/Pro subscribers using OpenCode with Codex
**Ver**: 1.0
---

## 1. Problem Statement

ChatGPT Plus/Pro subscribers using OpenCode with Codex have **no visibility** into their subscription quota usage. They hit 5-hour and weekly message limits unexpectedly, losing productive coding sessions mid-task. OpenCode itself doesn't display quota info, and the only way to check is navigating to `chatgpt.com/codex/settings/usage` in a browser.

**This plugin solves that** by providing a single `/codex_quota` command that displays real-time subscription quota directly in the OpenCode TUI.

---

## 2. User Stories

| # | As a... | I want to... | So that... |
|---|---------|-------------|------------|
| U1 | Plus subscriber | See my remaining 5h and weekly quota | I don't hit limits mid-session |
| U2 | Pro subscriber | Check how much of my weekly allocation I've used | I can plan my OpenCode usage |
| U3 | Agent (subtask) | Get compact quota info inline | I can decide whether to continue or pause |
| U4 | New user | See clear setup instructions if auth is missing | I can fix it without searching docs |
| U5 | Any user | See warnings before hitting limits | I can adjust my usage proactively |

---

## 3. Functional Requirements (Must Have)

| # | Requirement | Priority |
|---|-------------|----------|
| F1 | Single `/codex_quota` command | P0 |
| F2 | Display subscription tier (Plus/Pro) | P0 |
| F3 | Display primary window (5h) quota with progress bar, %, reset clock time | P0 |
| F4 | Display secondary window (weekly) quota with progress bar, %, reset clock time | P0 |
| F5 | Display code review quota when present | P1 |
| F6 | Display credits + approximate message counts when applicable | P1 |
| F7 | Display promotional quota info when present | P1 |
| F8 | Display spend control status | P1 |
| F9 | Warning banner when any limit is reached | P0 |
| F10 | Auth from OpenCode `auth.json` only (no env vars) | P0 |
| F11 | Rich Markdown output (NOT code blocks, NOT ASCII box) | P0 |
| F12 | Two display modes: compact (subtask) + full (user command) | P0 |
| F13 | User-friendly error messages in Markdown for all failure cases | P0 |
| F14 | Full test suite (unit + integration) | P0 |

---

## 4. Non-Functional Requirements

| # | Requirement | Target |
|---|-------------|--------|
| NF1 | API call timeout | 10 seconds |
| NF2 | Response formatting | < 50ms (pure string construction) |
| NF3 | Credential safety | Never log, print, or expose tokens in output or errors |
| NF4 | Error sanitization | Strip tokens/headers from error messages before display |
| NF5 | Graceful degradation | If API schema changes, show what we can + note partial data |
| NF6 | Bundle size | Minimal — only essential dependencies |

---

## 5. Scope Boundaries

### In Scope
- ChatGPT Plus/Pro Codex subscription quota
- 5-hour window + weekly window quotas
- Code review quota
- Credits with approximate message counts
- Promotional quota info
- Spend control status
- Reset clock times (local time)
- Warning banners on limit reached
- Subscription tier display
- Compact (agent) + full (user) display modes

### Out of Scope
- Multi-provider support (OpenAI only)
- Environment variable authentication
- API billing/tier information (separate from subscription)
- Background polling / auto-refresh
- Toast notifications
- Data persistence / caching
- Write operations (read-only)
- Retry logic
- Configuration options

---

## 6. Guardrails (Must NOT Have)

| # | Guardrail | Reason |
|---|-----------|--------|
| G1 | NO env var auth fallback | User explicitly excluded |
| G2 | NO multi-provider | Single provider keeps scope tight |
| G3 | NO monolithic index.ts | Component-Service architecture required |
| G4 | NO background polling | Query on demand only |
| G5 | NO data persistence | Fresh data each call |
| G6 | NO modification capabilities | Read-only subscription info |
| G7 | NO credential logging | Security — never log/expose tokens |
| G8 | NO ASCII box output | Rich Markdown only |
| G9 | NO code block wrapping | Return raw Markdown string |
| G10 | NO toast notifications | Keep simple, command-only |
| G11 | NO retry logic | Fail-fast on errors |

---

## 7. Research Findings

### 7.1 API Endpoint (live-tested 2026-03-29)

```
GET https://chatgpt.com/backend-api/wham/usage
Authorization: Bearer {oauth_access_token}
ChatGPT-Account-Id: {from JWT payload}
```

**Full response schema:**

```json
{
  "user_id": "string",
  "account_id": "string",
  "email": "string",
  "plan_type": "plus" | "pro" | string,
  "rate_limit": {
    "allowed": boolean,
    "limit_reached": boolean,
    "primary_window": {
      "used_percent": number,
      "limit_window_seconds": number,
      "reset_after_seconds": number,
      "reset_at": number
    },
    "secondary_window": { ... } | null
  },
  "code_review_rate_limit": {
    "allowed": boolean,
    "limit_reached": boolean,
    "primary_window": { ... } | null,
    "secondary_window": null
  },
  "additional_rate_limits": unknown,
  "credits": {
    "has_credits": boolean,
    "unlimited": boolean,
    "balance": "string",
    "approx_local_messages": [min, max],
    "approx_cloud_messages": [min, max]
  },
  "spend_control": { "reached": boolean },
  "promo": unknown | null
}
```

**Live test result** (Plus account, 2026-03-29):
- `plan_type`: "plus"
- `rate_limit.primary_window`: 0% used, 18000s window
- `rate_limit.secondary_window`: 16% used, 604800s window
- `code_review_rate_limit.primary_window`: 0% used, 604800s window
- `credits`: no credits, balance "0", approx messages [0,0]
- `spend_control.reached`: false
- `promo`: null

### 7.2 Auth Flow (verified from slkiser/opencode-quota + live test)

1. Read `~/.local/share/opencode/auth.json`
2. Look for provider keys in order: `codex` → `openai` → `chatgpt` → `opencode`
   - **First-match-wins**: Use the first key found that satisfies all checks below
   - Continue scanning only if current key fails validation (wrong type, expired, empty token)
3. Must be `type: "oauth"` with valid `access` token (not empty/whitespace)
4. Check `expires` timestamp (Unix seconds) — reject if expired
5. Decode JWT payload (base64, no verification needed — it's our own token)
6. Extract `chatgpt_account_id` from `https://api.openai.com/auth` claim
7. Extract `email` from `https://api.openai.com/profile` claim
8. Call endpoint with `Authorization: Bearer {access}` + `ChatGPT-Account-Id: {account_id}` header

### 7.3 Promo Field

- Currently `null` on tested Plus account (2026-03-29)
- Typed as `unknown | null` — conditionally displayed as formatted Markdown section when present
- The 2x rate limits promo (Feb-Apr 2026) is applied server-side, NOT surfaced in API response
- Display format will be refined once real promo data is encountered
- **v1.0 scope**: Display as "🎁 Promotional quota active" with raw JSON dump for unknown shapes. Structured display deferred to v1.1+ when real data is available.

### 7.4 External Implementations

| Plugin | Author | Approach | Stars |
|--------|--------|----------|-------|
| opencode-quota | slkiser | Multi-provider, toast notifications, v2.12.0 | 100 |
| opencode-glm-quota | guyinwonder168 | ASCII box format, GLM-specific, v1.6.2 | — |
| opencode-mystatus | vbgate | Multi-platform quota checker | 211 |
| opencode-quotas | PhilippPolterauer | Aggregates Antigravity + Codex usage | — |

**Source of endpoint + auth flow**: `slkiser/opencode-quota` (`src/lib/openai.ts`, `src/lib/opencode-auth.ts`)

### 7.5 Risk Notes

- `chatgpt.com/backend-api/wham/usage` is **undocumented/internal** — may change without notice
- OpenAI feature request #15281 (open) asks for official CLI-exposed usage data
- `x-ratelimit-*` headers are for API tiers (RPM/TPM), NOT ChatGPT subscription quotas
- Mitigation: graceful error handling + schema validation when API changes

---

## 8. Technical Specification

### 8.1 Type Definitions

```typescript
// types.ts

export interface AuthInfo {
  token: string           // OAuth access token (from auth.json "access" field)
  accountId: string       // Extracted from JWT chatgpt_account_id claim
  email: string           // Extracted from JWT email claim
  expiresAt: number       // Unix timestamp in SECONDS (from auth.json "expires" field)
}

export interface WindowInfo {
  used_percent: number          // 0–100 (may exceed 100 from API — clamp to 100 for display)
  limit_window_seconds: number  // Window duration in seconds (e.g., 18000 = 5h)
  reset_after_seconds: number   // Seconds until reset (kept for fallback/internal calculations)
  reset_at: number              // Unix timestamp in SECONDS for the local reset clock display
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
  user_id: string               // REQUIRED
  account_id: string            // REQUIRED
  email: string                 // REQUIRED
  plan_type: string             // REQUIRED — "plus" | "pro" | unknown string
  rate_limit: RateLimitInfo     // REQUIRED
  credits: CreditsInfo          // REQUIRED
  spend_control: { reached: boolean }  // REQUIRED
  // === OPTIONAL fields (gracefully handled if missing) ===
  code_review_rate_limit?: RateLimitInfo  // OPTIONAL — may be absent
  additional_rate_limits?: unknown        // OPTIONAL — ignored in v1.0 display
  promo?: unknown | null                  // OPTIONAL — displayed when non-null
}

export type DisplayMode = "compact" | "full"
```

**Validation rules for ApiClient (Task 4):**
1. If response is not a JSON object → trigger E7
2. If `rate_limit` is missing or not an object → trigger E7
3. If `rate_limit.primary_window` is missing or null → show "N/A" in table (NOT an error)
4. If `plan_type` is missing or empty string → display as "Unknown"
5. All other fields: use defensive access (`?.`) and fallback to defaults

### 8.2 Progress Bar Specification

- **Length**: 12 characters
- **Fill character**: `█`
- **Empty character**: `░`
- **Formula**: `Math.round(Math.min(used_percent, 100) / 100 * 12)` filled, remainder empty
- **Clamping**: If `used_percent > 100` (API may return overages), clamp to 100 for display — show full bar with actual percentage value (e.g., "105%")
- **Thresholds**:
  - 0–49%: No warning (normal)
  - 50–79%: Advisory note in output
  - 80–99%: Warning banner (blockquote with ⚠️)
  - 100%: Limit reached banner (blockquote with 🚫)

### 8.3 Reset Clock Formatting Specification

Display `reset_at` as a local clock string:

| Case | Output |
|------|--------|
| Same-day reset | `HH:mm:ss` |
| Reset on a different day | `HH:mm:ss on D MMM` |

- Use the user's local timezone
- Use 24-hour time with zero-padded hour, minute, and second
- `reset_after_seconds` remains available for fallback/internal calculations; normal display is driven by `reset_at`
- Weekly resets should append the date suffix when needed for clarity
- Example: primary reset `04:06:00`
- Example: weekly reset `05:46:00 on 9 Apr`

### 8.4 Display Mode Trigger

The tool accepts an optional `mode` argument:

```typescript
args: {
  mode: tool.schema.optional(tool.schema.string().describe("Display mode: 'compact' or 'full'. Default: 'full'"))
}
```

- **User runs `/codex_quota`** → OpenCode executes the command template, which instructs the agent to call the `codex_quota` tool with default `mode: "full"`
- **Agent calls tool** → can pass `mode: "compact"` for concise output
- **Invalid mode** → treated as `"full"`

### 8.5 Plugin API Contract

Based on `@opencode-ai/plugin` (documented at https://opencode.ai/docs/plugins/):

**Plugin entry point** (`src/index.ts`):

```typescript
import { type Plugin, type PluginModule, tool } from "@opencode-ai/plugin"

const codexQuotaServer: Plugin = async (ctx) => {
  return {
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {}
      opencodeConfig.command.codex_quota = {
        description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
        template:
          "Call the codex_quota tool now. Use mode=compact only if the user explicitly requested compact output; otherwise use mode=full. Present the tool result directly.",
      }
    },
    tool: {
      codex_quota: tool({
        description: "Show ChatGPT Plus/Pro Codex subscription quota usage",
        args: {
          mode: tool.schema.optional(
            tool.schema.string().describe("Display mode: 'compact' or 'full'. Default: 'full'")
          ),
        },
        async execute(args, context) {
          // args: { mode?: string }
          // context: { directory, worktree }
          // returns: string (raw Markdown rendered by OpenCode TUI via Glamour)
          // ...
        },
      }),
    },
  }
}

export default {
  id: "opencode-codex-quota",
  server: codexQuotaServer,
} satisfies PluginModule
```

**Key API details:**

| Aspect | Detail |
|--------|--------|
| Export | Default export object with `id` + `server` |
| Plugin context | `{ project, client, $, directory, worktree }` |
| Slash command | Wrapper prompt registered via `config.command.codex_quota` |
| Tool registration | `return { tool: { <name>: tool({ description, args, execute }) } }` |
| Schema builder | `tool.schema.string()`, `tool.schema.optional()`, `.describe()` — Zod-based |
| Execute args | First arg: validated args object. Second arg: `{ directory, worktree }` |
| Return value | String — rendered as Markdown by OpenCode TUI (Glamour renderer) |
| Tool naming | If plugin tool name matches built-in tool, plugin takes precedence |
| Logging | `client.app.log({ body: { service, level, message, extra } })` |

**Constraints:**
- Plugin function is called once at load time; hooks/tools are registered statically
- No lifecycle hooks needed — fresh read on each `execute()` call (no caching, per G5)
- Tool name `codex_quota` is the identifier the agent calls
- `/codex_quota` is a convenience wrapper prompt, not a direct no-LLM syscall

---

## 9. Output Specification

### 9.1 Formatting Rules

- Plugin returns **raw Markdown string** from `execute()` — NOT wrapped in code blocks
- OpenCode TUI renders with Glamour (themed headers, table borders, bold, blockquotes)
- Progress bars use backtick code spans (`████░░░░`) for monospace alignment inside tables
- All sections separated by `---` horizontal rules
- Timestamp in italic at footer

### 9.2 Compact Mode (subtask / agent)

```markdown
### Codex Quota — {Plan}

| Window | Usage | Progress | Resets At |
|--------|-------|----------|------------|
| 5h | {percent}% | `{bar}` | {clock} |
| Weekly | {percent}% | `{bar}` | {clock} |

**Status**: {✅ Within limits | ⚠️ {percent}% used | 🚫 Limit reached}
```

**Compact status priority:** When multiple windows are at different warning levels, show the most severe status (🚫 > ⚠️ > ✅). If all windows are within limits, omit the status line entirely.

**Conditional in compact:**
- Only show primary + secondary windows (skip code review, credits, promo)
- Show warning status line only if any window ≥ 50%

### 9.3 Full Mode (user command)

```markdown
# OpenAI Codex Subscription

**Plan:** {plan_type} | **Account:** {email}

---

## Quota Limits

| Window | Usage | Progress | Resets At |
|--------|-------|----------|------------|
| **Primary (5h)** | {percent}% | `{bar}` {percent}% | {clock} |
| **Weekly** | {percent}% | `{bar}` {percent}% | {clock} |

> ⚠️ {window name} at {percent}% — {advisory text}

---

## Code Review Quota

*(only shown when `code_review_rate_limit.primary_window` is not null)*

| Window | Usage | Progress | Resets At |
|--------|-------|----------|------------|
| **Weekly** | {percent}% | `{bar}` {percent}% | {clock} |

---

## Credits

*(only shown when `has_credits` is true or `unlimited` is true)*

| Metric | Value |
|--------|-------|
| **Balance** | {balance} |
| **Approx. Local Messages** | {min} — {max} |
| **Approx. Cloud Messages** | {min} — {max} |

---

## Spend Control

*(always shown)*

**Status:** {✅ Within limit | 🚫 Limit reached}

---

*Updated: {ISO timestamp UTC}*
```

### 9.4 Conditional Sections

| Section | Show When |
|---------|-----------|
| Quota Limits | Always (primary required, secondary when present) |
| Warning banner (blockquote) | Any window `used_percent` ≥ 80, or `limit_reached` is true |
| Code Review Quota | `code_review_rate_limit.primary_window` is not null |
| Credits | `credits.has_credits` is true OR `credits.unlimited` is true |
| Promo | `promo` is not null (display as formatted section — format TBD when real data encountered) |
| Spend Control | Always |
| Advisory note | Any window `used_percent` is 50–79 |
| Additional Rate Limits | `additional_rate_limits` is present and non-null — v1.0: ignored silently (logged via `client.app.log` at debug level) |

### 9.5 Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| `plan_type` unknown (not "plus"/"pro") | Display raw value, capitalize first letter |
| `secondary_window` is null | Skip that row in quota table |
| `primary_window` is null | Show "N/A" in table row |
| `credits.approx_local_messages` is [0, 0] | Show "0" instead of "0 — 0" |
| `promo` has unexpected shape | Display as "Promotional quota active" without details |
| `used_percent` is 0 | Show empty bar `░░░░░░░░░░░░` with "0%" |
| `used_percent` is 100 | Show full bar `████████████` with "100%" |
| `used_percent` > 100 | Clamp bar to full `████████████`, show actual value (e.g., "105%"), trigger limit reached banner |
| `plan_type` is empty string | Display as "Unknown" (same as missing) |
| Multiple windows at limit | Show warning for each, most severe first |

---

## 10. Error Specification

### 10.1 Error Scenarios

| # | Scenario | Detection | Output |
|---|----------|-----------|--------|
| E1 | `auth.json` not found | File read fails | Setup instructions (see E1 output) |
| E2 | No matching provider key | No `codex`/`openai`/`chatgpt`/`opencode` entry | Setup instructions with key names |
| E3 | Token expired | `expires` timestamp < now (Unix seconds) | Re-auth instruction |
| E4 | Network failure | Fetch aborts after 10s OR connection error (DNS, SSL, refused) | Connection error |
| E5 | API returns 401/403 | HTTP status code | Re-auth instruction |
| E6 | API returns 429 | HTTP status code | Rate limited message |
| E7 | API returns unexpected schema | Missing required fields (see §8.1 validation rules) | Partial data notice + what's available |
| E8 | API returns 5xx | HTTP status code | Service unavailable message |
| E9 | JWT parse failure | Malformed payload | Setup instructions |
| E10 | Wrong auth type | Provider entry has `type` that is not `"oauth"` (e.g., `"api_key"`) | Setup instructions |
| E11 | Empty access token | Provider entry `access` field is empty, missing, or whitespace-only | Setup instructions |

### 10.2 Error Output Design

**E1 — No auth.json:**

```markdown
## ⚠️ Codex Quota — Not Configured

OpenCode auth file not found at:
`~/.local/share/opencode/auth.json`

**Setup:**
1. Run `opencode auth login`
2. Select **ChatGPT Plus/Pro (Codex Subscription)**
3. Complete OAuth flow
4. Run `/codex_quota` again
```

**E2 — No matching provider:**

```markdown
## ⚠️ Codex Quota — No OpenAI Credentials

No OpenAI/ChatGPT credentials found in auth file.
Looked for keys: `codex`, `openai`, `chatgpt`, `opencode`

**Setup:**
1. Run `opencode auth login`
2. Select **ChatGPT Plus/Pro (Codex Subscription)**
3. Complete OAuth flow
4. Run `/codex_quota` again
```

**E3/E5 — Expired or invalid token:**

```markdown
## ⚠️ Codex Quota — Token Expired

Your OpenAI token has expired.

**Fix:** Run `opencode auth login` to refresh your credentials.
```

**E4 — Network failure (timeout, DNS, connection refused, SSL error):**

```markdown
## ⚠️ Codex Quota — Connection Error

Could not reach OpenAI servers.

**Check:** Your internet connection and try again.
```

**E6 — Rate limited on endpoint:**

```markdown
## ⚠️ Codex Quota — Rate Limited

Too many requests to the quota endpoint. Try again in a few seconds.
```

**E7 — Unexpected schema:**

```markdown
## ⚠️ Codex Quota — Partial Data

OpenAI returned unexpected data format. Showing what's available:

{best-effort rendering of parseable fields}

> The API response structure may have changed. Consider updating the plugin.
```

**E8 — Server error:**

```markdown
## ⚠️ Codex Quota — Service Unavailable

OpenAI returned a server error (5xx). Try again later.
```

**E9 — JWT parse failure:**

```markdown
## ⚠️ Codex Quota — Invalid Token Format

Could not parse the stored token. 

**Fix:** Run `opencode auth login` to re-authenticate.
```

**E10 — Wrong auth type (not OAuth):**

```markdown
## ⚠️ Codex Quota — Incompatible Auth Method

Found credentials but they are not OAuth-based (got `api_key` type).
Codex quota requires an OAuth session.

**Fix:** Run `opencode auth login` and select **ChatGPT Plus/Pro (Codex Subscription)**.
```

**E11 — Empty access token:**

```markdown
## ⚠️ Codex Quota — Incomplete Credentials

Found OAuth credentials but the access token is empty or missing.

**Fix:** Run `opencode auth login` to re-authenticate.
```

---

## 11. Architecture

### 11.1 Component Structure

```
opencode-codex-quota/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin entry point, tool definition
│   ├── types.ts              # All TypeScript interfaces + DisplayMode
│   ├── services/
│   │   ├── auth-reader.ts    # Read auth.json, parse JWT, extract account_id + email
│   │   └── api-client.ts     # Call wham/usage endpoint, return typed QuotaResponse
│   └── formatter/
│       └── markdown.ts       # Transform QuotaResponse → raw Markdown string
└── tests/
    ├── auth-reader.test.ts
    ├── api-client.test.ts
    ├── markdown.test.ts
    └── integration.test.ts
```

### 11.2 Data Flow

```
User/Agent → /codex_quota [mode?]
  → Plugin tool execute()
    → AuthReader.read()
      → Read auth.json → Find OAuth entry → Parse JWT → { token, accountId, email }
    → ApiClient.query(token, accountId)
      → GET wham/usage → Validate response → QuotaResponse
    → Formatter.format(response, mode)
      → Build Markdown sections → Conditional includes → Raw string
  → OpenCode TUI renders Markdown via Glamour
```

### 11.3 Plugin Lifecycle

- Plugin function is called **once** at OpenCode startup to register hooks/tools
- Each `execute()` call does a **fresh read** of auth.json and API — no caching (per G5)
- **No concurrent invocation guard needed** — OpenCode serializes tool executions per session
- Plugin stateless by design: no in-memory state between calls

| Field | Value |
|-------|-------|
| **Package name** | `opencode-codex-quota` |
| **Version** | `0.1.0` |
| **Runtime** | Node.js |
| **Language** | TypeScript (strict) |
| **Dependencies** | `@opencode-ai/plugin` (peer) |
| **Dev dependencies** | `typescript`, `@types/node`, `vitest`, `@vitest/coverage-v8`, `@biomejs/biome` (linter + formatter) |
| **Test framework** | `vitest` |
| **Build** | `npm run build` → outputs to `dist/` |

### 11.4 Plugin Installation

User adds to their OpenCode config (`opencode.json` in project root or `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["opencode-codex-quota"]
}
```

For local development, point OpenCode at the package directory after building:

```json
{
  "plugin": ["./path/to/opencode-codex-quota"]
}
```

OpenCode also supports raw local plugin files placed directly in `.opencode/plugins/` or `~/.config/opencode/plugins/`, but that is a different layout from this packaged npm/path plugin.

---

## 12. Implementation Plan

### 12.1 Execution Waves

```
Wave 1 (Start immediately — scaffolding + core services):
├── Task 1: Project scaffolding + package.json + tsconfig.json
├── Task 2: TypeScript types (types.ts — all interfaces)
├── Task 3: AuthReader service (auth.json + JWT parsing)
└── Task 4: ApiClient service (wham/usage HTTP call)

Wave 2 (After Wave 1 — formatter + integration):
├── Task 5: Formatter — Markdown output (compact + full modes + progress bars + time formatting)
├── Task 6: Plugin entry point (index.ts + tool definition + mode arg)
├── Task 7: Error handling (all E1–E11 scenarios with Markdown output)
└── Task 8: Integration — Wire all components end-to-end

Wave 3 (After Wave 2 — tests + docs):
├── Task 9: Unit tests — AuthReader
├── Task 10: Unit tests — ApiClient
├── Task 11: Unit tests — Formatter
├── Task 12: Integration tests — full plugin flow
└── Task 13: README + usage documentation

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Real plugin execution test
└── Task F4: Scope fidelity check
```

### 12.2 Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | — | 2, 3, 4 |
| 2 | 1 | 3, 4, 5 |
| 3 | 1, 2 | 6, 8 |
| 4 | 1, 2 | 6, 8 |
| 5 | 2 | 6, 8 |
| 6 | 3, 4, 5 | 7, 8 |
| 7 | 6 | 8 |
| 8 | 6, 7 | 9–13 |
| 9–13 | 8 | F1–F4 |

### 12.3 Commit Strategy

1. **Commit 1**: Project scaffolding + config + types
2. **Commit 2**: Core services (AuthReader, ApiClient)
3. **Commit 3**: Formatter + plugin integration
4. **Commit 4**: Tests
5. **Commit 5**: README + documentation

---

## 13. Verification Strategy

### 13.1 TDD Approach

- **Framework**: `vitest`
- **Pattern**: RED (failing test) → GREEN (minimal impl) → REFACTOR
- **Coverage target**: > 90% (measured via `npm run test:coverage`)
- **Evidence saved to**: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

### 13.2 Success Criteria

```bash
npm install                    # Expected: dependencies installed
npm run build                  # Expected: TypeScript compiles without errors
npm test                       # Expected: All tests pass
opencode run "/codex_quota"    # Expected: Shows quota or credential error
```

### 13.3 Final Verification Wave (MANDATORY)

> 4 review checks run in PARALLEL. ALL must APPROVE.

- [ ] **F1. Plan Compliance Audit**
  Verify all Must Have (F1–F14) implemented. Check Guardrails (G1–G11) — no violations.  
  Output: `Must Have [N/14] | Guardrails [N/11 clean] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Code Quality Review**
  Run `npm test` + `npx @biomejs/biome check src/`. Check for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports.  
  Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] **F3. Real Plugin Execution Test**
  Install plugin. Run `/codex_quota`. Verify Markdown renders correctly (NOT code blocks). Test error scenarios.  
  Output: `Execution [PASS/FAIL] | Errors [PASS/FAIL] | Display [PASS/FAIL] | VERDICT`

- [ ] **F4. Scope Fidelity Check**
  For each task: read spec, check implementation. Verify 1:1 — nothing beyond spec.  
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

### 13.4 Definition of Done

- [ ] Plugin installs successfully in OpenCode
- [ ] `/codex_quota` shows subscription quota as Markdown
- [ ] Compact mode renders for agent calls
- [ ] Full mode renders for user command
- [ ] All conditional sections work (credits, code review, promo, warnings)
- [ ] All error scenarios (E1–E11) produce user-friendly Markdown
- [ ] All tests pass (>90% coverage)
- [ ] README includes installation + usage

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API endpoint changes without notice | Medium | High | Graceful error E7 + schema validation |
| API becomes officially documented | Low | Positive | Migrate to stable endpoint when available |
| JWT claim structure changes | Low | High | Fail-fast with clear error E9 |
| Rate limiting on wham/usage endpoint | Low | Low | Error E6, no retry |
| Plugin API (`@opencode-ai/plugin`) changes | Low | High | Pin peer dependency version |

---

## Appendix A: Open Questions (All Resolved)

| # | Question | Resolution |
|---|----------|-----------|
| 1 | What quota data to display? | Full API response: plan, rate limits, code review, credits, promo |
| 2 | Multi-provider? | Single provider (ChatGPT) only |
| 3 | Auth method? | OpenCode auth.json, JWT parsing, no env vars |
| 4 | Output format? | Rich Markdown rendered by Glamour, NOT code blocks, NOT ASCII box |
| 5 | Promo field? | Typed `unknown \| null`, conditionally displayed |
| 6 | Auto-detect tier? | From `plan_type` field in API response |
| 7 | Compact vs full trigger? | Optional `mode` arg, defaults to "full" |
