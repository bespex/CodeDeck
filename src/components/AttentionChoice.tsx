import type { AttentionSettings } from "../backend";
import { useAttentionSettings } from "../attention";
import { LOCALE } from "./Trail";
import { t } from "../i18n";

/** How long "Do not disturb" lasts, in minutes; "tomorrow" is until 8 o'clock the next morning. */
const QUIET = [
  [30, "30 minutes"],
  [60, "1 hour"],
  [180, "3 hours"],
  ["tomorrow", "until tomorrow"],
] as const;

const tomorrowMorning = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
};

/** "Do not disturb" is on right now. */
export const isQuiet = (s: AttentionSettings | null) => !!s?.quietUntil && s.quietUntil > Date.now();

/**
 * "Do not disturb": no taskbar and no notification for a while; the window title still counts.
 * Shows until when it is on, and turns it off with one click.
 */
export function QuietChoice() {
  const [settings, update] = useAttentionSettings();
  if (!settings) return null;
  const on = isQuiet(settings);
  return (
    <select
      aria-label={t("Do not disturb")}
      value={on ? "on" : "off"}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "off") return update({ ...settings, quietUntil: null });
        const minutes = QUIET.find(([key]) => String(key) === v)?.[0];
        const until = minutes === "tomorrow" ? tomorrowMorning() : Date.now() + Number(minutes) * 60_000;
        update({ ...settings, quietUntil: until });
      }}
      className="rounded-md border border-overlay-line bg-base px-1.5 py-0.5 text-[12px] text-slate-200"
    >
      <option value="off">{t("off")}</option>
      {on && (
        <option value="on">
          {t("until {time}", { time: new Date(settings.quietUntil!).toLocaleString(LOCALE, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })}
        </option>
      )}
      {QUIET.map(([key, label]) => (
        <option key={key} value={String(key)}>
          {t(label)}
        </option>
      ))}
    </select>
  );
}

/**
 * What to be told about while looking elsewhere, and how; kept for this machine, for every window.
 * The window title always says how many sessions need you.
 */
export function AttentionChoice() {
  const [settings, update] = useAttentionSettings();
  if (!settings) return null;
  const box = (key: "asks" | "done" | "gitFailed" | "taskbar" | "desktop", label: string) => (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 whitespace-nowrap text-slate-300">
      <input type="checkbox" checked={settings[key]} onChange={(e) => update({ ...settings, [key]: e.target.checked })} className="size-3.5 accent-[var(--color-brand)]" />
      {label}
    </label>
  );
  return (
    <div className="text-[12px]">
      <div className="flex flex-col">
        {box("asks", t("a session asks"))}
        {box("done", t("a turn is finished"))}
        {box("gitFailed", t("a git command fails"))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <span className="text-slate-500">{t("how:")}</span>
        {box("taskbar", t("in the taskbar"))}
        {box("desktop", t("as a notification"))}
      </div>
      {!settings.taskbar && !settings.desktop && <p className="mt-1 text-[11px] text-slate-500">{t("Only the window title says it then.")}</p>}
    </div>
  );
}
