// What CodeDeck hears from coding assistants: the sessions in the project, whether their tools
// are connected, and the task waiting for the next prompt. No tool is named here or in the
// components: names and what is offered come from `HarnessInfo` and its capabilities.

import { useEffect, useState } from "react";
import { assistantState, harnessConnections, onAssistantChanged, type AssistantState, type Connection, type HarnessInfo } from "./backend";

const EMPTY: AssistantState = { heard: false, harnesses: [], sessions: [], handovers: [] };

/** Stands in until the backend told which tools there are: no name, nothing on offer. */
const UNKNOWN: HarnessInfo = {
  id: "",
  name: "The assistant",
  shortName: "Assistant",
  capabilities: { liveStatus: false, beforeWrite: false, handover: "none", startRules: false, pastSessions: false, usage: false },
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
export function touchedFiles(state: AssistantState): Map<string, number> {
  const touched = new Map<string, number>();
  for (const s of state.sessions) {
    for (const t of s.touched) touched.set(t.path, Math.max(t.at, touched.get(t.path) ?? 0));
  }
  return touched;
}

export const shortId = (id: string) => id.slice(0, 8);
