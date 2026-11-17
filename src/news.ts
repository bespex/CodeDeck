// What in the Workbench is new to the user: what came since they last looked there, like unread mail.
// A time span ("changed in the last 24 hours") marks what one has long seen after a long day.
//
// Per project and machine (`localStorage`) CodeDeck keeps when the Workbench was last looked at and the
// entries seen then, each with the time it had (a scratch file's change, a write, a mention). The
// Workbench, its tab and the summary report their entries here and ask what is new.
//
//   new      not there at the last look
//   changed  a scratch file there at the last look, changed since
//
// Seen is what was there when the user leaves the Workbench after looking at least LOOK_MS, or an entry
// they click on. During a look the marks stay, so they help finding; what comes during it is new as well.
// On the first look ever only what is younger than FIRST_LOOK_MS counts as new, else everything would.

import { useEffect, useState } from "react";

export type News = "new" | "changed";

/** One entry of the Workbench: a key that stays the same for it, and the time that says it changed. */
export interface NewsItem {
  key: string;
  time: number;
  /** Only scratch files can be "changed"; a page mentioned again or a hint moved is not new */
  changes?: boolean;
}

const LOOK_MS = 2000;
const FIRST_LOOK_MS = 3600_000;

interface Seen {
  at: number;
  keys: Record<string, number>;
}

let project: string | null = null;
let seen: Seen | null = null;
/** The record as it was when the current look began; marks are computed against it */
let baseline: Seen | null = null;
let lookStart: number | null = null;
const sources = new Map<string, NewsItem[]>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const storeKey = (path: string) => `codedeck.seen:${path}`;
function read(path: string): Seen | null {
  try {
    const value = JSON.parse(localStorage.getItem(storeKey(path)) ?? "null");
    return value && typeof value.at === "number" && value.keys ? value : null;
  } catch {
    return null;
  }
}
function write() {
  if (project && seen) localStorage.setItem(storeKey(project), JSON.stringify(seen));
}

/** The project of this window; what was seen is remembered per project. */
export function setNewsProject(path: string | null) {
  if (path === project) return;
  project = path;
  seen = path ? read(path) : null;
  baseline = seen;
  sources.clear();
  changed();
}

/** One source of entries (scratch folder, files left outside, pages, hints) tells what it has now. */
export function reportNews(source: string, items: NewsItem[]) {
  const before = sources.get(source);
  if (before && before.length === items.length && before.every((b, i) => b.key === items[i].key && b.time === items[i].time)) return;
  sources.set(source, items);
  changed();
}

/** What an entry is to the user right now. */
export function newsOf(item: NewsItem): News | null {
  const record = lookStart !== null ? baseline : seen;
  if (!record) return item.time > Date.now() - FIRST_LOOK_MS ? "new" : null;
  const then = record.keys[item.key];
  if (then === undefined) return "new";
  return item.changes && item.time > then ? "changed" : null;
}

/** The user clicked on it: seen, at once. */
export function markSeen(item: NewsItem) {
  if (!project) return;
  seen = { at: seen?.at ?? Date.now(), keys: { ...seen?.keys, [item.key]: item.time } };
  if (baseline) baseline = { ...baseline, keys: { ...baseline.keys, [item.key]: item.time } };
  else baseline = seen;
  write();
  changed();
}

/** The Workbench opens or closes. Leaving after a real look makes everything there seen. */
export function lookingAtWorkbench(on: boolean) {
  if (on && lookStart === null) {
    lookStart = Date.now();
    baseline = seen;
  } else if (!on && lookStart !== null) {
    const looked = Date.now() - lookStart >= LOOK_MS;
    lookStart = null;
    if (looked && project) {
      const keys: Record<string, number> = {};
      for (const items of sources.values()) for (const i of items) keys[i.key] = i.time;
      seen = { at: Date.now(), keys };
      write();
    }
    baseline = seen;
  }
  changed();
}

/** How many entries are new or changed. */
export function newsCount(): number {
  let n = 0;
  for (const items of sources.values()) for (const i of items) if (newsOf(i)) n++;
  return n;
}

/** Draws again when what is new changes. */
export function useNews(): { count: number; of: (item: NewsItem) => News | null } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const l = () => redraw((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { count: newsCount(), of: newsOf };
}

/* Keys: the same entry has the same key on every look */
export const scratchKey = (path: string) => `scratch:${path}`;
export const outsideKey = (path: string) => `outside:${path}`;
export const pageKey = (url: string) => `page:${url}`;
/** A hint is its file and words: moved to another line it is the same hint */
export const hintKey = (path: string, text: string) => `hint:${path}\n${text}`;
