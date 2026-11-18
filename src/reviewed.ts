// Files the user marked as "viewed". A mark belongs to the change as it was shown: when the
// file changes again its diff is another one and the mark is gone by itself. Viewing is a
// review aid only; it never decides what goes into a commit.

import { useEffect, useState } from "react";
import type { FileDiff } from "./diff";
import type { ChangeScope } from "./changes";

const STORE_KEY = "codedeck.reviewed";
const SEEN_KEY = "codedeck.reviewed.seen";
/** Marks remembered; the oldest go first. */
const KEPT = 400;

function load<T>(key: string, fallback: T, valid: (v: unknown) => boolean): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return valid(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

let ticked = new Set<string>(load<string[]>(STORE_KEY, [], Array.isArray).filter((k) => typeof k === "string"));
// Where a file was viewed (scope and path) and the change it was viewed at. Lets a file that
// changed afterwards say so instead of only losing its mark without a word
let seen = new Map<string, string>(
  Object.entries(load<Record<string, string>>(SEEN_KEY, {}, (v) => typeof v === "object" && v !== null && !Array.isArray(v))),
);
const listeners = new Set<() => void>();

/** A short fingerprint of a text. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * What stands for one file's change: where it is and what the diff says.
 *
 * @param repo project-relative path of the repository
 * @param path repository-relative
 * @param file its diff; without one (the patch was cut off) `counts` stands in
 */
export function reviewKey(repo: string, path: string, file: FileDiff | undefined, counts = ""): string {
  const said = file ? file.hunks.map((h) => h.lines.map((l) => l.kind[0] + l.text).join("\n")).join("\n@@\n") : counts;
  return `${repo}\n${path}\n${hash(`${file?.status ?? ""}${said}`)}`;
}

/**
 * Where a file's change is looked at: the same file in the same view (uncommitted, one turn,
 * one commit). HEAD is part of it, so after a commit an earlier look does not count as
 * "changed since": the new changes are new, not a change of what was seen.
 */
export function reviewSlot(scope: ChangeScope | null, key: string): string {
  const where = scope ? `${scope.range.join(" ")}\n${scope.repo.head ?? ""}` : "";
  return `${where}\n${key.slice(0, key.lastIndexOf("\n"))}`;
}

function save() {
  ticked = new Set([...ticked].slice(-KEPT));
  seen = new Map([...seen].slice(-KEPT));
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...ticked]));
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(seen)));
  } catch {
    // Remembering across restarts is a convenience only
  }
  listeners.forEach((l) => l());
}

/** Marks or unmarks a file's change as viewed; `slot` from `reviewSlot`. */
export function toggleReviewed(key: string, slot: string) {
  ticked = new Set(ticked);
  seen = new Map(seen);
  if (ticked.delete(key)) {
    seen.delete(slot);
  } else {
    ticked.add(key);
    seen.delete(slot); // to the end: the newest stays longest
    seen.set(slot, key);
  }
  save();
}

export function useReviewed(): (key: string) => boolean {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return (key) => ticked.has(key);
}

/** Whether the file was viewed here, but its change is another one now. */
export function changedSinceViewed(key: string, slot: string): boolean {
  const then = seen.get(slot);
  return then !== undefined && then !== key && !ticked.has(key);
}
