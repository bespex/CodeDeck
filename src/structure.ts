// The structure of a change: which files and folders came, went, moved or changed, as a tree.
// Built from what `git diff --raw` reports (with Git's rename detection) and from the folders
// that appeared or disappeared.

import type { Change, Patch } from "./backend";

/** What happened to a file, in the words of the structure view. */
export type Kind = "added" | "deleted" | "moved" | "modified";

export const KINDS: Kind[] = ["added", "deleted", "moved", "modified"];

export interface FileNode {
  type: "file";
  name: string;
  /** Repository-relative, the new path (the old one for a deleted file) */
  path: string;
  change: Change;
  kind: Kind;
  /** Only the name changed, not the folder */
  renamed: boolean;
  /** Moved along with its folder: the folder says where from */
  withFolder: boolean;
}

export interface DirNode {
  type: "dir";
  /** One or more folder names: a chain of folders with nothing else in them is shown as one */
  name: string;
  path: string;
  /** new: did not exist before; gone: does not exist any more; moved: came from `from` */
  state: "new" | "gone" | "moved" | "changed";
  from?: string;
  children: Node[];
  /** Files below, per kind */
  counts: Record<Kind, number>;
  added: number;
  removed: number;
}

export type Node = FileNode | DirNode;

export function kindOf(change: Change): Kind {
  switch (change.status) {
    case "A":
    case "C":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "moved";
    default:
      return "modified";
  }
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const under = (path: string, dir: string) => dir === "" || path.startsWith(`${dir}/`);

/**
 * Folders that went away while a new folder got all of their files, in the same places below
 * it: those were moved (or renamed) as a whole. New folder → old folder.
 */
function folderMoves(patch: Patch): Map<string, string> {
  const moves = new Map<string, string>();
  for (const gone of patch.goneDirs) {
    const leaving = patch.changes.filter((c) => under(c.from ?? (c.status === "D" ? c.path : ""), gone));
    if (leaving.length === 0 || leaving.some((c) => c.status !== "R" || !c.from)) continue;
    const first = leaving[0];
    const rest = first.from!.slice(gone.length);
    if (!first.path.endsWith(rest)) continue;
    const target = first.path.slice(0, first.path.length - rest.length);
    if (!patch.newDirs.includes(target) || moves.has(target)) continue;
    if (leaving.every((c) => c.path === target + c.from!.slice(gone.length))) moves.set(target, gone);
  }
  // A folder moved inside a moved folder came along with it: only the outermost counts
  for (const [target, gone] of moves) {
    const parent = [...moves].find(([t, g]) => t !== target && under(target, t) && under(gone, g));
    if (parent && target.slice(parent[0].length) === gone.slice(parent[1].length)) moves.delete(target);
  }
  return moves;
}

const emptyCounts = (): Record<Kind, number> => ({ added: 0, deleted: 0, moved: 0, modified: 0 });

/** The tree of everything a patch changed, folders first, then files, each by name. */
export function buildTree(patch: Patch): DirNode {
  const moves = folderMoves(patch);
  const newDirs = new Set(patch.newDirs);
  const goneDirs = new Set(patch.goneDirs);
  const root: DirNode = { type: "dir", name: "", path: "", state: "changed", children: [], counts: emptyCounts(), added: 0, removed: 0 };
  const dirs = new Map<string, DirNode>([["", root]]);

  const dirAt = (path: string): DirNode => {
    const known = dirs.get(path);
    if (known) return known;
    const parent = dirAt(dirOf(path));
    const from = moves.get(path);
    const dir: DirNode = {
      type: "dir",
      name: nameOf(path),
      path,
      state: from !== undefined ? "moved" : newDirs.has(path) ? "new" : goneDirs.has(path) ? "gone" : "changed",
      from,
      children: [],
      counts: emptyCounts(),
      added: 0,
      removed: 0,
    };
    parent.children.push(dir);
    dirs.set(path, dir);
    return dir;
  };

  for (const change of patch.changes) {
    const kind = kindOf(change);
    const movedDir = [...moves].find(([target, gone]) => change.from && under(change.path, target) && under(change.from, gone));
    const withFolder =
      !!movedDir && change.path.slice(movedDir[0].length) === change.from!.slice(movedDir[1].length);
    const file: FileNode = {
      type: "file",
      name: nameOf(change.path),
      path: change.path,
      change,
      kind,
      renamed: kind === "moved" && !withFolder && dirOf(change.from ?? "") === dirOf(change.path),
      withFolder,
    };
    dirAt(dirOf(change.path)).children.push(file);
  }

  const total = (dir: DirNode) => {
    for (const child of dir.children) {
      if (child.type === "dir") {
        total(child);
        for (const k of KINDS) dir.counts[k] += child.counts[k];
        dir.added += child.added;
        dir.removed += child.removed;
      } else {
        dir.counts[child.kind]++;
        dir.added += child.change.added ?? 0;
        dir.removed += child.change.removed ?? 0;
      }
    }
    dir.children.sort((a, b) =>
      a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  };
  total(root);
  compact(root);
  return root;
}

/** `src` › `components` with nothing else in `src` becomes one row `src/components`. */
function compact(dir: DirNode) {
  dir.children = dir.children.map((child) => {
    if (child.type !== "dir") return child;
    let node = child;
    while (
      node.state === "changed" &&
      node.children.length === 1 &&
      node.children[0].type === "dir" &&
      node.children[0].state === "changed"
    ) {
      const inner = node.children[0];
      node = { ...inner, name: `${node.name}/${inner.name}` };
    }
    compact(node);
    return node;
  });
}

/** Only what matches the filter; folders stay when something below them does. */
export function filterTree(dir: DirNode, keep: (file: FileNode) => boolean): DirNode {
  const children: Node[] = [];
  for (const child of dir.children) {
    if (child.type === "file") {
      if (keep(child)) children.push(child);
    } else {
      const inner = filterTree(child, keep);
      if (inner.children.length) children.push(inner);
    }
  }
  return { ...dir, children };
}

/** Folders of a tree by state, for the summary. */
export function countDirs(dir: DirNode): Record<"new" | "gone" | "moved", number> {
  const counts = { new: 0, gone: 0, moved: 0 };
  const walk = (d: DirNode, inside: boolean) => {
    for (const child of d.children) {
      if (child.type !== "dir") continue;
      // A new folder inside a new folder is part of it, not a second one
      const counted = child.state !== "changed" && !inside;
      if (counted) counts[child.state as "new" | "gone" | "moved"]++;
      walk(child, inside || child.state !== "changed");
    }
  };
  walk(dir, false);
  return counts;
}

/** What a change of mode means, if anything worth saying. */
export function modeNote(change: Change): string | null {
  const { oldMode: a, newMode: b } = change;
  if (b === "160000" && a !== "160000") return "a repository of its own";
  if (b === "120000" && a !== "120000") return a === "000000" ? "symbolic link" : "now a symbolic link";
  if (a === "120000" && b !== "120000" && b !== "000000") return "no longer a link";
  if (a === "100644" && b === "100755") return "now executable";
  if (a === "100755" && b === "100644") return "no longer executable";
  return null;
}
