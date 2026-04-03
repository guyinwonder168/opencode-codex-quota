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
