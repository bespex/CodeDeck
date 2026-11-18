// Sessions CodeDeck started in tmux that have not reported yet. A tool that asks something first
// (whether to trust the folder) says nothing until it is answered; without these rows such a
// session would be running, and nobody could see it or answer it.

import { useEffect, useState } from "react";
import { pendingSessions, type PendingSession } from "./backend";

/** The pending sessions of a project, asked of tmux now and then (it is cheap, and a session
 *  leaves the list by itself once it reports). `known` are the ids of the sessions already listed:
 *  one of them is no longer pending even before tmux is asked again, so it never shows twice, and
 *  a change among them asks again at once. */
export function usePending(project: string | undefined, known: string[], every = 3000): PendingSession[] {
  const [list, setList] = useState<PendingSession[]>([]);
  const knownKey = known.join("\n");
  useEffect(() => {
    if (!project) return;
    let alive = true;
    const load = () => void pendingSessions(project).then((l) => alive && setList((old) => (JSON.stringify(old) === JSON.stringify(l) ? old : l))).catch(() => {});
    load();
    const timer = setInterval(load, every);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [project, every, knownKey]);
  return list.filter((p) => !known.includes(p.id));
}
