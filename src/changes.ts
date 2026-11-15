// Changes attached to the next prompt: a turn, a commit, a snapshot, a comparison, or one file of
// them. Attached as a reference, not as the diff: the git command that shows it, so the prompt stays
// small and the assistant reads what it needs (like files: paths, not contents). Snapshots are refs
// in the same repository, so the commands work where the assistant runs.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { handOver, type AssistantState, type RepoStatus } from "./backend";
import { plural } from "./git";
import { toProject } from "./history";

/** Which change a diff shows: its repository, what git shows it with, and its name. */
export interface ChangeScope {
  repo: RepoStatus;
  /** git arguments without the paths, e.g. `["diff", "3f2a…", "9c1b…"]` or `["show", "3f2a…"]` */
  range: string[];
  /** For people and the assistant, e.g. `Turn 2 (Rate limiter)` */
  label: string;
  /**
   * It reaches up to the files on disk. CodeDeck shows new files there that git does not know yet
   * (it stages them in a scratch index); a plain `git diff` does not, so they are named apart.
   */
  worktree: boolean;
}

export interface ChangeRef {
  /** The command, or the new file: the same change attached twice is one */
  id: string;
  label: string;
  /** What shows it; `null` for a file new on disk, which is simply read */
  command: string | null;
  /** For a new file: its project-relative path */
  path?: string;
  worktree: boolean;
}

/** The part of the attachments that changes make. */
export const CHANGES_KEY = "changes";

/** Hashes are shortened; git takes any unique prefix. */
export const short = (hash: string) => hash.slice(0, 12);

/** What a repository without a commit is compared with: git's empty tree. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * The command that shows the change, run from the project root. A nested repository is reached
 * with `-C`; when the project lies inside its repository, paths are given from the repository's top.
 */
export function changeCommand(scope: ChangeScope, path?: string): string {
  const where = scope.repo.path ? ["-C", quote(scope.repo.path)] : [];
  const file = path === undefined ? [] : ["--", quote(scope.repo.prefix ? `:/${path}` : path)];
  return ["git", ...where, ...scope.range, ...file].join(" ");
}

const quote = (s: string) => (/^[\w./:@+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** @param added the file is new in this change */
export function changeRef(scope: ChangeScope, path?: string, added = false): ChangeRef {
  if (path !== undefined && added && scope.worktree) {
    const file = toProject(scope.repo, path);
    return { id: `new:${file}`, label: `${scope.label}, ${path}`, command: null, path: file, worktree: true };
  }
  const command = changeCommand(scope, path);
  return { id: command, label: path ? `${scope.label}, ${path}` : scope.label, command, worktree: scope.worktree };
}

/** The changes as text for the assistant. */
export function changesText(list: ChangeRef[]): string {
  const lines = list.map((c) => (c.command ? `- ${c.label}: \`${c.command}\`` : `- ${c.label}: a new file, read \`${c.path}\``));
  // A diff against the files on disk leaves out what git does not track yet
  const untracked = list.some((c) => c.command && c.worktree)
    ? ["", "New files that git does not track yet are not in `git diff`; `git status --short` lists them."]
    : [];
  return ["Look at these changes. Each names one, with the git command that shows it (run it in the project root):", "", ...lines, ...untracked].join("\n");
}

let changes: ChangeRef[] = [];
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

function set(next: ChangeRef[]) {
  changes = next;
  publish();
  void handOver(CHANGES_KEY, next.length ? changesText(next) : null, plural(next.length, "change"));
}

/** Attaches the change, or removes it if it is attached. */
export function toggleChange(ref: ChangeRef) {
  set(changes.some((c) => c.id === ref.id) ? changes.filter((c) => c.id !== ref.id) : [...changes, ref]);
}

/** The changes attached, for every component that offers attaching one. */
export function useChanges(): ChangeRef[] {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return changes;
}

/** Once for the window: when their part has left the queue (sent or removed) the changes are gone. */
export function useChangesSync(state: AssistantState) {
  const queued = state.handovers.some((h) => h.key === CHANGES_KEY);
  const seen = useRef(false);
  useEffect(() => {
    if (queued) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      changes = [];
      publish();
    }
  }, [queued]);
}

/** The change the diffs below show, for attaching it or one of its files; `null` where there is none. */
export const ChangeScopeContext = createContext<ChangeScope | null>(null);
export const useChangeScope = () => useContext(ChangeScopeContext);
