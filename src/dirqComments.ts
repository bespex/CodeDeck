// Comments on lines written in Dirq (Qiew docs/ANNOTATE.md, 4): Dirq sends them to the hub, the hub
// to the window of the project the patch belongs to (only for a patch CodeDeck opened there with
// --annotate). Here they become line comments of the next prompt, like those written in Changes.

import { useEffect, useRef } from "react";
import { onDirqComment } from "./backend";
import { addNote, dirqNoteId, removeNote } from "./notes";

/**
 * @param writer the session that wrote a file last: who a comment is for when Dirq names none (a
 * patch of the uncommitted changes has no session of its own)
 */
export function useDirqComments(writer: (path: string) => string | null) {
  const latest = useRef(writer);
  latest.current = writer;
  useEffect(
    () =>
      onDirqComment(({ id, add }) => {
        if (!add) return removeNote(dirqNoteId(id));
        addNote(add.path, add.line, add.code, add.text, add.session ?? latest.current(add.path), dirqNoteId(id));
      }),
    [],
  );
}
