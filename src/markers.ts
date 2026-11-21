// The `@ai` comments in the project's files, read again when files change; those attached to the
// next prompt (one part, see `attachments.ts`), and which of those sent are gone since (done).

import { useEffect, useState } from "react";
import { findMarkers, onFsChanged, type Marker } from "./backend";
import { plural } from "./git";
import { createPart } from "./attachments";
import { t } from "./i18n";

/** Lines move when text is edited: a comment is recognised by file and text. */
export const markerKey = (m: Marker) => `${m.path}\u0000${m.text}`;

/** The part of the attachments that hints make. */
export const MARKERS_KEY = "markers";

/** The task for the assistant, as one would write it. */
export function markerTask(markers: Marker[]): string {
  const lines = markers.map((m) => `- ${m.path}:${m.line}: ${m.text}`);
  return [
    "Work in these comments that I left for you in files of this project (lines beginning with `@ai`, or with a comment that begins with it).",
    "In Markdown, a comment like `<!-- @ai: … -->` on a line of its own is about the block that follows it (a paragraph, a list item, a table …).",
    "Change the text around each one as it asks, then remove the comment. Leave a comment in place if you are unsure, and tell me why.",
    "",
    ...lines,
  ].join("\n");
}

function markersLabel(list: Marker[]): string {
  const files = new Set(list.map((m) => m.path)).size;
  return files > 1
    ? t("{hints} in {files}", { hints: plural(list.length, "hint"), files: plural(files, "file") })
    : t("{hints} in {path}", { hints: plural(list.length, "hint"), path: list[0]?.path ?? "" });
}

/** Hints sent with a prompt in this window, oldest first: their progress is shown until the window closes. */
let sent: Marker[] = [];
const sentListeners = new Set<() => void>();

export const markers = createPart<Marker>(MARKERS_KEY, {
  id: markerKey,
  text: markerTask,
  label: markersLabel,
  onSent: (list) => {
    const known = new Set(sent.map(markerKey));
    sent = [...sent, ...list.filter((m) => !known.has(markerKey(m)))];
    sentListeners.forEach((l) => l());
  },
});

export interface Markers {
  /** `null` until read */
  markers: Marker[] | null;
  error: string | null;
  /** Sent with a prompt in this window, oldest first */
  sent: Marker[];
  /** Of `sent`, those no longer in the files */
  done: Set<string>;
}

// The files with hints, from the last search of any view: the file list marks them without
// searching again (each search is a git grep in the log)
let hintFiles = new Map<string, number>();
const hintListeners = new Set<(files: Map<string, number>) => void>();
function publishHints(found: Marker[]) {
  const files = new Map<string, number>();
  for (const m of found) files.set(m.path, (files.get(m.path) ?? 0) + 1);
  hintFiles = files;
  hintListeners.forEach((l) => l(files));
}

/** Project-relative path → number of @ai hints in it, as the Workbench last found them. */
export function useHintFiles(): Map<string, number> {
  const [files, setFiles] = useState(hintFiles);
  useEffect(() => {
    hintListeners.add(setFiles);
    setFiles(hintFiles);
    return () => void hintListeners.delete(setFiles);
  }, []);
  return files;
}

export function useMarkers(): Markers {
  const [found, setFound] = useState<Marker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      findMarkers()
        .then((m) => (setFound(m), setError(null), publishHints(m)))
        .catch((e) => setError(String(e)));
    load();
    const stop = onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 600);
    });
    const listener = () => redraw((n) => n + 1);
    sentListeners.add(listener);
    return () => {
      clearTimeout(timer);
      stop();
      sentListeners.delete(listener);
    };
  }, []);

  const open = new Set((found ?? []).map(markerKey));
  const done = new Set(found ? sent.map(markerKey).filter((k) => !open.has(k)) : []);
  return { markers: found, error, sent, done };
}
