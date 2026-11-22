// Groups of projects in the overview (docs/UEBERSICHT.md): the folders my projects are filed in. A
// project's group is the deepest folder above it that holds at least one more of my projects; a
// project that holds others is the group's own folder and leads that group. So ~/projects/bespex/…
// make "bespex", ~/projects/tsobss itself and its projects make "tsobss", and the projects right in
// ~/projects (holding no others) make "projects" (user, 2026-11-22). It does not depend on where the
// other projects lie: a project in ~ or in ~/Dokumente/Setup/… does not flatten the rest (before, the
// groups were the first folder below the one all projects share; with ~ on the list that was one
// group, "bespecke"). Nothing to set up: the groups are the user's own filing. A group of one is no group.

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const holds = (folder: string, path: string) => path.startsWith(folder === "/" ? "/" : `${folder}/`);

/**
 * The folder of a project's group, before groups of one are dissolved: the project itself if it holds
 * another of `all`, else the deepest folder above it that holds another.
 */
function folderOf(path: string, all: string[]): string | null {
  const others = all.filter((o) => o !== path);
  if (others.some((o) => holds(path, o))) return path;
  for (let folder = parentOf(path); ; folder = parentOf(folder)) {
    if (others.some((o) => holds(folder, o))) return folder;
    if (folder === "/") return null;
  }
}

/** The groups' names: the folder's name; two folders of the same name are told apart by their parent's. */
function namesOf(folders: string[]): Map<string, string> {
  const last = (f: string) => f.split("/").filter(Boolean).at(-1) ?? "/";
  const names = new Map<string, string>();
  for (const f of folders) {
    const twin = folders.some((o) => o !== f && last(o) === last(f));
    names.set(f, twin ? `${last(parentOf(f))}/${last(f)}` : last(f));
  }
  return names;
}

/** A project's name in its group: without the group's name in front, "tsobss-nms" in "tsobss" is "nms". */
export function nameIn(name: string, group: string | null): string {
  if (!group) return name;
  const prefix = `${group}-`;
  return name.toLowerCase().startsWith(prefix.toLowerCase()) && name.length > prefix.length ? name.slice(prefix.length) : name;
}

export interface Section<T> {
  /** The group's name; `null` for the projects without one */
  group: string | null;
  items: T[];
  /** The path of the project that is the group's own folder: it stands first, set apart */
  umbrella: string | null;
}

/**
 * My projects in sections, each in the order of the list: first those without a group, then the
 * groups in the order their first project comes in. Projects not on my list (a session runs there)
 * come last, without a group, as before.
 */
export function sectionsOf<T extends { path: string; listed: boolean }>(projects: T[]): Section<T>[] {
  const mine = projects.filter((p) => p.listed);
  const paths = mine.map((p) => p.path);
  const folderBy = new Map(mine.map((p) => [p.path, folderOf(p.path, paths)]));
  const size = new Map<string, number>();
  for (const f of folderBy.values()) if (f) size.set(f, (size.get(f) ?? 0) + 1);
  // A group of one: that project stands with those without a group
  const folderOfItem = (p: T) => {
    const f = folderBy.get(p.path) ?? null;
    return f && (size.get(f) ?? 0) > 1 ? f : null;
  };
  const loose: T[] = [];
  const groups = new Map<string, T[]>();
  for (const p of mine) {
    const f = folderOfItem(p);
    if (!f) loose.push(p);
    else groups.set(f, [...(groups.get(f) ?? []), p]);
  }
  const names = namesOf([...groups.keys()]);
  const sections: Section<T>[] = [];
  if (loose.length) sections.push({ group: null, items: loose, umbrella: null });
  for (const [folder, items] of groups) {
    // The project that is the group's folder always comes first, whatever its place on my list
    const top = items.find((p) => p.path === folder);
    sections.push({ group: names.get(folder)!, items: top ? [top, ...items.filter((p) => p !== top)] : items, umbrella: top?.path ?? null });
  }
  const others = projects.filter((p) => !p.listed);
  if (others.length) sections.push({ group: null, items: others, umbrella: null });
  return sections;
}

const COLLAPSED = "codedeck.overview.collapsed";

/** The groups the user folded away, on this machine. */
export function loadCollapsed(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(COLLAPSED) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((g) => typeof g === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveCollapsed(groups: Set<string>) {
  localStorage.setItem(COLLAPSED, JSON.stringify([...groups]));
}
