// The `@ai` comments in the project's files, read again when files change; those attached to the
// next prompt (one part, see `attachments.ts`), and which of those sent are gone since (done).

import { useEffect, useState } from "react";
import { findMarkers, onFsChanged, type Marker } from "./backend";
import { plural } from "./git";
import { createPart } from "./attachments";

/** Lines move when text is edited: a comment is recognised by file and text. */
export const markerKey = (m: Marker) => `${m.path}\u0000${m.text}`;

/** The part of the attachments that hints make. */
export const MARKERS_KEY = "markers";

/** The task for the assistant, as one would write it. */
export function markerTask(markers: Marker[]): string {
  const lines = markers.map((m) => `- ${m.path}:${m.line}: ${m.text}`);
  return [
    "Work in these comments that I left for you in files of this project (lines beginning with `@ai`, or with a comment that begins with it).",
    "Change the text around each one as it asks, then remove the comment. Leave a comment in place if you are unsure, and tell me why.",
    "",
    ...lines,
  ].join("\n");
}

function markersLabel(list: Marker[]): string {
  const files = new Set(list.map((m) => m.path)).size;
  return `${plural(list.length, "hint")}${files > 1 ? ` in ${files} files` : ` in ${list[0]?.path ?? ""}`}`;
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

export function useMarkers(): Markers {
  const [found, setFound] = useState<Marker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      findMarkers()
        .then((m) => (setFound(m), setError(null)))
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
