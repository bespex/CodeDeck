// What Dirq shows above a patch CodeDeck hands it (docs/QIEW.md, 5): Dirq reads the header of a
// `git format-patch` mail (subject, author, date, message, trailers), so a turn, a snapshot or the
// uncommitted state arrive with what they are, not as a bare diff.

export interface DirqMeta {
  subject: string;
  /** Who made it: a session, the author of a commit */
  author?: string;
  /** Unix seconds */
  at?: number;
  /** The message: what was asked, what was said at the end */
  body?: string;
  /** The commit or snapshot, if it has one */
  hash?: string;
  /** What the patch is, for Dirq's `--id`; without one the subject names it. */
  id?: string;
  /**
   * The session a comment written in Dirq is for (`X-CodeDeck-Session`, Qiew docs/ANNOTATE.md, 5):
   * Dirq sends it back with each comment. Only for a patch Dirq may comment on.
   */
  session?: string | null;
}

/**
 * What Dirq is told the patch is (`--id`): the same id on a later call is a new version of the same
 * thing (Dirq keeps its place and folded files and marks what changed), another id a different one.
 * The subject says what is shown (turn, uncommitted changes, comparison); a commit names its hash.
 */
export const dirqId = (meta: DirqMeta) => meta.id ?? meta.subject;

/** The patch with a mail header in front, as `git format-patch` writes it. */
export function withHeader(patch: string, meta: DirqMeta): string {
  return `${headerOf(meta)}${patch}`;
}

/** Line `start` of the patch (0-based) as a line of what Dirq gets: behind the header, 1-based. */
export function lineBehindHeader(meta: DirqMeta, start: number): number {
  return headerOf(meta).split("\n").length + start;
}

/** The mail header, ending in a line break. */
function headerOf(meta: DirqMeta): string {
  const date = new Date((meta.at ?? Date.now() / 1000) * 1000).toUTCString().replace("GMT", "+0000");
  const lines = [
    `From ${(meta.hash ?? "").padEnd(40, "0").slice(0, 40)} Mon Sep 17 00:00:00 2001`,
    `From: ${(meta.author ?? "CodeDeck").replace(/[\r\n]/g, " ")} <codedeck@localhost>`,
    `Date: ${date}`,
    `Subject: ${meta.subject.replace(/[\r\n]+/g, " ")}`,
    ...(meta.session ? [`X-CodeDeck-Session: ${meta.session.replace(/\s+/g, "")}`] : []),
    "",
    ...(meta.body ? [meta.body.trim(), ""] : []),
    "---",
    "",
  ];
  return lines.join("\n");
}
