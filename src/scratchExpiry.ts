// Expiry of scratch files (roadmap U8.5): once after a project window opened and then every hour,
// the backend moves old scratch files to the trash by the rules of this machine (`scratch.rs`). The
// window adds what only it knows must stay: what is attached to the next prompt, what the user has
// not seen yet, and what a session still at work wrote. The journal tells it; the bell shows it.

import { useEffect, useRef } from "react";
import { scratchExpire, scratchList, type AssistantState } from "./backend";
import { files as attachedFiles } from "./files";
import { newsOf, scratchKey } from "./news";
import { useSessionMarks } from "./assistant";

const FIRST_MS = 30_000;
const EVERY_MS = 3600_000;

export function useScratchExpiry(assistant: AssistantState) {
  const marks = useSessionMarks();
  // The interval reads the latest state without being set up again on every change
  const now = useRef({ assistant, marks });
  now.current = { assistant, marks };
  useEffect(() => {
    const run = async () => {
      try {
        const files = await scratchList();
        const { assistant, marks } = now.current;
        const busy = new Set(assistant.sessions.filter((s) => s.status !== "ended").map((s) => s.id));
        const keep = new Set<string>(attachedFiles.items().map((p) => p.id));
        for (const f of files) {
          if (newsOf({ key: scratchKey(f.path), time: f.modified, changes: true }) !== null) keep.add(f.path);
          const writer = marks.writer(f.path);
          if (writer && busy.has(writer)) keep.add(f.path);
        }
        await scratchExpire([...keep]);
      } catch (e) {
        console.error("scratch expiry", e);
      }
    };
    const first = setTimeout(run, FIRST_MS);
    const every = setInterval(run, EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}
