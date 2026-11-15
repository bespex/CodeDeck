// Git state of the open project: every repository in it, kept current, and the commands that
// ran to find out. The backend only answers; when to ask is decided here.

import { useEffect, useMemo, useState } from "react";
import {
  gitLog,
  gitStatus,
  onFsChanged,
  onGitChanged,
  onGitRan,
  type Commit,
  type GitRun,
  type GitState,
  type RepoStatus,
} from "./backend";

/** While the window is visible, the status is read again this often. */
const POLL_MS = 5000;
/** Changes on disk arrive in bursts; one status read after the burst is enough. */
const SETTLE_MS = 300;
/** Commands kept for display. */
/** Commands kept for the log: all actions up to this many, and the latest reads. */
const ACTIONS_KEPT = 300;
const READS_KEPT = 300;

/** Adds a run, dropping the oldest of its kind (actions and reads are kept apart). */
function keep(runs: GitRun[], run: GitRun): GitRun[] {
  const next = [...runs, run];
  const ofKind = next.filter((r) => r.changes === run.changes);
  const limit = run.changes ? ACTIONS_KEPT : READS_KEPT;
  if (ofKind.length <= limit) return next;
  const drop = ofKind[0].id;
  return next.filter((r) => r.id !== drop);
}

export interface GitView {
  repos: RepoStatus[];
  /** Repositories in folders, by project-relative path; not the one the project lies in */
  repoAt: Map<string, RepoStatus>;
  /** The repository the whole project belongs to, if any */
  rootRepo: RepoStatus | undefined;
  /**
   * State Git reports for exactly this file or folder. Below an untracked folder nothing is
   * reported again: the folder's own mark says it for everything inside.
   */
  stateOf: (path: string) => GitState | undefined;
  /** Number of changed files below a folder */
  changesIn: (dir: string) => number;
  /** Changed files over all repositories */
  changed: number;
  /** Latest commands, oldest first */
  runs: GitRun[];
  /** Read the status again now, e.g. after an action */
  refresh: () => void;
}

export function useGit(projectPath: string | undefined): GitView {
  const [repos, setRepos] = useState<RepoStatus[]>([]);
  const [runs, setRuns] = useState<GitRun[]>([]);
  const [refresh, setRefresh] = useState<() => void>(() => () => {});

  useEffect(() => {
    if (!projectPath) return;
    let alive = true;
    setRepos([]);
    // One read at a time; asks that arrive meanwhile are folded into one more read afterwards
    const busy = { current: false };
    const again: { current: boolean | null } = { current: null };

    const refresh = async (rescan: boolean) => {
      if (busy.current) {
        again.current = (again.current ?? false) || rescan;
        return;
      }
      busy.current = true;
      try {
        const next = await gitStatus(rescan);
        if (alive) setRepos(next);
      } catch {
        // Keep showing the last known state
      } finally {
        busy.current = false;
        const pending = again.current;
        again.current = null;
        if (alive && pending !== null) refresh(pending);
      }
    };

    let settle: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(settle);
      settle = setTimeout(() => refresh(false), SETTLE_MS);
    };
    // Coming back to the window: maybe repos were cloned or removed meanwhile
    const onFocus = () => refresh(true);
    const poll = setInterval(() => document.visibilityState === "visible" && refresh(false), POLL_MS);

    refresh(true);
    setRefresh(() => () => refresh(false));
    gitLog().then((log) => alive && setRuns((seen) => [...log.filter((r) => !seen.some((s) => s.id === r.id)), ...seen].sort((a, b) => a.id - b.id)));
    window.addEventListener("focus", onFocus);
    const stopFs = onFsChanged(soon);
    const stopGit = onGitChanged(soon);
    const stopRan = onGitRan((run) => setRuns((current) => keep(current, run)));
    return () => {
      alive = false;
      clearTimeout(settle);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      stopFs();
      stopGit();
      stopRan();
    };
  }, [projectPath]);

  return useMemo(() => view(repos, runs, refresh), [repos, runs, refresh]);
}

function view(repos: RepoStatus[], runs: GitRun[], refresh: () => void): GitView {
  const states = new Map<string, GitState>();
  const counts = new Map<string, number>();
  let changed = 0;

  for (const repo of repos) {
    for (const file of repo.files) {
      states.set(file.path, file.state);
      changed++;
      // Count the change for every folder above it
      for (let slash = file.path.indexOf("/"); slash > 0; slash = file.path.indexOf("/", slash + 1)) {
        const dir = file.path.slice(0, slash);
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
      }
    }
  }

  return {
    repos,
    repoAt: new Map(repos.filter((r) => r.path).map((r) => [r.path, r])),
    rootRepo: repos.find((r) => !r.path),
    stateOf: (path) => states.get(path),
    changesIn: (dir) => counts.get(dir) ?? 0,
    changed,
    runs,
    refresh,
  };
}

/** `↑2 ↓1`, empty when in sync. */
export function aheadBehind(repo: RepoStatus): string {
  return [repo.ahead && `↑${repo.ahead}`, repo.behind && `↓${repo.behind}`].filter(Boolean).join(" ");
}

