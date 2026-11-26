// Comments on single lines of a diff, attached to the next prompt as one part (see `attachments.ts`).

import { createContext } from "react";
import { attachFor } from "./backend";
import { plural } from "./git";
import { createPart, lastState } from "./attachments";
import { movedPath } from "./files";

export interface Note {
  /** A number for comments written here, `dirq:<id>` for those written in Dirq */
  id: number | string;
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

let nextId = 1;

/** The comments as text for the assistant. */
export function notesText(list: Note[]): string {
  const lines = list.map((n) => `- ${n.path}:${n.line}  \`${n.code.trim().slice(0, 160)}\`\n  ${n.text.replace(/\n/g, "\n  ")}`);
  return ["My comments on single lines of the changes. Each names the file, the line and the line's text:", "", ...lines].join("\n");
}

export const notes = createPart<Note>(NOTES_KEY, {
  id: (n) => String(n.id),
  text: notesText,
  label: (list) => plural(list.length, "line comment"),
});

/** The session whose changes a diff shows, if it is one turn's: comments there are meant for it. */
export const NoteSessionContext = createContext<string | null>(null);

/**
 * @param session who the comment is preferably for: with nothing attached and no session chosen yet,
 * the attachments are aimed at it, if it can take them. The user can change that in "Next prompt".
 */
/** Line comments on files that moved or were renamed: they keep pointing at the file. */
export function moveNotes(moves: [from: string, to: string][]) {
  notes.update((note) => {
    const path = moves.reduce((p, [from, to]) => movedPath(p, from, to), note.path);
    return path === note.path ? note : { ...note, path };
  });
}

export function addNote(path: string, line: number, code: string, text: string, session?: string | null, id?: string) {
  const state = lastState();
  const s = state?.sessions.find((x) => x.id === session);
  if (s && state?.attachments.length === 0 && !state.target && !state.any && s.status !== "ended" && s.capabilities.attach === "withNextPrompt") {
    void attachFor(s.id);
  }
  // The same id again (a comment changed in Dirq) replaces it
  if (id !== undefined) notes.remove([id]);
  notes.add([{ id: id ?? nextId++, path, line, code, text: text.trim() }]);
}

export const removeNote = (id: number | string) => notes.remove([String(id)]);

/** The id under which a comment written in Dirq is kept. */
export const dirqNoteId = (id: string) => `dirq:${id}`;
