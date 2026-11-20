// Turns: one request to an assistant, from the prompt until it is done. A turn is the stretch
// between two snapshots of one repository: the one taken before the session's first write and
// the one taken when it was done. A running turn has no end yet and reaches up to the present.

import { useEffect, useState, useSyncExternalStore } from "react";
import { openView } from "./view";
import { gitCompare, type RepoStatus, type Session, type Snapshot } from "./backend";

export interface Turn {
  /** Stays the same when a running turn ends */
  key: string;
  /** Project-relative path of the repository */
  repo: string;
  session: string | null;
  /** The snapshot it began at */
  from: string;
  /** The snapshot it ended at; `null` while it runs */
  to: string | null;
  /** Unix seconds: when it ended, for a running one when it was last heard of */
  at: number;
  /** What was asked for */
  prompt: string | null;
  /** What the assistant said at the end, as it said it */
  report: string | null;
  /** Its place among the turns since the last commit, from 1 */
  n: number;
}

const keyOf = (repo: string, from: string, session: string | null) => `${repo}:${from}:${session ?? ""}`;

/**
 * The turns that count for the uncommitted changes: those since the commit checked out, oldest
 * first. Earlier ones are part of a commit by now and are found on the trail.
 */
export function turnsOf(repos: RepoStatus[], snapshots: Snapshot[], sessions: Session[]): Turn[] {
  const head = new Map(repos.map((r) => [r.path, r.head]));
  const ended = snapshots
    .filter((s) => s.turnFrom && head.has(s.repo) && (s.parent ?? null) === head.get(s.repo))
    .map((s) => ({
      key: keyOf(s.repo, s.turnFrom!, s.session),
      repo: s.repo,
      session: s.session,
      from: s.turnFrom!,
      to: s.hash as string | null,
      at: s.at,
      prompt: s.label.replace(/^After: /, "") || null,
      report: s.report,
    }));
  const running = sessions.flatMap((session) =>
    session.turn
      .filter((t) => head.has(t.repo))
      .map((t) => ({
        key: keyOf(t.repo, t.hash, session.id),
        repo: t.repo,
        session: session.id as string | null,
        from: t.hash,
        to: null as string | null,
        at: Math.floor(session.last / 1000),
        prompt: session.prompt,
        report: null as string | null,
      })),
  );
  // A running turn comes after every ended one
  return [...ended.sort((a, b) => a.at - b.at), ...running.sort((a, b) => a.at - b.at)].map((t, i) => ({ ...t, n: i + 1 }));
}

/** What a turn changed never changes: asked once per turn. */
const changedPaths = new Map<string, Promise<string[]>>();

/**
 * Who changed the uncommitted files of a repository: for each repository-relative path the
 * session of the latest ended turn that changed it. Files in no turn are missing.
 */
export function useTurnWriters(repo: string, turns: Turn[]): Map<string, string> {
  const ended = turns.filter((t) => t.repo === repo && t.to && t.session);
  const key = ended.map((t) => t.to).join();
  const [writers, setWriters] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    Promise.all(
      ended.map((t) => {
        const id = `${repo}:${t.from}:${t.to}`;
        if (!changedPaths.has(id)) {
          changedPaths.set(
            id,
            gitCompare(repo, t.from, t.to!).then(
              (patch) => patch.changes.map((c) => c.path),
              () => {
                changedPaths.delete(id); // ask again next time
                return [];
              },
            ),
          );
        }
        return changedPaths.get(id)!.then((paths) => ({ session: t.session!, paths }));
      }),
    ).then((all) => {
      if (!alive) return;
      const next = new Map<string, string>();
      // Oldest first, so the latest turn has the last word
      for (const { session, paths } of all) for (const path of paths) next.set(path, session);
      setWriters(next);
    });
    return () => {
      alive = false;
    };
    // `key` stands for what matters in `turns`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, key]);
  return writers;
}

/* A session's latest turn asked for from outside the Changes view (a session's card: "See the
   turn"). The view picks it up when it is there, even if it opens only now, and only once. */
let wanted: string | null = null;
const wantedListeners = new Set<() => void>();

/** Shows the latest turn of a session in Changes. */
export function showTurnOf(session: string) {
  wanted = session;
  openView("changes");
  wantedListeners.forEach((l) => l());
}

/** The session whose latest turn is asked for, until `turnShown` says it is shown. */
export const useWantedTurn = () =>
  useSyncExternalStore(
    (l) => {
      wantedListeners.add(l);
      return () => wantedListeners.delete(l);
    },
    () => wanted,
  );

export function turnShown() {
  wanted = null;
  wantedListeners.forEach((l) => l());
}
