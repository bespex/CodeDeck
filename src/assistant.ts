// What CodeDeck hears from coding assistants: the sessions in the project (from Claude Code's
// hooks), whether those hooks are set up, and the task waiting for the next prompt.

import { useEffect, useState } from "react";
import { assistantState, claudeHooks, onAssistantChanged, type AssistantState, type HookSetup } from "./backend";

const EMPTY: AssistantState = { heard: false, sessions: [], handovers: [] };

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

/** CodeDeck's hooks per Claude Code configuration, shared by every component that shows them. */
export interface Hooks {
  /** `null` while asking */
  setups: HookSetup[] | null;
  /** In at least one configuration */
  connected: boolean;
  /** After connecting or disconnecting: the new state for everyone */
  update: (setups: HookSetup[]) => void;
}

let shared: HookSetup[] | null = null;
const listeners = new Set<(s: HookSetup[]) => void>();
const publish = (setups: HookSetup[]) => {
  shared = setups;
  listeners.forEach((l) => l(setups));
};

export function useHooks(): Hooks {
  const [setups, setSetups] = useState<HookSetup[] | null>(shared);
  useEffect(() => {
    listeners.add(setSetups);
    if (!shared) claudeHooks().then(publish).catch(() => {});
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
