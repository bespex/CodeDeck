// What CodeDeck hears from coding assistants: the sessions in the project, whether their tools
// are connected, and the task waiting for the next prompt. No tool is named here or in the
// components: names and what is offered come from `HarnessInfo` and its capabilities.

import { createContext, useContext, useEffect, useState } from "react";
import { assistantState, harnessConnections, onAssistantChanged, type AssistantState, type Connection, type HarnessInfo, type Session } from "./backend";

const EMPTY: AssistantState = { heard: false, usage: [], harnesses: [], sessions: [], identities: [], attachments: [], preview: null, delivered: null, target: null, any: false, held: false, targetLost: null, ruled: null, found: { outside: [], pages: [] } };

/** Stands in until the backend told which tools there are: no name, nothing on offer. */
const UNKNOWN: HarnessInfo = {
  id: "",
  name: "The assistant",
  shortName: "Assistant",
  capabilities: { liveStatus: false, beforeWrite: false, attach: "none", startRules: false, pastSessions: false, usage: false, desktopProfiles: false },
};

/** The tool texts and offers go by: the default one. */
export const mainHarness = (state: AssistantState): HarnessInfo => state.harnesses[0] ?? UNKNOWN;

export function useAssistant(): AssistantState {
  const [state, setState] = useState<AssistantState>(EMPTY);
  useEffect(() => {
    let alive = true;
    assistantState()
      .then((s) => alive && setState(s))
      .catch(() => {});
    const stop = onAssistantChanged(setState);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return state;
}

/** The tools' connections per account, shared by every component that shows them. */
export interface Connections {
  /** `null` while asking */
  setups: Connection[] | null;
  /** At least one account reports */
  connected: boolean;
  /** After connecting or disconnecting: the new state for everyone */
  update: (setups: Connection[]) => void;
}

let shared: Connection[] | null = null;
const listeners = new Set<(s: Connection[]) => void>();
const publish = (setups: Connection[]) => {
  shared = setups;
  listeners.forEach((l) => l(setups));
};

export function useConnections(): Connections {
  const [setups, setSetups] = useState<Connection[] | null>(shared);
  useEffect(() => {
    listeners.add(setSetups);
    if (!shared) harnessConnections().then(publish).catch(() => {});
    return () => void listeners.delete(setSetups);
  }, []);
  return { setups, connected: !!setups?.some((s) => s.installed), update: publish };
}

/** Files the assistant wrote, project-relative, with the time (ms) of the latest write. */
/**
 * The tmux session CodeDeck started a session in, which it may stop and restart; `undefined` for a
 * session started by hand, even in tmux: its tmux session is the user's and may hold other work of
 * theirs, which stopping would end too. The backend refuses those as well.
 */
export function ownTmux(s: Session): string | undefined {
  return (s.status !== "ended" && s.place?.launched && s.place.tmux?.session) || undefined;
}

export function touchedFiles(state: AssistantState): Map<string, number> {
  const touched = new Map<string, number>();
  for (const s of state.sessions) {
    for (const t of s.touched) touched.set(t.path, Math.max(t.at, touched.get(t.path) ?? 0));
  }
  return touched;
}

export const shortId = (id: string) => id.slice(0, 8);

/** What tells a session apart wherever it shows up. */
export interface SessionMark {
  /** A CSS colour */
  color: string;
  short: string;
  title: string | null;
}

/** The sessions' marks for every component, and the session the mouse is on in the list. */
export interface SessionMarks {
  /** The mark of a session, also of one no longer listed; `null` for one never heard of */
  of: (id: string | null) => SessionMark | null;
  /** The session that wrote the file last; for a folder, one that wrote inside it */
  writer: (path: string, isDir?: boolean) => string | null;
  /** While set, what belongs to this session stands out and the rest steps back */
  hovered: string | null;
  hover: (id: string | null) => void;
}

const NO_MARKS: SessionMarks = { of: () => null, writer: () => null, hovered: null, hover: () => {} };
export const SessionMarksContext = createContext<SessionMarks>(NO_MARKS);
export const useSessionMarks = () => useContext(SessionMarksContext);

export function sessionMarks(state: AssistantState, hovered: string | null, hover: (id: string | null) => void): SessionMarks {
  const marks = new Map<string, SessionMark>(
    state.identities.map((i) => [i.id, { color: `var(--color-session-${i.color})`, short: i.short, title: i.title }]),
  );
  const writers = new Map<string, { session: string; at: number }>();
  for (const s of state.sessions) {
    for (const t of s.touched) {
      if (t.at > (writers.get(t.path)?.at ?? 0)) writers.set(t.path, { session: s.id, at: t.at });
    }
  }
  const writer = (path: string, isDir = false) => {
    if (!isDir) return writers.get(path)?.session ?? null;
    // Of those inside, the hovered session first, so that its folders stand out too
    const inside = [...writers].filter(([file]) => file.startsWith(`${path}/`)).map(([, w]) => w);
    return (inside.find((w) => w.session === hovered) ?? inside.sort((a, b) => b.at - a.at)[0])?.session ?? null;
  };
  return { of: (id) => (id ? (marks.get(id) ?? null) : null), writer, hovered, hover };
}
