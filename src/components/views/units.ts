// Sizes and ages the way the Workbench shows them.

import { LOCALE } from "../Trail";
import { t } from "../../i18n";

const DAY = 24 * 3600_000;

/** A size as people read it. */
export function size(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** How long ago, in the words of the dummy: today with the time, else days. */
export function age(at: number, now: number): string {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  if (at >= midnight) return t("today {time}", { time: new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) });
  const days = Math.ceil((midnight - at) / DAY);
  return days === 1 ? t("yesterday") : t("{n} days ago", { n: days });
}
