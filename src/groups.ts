// Groups of projects in the overview (docs/UEBERSICHT.md): the folder a project lies in, below the
// folder all my projects share. With projects in ~/projects/bespex/… and ~/projects/tsobss/… the
// groups are "bespex" and "tsobss"; a project right in ~/projects has none. Nothing to set up: the
// groups are the user's own filing. A group of one is no group.

/** The folder every path lies in, as path segments; the paths are absolute, `/`-separated. */
function shared(paths: string[]): string[] {
  const parents = paths.map((p) => p.split("/").filter(Boolean).slice(0, -1));
  if (!parents.length) return [];
  let n = parents[0].length;
  for (const p of parents) {
    let i = 0;
    while (i < n && i < p.length && p[i] === parents[0][i]) i++;
    n = i;
  }
  return parents[0].slice(0, n);
}

/** The group of a project: the first folder below `root` on its way, if it does not lie right in `root`. */
function groupIn(path: string, root: string[]): string | null {
  const parts = path.split("/").filter(Boolean);
  return parts.length - 1 > root.length ? parts[root.length] : null;
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
}

/**
 * My projects in sections, each in the order of the list: first those without a group, then the
 * groups in the order their first project comes in. Projects not on my list (a session runs there)
 * come last, without a group, as before.
 */
export function sectionsOf<T extends { path: string; listed: boolean }>(projects: T[]): Section<T>[] {
  const mine = projects.filter((p) => p.listed);
  const root = shared(mine.map((p) => p.path));
  const groupOf = new Map(mine.map((p) => [p.path, groupIn(p.path, root)]));
  const size = new Map<string, number>();
  for (const g of groupOf.values()) if (g) size.set(g, (size.get(g) ?? 0) + 1);
  // A group of one: that project stands with those without a group
  const group = (p: T) => {
    const g = groupOf.get(p.path) ?? null;
    return g && (size.get(g) ?? 0) > 1 ? g : null;
  };
  const loose: T[] = [];
  const groups = new Map<string, T[]>();
  for (const p of mine) {
    const g = group(p);
    if (!g) loose.push(p);
    else groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const sections: Section<T>[] = [];
  if (loose.length) sections.push({ group: null, items: loose });
  for (const [g, items] of groups) sections.push({ group: g, items });
  const others = projects.filter((p) => !p.listed);
  if (others.length) sections.push({ group: null, items: others });
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
