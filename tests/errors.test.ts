import { describe, expect, test } from "vitest";
import { formatError } from "../src/formatter/errors";

describe("formatError", () => {
  test("E1 — auth.json not found", () => {
    const result = formatError("E1");
    expect(result).toContain("Not Configured");
    expect(result).toContain("auth.json");
    expect(result).toContain("opencode auth login");
  });

  test("E2 — no matching provider", () => {
    const result = formatError("E2");
    expect(result).toContain("No OpenAI Credentials");
    expect(result).toContain("codex");
    expect(result).toContain("opencode auth login");
  });

  test("E3 — token expired", () => {
    const result = formatError("E3");
    expect(result).toContain("Token Expired");
    expect(result).toContain("opencode auth login");
  });

  test("E4 — network error", () => {
    const result = formatError("E4");
    expect(result).toContain("Connection Error");
    expect(result).toContain("internet connection");
  });

  test("E5 — auth error 401/403", () => {
    const result = formatError("E5");
    expect(result).toContain("Token Expired");
    expect(result).toContain("opencode auth login");
  });

  test("E3 and E5 produce identical output", () => {
    expect(formatError("E3")).toBe(formatError("E5"));
  });

  test("E6 — rate limited includes guidance text", () => {
    const result = formatError("E6");
    expect(result).toContain("Rate Limited");
    expect(result).toContain("Try again in a few seconds");
  });

  test("E7 — unexpected schema with partial data", () => {
    const result = formatError("E7", { plan_type: "plus" });
    expect(result).toContain("Partial Data");
    expect(result).toContain("unexpected data format");
    expect(result).toContain(JSON.stringify({ plan_type: "plus" }, null, 2));
  });

  test("E7 — unexpected schema without partial data", () => {
    const result = formatError("E7");
    expect(result).toContain("Partial Data");
    expect(result).toContain("(no data)");
  });

  test("E7 — null partialData treated as no data", () => {
    const result = formatError("E7", null);
    expect(result).toContain("(no data)");
  });

  test("E8 — server error", () => {
    const result = formatError("E8");
    expect(result).toContain("Service Unavailable");
    expect(result).toContain("server error");
  });

  test("E9 — JWT parse failure", () => {
    const result = formatError("E9");
    expect(result).toContain("Invalid Token Format");
    expect(result).toContain("opencode auth login");
  });

  test("E10 — wrong auth type (not OAuth)", () => {
    const result = formatError("E10");
    expect(result).toContain("Incompatible Auth Method");
    expect(result).toContain("OAuth");
    expect(result).toContain("opencode auth login");
  });

  test("E11 — empty access token", () => {
    const result = formatError("E11");
    expect(result).toContain("Incomplete Credentials");
    expect(result).toContain("access token");
    expect(result).toContain("opencode auth login");
  });

  test("all E1–E11 errors use ⚠️ icon", () => {
    const codes = [
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "E7",
      "E8",
      "E9",
      "E10",
      "E11",
    ];
    for (const code of codes) {
      expect(formatError(code)).toContain("⚠️");
    }
  });

  test("all errors are raw Markdown (not code block wrapped)", () => {
    const codes = [
      "E1",
      "E2",
      "E3",
      "E4",
      "E5",
      "E6",
      "E7",
      "E8",
      "E9",
      "E10",
      "E11",
    ];
    for (const code of codes) {
      const result = formatError(code);
      expect(result).not.toMatch(/^```\n/);
      expect(result).not.toMatch(/\n```$/);
    }
  });

  test("unknown error code returns generic message", () => {
    const result = formatError("E99");
    expect(result).toContain("Unknown Error");
    expect(result).toContain("E99");
    expect(result).toContain("⚠️");
  });
});
