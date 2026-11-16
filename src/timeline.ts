// The sessions' timeline and the notices, both made from the journal (`journal.rs`): one line per
// event, kept for a week. Nothing here is guessed: a block runs from the prompt to the end of the
// turn as the tool reported them.

import { useEffect, useState } from "react";
import { journalLines, type AssistantState, type JournalLine, type Session } from "./backend";
import { t } from "./i18n";

const HOUR = 3600_000;

/** What the project's journal holds for the last day; read again whenever a session reports. */
export function useJournal(assistant: AssistantState): JournalLine[] {
  const [lines, setLines] = useState<JournalLine[]>([]);
  // Every event moves `last` or `status` of its session: that is when the journal has something new
  const stamp = assistant.sessions.map((s) => `${s.id}:${s.last}:${s.status}`).join("|");
  useEffect(() => {
    let alive = true;
    journalLines(Date.now() - 24 * HOUR)
      .then((l) => alive && setLines(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stamp]);
  return lines;
}

export interface Block {
  from: number;
  to: number;
  /** Working, or waiting for the user (an answer, a permission) */
  phase: "working" | "waiting";
  /** The prompt, or what it waits for */
  text?: string;
}

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
export function lanesOf(lines: JournalLine[], sessions: Session[], now: number): Lane[] {
  const lanes = new Map<string, Lane & { open: Block | null }>();
  const lane = (id: string) => {
    let l = lanes.get(id);
    if (!l) lanes.set(id, (l = { session: id, blocks: [], turns: 0, last: 0, open: null }));
    return l;
  };
  const close = (l: ReturnType<typeof lane>, at: number) => {
    if (l.open) l.blocks.push({ ...l.open, to: Math.max(at, l.open.from) });
    l.open = null;
  };
  for (const line of lines) {
    if (!line.session) continue;
    const l = lane(line.session);
    l.last = line.at;
    switch (line.kind) {
      case "prompt_submitted":
        close(l, line.at);
        l.turns += 1;
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
      case "session_ended":
        close(l, line.at);
        break;
    }
  }
  for (const l of lanes.values()) {
    const live = sessions.find((s) => s.id === l.session)?.status;
    close(l, live === "working" || live === "waiting" ? now : l.last);
  }
  return [...lanes.values()].filter((l) => l.blocks.length > 0).map(({ open: _open, ...l }) => l).sort((a, b) => a.blocks[0].from - b.blocks[0].from);
}

/** The time the timeline spans: whole hours from before the first block to just after now. */
export function spanOf(lanes: Lane[], now: number): { from: number; to: number; ticks: number[] } {
  const first = Math.min(now - 90 * 60_000, ...lanes.map((l) => l.blocks[0].from));
  const from = Math.floor(first / HOUR) * HOUR;
  const to = now + 5 * 60_000;
  const step = to - from <= 6 * HOUR ? HOUR : to - from <= 12 * HOUR ? 2 * HOUR : 3 * HOUR;
  const ticks: number[] = [];
  for (let at = Math.ceil(from / step) * step; at < to; at += step) ticks.push(at);
  return { from, to, ticks };
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
