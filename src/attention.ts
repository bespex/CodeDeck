// What needs the user, and telling them when they are not looking (step 2.1a). "Needs you" is
// worked out here once, for the right column and for the window title, the taskbar and the
// desktop notification (sessions: by the backend, for all projects). Which events count and how they are shown is the user's choice
// (`AttentionSettings`, in the project menu).

import { setWindowWaits } from "./windowIcon";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  attentionSettings,
  onSettingsChanged,
  notifyAttention,
  setAttentionSettings,
  sessionSeen,
  setTitleStatus,
  type AssistantState,
  type AttentionSettings,
  type GitRun,
  type Session,
} from "./backend";
import { t } from "./i18n";

/**
 * A session needs you when it asks something, or when its turn is over and it waits for the next
 * prompt. Only sessions that report count: of one known from its log nothing is known but that it
 * was there.
 */
export function needsYou(s: Session): "asks" | "done" | null {
  if (!s.capabilities.liveStatus) return null;
  if (s.status === "waiting") return "asks";
  return s.status === "idle" && s.turnDone != null ? "done" : null;
}

/**
 * A finished turn waits until the user saw it (went into the session, opened the turn, put it
 * aside), but no longer than this: by then its session is under "Earlier" anyway. As `tray.rs`.
 */
export const DONE_SHOWN_MS = 6 * 3600_000;

/** It waits for you now: it asks, or its turn is over and you have not seen it yet. Not one started
 *  above the project: that one waits in its own project (user, 2026-11-22). */
export const waitsForYou = (s: Session, now: number) =>
  !s.above &&
  (needsYou(s) === "asks" || (needsYou(s) === "done" && !s.seen && now - (s.turnDone ?? s.last) < DONE_SHOWN_MS));

/** When the window opened: what needs you from before is not new, and does not light up. */
export const OPENED_AT = Date.now();

/** Since when it needs you: the question came with its last event, a finished turn has its end. */
export const waitsSince = (s: Session) => (needsYou(s) === "asks" ? s.last : (s.turnDone ?? s.last));

/** One thing that needs you; a new key is a new reason to say so. */
export const waitKey = (s: Session) => (needsYou(s) === "asks" ? `${s.id}:asks` : `${s.id}:done:${s.turnDone}`);

/** Seen, in the backend: every window, the project list and the tray stop counting it at once. */
export function putAside(s: Session) {
  void sessionSeen(s.id);
}

/** Renders again every half minute: what is shown depends on how long ago something was. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The sessions that need you, questions first: they block a session, a finished turn does not. */
export function useWaiting(state: AssistantState): Session[] {
  const now = useNow();
  const waiting = state.sessions.filter((s) => waitsForYou(s, now));
  return waiting.sort((a, b) => Number(needsYou(b) === "asks") - Number(needsYou(a) === "asks"));
}

/* The settings, read once and shared by every component */
let settings: AttentionSettings | null = null;
const settingsListeners = new Set<() => void>();
const load = () =>
  attentionSettings().then((s) => {
    settings = s;
    settingsListeners.forEach((l) => l());
  });
void load();
// Changed in another window: what is told, and how, is the same in all of them
onSettingsChanged(() => void load());
export function useAttentionSettings(): [AttentionSettings | null, (next: AttentionSettings) => void] {
  const current = useSyncExternalStore(
    (l) => {
      settingsListeners.add(l);
      return () => settingsListeners.delete(l);
    },
    () => settings,
  );
  const update = (next: AttentionSettings) => {
    settings = next;
    settingsListeners.forEach((l) => l());
    void setAttentionSettings(next);
  };
  return [current, update];
}

/** Things that happen together are told together: a moment to collect them. */
const GATHER_MS = 1500;

/** The window is not looked at: hidden, minimised, or another window has the focus. */
const unseen = () => document.hidden || !document.hasFocus();

/**
 * Keeps the window title on what needs you, and tells the user about what is new while they are
 * not looking: questions and finished turns of the sessions, failed git commands, each as chosen.
 * What is already there when the window opens is not news.
 */
export function useAttention(state: AssistantState, runs: GitRun[], project: string | undefined) {
  const waiting = useWaiting(state);
  const lastRun = useRef<number | null>(null);
  const pending = useRef<{ failed: GitRun[] }>({ failed: [] });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Asking and finished apart: only a question blocks a session, and a number that mixes both says little
  const asking = waiting.filter((s) => needsYou(s) === "asks").length;
  const done = waiting.length - asking;
  useEffect(() => {
    const parts = [asking && t("{n} asking", { n: asking }), done && t("{n} done", { n: done })].filter(Boolean);
    // After the project's name: cut short in the taskbar, the name still shows (user, 2026-11-17)
    void setTitleStatus(parts.length ? `● ${parts.join(" · ")}` : "", asking, done);
    // The taskbar icon: the project's mark, a pill with the number that ask, a dot for a finished turn
    setWindowWaits({ asks: asking, done: done > 0 });
    // For themes that let the window's edge light up while something waits (docs/STYLING.md, `events`)
    document.documentElement.classList.toggle("attn-asks", asking > 0);
    document.documentElement.classList.toggle("attn-done", done > 0);
  }, [asking, done]);

  // Sessions are told by the backend, for every project at once (`attention.rs`, `observe`): here
  // only what this window ran
  const flush = () => {
    const { failed } = pending.current;
    pending.current = { failed: [] };
    if (!unseen() || failed.length === 0) return;
    const where = project ? ` · ${project}` : "";
    const run = failed[failed.length - 1];
    void notifyAttention("git", t("A git command failed") + where, `git ${run.command}`);
  };
  const gather = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, GATHER_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Failed git commands, if wanted
  const last = runs.at(-1);
  useEffect(() => {
    if (!last) return;
    const seen = lastRun.current;
    lastRun.current = last.at;
    if (seen === null || last.at <= seen || last.ok || !settings?.gitFailed || !unseen()) return;
    pending.current.failed.push(last);
    gather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.at]);
}
