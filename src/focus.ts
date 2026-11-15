// Files, folders and passages attached to the next prompt (D21). Attaching is one step: what is
// pinned is attached, there is no list to collect first. Once the attachment went out with a prompt
// (or was removed) the pins are gone; nothing is given to the assistant unasked.

import { useEffect, useRef } from "react";
import { handOver, pathStats, tokensFor, type AssistantState, type Entry } from "./backend";
import { plural } from "./git";

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

/** The part of the attachments that pinned files, folders and passages make. */
export const FILES_KEY = "files";

/**
 * The pins as text for the assistant: paths only (it reads them itself, as far as it needs), passages
 * with their text.
 */
export function filesText(pins: Pin[]): string {
  const lines = pins.map((p) => {
    if (p.kind === "file") return `- ${p.id}`;
    if (p.kind === "folder") return `- ${p.id}/ (folder)`;
    const from = [p.detail, p.via && `from ${p.via}`].filter(Boolean).join(", ");
    return `- Passage${from ? ` (${from})` : ""}:\n\n\`\`\`\n${p.content ?? p.label}\n\`\`\``;
  });
  return ["For this request, look at these parts of the project; read them as far as you need:", "", ...lines].join("\n");
}

export const filesLabel = (pins: Pin[]) => `Files: ${plural(pins.length, "item")}`;

/** How many things are attached, counted the same everywhere: each pinned item, each other part. */
export const attachmentCount = (state: AssistantState, pinned: number) =>
  state.handovers.filter((h) => h.key !== FILES_KEY).length + pinned;

/**
 * Keeps the pins and their attachment in step, once for the window: every change of the pins is
 * the attachment, and when the attachment has left (sent with a prompt, or removed) the pins go.
 * `attaches`: the tool takes text with a prompt; otherwise the pins stay here to be copied.
 */
export function useAttachedFiles(pins: Pin[], clear: () => void, state: AssistantState, attaches: boolean) {
  useEffect(() => {
    if (attaches) void handOver(FILES_KEY, pins.length ? filesText(pins) : null, filesLabel(pins));
  }, [pins, attaches]);
  const queued = state.handovers.some((h) => h.key === FILES_KEY);
  const seen = useRef(false);
  useEffect(() => {
    if (queued) seen.current = true;
    else if (seen.current) {
      seen.current = false;
      clear();
    }
  }, [queued, clear]);
}
