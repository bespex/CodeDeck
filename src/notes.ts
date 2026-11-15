// Comments on single lines of a diff. They are attached to the next prompt as one part
// and go out with it; once that part is gone (delivered or taken back) they are gone here too.

import { createContext, useEffect, useRef, useState } from "react";
import { handOver, handOverTo, type AssistantState } from "./backend";
import { plural } from "./git";

export interface Note {
  id: number;
  /** Project-relative */
  path: string;
  /** Line number on the new side of the diff */
  line: number;
  /** The line's text, so the assistant finds it even if the numbers have moved */
  code: string;
  text: string;
}

/** The part of the attachments that the comments make. */
export const NOTES_KEY = "notes";

let notes: Note[] = [];
let nextId = 1;
/** Whether comments can reach a session at all */
let offered = false;
/** The sessions and the hand-over as last heard, to pick who a first comment is meant for */
let state: AssistantState | null = null;

/** The session whose changes a diff shows, if it is one turn's: comments there are meant for it. */
export const NoteSessionContext = createContext<string | null>(null);
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

/** The comments as text for the assistant. */
export function notesText(list: Note[]): string {
  const lines = list.map((n) => `- ${n.path}:${n.line}  \`${n.code.trim().slice(0, 160)}\`\n  ${n.text.replace(/\n/g, "\n  ")}`);
  return ["My comments on single lines of the changes. Each names the file, the line and the line's text:", "", ...lines].join("\n");
}

function set(next: Note[]) {
  notes = next;
  publish();
  void handOver(NOTES_KEY, next.length ? notesText(next) : null, plural(next.length, "line comment"));
}

/**
 * @param session who the comment is preferably for: with nothing queued and no session chosen yet,
 * the hand-over is aimed at it, if it can take one. The user can change that in "Next prompt".
 */
export function addNote(path: string, line: number, code: string, text: string, session?: string | null) {
  const s = state?.sessions.find((x) => x.id === session);
  if (s && state?.handovers.length === 0 && !state.target && s.status !== "ended" && s.capabilities.handover === "withNextPrompt") {
    void handOverTo(s.id);
  }
  set([...notes, { id: nextId++, path, line, code, text: text.trim() }]);
}
export const removeNote = (id: number) => set(notes.filter((n) => n.id !== id));

/** The comments waiting, for every component that shows a diff. */
export function useNotes(): { notes: Note[]; offered: boolean } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return { notes, offered };
}

/**
 * Keeps the comments in step with the hand-over, once for the window: when their part has left
 * the queue they have done their job. `canHandOver`: the tool takes text from CodeDeck.
 */
export function useNotesSync(current: AssistantState, canHandOver: boolean) {
  state = current;
  const queued = current.handovers.some((h) => h.key === NOTES_KEY);
  const seen = useRef(false);
  useEffect(() => {
    if (queued) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      notes = [];
      publish();
    }
  }, [queued]);
  useEffect(() => {
    offered = canHandOver;
    publish();
  }, [canHandOver]);
}
