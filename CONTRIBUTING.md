# Contributing to opencode-codex-quota

Thank you for your interest in contributing! This document covers everything you need to get started.

## Quick Start

```bash
git clone https://github.com/guyinwonder168/opencode-codex-quota.git
cd opencode-codex-quota
bun install
bun test          # Verify everything works
bun run build     # Build the project
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/your-feature`
3. **Write tests first** (TDD: RED → GREEN → REFACTOR)
4. **Implement** the minimal code to pass tests
5. **Run checks**: `bun test && bun run typecheck`
6. **Commit** with conventional commit messages
7. **Push** and open a Pull Request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new display section
fix: handle null secondary window
test: add auth-reader edge cases
docs: update README with new section
refactor: extract progress bar logic
chore: update dependencies
```

## Code Style

- **TypeScript strict mode** — no `any`, no `@ts-ignore`
- **Functional patterns** — prefer pure functions, avoid classes
- **No console.log in production code** — only in tests
- **Exports** — prefer named exports in regular modules; use the modern default export object for the plugin entry point
- **File structure**: one component per file, tests mirror source structure

### Formatting

- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line structures
- Max line length: 100 characters (guideline, not enforced)

## Testing

### Requirements

- All new code must have tests
- Follow Arrange-Act-Assert pattern
- Mock external dependencies (fetch, filesystem)
- Test both success and error paths
- Aim for >90% coverage

### Running Tests

```bash
bun test                              # All tests
bun test tests/auth-reader.test.ts    # Single file
bun test --watch                      # Watch mode
bun test --coverage                   # With coverage
```

### Test File Convention

```
src/services/auth-reader.ts    →  tests/auth-reader.test.ts
src/formatter/markdown.ts      →  tests/markdown.test.ts
```

## Architecture

The project follows a **Component-Service** pattern:

- **`services/auth-reader.ts`** — Reads `auth.json`, parses JWT, extracts credentials
- **`services/api-client.ts`** — Calls the API endpoint, returns typed response
- **`formatter/markdown.ts`** — Transforms API response into Markdown
- **`formatter/errors.ts`** — Maps error codes to user-friendly Markdown
- **`index.ts`** — Plugin entry point, wires everything together

### Guardrails

These are hard constraints — PRs violating them will be rejected:

| Rule | Reason |
|------|--------|
| No env var auth | Credentials come from OpenCode auth only |
| No multi-provider | Single provider (ChatGPT) keeps scope tight |
| No monolithic index.ts | Component-Service architecture required |
| No polling/auto-refresh | Query on demand only |
| No caching | Fresh data each call |
| No credential logging | Never log or expose tokens |
| No ASCII box output | Rich Markdown only |
| No code block wrapping | Return raw Markdown string |
| No retry logic | Fail-fast on errors |
| No toast notifications | Command-only, no background UI |

## Pull Request Process

1. Ensure all tests pass: `bun test`
2. Ensure type checking passes: `bun run typecheck`
3. Ensure build succeeds: `bun run build`
4. Update documentation if needed
5. Add entries to CHANGELOG.md under `[Unreleased]`
6. Reference any related issues: `Fixes #123`

### PR Template

Your PR should include:

- **What** — what does this change do?
- **Why** — why is this change needed?
- **How** — how was it implemented?
- **Tests** — what tests were added/modified?

## Reporting Issues

### Bugs

Use the [Bug Report template](https://github.com/guyinwonder168/opencode-codex-quota/issues/new?template=bug_report.md).

Include:
- OpenCode version (`opencode --version`)
- Plugin version
- Expected vs actual behavior
- Steps to reproduce

### Feature Requests

Use the [Feature Request template](https://github.com/guyinwonder168/opencode-codex-quota/issues/new?template=feature_request.md).

## Questions?

Feel free to open an issue with the `question` label or start a [Discussion](https://github.com/guyinwonder168/opencode-codex-quota/discussions).
