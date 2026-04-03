import { describe, expect, test } from "vitest";
import {
  buildProgressBar,
  formatQuota,
  formatResetClock,
} from "../src/formatter/markdown";
import type { QuotaResponse } from "../src/types";

// Helper to create a base response for tests
function createBaseResponse(overrides?: Partial<QuotaResponse>): QuotaResponse {
  return {
    user_id: "u1",
    account_id: "acct_1",
    email: "user@example.com",
    plan_type: "plus",
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: {
        used_percent: 25,
        limit_window_seconds: 18000,
        reset_after_seconds: 3600,
        reset_at: 1743272400,
      },
      secondary_window: {
        used_percent: 16,
        limit_window_seconds: 604800,
        reset_after_seconds: 86400,
        reset_at: 1743877200,
      },
    },
    credits: {
      has_credits: false,
      unlimited: false,
      balance: "0",
      approx_local_messages: [0, 0],
      approx_cloud_messages: [0, 0],
    },
    spend_control: { reached: false },
    promo: null,
    ...overrides,
  };
}

// === buildProgressBar ===
describe("buildProgressBar", () => {
  test("0% → empty bar", () => {
    expect(buildProgressBar(0)).toBe("░░░░░░░░░░░░");
  });

  test("100% → full bar", () => {
    expect(buildProgressBar(100)).toBe("████████████");
  });

  test("50% → half filled", () => {
    expect(buildProgressBar(50)).toBe("██████░░░░░░");
  });

  test("25% → 3 filled", () => {
    expect(buildProgressBar(25)).toBe("███░░░░░░░░░");
  });

  test("75% → 9 filled", () => {
    expect(buildProgressBar(75)).toBe("█████████░░░");
  });

  test("8% → 1 filled (rounds 0.96 → 1)", () => {
    expect(buildProgressBar(8)).toBe("█░░░░░░░░░░░");
  });

  test("clamps >100% to full bar (12 chars)", () => {
    expect(buildProgressBar(105)).toBe("████████████");
  });
});

// === formatResetClock ===
describe("formatResetClock", () => {
  test("same-day reset → HH:mm:ss", () => {
    const referenceDate = new Date("2025-04-08T12:00:00");
    const sameDayReset = Math.floor(
      new Date("2025-04-08T04:06:00").getTime() / 1000,
    );
    expect(formatResetClock(sameDayReset, referenceDate)).toBe("04:06:00");
  });

  test("different-day reset → HH:mm:ss on D MMM", () => {
    const referenceDate = new Date("2025-04-08T12:00:00");
    const nextDayReset = Math.floor(
      new Date("2025-04-09T05:46:00").getTime() / 1000,
    );
    expect(formatResetClock(nextDayReset, referenceDate)).toBe(
      "05:46:00 on 9 Apr",
    );
  });
});

