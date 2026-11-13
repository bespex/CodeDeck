// Unified diffs as `git diff` and `git show` print them, read into files, hunks and lines.

export interface DiffLine {
  kind: "context" | "add" | "del" | "note";
  text: string;
  /** Line number on the old side, for context and removed lines */
  old?: number;
  /** Line number on the new side, for context and added lines */
  new?: number;
}

export interface Hunk {
  /** The text after the second `@@`: usually the enclosing function */
  context: string;
  lines: DiffLine[];
}

export interface FileDiff {
  /** Repository-relative, the new path */
  path: string;
  /** The old path of a rename */
  from?: string;
  status: "M" | "A" | "D" | "R";
  binary: boolean;
  hunks: Hunk[];
  added: number;
  removed: number;
}

const ESCAPES: Record<string, number> = { n: 10, t: 9, '"': 34, "\\": 92 };

/** Git quotes unusual paths in C style: `"a/f\303\274r.txt"`. */
function unquote(path: string): string {
  if (!path.startsWith('"')) return path;
  const bytes: number[] = [];
  const inner = path.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c !== "\\") {
      bytes.push(...new TextEncoder().encode(c));
      continue;
    }
    const next = inner[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(inner.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const strip = (path: string) => unquote(path).replace(/^[ab]\//, "");

export function parsePatch(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let file: FileDiff | undefined;
  let hunk: Hunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      // Fallback path from the header; `+++`/`rename to` lines below are more reliable
      const header = line.slice("diff --git ".length);
      const split = header.lastIndexOf(" b/");
      file = {
        path: strip(split >= 0 ? header.slice(split + 1) : header),
        status: "M",
        binary: false,
        hunks: [],
        added: 0,
        removed: 0,
      };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) continue;

    if (!hunk) {
      if (line.startsWith("new file mode")) file.status = "A";
      else if (line.startsWith("deleted file mode")) file.status = "D";
      else if (line.startsWith("rename from ")) {
        file.status = "R";
        file.from = unquote(line.slice("rename from ".length));
      } else if (line.startsWith("rename to ")) file.path = unquote(line.slice("rename to ".length));
      else if (line.startsWith("Binary files ")) file.binary = true;
      else if (line.startsWith("+++ ") && !line.endsWith("/dev/null")) file.path = strip(line.slice(4));
      else if (line.startsWith("--- ") && file.status === "D" && !line.endsWith("/dev/null")) {
        file.path = strip(line.slice(4));
      }
    }

    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
    if (at) {
      oldLine = Number(at[1]);
      newLine = Number(at[2]);
      hunk = { context: at[3], lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    const mark = line[0];
    const body = line.slice(1);
    if (mark === "+") {
      hunk.lines.push({ kind: "add", text: body, new: newLine++ });
      file.added++;
    } else if (mark === "-") {
      hunk.lines.push({ kind: "del", text: body, old: oldLine++ });
      file.removed++;
    } else if (mark === " ") {
      hunk.lines.push({ kind: "context", text: body, old: oldLine++, new: newLine++ });
    } else if (mark === "\\") {
      hunk.lines.push({ kind: "note", text: body.trim() });
    }
  }
  return files;
}

/** Lines a diff shows, to decide whether it opens collapsed. */
export const diffSize = (file: FileDiff) => file.hunks.reduce((n, h) => n + h.lines.length, 0);
