# opencode-codex-quota

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Issues](https://img.shields.io/github/issues/guyinwonder168/opencode-codex-quota.svg)](https://github.com/guyinwonder168/opencode-codex-quota/issues)
[![Bun](https://img.shields.io/badge/runtime-bun-black.svg)](https://bun.sh)

OpenCode plugin that displays your **ChatGPT Plus/Pro Codex subscription quota** directly in the terminal — no browser needed.

## Features

- **Single `/codex_quota` command** — one slash command, instant results
- **Rich Markdown output** — themed headers, progress bars, tables rendered by OpenCode TUI
- **5h + Weekly windows** — primary 5-hour and secondary weekly usage with countdown timers
- **Code review quota** — shown when applicable to your plan
- **Credits & spend control** — balance, approximate message counts, spending status
- **Warning banners** — proactive alerts at 50%, 80%, and 100% usage
- **Two display modes** — full (user command) and compact (agent subtask)
- **Auth from OpenCode** — reads your existing `opencode auth login` credentials, no extra setup

## Screenshot

*(Coming soon — plugin renders as styled Markdown in OpenCode TUI)*

## Install

### Via OpenCode CLI (recommended)

```bash
opencode plugin install opencode-codex-quota
```

### Via config file

Add to your OpenCode config (`~/.config/opencode/config.json`):

```json
{
  "plugin": ["opencode-codex-quota"]
}
```

### From source (development)

```bash
git clone https://github.com/guyinwonder168/opencode-codex-quota.git
cd opencode-codex-quota
bun install
bun run build
```

Then add the local path to your config:

```json
{
  "plugin": ["./path/to/opencode-codex-quota"]
}
```

## Usage

### User Command (Full Mode)

```
/codex_quota
```

Displays complete quota information:

```
# OpenAI Codex Subscription

**Plan:** Plus | **Account:** user@example.com

---

## Quota Limits

| Window | Usage | Progress | Resets In |
|--------|-------|----------|-----------|
| **Primary (5h)** | 25% | `███░░░░░░░░░` 25% | 1h 30m |
| **Weekly** | 16% | `██░░░░░░░░░░` 16% | 5d 12h |

---

## Spend Control

**Status:** ✅ Within limit

---

*Updated: 2026-03-29T12:00:00.000Z*
```

### Agent Subtask (Compact Mode)

The tool can be called by AI agents with `mode=compact` for concise output:

```
/codex_quota mode=compact
```

```
### Codex Quota — Plus

| Window | Usage | Progress | Reset |
|--------|-------|----------|-------|
| 5h | 25% | `███░░░░░░░░░` | 1h 30m |
| Weekly | 16% | `██░░░░░░░░░░` | 5d 12h |
```

### Conditional Sections

Some sections appear only when relevant:

| Section | When Shown |
|---------|-----------|
| **Code Review Quota** | When your plan includes code review limits |
| **Credits** | When you have credits or unlimited balance |
| **Promotional** | When promotional quota is active |
| **Warning banners** | When any window exceeds 80% |
| **Advisory notes** | When any window is 50–79% |

## Requirements

- [OpenCode](https://opencode.ai) installed and configured
- **ChatGPT Plus or Pro** subscription with Codex access
- OAuth credentials via `opencode auth login` (select ChatGPT Plus/Pro)

## Error Handling

The plugin shows clear, actionable Markdown messages for common issues:

| Error | Message |
|-------|---------|
| No auth file | Setup instructions with `opencode auth login` steps |
| No OpenAI credentials | Lists provider keys checked, re-auth guidance |
| Token expired | Re-auth instruction |
| Network timeout | Connection check guidance |
| API 401/403 | Token refresh instruction |
| API 429 | Rate limited — wait a few seconds |
| API 5xx | Service unavailable — try later |
| Unexpected API response | Partial data with update notice |

## Architecture

```
opencode-codex-quota/
├── src/
│   ├── index.ts              # Plugin entry point, tool definition
│   ├── types.ts              # All TypeScript interfaces
│   ├── services/
│   │   ├── auth-reader.ts    # Read auth.json → parse JWT → extract credentials
│   │   └── api-client.ts     # Call wham/usage → typed QuotaResponse
│   └── formatter/
│       ├── markdown.ts       # QuotaResponse → Markdown string
│       └── errors.ts         # Error codes → Markdown error messages
└── tests/
    ├── auth-reader.test.ts
    ├── api-client.test.ts
    ├── markdown.test.ts
    ├── errors.test.ts
    └── integration.test.ts
```

**Data flow:**

```
/codex_quota [mode?]
  → AuthReader: auth.json → JWT → { token, accountId, email }
  → ApiClient: GET wham/usage → QuotaResponse
  → Formatter: QuotaResponse + mode → Markdown string
  → OpenCode TUI renders via Glamour
```

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.2.0
- TypeScript >= 5.7

### Setup

```bash
git clone https://github.com/guyinwonder168/opencode-codex-quota.git
cd opencode-codex-quota
bun install
```

### Commands

```bash
bun run build       # TypeScript → dist/
bun run typecheck   # Type checking only
bun test            # Run all tests
bun test --watch    # Run tests in watch mode
```

### Testing

Tests use `bun test` with the Arrange-Act-Assert pattern. Mocks for `fetch` and `fs` are set up per test.

```bash
bun test                              # All tests
bun test tests/auth-reader.test.ts    # Specific file
bun test --coverage                   # With coverage report
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © 2026 guyinwonder168

## Acknowledgments

- [slkiser/opencode-quota](https://github.com/slkiser/opencode-quota) — source of the API endpoint and auth flow discovery
- [OpenCode](https://opencode.ai) — the AI coding assistant this plugin extends