// === Full Mode ===
describe("formatQuota — full mode", () => {
  test("includes plan type and email in header", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).toContain("**Plan:** Plus");
    expect(result).toContain("**Account:** user@example.com");
  });

  test("includes primary window with progress bar and percentage", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).toContain("**Primary (5h)**");
    expect(result).toContain("25%");
    expect(result).toContain("███░░░░░░░░░");
    expect(result).toContain("Resets At");
    expect(result).not.toContain("Resets In");
  });

  test("includes secondary window when present", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).toContain("**Weekly**");
    expect(result).toContain("16%");
    expect(result).toContain("Resets At");
  });

  test("skips secondary window row when null", () => {
    const noSecondary = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 25,
          limit_window_seconds: 18000,
          reset_after_seconds: 3600,
          reset_at: 1743272400,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(noSecondary, "full");
    expect(result).not.toContain("**Weekly**");
  });

  test("shows code review section with clock-style reset time", () => {
    const withCodeReview = createBaseResponse({
      code_review_rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 604800,
          reset_after_seconds: 604800,
          reset_at: 1743877200,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(withCodeReview, "full");
    expect(result).toContain("## Code Review Quota");
    expect(result).toContain("Resets At");
    expect(result).not.toContain("Resets In");
  });

  test("hides code review section when primary_window is null", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).not.toContain("## Code Review Quota");
  });

  test("shows credits when has_credits is true", () => {
    const withCredits = createBaseResponse({
      credits: {
        has_credits: true,
        unlimited: false,
        balance: "50",
        approx_local_messages: [10, 20],
        approx_cloud_messages: [5, 15],
      },
    });
    const result = formatQuota(withCredits, "full");
    expect(result).toContain("## Credits");
    expect(result).toContain("50");
    expect(result).toContain("10 — 20");
    expect(result).toContain("5 — 15");
  });

  test("hides credits when has_credits is false and unlimited is false", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).not.toContain("## Credits");
  });

  test("shows spend control status — within limit", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).toContain("✅ Within limit");
  });

  test("shows spend control status — limit reached", () => {
    const result = formatQuota(
      createBaseResponse({ spend_control: { reached: true } }),
      "full",
    );
    expect(result).toContain("🚫 Limit reached");
  });

  test("shows warning banner (blockquote) when usage >= 80%", () => {
    const highUsage = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 85,
          limit_window_seconds: 18000,
          reset_after_seconds: 3600,
          reset_at: 1743272400,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(highUsage, "full");
    expect(result).toContain("⚠️");
  });

  test("shows limit reached banner at 100%", () => {
    const atLimit = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: {
          used_percent: 100,
          limit_window_seconds: 18000,
          reset_after_seconds: 0,
          reset_at: 1743272400,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(atLimit, "full");
    expect(result).toContain("🚫");
  });

  test("clamps >100% to full bar but shows actual value", () => {
    const overLimit = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: {
          used_percent: 105,
          limit_window_seconds: 18000,
          reset_after_seconds: 0,
          reset_at: 1743272400,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(overLimit, "full");
    expect(result).toContain("████████████");
    expect(result).toContain("105%");
  });

  test("includes Updated timestamp footer in italic", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).toMatch(/\*Updated:.*\*/);
  });

  test("does NOT wrap output in code blocks", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).not.toMatch(/^```\n/);
    expect(result).not.toMatch(/\n```$/);
  });

  test("shows promo section when promo is non-null", () => {
    const withPromo = createBaseResponse({
      promo: { description: "2x rate limits" },
    });
    const result = formatQuota(withPromo, "full");
    expect(result).toContain("Promotional quota active");
  });

  test("hides promo section when promo is null", () => {
    const result = formatQuota(createBaseResponse(), "full");
    expect(result).not.toContain("Promotional");
  });

  test("unknown plan_type displays capitalized", () => {
    const result = formatQuota(
      createBaseResponse({ plan_type: "enterprise" }),
      "full",
    );
    expect(result).toContain("Enterprise");
  });

  test("plan_type empty string displays as Unknown", () => {
    const result = formatQuota(createBaseResponse({ plan_type: "" }), "full");
    expect(result).toContain("Unknown");
  });

  test("null primary_window shows N/A", () => {
    const noPrimary = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: null,
        secondary_window: null,
      },
    });
    const result = formatQuota(noPrimary, "full");
    expect(result).toContain("N/A");
  });

  test("approx messages [0,0] shows 0 not '0 — 0'", () => {
    const withCredits = createBaseResponse({
      credits: {
        has_credits: true,
        unlimited: false,
        balance: "0",
        approx_local_messages: [0, 0],
        approx_cloud_messages: [0, 0],
      },
    });
    const result = formatQuota(withCredits, "full");
    expect(result).not.toContain("0 — 0");
  });
});

// === Compact Mode ===
describe("formatQuota — compact mode", () => {
  test("uses h3 header with capitalized plan type", () => {
    const result = formatQuota(createBaseResponse(), "compact");
    expect(result).toContain("### Codex Quota — Plus");
  });

  test("shows only primary and secondary windows", () => {
    const result = formatQuota(createBaseResponse(), "compact");
    expect(result).toContain("| 5h |");
    expect(result).toContain("| Weekly |");
    expect(result).toContain("Resets At");
    expect(result).not.toContain("Reset |");
  });

  test("does NOT show code review, credits, spend control, promo", () => {
    const result = formatQuota(createBaseResponse(), "compact");
    expect(result).not.toContain("Code Review");
    expect(result).not.toContain("Credits");
    expect(result).not.toContain("Spend Control");
    expect(result).not.toContain("Promotional");
  });

  test("shows status line only when usage >= 50%", () => {
    const highUsage = createBaseResponse({
      rate_limit: {
        allowed: true,
        limit_reached: false,
        primary_window: {
          used_percent: 55,
          limit_window_seconds: 18000,
          reset_after_seconds: 3600,
          reset_at: 1743272400,
        },
        secondary_window: null,
      },
    });
    const result = formatQuota(highUsage, "compact");
    expect(result).toContain("**Status**");
  });

  test("does NOT show status line when all usage < 50%", () => {
    const result = formatQuota(createBaseResponse(), "compact");
    expect(result).not.toContain("**Status**");
  });

  test("most severe status wins: 🚫 over ⚠️ over ✅", () => {
    const mixed = createBaseResponse({
      rate_limit: {
        allowed: false,
        limit_reached: true,
        primary_window: {
          used_percent: 100,
          limit_window_seconds: 18000,
          reset_after_seconds: 0,
          reset_at: 1743272400,
        },
        secondary_window: {
          used_percent: 60,
          limit_window_seconds: 604800,
          reset_after_seconds: 86400,
          reset_at: 1743877200,
        },
      },
    });
    const result = formatQuota(mixed, "compact");
    expect(result).toContain("🚫");
    expect(result).not.toContain("✅");
  });
});
