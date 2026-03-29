# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial plugin implementation
- `/codex_quota` command with full and compact display modes
- Auth reading from OpenCode `auth.json` with JWT parsing
- API client for `chatgpt.com/backend-api/wham/usage` endpoint
- Markdown formatter with progress bars, time formatting, conditional sections
- Error handling for E1–E9 scenarios
- Full test suite with `bun test`
- CI workflow for test + typecheck + build
