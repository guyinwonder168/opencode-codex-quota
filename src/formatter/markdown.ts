import type { DisplayMode, QuotaResponse, WindowInfo } from "../types";

const BAR_LENGTH = 12;
const FILL = "█";
const EMPTY = "░";

/**
 * Build a 12-character progress bar. Clamps values > 100 to full bar.
 * PRD 8.2: Math.round(Math.min(used_percent, 100) / 100 * 12)
 */
export function buildProgressBar(usedPercent: number): string {
  const clamped = Math.min(usedPercent, 100);
  const filled = Math.round((clamped / 100) * BAR_LENGTH);
  return FILL.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled);
}

/**
 * Format seconds to human-readable string. PRD 8.3.
 */
export function formatTime(seconds: number): string {
  if (seconds <= 0) return "now";

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function capitalize(s: string): string {
  if (!s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMessageRange(range: [number, number]): string {
  if (range[0] === 0 && range[1] === 0) return "0";
  return `${range[0]} — ${range[1]}`;
}

function windowRow(label: string, window: WindowInfo | null): string {
  if (!window) return `| **${label}** | N/A | N/A | N/A |`;
  const bar = buildProgressBar(window.used_percent);
  const time = formatTime(window.reset_after_seconds);
  return `| **${label}** | ${window.used_percent}% | \`${bar}\` ${window.used_percent}% | ${time} |`;
}

type WarningLevel = "none" | "advisory" | "warning" | "critical";

function getWarningLevel(window: WindowInfo | null): WarningLevel {
  if (!window) return "none";
  if (window.used_percent >= 100) return "critical";
  if (window.used_percent >= 80) return "warning";
  if (window.used_percent >= 50) return "advisory";
  return "none";
}

const severityOrder: Record<WarningLevel, number> = {
  critical: 3,
  warning: 2,
  advisory: 1,
  none: 0,
};

function getMostSevereStatus(response: QuotaResponse): WarningLevel {
  const levels: WarningLevel[] = [
    getWarningLevel(response.rate_limit.primary_window),
    getWarningLevel(response.rate_limit.secondary_window),
  ];
  return levels.reduce(
    (worst, level) =>
      severityOrder[level] > severityOrder[worst] ? level : worst,
    "none" as WarningLevel,
  );
}

function formatWarnings(response: QuotaResponse): string {
  const lines: string[] = [];
  const windows = [
    { name: "Primary (5h)", window: response.rate_limit.primary_window },
    { name: "Weekly", window: response.rate_limit.secondary_window },
  ];

  for (const { name, window } of windows) {
    if (!window) continue;
    if (window.used_percent >= 100) {
      lines.push(
        `> 🚫 ${name} — limit reached. Resets in ${formatTime(window.reset_after_seconds)}.`,
      );
    } else if (window.used_percent >= 80) {
      lines.push(`> ⚠️ ${name} at ${window.used_percent}% — approaching limit.`);
    }
  }

  // Advisory notes (50-79%)
  for (const { name, window } of windows) {
    if (!window) continue;
    if (window.used_percent >= 50 && window.used_percent < 80) {
      lines.push(
        `> ⚠️ ${name} at ${window.used_percent}% — consider pacing your usage.`,
      );
    }
  }

  return lines.join("\n\n");
}

function formatFull(response: QuotaResponse): string {
  const sections: string[] = [];

  // Header
  const planDisplay = capitalize(response.plan_type);
  sections.push(
    `# OpenAI Codex Subscription\n\n**Plan:** ${planDisplay} | **Account:** ${response.email}`,
  );

  // Quota Limits (always shown)
  let quotaTable =
    "## Quota Limits\n\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|";

  if (response.rate_limit.primary_window) {
    quotaTable += `\n${windowRow("Primary (5h)", response.rate_limit.primary_window)}`;
  } else {
    quotaTable += `\n${windowRow("Primary (5h)", null)}`;
  }

  if (response.rate_limit.secondary_window) {
    quotaTable += `\n${windowRow("Weekly", response.rate_limit.secondary_window)}`;
  }

  sections.push(quotaTable);

  // Warnings
  const warnings = formatWarnings(response);
  if (warnings) {
    sections.push(warnings);
  }

  // Code Review Quota — only when primary_window is not null (9.4)
  if (response.code_review_rate_limit?.primary_window) {
    const crTable = `## Code Review Quota\n\n| Window | Usage | Progress | Resets In |\n|--------|-------|----------|-----------|\n${windowRow("Weekly", response.code_review_rate_limit.primary_window)}`;
    sections.push(crTable);
  }

  // Credits — only when has_credits or unlimited (9.4)
  if (response.credits.has_credits || response.credits.unlimited) {
    const creditsTable = `## Credits\n\n| Metric | Value |\n|--------|-------|\n| **Balance** | ${response.credits.unlimited ? "Unlimited" : response.credits.balance} |\n| **Approx. Local Messages** | ${formatMessageRange(response.credits.approx_local_messages)} |\n| **Approx. Cloud Messages** | ${formatMessageRange(response.credits.approx_cloud_messages)} |`;
    sections.push(creditsTable);
  }

  // Spend Control (always shown)
  const spendStatus = response.spend_control.reached
    ? "🚫 Limit reached"
    : "✅ Within limit";
  sections.push(`## Spend Control\n\n**Status:** ${spendStatus}`);

  // Promo — only when non-null (9.4)
  if (response.promo !== null && response.promo !== undefined) {
    sections.push("## Promotional\n\n🎁 Promotional quota active");
  }

  // Timestamp footer
  sections.push(`*Updated: ${new Date().toISOString()}*`);

  return sections.join("\n\n---\n\n");
}

function formatCompact(response: QuotaResponse): string {
  const lines: string[] = [];

  const planDisplay = capitalize(response.plan_type);
  lines.push(`### Codex Quota — ${planDisplay}`);
  lines.push("");
  lines.push("| Window | Usage | Progress | Reset |");
  lines.push("|--------|-------|----------|-------|");

  if (response.rate_limit.primary_window) {
    const w = response.rate_limit.primary_window;
    const bar = buildProgressBar(w.used_percent);
    const time = formatTime(w.reset_after_seconds);
    lines.push(`| 5h | ${w.used_percent}% | \`${bar}\` | ${time} |`);
  }

  if (response.rate_limit.secondary_window) {
    const w = response.rate_limit.secondary_window;
    const bar = buildProgressBar(w.used_percent);
    const time = formatTime(w.reset_after_seconds);
    lines.push(`| Weekly | ${w.used_percent}% | \`${bar}\` | ${time} |`);
  }

  // Compact status — most severe wins (PRD 9.2: 🚫 > ⚠️ > ✅)
  const status = getMostSevereStatus(response);
  if (status === "critical") {
    lines.push("\n**Status**: 🚫 Limit reached");
  } else if (status === "warning") {
    lines.push("\n**Status**: ⚠️ Approaching limit");
  } else if (status === "advisory") {
    lines.push("\n**Status**: ✅ Within limits");
  }
  // status === "none" → omit status line entirely

  return lines.join("\n");
}

export function formatQuota(
  response: QuotaResponse,
  mode: DisplayMode,
): string {
  if (mode === "compact") {
    return formatCompact(response);
  }
  return formatFull(response);
}
