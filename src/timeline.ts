// The sessions' timeline and the notices, both made from the journal (`journal.rs`): one line per
// event, kept for a week. Nothing here is guessed: a block runs from the prompt to the end of the
// turn as the tool reported them.

import { useEffect, useState } from "react";
import { journalLines, type AssistantState, type JournalLine, type Session } from "./backend";
import { t } from "./i18n";

const HOUR = 3600_000;

/** A calendar day, from midnight to midnight in local time; `offset` days before today. */
export interface Day {
  from: number;
  to: number;
  offset: number;
}

export function dayOf(now: number, offset = 0): Day {
  const d = new Date(now);
  return {
    from: new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime(),
    to: new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset + 1).getTime(),
    offset,
  };
}

/**
 * What the journal holds for a day (or, without one, the last 24 hours); read again whenever a
 * session reports.
 */
export function useJournal(assistant: AssistantState, day?: Day): JournalLine[] {
  const [lines, setLines] = useState<JournalLine[]>([]);
  // Every event moves `last` or `status` of its session: that is when the journal has something new
  const stamp = assistant.sessions.map((s) => `${s.id}:${s.last}:${s.status}`).join("|");
  const from = day?.from;
  const to = day?.to;
  useEffect(() => {
    let alive = true;
    // A block that began the day before still counts for this day, so the read reaches a day further back
    const since = from !== undefined ? from - 24 * HOUR : Date.now() - 24 * HOUR;
    journalLines(since)
      .then((l) => alive && setLines(to !== undefined ? l.filter((x) => x.at < to) : l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stamp, from, to]);
  return lines;
}

export interface Block {
  from: number;
  to: number;
  /**
   * Working, waiting for the user (an answer, a permission), or after the turn: something it
   * started goes on in the background. That one is shown apart, because the session is not working.
   */
  phase: "working" | "waiting" | "background";
  /** The prompt, or what it waits for, or what runs in the background */
  text?: string;
  /**
   * Only for `background`: whether the end of what ran was announced (a hard end) or not (it
   * fades out over `FADE_MS`: nothing says when, or whether, it ended)
   */
  end?: "known" | "unknown";
}

/** How long a background stretch of unknown end is drawn, fading out. */
export const FADE_MS = 12 * 60_000;

export interface Lane {
  session: string;
  blocks: Block[];
  turns: number;
  /** Unix milliseconds of its last event */
  last: number;
}

/**
 * One lane per session that did something in the journal. A block opens with a prompt (or with the
 * first sign of work), turns to waiting when the session asks, and closes with the end of the
 * turn. One still open runs to now while the session is working or waiting; else it ends at its
 * last event.
 */
export function lanesOf(lines: JournalLine[], sessions: Session[], now: number, day?: Day): Lane[] {
  const lanes = new Map<string, Lane & { open: Block | null; bg: { from: number; tasks: Map<string, string> } | null }>();
  const from = day?.from ?? -Infinity;
  const to = day?.to ?? Infinity;
  const lane = (id: string) => {
    let l = lanes.get(id);
    if (!l) lanes.set(id, (l = { session: id, blocks: [], turns: 0, last: 0, open: null, bg: null }));
    return l;
  };
  const close = (l: ReturnType<typeof lane>, at: number) => {
    if (l.open) l.blocks.push({ ...l.open, to: Math.max(at, l.open.from) });
    l.open = null;
  };
  // What a turn left running: drawn from the end of the turn to when its end was announced, else
  // for a while into the future, but never over what the session did meanwhile
  const settle = (l: ReturnType<typeof lane>, at: number, known: boolean) => {
    if (!l.bg) return;
    const to = known ? at : Math.min(l.bg.from + FADE_MS, at);
    l.blocks.push({ from: l.bg.from, to: Math.max(to, l.bg.from), phase: "background", end: known ? "known" : "unknown", text: [...l.bg.tasks.values()].join(", ") });
    l.bg = null;
  };
  for (const line of lines) {
    if (!line.session) continue;
    const l = lane(line.session);
    l.last = line.at;
    if (l.bg && ["waiting", "before_write", "after_write"].includes(line.kind) && !l.open) settle(l, line.at, false);
    switch (line.kind) {
      case "prompt_submitted":
        close(l, line.at);
        if (l.bg) {
          // The prompt a tool makes when a background task ends names the task: the last one ending it for sure
          const ended = line.taskEnded !== undefined && l.bg.tasks.delete(line.taskEnded);
          settle(l, line.at, ended && l.bg.tasks.size === 0);
        }
        if (line.at >= from) l.turns += 1;
        l.open = { from: line.at, to: line.at, phase: "working", text: line.text };
        break;
      case "waiting":
        close(l, line.at);
        l.open = { from: line.at, to: line.at, phase: "waiting", text: line.text };
        break;
      case "before_write":
      case "after_write":
        // Work after a question: it was answered. Work with no prompt seen: the turn began before we listened
        if (l.open?.phase === "waiting") {
          const text = l.blocks.at(-1)?.text;
          close(l, line.at);
          l.open = { from: line.at, to: line.at, phase: "working", text };
        } else if (!l.open) l.open = { from: line.at, to: line.at, phase: "working" };
        break;
      case "turn_done":
        close(l, line.at);
        // Only `Stop` says what runs on; the "waiting for input" a minute later says nothing, and changes nothing
        if (line.background?.length) l.bg = { from: line.at, tasks: new Map(line.background.map((b) => [b.id, b.text])) };
        break;
      case "session_ended":
        close(l, line.at);
        settle(l, line.at, false);
        break;
    }
  }
  for (const l of lanes.values()) {
    settle(l, now, false);
    const live = sessions.find((s) => s.id === l.session)?.status;
    close(l, live === "working" || live === "waiting" ? now : l.last);
  }
  // Only what falls in the day: a block that ran over midnight is cut at the day's edges
  return [...lanes.values()]
    .map(({ open: _open, ...l }) => ({ ...l, blocks: l.blocks.filter((b) => b.to > from && b.from < to).map((b) => ({ ...b, from: Math.max(b.from, from), to: Math.min(b.to, to) })) }))
    .filter((l) => l.blocks.length > 0)
    .sort((a, b) => a.blocks[0].from - b.blocks[0].from);
}

const MIN = 60_000;

/** Whole-minute ticks for what is shown: the smallest step that keeps it to about eight labels. */
export function ticksIn(from: number, to: number): number[] {
  const step = ([5, 10, 15, 30, 60, 120, 180, 360].find((m) => (to - from) / (m * MIN) <= 8) ?? 360) * MIN;
  const ticks: number[] = [];
  for (let at = Math.ceil(from / step) * step; at < to; at += step) ticks.push(at);
  return ticks;
}

/**
 * The time the timeline spans: from the hour of the first block of the day, to just after now for
 * today, or to the end of the last block's hour for a day that is over.
 */
export function spanOf(lanes: Lane[], now: number, day?: Day): { from: number; to: number; ticks: number[] } {
  const first = lanes.length > 0 ? Math.min(...lanes.map((l) => l.blocks[0].from)) : now - 90 * MIN;
  const from = Math.floor(first / HOUR) * HOUR;
  const today = !day || now < day.to;
  const last = lanes.length > 0 ? Math.max(...lanes.flatMap((l) => l.blocks.map((b) => b.to))) : now;
  const to = today ? now + 5 * MIN : Math.max(Math.ceil(last / HOUR) * HOUR, from + HOUR);
  return { from, to, ticks: ticksIn(from, to) };
}

/** The shortest stretch one can zoom in to. */
export const MIN_SPAN = 10 * MIN;

/**
 * A view of `full` that starts at `from` and is `len` long, moved back inside it; `null` when it
 * would show everything anyway.
 */
export function zoomed(full: { from: number; to: number }, from: number, len: number): { from: number; to: number } | null {
  const whole = full.to - full.from;
  len = Math.min(Math.max(len, MIN_SPAN), whole);
  if (len >= whole - MIN) return null;
  const start = Math.min(Math.max(from, full.from), full.to - len);
  return { from: start, to: start + len };
}

export interface Notice {
  at: number;
  text: string;
}

/**
 * The last things that happened, in words, newest first. Several writes in a row by one session
 * are one line; the steps in between do not need telling.
 */
export function noticesOf(lines: JournalLine[], who: (session: string) => string, max = 8): Notice[] {
  const out: Notice[] = [];
  let run: { session: string; files: Set<string>; at: number } | null = null;
  const flush = () => {
    if (!run) return;
    const n = run.files.size;
    out.push({ at: run.at, text: n === 1 ? t("{who} wrote {file}", { who: who(run.session), file: [...run.files][0] }) : t("{who} wrote {n} files", { who: who(run.session), n }) });
    run = null;
  };
  for (const l of lines) {
    if (l.kind === "after_write" && l.session && l.file) {
      if (run && run.session !== l.session) flush();
      run ??= { session: l.session, files: new Set(), at: l.at };
      run.files.add(l.file);
      run.at = l.at;
      continue;
    }
    if (l.kind === "before_write") continue;
    flush();
    const name = l.session ? who(l.session) : "";
    const text =
      l.kind === "opened"
        ? t("CodeDeck opened the project")
        : l.kind === "session_started"
          ? t("{who} started", { who: name })
          : l.kind === "prompt_submitted"
            ? t("{who} began a turn: {prompt}", { who: name, prompt: l.text ?? "" })
            : l.kind === "waiting"
              ? t("{who} is waiting: {message}", { who: name, message: l.text ?? "" })
              : l.kind === "turn_done"
                ? t("{who} finished its turn", { who: name })
                : l.kind === "session_ended"
                  ? t("{who} ended", { who: name })
                  : null;
    if (text) out.push({ at: l.at, text });
  }
  flush();
  return out.reverse().slice(0, max);
}
