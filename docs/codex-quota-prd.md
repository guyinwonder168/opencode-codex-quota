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
| F3 | Display primary window (5h) quota with progress bar, %, reset countdown | P0 |
| F4 | Display secondary window (weekly) quota with progress bar, %, reset countdown | P0 |
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
- Reset time countdowns
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
3. Must be `type: "oauth"` with valid `access` token
4. Check `expires` timestamp — reject if expired
5. Decode JWT payload (base64, no verification needed — it's our own token)
6. Extract `chatgpt_account_id` from `https://api.openai.com/auth` claim
7. Extract `email` from `https://api.openai.com/profile` claim
8. Call endpoint with `Authorization: Bearer {access}` + `ChatGPT-Account-Id: {account_id}` header

### 7.3 Promo Field

- Currently `null` on tested Plus account (2026-03-29)
- Typed as `unknown | null` — conditionally displayed as formatted Markdown section when present
- The 2x rate limits promo (Feb-Apr 2026) is applied server-side, NOT surfaced in API response
- Display format will be refined once real promo data is encountered

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

### 8.2 Progress Bar Specification

- **Length**: 12 characters
- **Fill character**: `█`
- **Empty character**: `░`
- **Formula**: `Math.round(used_percent / 100 * 12)` filled, remainder empty
- **Thresholds**:
  - 0–49%: No warning (normal)
  - 50–79%: Advisory note in output
  - 80–99%: Warning banner (blockquote with ⚠️)
  - 100%: Limit reached banner (blockquote with 🚫)

### 8.3 Time Formatting Specification

Convert seconds to human-readable string:

| Seconds | Output |
|---------|--------|
| 0 | `now` |
| < 60 | `{s}s` |
| < 3600 | `{m}m {s}s` |
| < 86400 | `{h}h {m}m` |
| ≥ 86400 | `{d}d {h}h` |

- Floor all divisions (no decimals)
- Use remainder for next smaller unit
- Example: `90061s` → `1d 1h`

### 8.4 Display Mode Trigger

The tool accepts an optional `mode` argument:

```typescript
args: {
  mode: tool.schema.optional(tool.schema.string().describe("Display mode: 'compact' or 'full'. Default: 'full'"))
}
```

- **User runs `/codex_quota`** → `mode` is undefined → defaults to `"full"`
- **Agent calls tool** → can pass `mode: "compact"` for concise output
- **Invalid mode** → treated as `"full"`

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

| Window | Usage | Progress | Reset |
|--------|-------|----------|-------|
| 5h | {percent}% | `{bar}` | {time} |
| Weekly | {percent}% | `{bar}` | {time} |

**Status**: {✅ Within limits | ⚠️ {percent}% used | 🚫 Limit reached}
```

**Conditional in compact:**
- Only show primary + secondary windows (skip code review, credits, promo)
- Show warning status line only if any window ≥ 50%

### 9.3 Full Mode (user command)

```markdown
# OpenAI Codex Subscription

**Plan:** {plan_type} | **Account:** {email}

---

## Quota Limits

| Window | Usage | Progress | Resets In |
|--------|-------|----------|-----------|
| **Primary (5h)** | {percent}% | `{bar}` {percent}% | {time} |
| **Weekly** | {percent}% | `{bar}` {percent}% | {time} |

> ⚠️ {window name} at {percent}% — {advisory text}

---

## Code Review Quota

*(only shown when `code_review_rate_limit.primary_window` is not null)*

| Window | Usage | Progress | Resets In |
|--------|-------|----------|-----------|
| **Weekly** | {percent}% | `{bar}` {percent}% | {time} |

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
| Multiple windows at limit | Show warning for each, most severe first |

---

## 10. Error Specification

### 10.1 Error Scenarios

| # | Scenario | Detection | Output |
|---|----------|-----------|--------|
| E1 | `auth.json` not found | File read fails | Setup instructions (see E1 output) |
| E2 | No matching provider key | No `codex`/`openai`/`chatgpt`/`opencode` entry | Setup instructions with key names |
| E3 | Token expired | `expires` timestamp < now | Re-auth instruction |
| E4 | Network timeout | Fetch aborts after 10s | Connection error |
| E5 | API returns 401/403 | HTTP status code | Re-auth instruction |
| E6 | API returns 429 | HTTP status code | Rate limited message |
| E7 | API returns unexpected schema | Missing required fields | Partial data notice + what's available |
| E8 | API returns 5xx | HTTP status code | Service unavailable message |
| E9 | JWT parse failure | Malformed payload | Setup instructions |

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

**E4 — Network timeout:**

```markdown
## ⚠️ Codex Quota — Connection Error

Could not reach OpenAI (timeout after 10s).

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

### 11.3 Package Details

| Field | Value |
|-------|-------|
| **Package name** | `opencode-codex-quota` |
| **Version** | `0.1.0` |
| **Runtime** | Bun |
| **Language** | TypeScript (strict) |
| **Dependencies** | `@opencode-ai/plugin` (peer) |
| **Dev dependencies** | `typescript`, `@types/bun`, `bun-types` |
| **Test framework** | `bun test` |
| **Build** | `bun run build` → outputs to `dist/` |

### 11.4 Plugin Installation

User adds to their OpenCode config (`~/.config/opencode/config.json`):

```json
{
  "plugins": {
    "opencode-codex-quota": {}
  }
}
```

Or installs via:
```bash
opencode plugin install opencode-codex-quota
```

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
├── Task 7: Error handling (all E1–E9 scenarios with Markdown output)
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

- **Framework**: `bun test`
- **Pattern**: RED (failing test) → GREEN (minimal impl) → REFACTOR
- **Coverage target**: > 90%
- **Evidence saved to**: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

### 13.2 Success Criteria

```bash
bun install                    # Expected: dependencies installed
bun run build                  # Expected: TypeScript compiles without errors
bun test                       # Expected: All tests pass
opencode run "/codex_quota"    # Expected: Shows quota or credential error
```

### 13.3 Final Verification Wave (MANDATORY)

> 4 review checks run in PARALLEL. ALL must APPROVE.

- [ ] **F1. Plan Compliance Audit**
  Verify all Must Have (F1–F14) implemented. Check Guardrails (G1–G11) — no violations.  
  Output: `Must Have [N/14] | Guardrails [N/11 clean] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Code Quality Review**
  Run `bun test` + `bun run lint`. Check for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports.  
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
- [ ] All error scenarios (E1–E9) produce user-friendly Markdown
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
