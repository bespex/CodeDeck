// What CodeDeck hears from coding assistants: the sessions in the project (from Claude Code's
// hooks), whether those hooks are set up, and the task waiting for the next prompt.

import { useEffect, useState } from "react";
import { assistantState, claudeHooks, onAssistantChanged, type AssistantState, type HookSetup } from "./backend";

const EMPTY: AssistantState = { heard: false, sessions: [], handover: null };

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

/** Whether CodeDeck's hooks are in Claude Code's settings; `null` while asking. */
export function useHookSetup(): [HookSetup | null, (setup: HookSetup) => void] {
  const [setup, setSetup] = useState<HookSetup | null>(null);
  useEffect(() => {
    claudeHooks()
      .then(setSetup)
      .catch(() => {});
  }, []);
  return [setup, setSetup];
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
