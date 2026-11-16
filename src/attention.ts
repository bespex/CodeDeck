// What needs the user, and telling them when they are not looking (step 2.1a). "Needs you" is
// worked out here once, for the right column and for the window title, the taskbar and the
// desktop notification. Which events count and how they are shown is the user's choice
// (`AttentionSettings`, in the project menu).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  attentionSettings,
  notifyAttention,
  setAttentionSettings,
  setTitlePrefix,
  type AssistantState,
  type AttentionSettings,
  type GitRun,
  type Session,
} from "./backend";
import { shortId } from "./assistant";
import { plural, t } from "./i18n";

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

/** How long a finished turn stays under "Needs you". To become a setting. */
export const DONE_SHOWN_MS = 30 * 60_000;

/** When the window opened: what needs you from before is not new, and does not light up. */
export const OPENED_AT = Date.now();

/** Since when it needs you: the question came with its last event, a finished turn has its end. */
export const waitsSince = (s: Session) => (needsYou(s) === "asks" ? s.last : (s.turnDone ?? s.last));

/** One thing that needs you; a new key is a new reason to say so. */
export const waitKey = (s: Session) => (needsYou(s) === "asks" ? `${s.id}:asks` : `${s.id}:done:${s.turnDone}`);

/* Finished turns put aside, per turn; shared by the list and the title */
let aside = new Set<string>();
const asideListeners = new Set<() => void>();
export function putAside(s: Session) {
  aside = new Set(aside).add(waitKey(s));
  asideListeners.forEach((l) => l());
}
const useAside = () =>
  useSyncExternalStore(
    (l) => {
      asideListeners.add(l);
      return () => asideListeners.delete(l);
    },
    () => aside,
  );

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
  const put = useAside();
  const fresh = (s: Session) => now - (s.turnDone ?? s.last) < DONE_SHOWN_MS;
  const waiting = state.sessions.filter((s) => needsYou(s) === "asks" || (needsYou(s) === "done" && fresh(s) && !put.has(waitKey(s))));
  return waiting.sort((a, b) => Number(needsYou(b) === "asks") - Number(needsYou(a) === "asks"));
}

/* The settings, read once and shared by every component */
let settings: AttentionSettings | null = null;
const settingsListeners = new Set<() => void>();
const loaded = attentionSettings().then((s) => {
  settings = s;
  settingsListeners.forEach((l) => l());
});
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

const titleOf = (s: Session) => s.title ?? t("Session {id}", { id: shortId(s.id) });
/** The window is not looked at: hidden, minimised, or another window has the focus. */
const unseen = () => document.hidden || !document.hasFocus();

/**
 * Keeps the window title on what needs you, and tells the user about what is new while they are
 * not looking: questions and finished turns of the sessions, failed git commands, each as chosen.
 * What is already there when the window opens is not news.
 */
export function useAttention(state: AssistantState, runs: GitRun[], project: string | undefined) {
  const waiting = useWaiting(state);
  const known = useRef<Set<string> | null>(null);
  const lastRun = useRef<number | null>(null);
  const pending = useRef<{ sessions: Session[]; failed: GitRun[] }>({ sessions: [], failed: [] });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const n = waiting.length;
  useEffect(() => {
    void setTitlePrefix(n ? `● ${t(n === 1 ? "1 waiting" : "{n} waiting", { n })} · ` : "");
  }, [n]);

  const flush = () => {
    const { sessions, failed } = pending.current;
    pending.current = { sessions: [], failed: [] };
    if (!unseen() || (sessions.length === 0 && failed.length === 0)) return;
    const where = project ? ` · ${project}` : "";
    if (sessions.length === 1 && failed.length === 0) {
      const s = sessions[0];
      const asks = needsYou(s) === "asks";
      const summary = `${titleOf(s)} ${asks ? t("asks") : t("finished its turn")}`;
      const body = (asks ? (s.message ?? t("Waits for your answer")) : (s.prompt ?? t("Waits for your next prompt"))) + where;
      void notifyAttention(summary, body);
    } else if (sessions.length > 0) {
      const lines = sessions.map((s) => `${s.short}: ${titleOf(s)} ${needsYou(s) === "asks" ? t("asks") : t("finished its turn")}`);
      if (failed.length) lines.push(t("A git command failed"));
      void notifyAttention(t("{sessions} need you", { sessions: plural(sessions.length, "session") }) + where, lines.join("\n"));
    } else {
      const run = failed[failed.length - 1];
      void notifyAttention(t("A git command failed") + where, `git ${run.command}`);
    }
  };
  const gather = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, GATHER_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // New reasons the sessions need you
  const keys = waiting.map(waitKey).join("|");
  useEffect(() => {
    void loaded.then(() => {
      const now = new Set(waiting.map(waitKey));
      const before = known.current;
      known.current = now;
      if (!before || !settings) return;
      // New to this window, and new in time: the list is empty until the first state arrives
      const fresh = waiting.filter(
        (s) => !before.has(waitKey(s)) && waitsSince(s) > OPENED_AT && (needsYou(s) === "asks" ? settings!.asks : settings!.done),
      );
      if (fresh.length && unseen()) {
        pending.current.sessions.push(...fresh);
        gather();
      }
    });
    // `keys` stands for what matters in `waiting`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

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
