// How much of an account's allowance is used (step 2.4). The figures are the tool's, taken as
// stated. What is worked out here is only how they stand: whether, at the pace so far, a limit
// would be used up before it starts over. The rule is the same for the figure in the status bar,
// the popup, Activity and the sessions, so it is here once.

import type { AccountUsage, UsageWindow } from "./backend";
import { plural, t } from "./i18n";

export type Standing = "fine" | "pace" | "limit";

/** The length of the limits, in seconds. */
const FIVE_HOURS = 5 * 3600;
const SEVEN_DAYS = 7 * 86400;

export interface Limit {
  key: "5h" | "wk";
  /** As the interface says it */
  label: string;
  /** Length of the whole stretch in seconds */
  length: number;
  window: UsageWindow;
  standing: Standing;
  /** How much of the time is over, 0 to 1 */
  elapsed: number;
  /** Seconds until it starts over */
  left: number;
}

/**
 * How a limit stands. "limit" at 100 %. "pace" when what is used so far, spread over the time that is
 * over, would use everything up before the reset, and a good part is gone already (below 60 %
 * an early burst says little). Else "fine": 88 % shortly before the reset is nothing to warn of.
 */
export function standingOf(used: number, elapsed: number): Standing {
  if (used >= 100) return "limit";
  return used >= 60 && used / Math.max(elapsed, 0.02) >= 100 ? "pace" : "fine";
}

function limit(key: Limit["key"], length: number, window: UsageWindow | null, nowSec: number): Limit | null {
  // A tool drops a limit once it started over; one still in the figures we kept is stale
  if (!window || window.resetsAt <= nowSec) return null;
  const left = window.resetsAt - nowSec;
  const elapsed = Math.min(1, Math.max(0, 1 - left / length));
  return { key, label: key === "5h" ? t("Last 5 hours") : t("This week"), length, window, standing: standingOf(window.used, elapsed), elapsed, left };
}

/** The limits of an account that are still current. */
export function limitsOf(usage: AccountUsage | undefined, now: number): Limit[] {
  const sec = Math.floor(now / 1000);
  return [limit("5h", FIVE_HOURS, usage?.fiveHour ?? null, sec), limit("wk", SEVEN_DAYS, usage?.sevenDay ?? null, sec)].filter((l): l is Limit => l !== null);
}

const RANK: Record<Standing, number> = { fine: 0, pace: 1, limit: 2 };
export const worst = (limits: Limit[]): Standing => limits.reduce<Standing>((w, l) => (RANK[l.standing] > RANK[w] ? l.standing : w), "fine");

/** Colour classes of a standing: bright like the branch when fine, amber, red. */
export const STANDING_TEXT: Record<Standing, string> = { fine: "text-slate-200", pace: "text-changed", limit: "text-problem" };
export const STANDING_FILL: Record<Standing, string> = { fine: "bg-ai", pace: "bg-changed", limit: "bg-problem" };

/** `3 h 5 min`, `22 min`, `3 d 1 h`: the time until a reset. */
export function span(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min >= 24 * 60) return t("{d} d {h} h", { d: Math.floor(min / 1440), h: Math.floor((min % 1440) / 60) });
  if (min >= 60) return t("{h} h {m} min", { h: Math.floor(min / 60), m: min % 60 });
  return t("{m} min", { m: min });
}

/** The reset as a clock time, with the weekday when it is not today or tomorrow. */
export function resetAt(resetsAt: number, now: number, locale: string): string {
  const d = new Date(resetsAt * 1000);
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return resetsAt * 1000 - now < 20 * 3600_000 ? time : `${d.toLocaleDateString(locale, { weekday: "short" })} ${time}`;
}

/** The name of an account: the folder the tool keeps its configuration in, without the path. */

/** The session cannot go on until its account's limit starts over: when that is, else `null`. */
export function blockedUntil(usage: AccountUsage[], account: string | null | undefined, now: number): number | null {
  const found = limitsOf(usage.find((u) => u.account === account), now).filter((l) => l.standing === "limit");
  return found.length ? Math.max(...found.map((l) => l.window.resetsAt)) : null;
}

export { plural };
