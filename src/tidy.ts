// Tidying up the scratch folder (docs/DATEISPALTE.md, part A): which files can probably go, which
// to look at first, which stay. Only a proposal: the user ticks what goes, and it goes to the trash,
// never deleted for good. Age alone (the old "older than 7 days") misses what CodeDeck knows besides:
// who wrote a file and whether that session is over, whether the user saw it, whether it is
// attached, what kind of file it is and whether it lies in the project already.

import type { Session, WorkFile } from "./backend";

export type TidyGroup = "away" | "check" | "keep";

export interface TidyItem {
  file: WorkFile;
  group: TidyGroup;
  /** Why, in English: the interface translates it (`t`), with `{path}` filled in from `path` */
  reason: string;
  path?: string;
}

export interface TidyFacts {
  now: number;
  /** Scratch path → the project file with the same name and bytes */
  twins: Map<string, string>;
  /** The session that wrote the file, if known */
  writer: (path: string) => string | null;
  session: (id: string) => Session | undefined;
  /** Not seen yet by the user (the "new" mark of the Workbench) */
  unseen: (file: WorkFile) => boolean;
  /** Project-relative paths attached to the next prompt */
  attached: Set<string>;
}

const DAY = 24 * 3600_000;
/** What a tool or a run produces again: logs, measurements, pictures */
const OUTPUT = /\.(log|out|tmp|bak|csv|tsv|jsonl|ndjson|png|jpe?g|webp|gif|bmp|prof|trace|dump)$/i;
/** What a person may want to keep: drafts and scripts */
const DRAFT = /\.(md|markdown|html?|txt|py|sh|js|mjs|ts|tsx|rs|java|kt|go|rb|sql|ya?ml|toml|json)$/i;

/** One file's group and why; the first rule that applies decides. */
export function tidyOf(file: WorkFile, facts: TidyFacts): TidyItem {
  const age = facts.now - file.modified;
  const writer = facts.writer(file.path);
  const session = writer ? facts.session(writer) : undefined;
  if (facts.attached.has(file.path)) return { file, group: "keep", reason: "attached to your next prompt" };
  if (session && (session.status === "working" || session.status === "waiting")) return { file, group: "keep", reason: "its AI session is at work" };
  if (facts.unseen(file)) return { file, group: "keep", reason: "not seen yet" };
  if (age < DAY) return { file, group: "keep", reason: "changed today" };
  const twin = facts.twins.get(file.path);
  if (twin) return { file, group: "away", reason: "the same file is in the project: {path}", path: twin };
  if (OUTPUT.test(file.path)) return { file, group: "away", reason: "output that can be made again" };
  if (DRAFT.test(file.path)) return { file, group: "check", reason: "a draft or script: look before it goes" };
  if (age > 7 * DAY) return { file, group: "away", reason: "unchanged for more than 7 days" };
  if (session?.status === "ended" && file.modified <= session.last) return { file, group: "away", reason: "its AI session has ended, unchanged since" };
  return { file, group: "check", reason: "not clear" };
}

export function tidyPlan(files: WorkFile[], facts: TidyFacts): TidyItem[] {
  return files.map((f) => tidyOf(f, facts));
}
