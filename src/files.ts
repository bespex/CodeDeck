// Files, folders and passages attached to the next prompt (D21). Attaching is one step: what is
// pinned is attached, there is no list to collect first. Once it went out with a prompt (or was
// removed) it is gone; nothing is given to the assistant unasked. Kept like every attachment, see
// `attachments.ts`.

import { pathStats, tokensFor, type Entry } from "./backend";
import { plural } from "./git";
import { createPart } from "./attachments";
import { known, t } from "./i18n";

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
  /** For a folder: how many files it holds, worded when shown so it follows the language */
  count?: { files: number; truncated: boolean };
}

/** Where a pin is, or for a folder how many files it holds, in the language of the interface. */
export function pinDetail(pin: Pin): string {
  if (pin.count) {
    const files = plural(pin.count.files, "file");
    return pin.count.truncated ? t("over {files}", { files }) : files;
  }
  return known(pin.detail);
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
  const count = { files: stats.files, truncated: stats.truncated };
  return { id: entry.path, kind: "folder", label: `${entry.name}/`, detail: "", count, tokens: tokensFor(stats.bytes) };
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

export const filesLabel = (pins: Pin[]) => t("Files: {items}", { items: plural(pins.length, "item") });

/** The files, folders and passages attached: pinning one attaches it. */
export const files = createPart<Pin>(FILES_KEY, { id: (p) => p.id, text: filesText, label: filesLabel });
