# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Upgrade `@biomejs/biome` from 1.9.4 to 2.4.10 (migrated config via `biome migrate`)
- Upgrade `typescript` from 5.9.3 to 6.0.2
- Upgrade `vitest` from 3.2.4 to 4.1.2
- Upgrade `@vitest/coverage-v8` from 3.2.4 to 4.1.2
- Upgrade `@types/node` from 22.19.15 to 25.5.2
- Bump minimum Node.js version from 18 to 20
- Biome config: `organizeImports.enabled` migrated to `assist.actions.source.organizeImports`

## [1.0.0] - 2026-04-04

### Added
- Initial plugin implementation
- `/codex_quota` slash command wrapper with full and compact display modes
- Auth reading from OpenCode `auth.json` with JWT parsing
- API client for `chatgpt.com/backend-api/wham/usage` endpoint
- Markdown formatter with progress bars, time formatting, conditional sections
- Error handling for E1–E9 scenarios
- Full Vitest test suite (124 tests, 99%+ coverage)
- CI workflow for test + typecheck + build + SonarCloud analysis
- Publish-to-npm workflow triggered on GitHub Release with provenance
- README screenshot showing OpenCode TUI output

### Changed
- Reset columns now use local clock-style `Resets At` timestamps instead of relative countdown text
- `/codex_quota` now routes slash-command arguments into the wrapper instruction so `compact` mode works from the command entrypoint
- README and CONTRIBUTING now match the current npm-based development workflow and command behavior

### Fixed
- Mark the injected `/codex_quota` wrapper instruction text as synthetic for OpenCode TUI prompt reconstruction actions
- SonarCloud maintainability: extract helper functions to reduce cognitive complexity, consolidate consecutive statements, replace negated conditionals
