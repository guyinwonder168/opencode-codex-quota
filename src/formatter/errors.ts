/**
 * Error formatter for Codex Quota Plugin.
 * PRD §10: E1–E11 error codes with exact Markdown output templates.
 */

function e1(): string {
  return [
    "## ⚠️ Codex Quota — Not Configured",
    "",
    "OpenCode auth file not found at:",
    "`~/.local/share/opencode/auth.json`",
    "",
    "**Setup:**",
    "1. Run `opencode auth login`",
    "2. Select **ChatGPT Plus/Pro (Codex Subscription)**",
    "3. Complete OAuth flow",
    "4. Run `/codex_quota` again",
  ].join("\n");
}

function e2(): string {
  return [
    "## ⚠️ Codex Quota — No OpenAI Credentials",
    "",
    "No OpenAI/ChatGPT credentials found in auth file.",
    "Looked for keys: `codex`, `openai`, `chatgpt`, `opencode`",
    "",
    "**Setup:**",
    "1. Run `opencode auth login`",
    "2. Select **ChatGPT Plus/Pro (Codex Subscription)**",
    "3. Complete OAuth flow",
    "4. Run `/codex_quota` again",
  ].join("\n");
}

function e3e5(): string {
  return [
    "## ⚠️ Codex Quota — Token Expired",
    "",
    "Your OpenAI token has expired.",
    "",
    "**Fix:** Run `opencode auth login` to refresh your credentials.",
  ].join("\n");
}

function e4(): string {
  return [
    "## ⚠️ Codex Quota — Connection Error",
    "",
    "Could not reach OpenAI servers.",
    "",
    "**Check:** Your internet connection and try again.",
  ].join("\n");
}

function e6(): string {
  return [
    "## ⚠️ Codex Quota — Rate Limited",
    "",
    "Too many requests to the quota endpoint. Try again in a few seconds.",
  ].join("\n");
}

function e7(partialData?: unknown): string {
  let dataStr = "(no data)";
  if (partialData !== null && partialData !== undefined) {
    dataStr = JSON.stringify(partialData, null, 2);
  }
  return [
    "## ⚠️ Codex Quota — Partial Data",
    "",
    "OpenAI returned unexpected data format. Showing what's available:",
    "",
    dataStr,
    "",
    "> The API response structure may have changed. Consider updating the plugin.",
  ].join("\n");
}

function e8(): string {
  return [
    "## ⚠️ Codex Quota — Service Unavailable",
    "",
    "OpenAI returned a server error (5xx). Try again later.",
  ].join("\n");
}

function e9(): string {
  return [
    "## ⚠️ Codex Quota — Invalid Token Format",
    "",
    "Could not parse the stored token.",
    "",
    "**Fix:** Run `opencode auth login` to re-authenticate.",
  ].join("\n");
}

function e10(): string {
  return [
    "## ⚠️ Codex Quota — Incompatible Auth Method",
    "",
    "Found credentials but they are not OAuth-based (got `api_key` type).",
    "Codex quota requires an OAuth session.",
    "",
    "**Fix:** Run `opencode auth login` and select **ChatGPT Plus/Pro (Codex Subscription)**.",
  ].join("\n");
}

function e11(): string {
  return [
    "## ⚠️ Codex Quota — Incomplete Credentials",
    "",
    "Found OAuth credentials but the access token is empty or missing.",
    "",
    "**Fix:** Run `opencode auth login` to re-authenticate.",
  ].join("\n");
}

function defaultError(code: string): string {
  return [
    "## ⚠️ Codex Quota — Unknown Error",
    "",
    `An unexpected error occurred: ${code}`,
  ].join("\n");
}

/**
 * Format an error code into a Markdown string for display.
 * PRD §10.2: Exact error output templates.
 */
export function formatError(code: string, partialData?: unknown): string {
  switch (code) {
    case "E1":
      return e1();
    case "E2":
      return e2();
    case "E3":
    case "E5":
      return e3e5();
    case "E4":
      return e4();
    case "E6":
      return e6();
    case "E7":
      return e7(partialData);
    case "E8":
      return e8();
    case "E9":
      return e9();
    case "E10":
      return e10();
    case "E11":
      return e11();
    default:
      return defaultError(code);
  }
}
