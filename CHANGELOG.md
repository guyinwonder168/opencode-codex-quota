# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial plugin implementation
- `/codex_quota` slash command wrapper with full and compact display modes
- Auth reading from OpenCode `auth.json` with JWT parsing
- API client for `chatgpt.com/backend-api/wham/usage` endpoint
- Markdown formatter with progress bars, time formatting, conditional sections
- Error handling for E1–E9 scenarios
- Full Vitest test suite
- CI workflow for test + typecheck + build
- README screenshot showing OpenCode TUI output

### Changed
- Reset columns now use local clock-style `Resets At` timestamps instead of relative countdown text
- `/codex_quota` now routes slash-command arguments into the wrapper instruction so `compact` mode works from the command entrypoint
- README and CONTRIBUTING now match the current npm-based development workflow and command behavior

### Fixed
- Mark the injected `/codex_quota` wrapper instruction text as synthetic for OpenCode TUI prompt reconstruction actions
