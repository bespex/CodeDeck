// The focus: files, folders and passages the user picks for Claude. Empty by default: then
// nothing is handed over and the assistant works without extra context.

import { pathStats, tokensFor, type Entry } from "./backend";

export interface Pin {
  /** The project-relative path, or an id of its own for a passage */
  id: string;
  kind: "file" | "folder" | "snippet";
  label: string;
  detail: string;
  /** Rough estimate of what reading it costs the assistant */
  tokens: number;
  /** Program that sent it, e.g. jayq */
  via?: string;
  /** For a passage: its text, handed over as it is */
  content?: string;
}

export async function pinFromEntry(entry: Entry): Promise<Pin> {
  if (!entry.isDir) {
    const slash = entry.path.lastIndexOf("/");
    return {
      id: entry.path,
      kind: "file",
      label: entry.name,
      detail: slash < 0 ? "project root" : entry.path.slice(0, slash),
      tokens: tokensFor(entry.size),
    };
  }
  const stats = await pathStats(entry.path);
  const count = `${stats.truncated ? "over " : ""}${stats.files} file${stats.files === 1 ? "" : "s"}`;
  return { id: entry.path, kind: "folder", label: `${entry.name}/`, detail: count, tokens: tokensFor(stats.bytes) };
}

/** The part of the hand-over that the focus makes. */
export const FOCUS_KEY = "focus";

/**
 * The focus as text for Claude: paths only (it reads them itself, as far as it needs), passages
 * with their text.
 */
export function focusText(pins: Pin[]): string {
  const lines = pins.map((p) => {
    if (p.kind === "file") return `- ${p.id}`;
    if (p.kind === "folder") return `- ${p.id}/ (folder)`;
    const from = [p.detail, p.via && `from ${p.via}`].filter(Boolean).join(", ");
    return `- Passage${from ? ` (${from})` : ""}:\n\n\`\`\`\n${p.content ?? p.label}\n\`\`\``;
  });
  return ["For my next request, focus on these parts of the project; read them as far as you need:", "", ...lines].join("\n");
}
