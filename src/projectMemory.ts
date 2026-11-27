// What a window showed of a project, kept while it shows another one (docs/UMSETZUNG.md "Projektliste im
// Fenster statt Übersicht", step a): coming back, the project looks as it was left. In this window's
// memory only; a new window starts fresh, as a restart does.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const memory = new Map<string, Map<string, unknown>>();
let shown: string | null = null;

/** How long the last project switch in this window took, until files and git were there (ms) */
export let lastSwitch: number | null = null;
export const switchTook = (ms: number) => void (lastSwitch = Math.round(ms));

/** The project the window shows from now on; panels made after this remember for it. */
export function showProject(path: string | null) {
  shown = path;
}

/** Keeps a value for a project. */
export function remember(project: string | null, name: string, value: unknown) {
  if (!project) return;
  let values = memory.get(project);
  if (!values) memory.set(project, (values = new Map()));
  values.set(name, value);
}

/** A value kept for a project, if there is one. */
export function recall<T>(project: string | null, name: string): T | undefined {
  return project ? (memory.get(project)?.get(name) as T | undefined) : undefined;
}

/**
 * State of a panel that comes back with its project. The panel belongs to the project shown when it
 * was made (panels are made anew for each project), so what it writes later stays with that project
 * even while the next one is already being shown.
 */
export function usePerProject<T>(name: string, initial: () => T): [T, Dispatch<SetStateAction<T>>] {
  const owner = useRef(shown);
  const [value, setValue] = useState<T>(() => recall<T>(owner.current, name) ?? initial());
  useEffect(() => remember(owner.current, name, value), [name, value]);
  return [value, setValue];
}
