// The trail's data (commits of all repositories, merged into one timeline), running git actions
// with their visible output, and the file actions of the Changes view.

import { useEffect, useRef, useState } from "react";
import {
  gitAction,
  gitHistory,
  gitSnapshots,
  onSnapshotTaken,
  type Commit,
  type FileStatus,
  type RepoStatus,
  type Snapshot,
} from "./backend";
import { commandLine, type Steps } from "./git";

/** At most this many points on the trail. */
const TRAIL_LIMIT = 150;

export interface TrailCommit {
  /** Project-relative path of the repository */
  repo: string;
  repoName: string;
  commit: Commit;
}

/**
 * All commits of all repositories, newest first. Read again only when a repository's checked
 * out commit or its distance to the upstream changes, not on every status round.
 */
export function useHistory(repos: RepoStatus[]): TrailCommit[] {
  const [commits, setCommits] = useState<TrailCommit[]>([]);
  const key = repos.map((r) => `${r.path}:${r.head}:${r.ahead}:${r.behind}`).join("|");

  useEffect(() => {
    if (!repos.length) {
      setCommits([]);
      return;
    }
    let alive = true;
    const names = new Map(repos.map((r) => [r.path, r.name]));
    gitHistory(repos.map((r) => r.path))
      .then((logs) => {
        if (!alive) return;
        const merged = logs
          .flatMap((log) =>
            log.commits.map((commit) => ({ repo: log.path, repoName: names.get(log.path) ?? log.path, commit })),
          )
          .sort((a, b) => b.commit.at - a.commit.at)
          .slice(0, TRAIL_LIMIT);
        setCommits(merged);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // `key` stands for what matters in `repos`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return commits;
}

/**
 * The snapshots of all repositories, newest first. Read again when one is taken, when a
 * repository's commit changes, and on `reload` (after going back to one).
 */
export function useSnapshots(repos: RepoStatus[]): { snapshots: Snapshot[]; reload: () => void } {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [tick, setTick] = useState(0);
  const key = repos.map((r) => `${r.path}:${r.head}`).join("|");
  useEffect(() => onSnapshotTaken(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    if (!repos.length) {
      setSnapshots([]);
      return;
    }
    let alive = true;
    gitSnapshots(repos.map((r) => r.path))
      .then((list) => alive && setSnapshots(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // `key` stands for what matters in `repos`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { snapshots, reload: () => setTick((t) => t + 1) };
}

export interface Done {
  command: string;
  ok: boolean;
  output: string;
}

/** Runs the steps of an action one after another, stopping at the first that fails. */
export function useGitRun(repo: string, onDone: () => void) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Done[]>([]);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const run = async (steps: Steps): Promise<boolean> => {
    setRunning(true);
    const results: Done[] = [];
    for (const args of steps) {
      const result = await gitAction(repo, args).catch((e) => ({ ok: false, output: String(e) }));
      results.push({ command: commandLine(args), ...result });
      if (alive.current) setDone([...results]);
      if (!result.ok) break;
    }
    if (alive.current) setRunning(false);
    onDone();
    return results.every((r) => r.ok);
  };
  return { run, running, done, clear: () => setDone([]) };
}

/** Repository-relative (as in a patch) to project-relative (as in the tree and the status). */
export function toProject(repo: RepoStatus, path: string): string {
  if (repo.outer) return path.startsWith(`${repo.prefix}/`) ? path.slice(repo.prefix.length + 1) : path;
  return repo.path ? `${repo.path}/${path}` : path;
}

/** What can be done with one uncommitted file, each as the git commands it takes. */
export interface FileActions {
  stage?: Steps;
  unstage?: Steps;
  discard?: Steps;
  /** What discarding means for this file, in words */
  discardMeans?: string;
}

/**
 * @param path repository-relative
 * @param from repository-relative old path of a rename
 */
export function fileActions(repo: RepoStatus, status: FileStatus | undefined, path: string, from?: string): FileActions {
  const state = status?.state ?? "?";
  const hasHead = repo.head !== null;
  const unstage: Steps = [hasHead ? ["restore", "--staged", "--", path] : ["rm", "--cached", "--", path]];
  if (state === "U") return { stage: [["add", "--", path]] };
  // Moved without `git mv`: the old file is deleted, the new one untracked or just added.
  // Git's rename detection pairs them; the actions take both, like for a staged rename.
  if (from && hasHead && (state === "?" || state === "A")) {
    const unstageNew: Steps = state === "A" ? [["restore", "--staged", "--", path]] : [];
    return {
      stage: [["add", "-A", "--", from, path]],
      ...(state === "A" ? { unstage: [["restore", "--staged", "--", from, path]] } : {}),
      discard: [...unstageNew, ["restore", "--source=HEAD", "--staged", "--worktree", "--", from], ["clean", "-f", "--", path]],
      discardMeans: "Moves it back: restores the old file and deletes the new one",
    };
  }
  if (state === "?") {
    return { stage: [["add", "--", path]], discard: [["clean", "-f", "--", path]], discardMeans: "Deletes the new file" };
  }
  if (state === "A") {
    return {
      unstage,
      discard: [...unstage, ["clean", "-f", "--", path]],
      discardMeans: "Deletes the new file",
    };
  }
  const paths = from ? [from, path] : [path];
  return {
    ...(status?.staged ? { unstage: [hasHead ? ["restore", "--staged", "--", ...paths] : unstage[0]] } : {}),
    stage: [["add", "-A", "--", ...paths]],
    discard: hasHead ? [["restore", "--source=HEAD", "--staged", "--worktree", "--", ...paths]] : undefined,
    discardMeans: "Puts the file back as in the last commit",
  };
}
