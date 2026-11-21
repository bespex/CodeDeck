// Finding files in the whole project (docs/DATEISPALTE.md, C1/C2): the search field of the file list
// looks through every file, not only the folders opened, and chips narrow the list to what is
// changed, new, attached, holds @ai hints, is marked important or was written by one session. With
// a search or a chip the tree gives way to a flat list of what was found.

/** A chip: one kind of file to narrow the list to; `session:<id>` for the files of one session. */
export type Chip = "changed" | "new" | "attached" | "hints" | "important" | `session:${string}`;

/**
 * How well `path` matches `query` (lower case), higher is better; `null`: not at all. The name
 * counts more than the folders, a run of letters more than letters scattered over the path.
 */
export function score(path: string, query: string): number | null {
  const lower = path.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (name === query) return 1000;
  if (name.startsWith(query)) return 800 - name.length;
  if (name.includes(query)) return 600 - name.length;
  if (lower.includes(query)) return 400 - lower.length;
  // The letters in order, anywhere: "ratelim" finds src/middleware/rate_limit.rs
  let at = 0;
  for (const c of query) {
    if (c === " ") continue;
    at = lower.indexOf(c, at);
    if (at < 0) return null;
    at++;
  }
  return 200 - lower.length;
}

/** The paths that match, best first, at most `max`. */
export function search(paths: Iterable<string>, query: string, max = 300): string[] {
  const q = query.trim().toLowerCase();
  const found: [string, number][] = [];
  for (const p of paths) {
    const s = score(p, q);
    if (s !== null) found.push([p, s]);
  }
  return found.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([p]) => p);
}
