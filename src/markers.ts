// The `@ai` comments in the project's documents, read again when files change, and which of
// those handed to the assistant are gone since (done).

import { useCallback, useEffect, useState } from "react";
import { findMarkers, onFsChanged, type Marker } from "./backend";

/** Lines move when text is edited: a comment is recognised by file and text. */
export const markerKey = (m: Marker) => `${m.path}\u0000${m.text}`;

export interface Markers {
  /** `null` until read */
  markers: Marker[] | null;
  error: string | null;
  /** Handed to the assistant in this window, oldest first */
  handed: Marker[];
  /** Of `handed`, those no longer in the documents */
  done: Set<string>;
  markHanded: (list: Marker[]) => void;
}

export function useMarkers(): Markers {
  const [markers, setMarkers] = useState<Marker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handed, setHanded] = useState<Marker[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      findMarkers()
        .then((m) => (setMarkers(m), setError(null)))
        .catch((e) => setError(String(e)));
    load();
    const stop = onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 600);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  const markHanded = useCallback((list: Marker[]) => {
    setHanded((current) => {
      const known = new Set(current.map(markerKey));
      return [...current, ...list.filter((m) => !known.has(markerKey(m)))];
    });
  }, []);

  const open = new Set((markers ?? []).map(markerKey));
  const done = new Set(markers ? handed.map(markerKey).filter((k) => !open.has(k)) : []);
  return { markers, error, handed, done, markHanded };
}
