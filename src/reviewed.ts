// Files the user ticked as "looked at". A tick belongs to the change as it was shown: when the
// file changes again its diff is another one and the tick is gone by itself.

import { useEffect, useState } from "react";
import type { FileDiff } from "./diff";

const STORE_KEY = "codedeck.reviewed";
/** Ticks remembered; the oldest go first. */
const KEPT = 400;

function load(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

let ticked = new Set<string>(load());
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

export function toggleReviewed(key: string) {
  const next = new Set(ticked);
  if (!next.delete(key)) next.add(key);
  ticked = new Set([...next].slice(-KEPT));
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...ticked]));
  } catch {
    // Remembering across restarts is a convenience only
  }
  listeners.forEach((l) => l());
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