// Counting follows the language of the interface
import { plural, t } from "./i18n";
export { plural };

/** What a status letter means, in a few words. */
export const stateMeaning: Record<GitState, string> = {
  M: "Modified",
  A: "Added: new, already staged for the next commit",
  D: "Deleted",
  R: "Renamed",
  U: "Conflict: needs to be resolved",
  "?": "New: not yet in Git",
};

/** Letter shown for a state; untracked files show `N` (new) rather than Git's `?`. */
export const stateSymbol = (state: GitState) => (state === "?" ? "N" : state);

/** The uncommitted changes in plain words: "3 uncommitted changes: 2 modified, 1 new". */
export function changeSummary(repo: RepoStatus): string {
  if (repo.files.length === 0) return t("No uncommitted changes");
  const kinds: [string, (s: GitState) => boolean][] = [
    ["modified", (s) => s === "M" || s === "R"],
    ["new", (s) => s === "A" || s === "?"],
    ["deleted", (s) => s === "D"],
    ["in conflict", (s) => s === "U"],
  ];
  const parts = kinds
    .map(([label, test]) => [label, repo.files.filter((f) => test(f.state)).length] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${t(label)}`);
  return `${plural(repo.files.length, "uncommitted change")}: ${parts.join(", ")}`;
}

/** Where the branch stands against its upstream, in plain words. */
export function syncSummary(repo: RepoStatus): string {
  if (!repo.branch) return t("Detached HEAD: no branch checked out");
  if (repo.remotes.length === 0) return t("Local only: no remote to push to yet");
  if (!repo.upstream) return t("Not published yet: the branch has no upstream");
  const parts = [
    repo.ahead > 0 && t("{commits} to push", { commits: plural(repo.ahead, "commit") }),
    repo.behind > 0 && t("{commits} to pull", { commits: plural(repo.behind, "commit") }),
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")} (${repo.upstream})` : t("In sync with {upstream}", { upstream: repo.upstream });
}

/** An argument as one would type it in a shell; the backend's `quote` does the same. */
export function quote(arg: string): string {
  return /^[A-Za-z0-9\-_./=:@+,]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export const commandLine = (args: string[]) => `git ${args.map(quote).join(" ")}`;

/** One action: the git commands it consists of, run one after the other. */
export type Steps = string[][];

/**
 * Commit: when something is staged already, exactly that is committed; otherwise everything
 * shown as changed. In a repo the project only lies inside, only the opened folder is added.
 */
export function commitSteps(repo: RepoStatus, message: string): Steps {
  const msg = message.trim() || "…";
  if (repo.files.some((f) => f.staged)) return [["commit", "-m", msg]];
  const add = repo.outer ? ["add", "-A", "--", repo.prefix] : ["add", "-A"];
  return [add, ["commit", "-m", msg]];
}

/**
 * Changing the message of a commit not yet on any remote. The newest one is amended (`--only`
 * leaves staged changes out). An older one gets an `amend!` commit with the new message, which
 * a rebase then folds into it; local changes are stashed meanwhile and put back.
 *
 * @param commits the repository's commits, newest first, as on the trail
 * @param head the commit checked out: only that one can simply be amended
 * @returns the steps, or why it cannot be done
 */
export function rewordSteps(commits: Commit[], head: string | null, hash: string, text: string): Steps | string {
  const at = commits.findIndex((c) => c.hash === hash);
  const target = commits[at];
  if (!target) return "This commit is not in the history shown";
  if (!target.local) return "Already pushed: changing it would rewrite history others may have";
  if (commits.slice(0, at + 1).some((c) => c.merge)) {
    return "A merge lies between this commit and now; its message cannot be changed here";
  }
  const [subject, ...rest] = text.trim().split(/\n\s*\n/);
  const messages = [subject.trim(), rest.join("\n\n").trim()].filter(Boolean).flatMap((m) => ["-m", m]);
  if (!subject.trim()) return "The message needs a first line";
  if (hash === head) return [["commit", "--amend", "--only", ...messages]];
  return [
    ["commit", "--allow-empty", "--only", "-m", `amend! ${hash}`, ...messages],
    ["rebase", "-i", "--autosquash", "--autostash", target.root ? "--root" : `${hash}^`],
  ];
}

export const pullSteps = (): Steps => [["pull", "--ff-only"]];
export const fetchSteps = (): Steps => [["fetch"]];
/** The remote a new branch is published to: `origin` if there is one, else the only one. */
export const remoteOf = (repo: RepoStatus) => (repo.remotes.includes("origin") ? "origin" : repo.remotes[0]);

export function pushSteps(repo: RepoStatus): Steps {
  const remote = remoteOf(repo);
  return repo.upstream || !repo.branch || !remote ? [["push"]] : [["push", "-u", remote, repo.branch]];
}

export const addRemoteSteps = (url: string): Steps => [["remote", "add", "origin", url.trim()]];

export function ago(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 5) return t("just now");
  if (s < 60) return t("{n} s ago", { n: s });
  return t("{n} min ago", { n: Math.round(s / 60) });
}
