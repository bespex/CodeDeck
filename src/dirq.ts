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
}

/** The patch with a mail header in front, as `git format-patch` writes it. */
export function withHeader(patch: string, meta: DirqMeta): string {
  const date = new Date((meta.at ?? Date.now() / 1000) * 1000).toUTCString().replace("GMT", "+0000");
  const lines = [
    `From ${(meta.hash ?? "").padEnd(40, "0").slice(0, 40)} Mon Sep 17 00:00:00 2001`,
    `From: ${(meta.author ?? "CodeDeck").replace(/[\r\n]/g, " ")} <codedeck@localhost>`,
    `Date: ${date}`,
    `Subject: ${meta.subject.replace(/[\r\n]+/g, " ")}`,
    "",
    ...(meta.body ? [meta.body.trim(), ""] : []),
    "---",
    "",
  ];
  return `${lines.join("\n")}${patch}`;
}
