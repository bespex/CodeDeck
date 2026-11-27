// The scratch folder (`.scratch/` in the project, a tile of the Workbench view): what sessions made
// that is not part of the project yet. Its files are moved into the project by dragging them onto a
// folder of the file list; the outcome is told in the Workbench view, wherever the drop happened.

import { createContext, useEffect, useState } from "react";
import { machineSettings, onSettingsChanged, scratchMove, setMachineSetting } from "./backend";

/** What a dragged scratch file carries: its project-relative path. */
export const SCRATCH_DRAG = "application/x-codedeck-scratch";

export const SCRATCH_DIR = ".scratch";
export const inScratch = (path: string) => path === SCRATCH_DIR || path.startsWith(`${SCRATCH_DIR}/`);

/** The last move and how it went, for the view to say. */
export interface Moved {
  from: string;
  to: string | null;
  error: string | null;
}

let last: Moved | null = null;
const listeners = new Set<() => void>();

/** Moves a scratch file into `dir` of the project (`""` for the root), under its own name. */
export async function moveIntoProject(from: string, dir: string, name = from.split("/").pop() ?? from) {
  const to = dir ? `${dir}/${name}` : name;
  try {
    last = { from, to: await scratchMove(from, to), error: null };
  } catch (e) {
    last = { from, to: null, error: String(e) };
  }
  listeners.forEach((l) => l());
}

export function useLastMove(): Moved | null {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return last;
}

/** What a scratch file is, by its name: the scratch line counts them (U8.4); the expiry will go by it (U8.5). */
export type ScratchKind = "draft" | "image" | "script" | "data" | "backup" | "other";

const KIND_BY_EXT: Record<string, ScratchKind> = {
  md: "draft", txt: "draft", html: "draft", htm: "draft", pdf: "draft",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  py: "script", sh: "script", js: "script", mjs: "script", ts: "script", rs: "script", rb: "script",
  csv: "data", json: "data", log: "data", xml: "data", yaml: "data", yml: "data", sql: "data", tsv: "data",
  bak: "backup", orig: "backup", patch: "backup", diff: "backup",
};

export function scratchKind(path: string): ScratchKind {
  // A copy of a repository or anything inside a folder named like a backup
  if (/(^|\/)[^/]*(backup|\.git)(\/|$)/i.test(path)) return "backup";
  const name = path.slice(path.lastIndexOf("/") + 1);
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return KIND_BY_EXT[ext] ?? "other";
}

export const isImage = (path: string) => scratchKind(path) === "image" && !/(^|\/)[^/]*(backup|\.git)(\/|$)/i.test(path);

/** Days per kind when nobody chose others; the same as `EXPIRY_DAYS` in `scratch.rs`. 0: never. */
export const EXPIRY_DAYS: Record<ScratchKind, number> = { draft: 30, image: 7, script: 7, data: 7, backup: 7, other: 14 };

/** The machine setting `scratchExpiry` (U8.5). */
export interface Expiry {
  on: boolean;
  days: Record<ScratchKind, number>;
}

let expiry: Expiry = { on: true, days: { ...EXPIRY_DAYS } };
const expiryListeners = new Set<(e: Expiry) => void>();
const readExpiry = () =>
  machineSettings()
    .then((m) => {
      const v = (m.scratchExpiry ?? {}) as Partial<{ on: boolean; days: Partial<Record<ScratchKind, number>> }>;
      expiry = { on: v.on !== false, days: { ...EXPIRY_DAYS, ...(v.days ?? {}) } };
      expiryListeners.forEach((l) => l(expiry));
    })
    .catch(() => {});
void readExpiry();
onSettingsChanged(() => void readExpiry());

/** The expiry rules of this machine, and a way to change them. */
export function useExpiry(): [Expiry, (next: Expiry) => void] {
  const [value, setValue] = useState(expiry);
  useEffect(() => {
    expiryListeners.add(setValue);
    setValue(expiry);
    return () => void expiryListeners.delete(setValue);
  }, []);
  return [value, (next) => void setMachineSetting("scratchExpiry", next)];
}

const DAY_MS = 24 * 3600_000;

/** When a scratch file expires by the rules (ms), or null when its kind never does or expiry is off. */
export function expiresAt(path: string, modified: number, rules: Expiry): number | null {
  const days = rules.days[scratchKind(path)];
  return rules.on && days > 0 ? modified + days * DAY_MS : null;
}

/** Kept from expiry: the path itself or a folder above it is marked kept. */
export const isKept = (path: string, kept: string[]) => kept.some((k) => path === k || path.startsWith(`${k}/`));

/** What is kept from expiry in the project shown, and a way to keep or let go (one source for the Workbench). */
export const KeptContext = createContext<{ kept: string[]; keep: (path: string, on: boolean) => void }>({ kept: [], keep: () => {} });

/**
 * The unit a scratch file goes with; the same as `unit_of` in `scratch.rs`. A backup folder (a copy of
 * a repository, a folder named like a backup) is one thing, shown, counted and expired as a whole.
 */
export function unitOf(path: string): string {
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const lower = parts[i].toLowerCase();
    if (lower.includes("backup") || lower.endsWith(".git")) return parts.slice(0, i + 1).join("/");
  }
  return path;
}

/** The folder right below the scratch folder that a file lies in, or null for a file at its top. */
export function topFolderOf(path: string): string | null {
  const parts = path.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : null;
}
