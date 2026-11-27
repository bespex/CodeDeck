// How the file list shows the project (docs/DATEISPALTE.md): what is hidden ("Ausblenden", shown
// faded or not at all; nothing to do with git's ignore, though what git ignores can be hidden too),
// what is marked important, whether the dots of the sessions stay, whether @ai hints show. The
// switches are machine settings (`files` in settings.json, the file list's quick settings and the
// settings window); the marks belong to a project (`filemarks.rs`). And "Show in tree": any part of
// the window asks the file list to bring a file into sight.

import { useEffect, useState } from "react";
import { fileMarks, machineSettings, onSettingsChanged, setFileMark, setMachineSetting, type FileMarks } from "./backend";
import type { ScratchKind } from "./scratch";

export interface FileSettings {
  /** What git ignores counts as hidden */
  gitIgnored: boolean;
  /** Hidden things: faded in the list, or not shown at all */
  look: "dim" | "hide";
  /** The dot of the session that changed a file stays until the next commit instead of two minutes */
  keepDots: boolean;
  /** Files with @ai hints carry a mark */
  hints: boolean;
  /** Hidden in every project unless shown there again: a name (any depth) or a path */
  defaults: string[];
}

export const FILE_DEFAULTS: FileSettings = { gitIgnored: true, look: "dim", keepDots: false, hints: true, defaults: [".scratch"] };

const KEY = "files";
let current: FileSettings = FILE_DEFAULTS;
const listeners = new Set<(s: FileSettings) => void>();
const publish = (next: FileSettings) => {
  current = next;
  listeners.forEach((l) => l(next));
};
const load = () =>
  machineSettings()
    .then((m) => publish({ ...FILE_DEFAULTS, ...((m[KEY] as Partial<FileSettings> | undefined) ?? {}) }))
    .catch(() => {});
void load();
onSettingsChanged(() => void load());

/** The file list's settings, and a way to change some of them (kept for this machine, every window). */
export function useFileSettings(): [FileSettings, (change: Partial<FileSettings>) => void] {
  const [settings, setSettings] = useState(current);
  useEffect(() => {
    listeners.add(setSettings);
    setSettings(current);
    return () => void listeners.delete(setSettings);
  }, []);
  const change = (part: Partial<FileSettings>) => {
    const next = { ...current, ...part };
    publish(next);
    void setMachineSetting(KEY, next);
  };
  return [settings, change];
}

const NO_MARKS: FileMarks = { hidden: [], shown: [], important: [] };

/** The project's marks, and a way to set one; read again when the project changes. */
export function useFileMarks(
  project: string | undefined,
): [FileMarks, (kind: "hidden" | "shown" | "important" | "kept", path: string, on: boolean) => void, () => void] {
  const [marks, setMarks] = useState<FileMarks>(NO_MARKS);
  // Read again when the backend changed them itself (marks follow a moved or renamed file)
  const [round, reread] = useState(0);
  useEffect(() => {
    if (!project) return setMarks(NO_MARKS);
    let alive = true;
    fileMarks()
      .then((m) => alive && setMarks(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project, round]);
  useEffect(() => setMarks(NO_MARKS), [project]);
  const set = (kind: "hidden" | "shown" | "important" | "kept", path: string, on: boolean) =>
    void setFileMark(kind, path, on)
      .then(setMarks)
      .catch((e) => console.error(e));
  return [marks, set, () => reread((n) => n + 1)];
}

/** `path` is `base` or lies below it. */
export const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Why a path is hidden, if it is: the user's own mark, the defaults, or git. */
export function hiddenBy(path: string, settings: FileSettings, marks: FileMarks, ignored: string[]): "mark" | "default" | "git" | null {
  if (marks.shown.some((s) => under(path, s))) return null;
  if (marks.hidden.some((h) => under(path, h))) return "mark";
  const parts = path.split("/");
  if (settings.defaults.some((d) => (d.includes("/") ? under(path, d) : parts.includes(d)))) return "default";
  if (settings.gitIgnored && ignored.some((i) => under(path, i))) return "git";
  return null;
}

/** Marked important: the path itself (not what lies below a marked folder). */
export const isImportant = (path: string, marks: FileMarks) => marks.important.includes(path);

const revealers = new Set<(path: string) => void>();

/** Brings a file or folder of the project into sight in the file list ("Show in tree"). */
export function revealInTree(path: string) {
  revealers.forEach((r) => r(path));
}

/** For the file list: called with the path to show. */
export function onReveal(callback: (path: string) => void): () => void {
  revealers.add(callback);
  return () => void revealers.delete(callback);
}

const kindShowers = new Set<(kind: ScratchKind | null) => void>();

/** The file list shows the scratch files of one kind, newest first (from the scratch line, U8.5). */
export function showScratchKind(kind: ScratchKind | null) {
  kindShowers.forEach((s) => s(kind));
}

export function onScratchKind(callback: (kind: ScratchKind | null) => void): () => void {
  kindShowers.add(callback);
  return () => void kindShowers.delete(callback);
}
