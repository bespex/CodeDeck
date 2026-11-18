// Sessions CodeDeck started in tmux that have not reported yet. A tool that asks something first
// (whether to trust the folder) says nothing until it is answered; without these rows such a
// session would be running, and nobody could see it or answer it.

import { useEffect, useState } from "react";
import { onSessionsStarted, pendingSessions, type PendingSession } from "./backend";

/** How long a fresh session counts as starting. A tool that has not reported by then most
 *  likely waits for an answer (it usually reports within a few seconds). */
const STARTING_FOR = 20_000;

/** A pending session, and whether it probably waits for an answer rather than still starting. */
export type Pending = PendingSession & { waits: boolean };

/** The pending sessions of a project, asked of tmux now and then (it is cheap, and a session
 *  leaves the list by itself once it reports) and at once when a session was started anywhere.
 *  `known` are the ids of the sessions already listed: one of them is no longer pending even
 *  before tmux is asked again, so it never shows twice, and a change among them asks again at once. */
export function usePending(project: string | undefined, known: string[], every = 3000): Pending[] {
  const [list, setList] = useState<PendingSession[]>([]);
  // Moves on with every look, so that "starting" turns into "waits" in time
  const [now, setNow] = useState(() => Date.now());
  const knownKey = known.join("\n");
  useEffect(() => {
    if (!project) return;
    let alive = true;
    const load = () =>
      void pendingSessions(project)
        .then((l) => {
          if (!alive) return;
          setList((old) => (JSON.stringify(old) === JSON.stringify(l) ? old : l));
          setNow(Date.now());
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, every);
    const stop = onSessionsStarted(load);
    return () => {
      alive = false;
      clearInterval(timer);
      stop();
    };
  }, [project, every, knownKey]);
  return list.filter((p) => !known.includes(p.id)).map((p) => ({ ...p, waits: now - p.since > STARTING_FOR }));
}
