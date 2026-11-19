// What is attached to the next prompt, one part per kind (files, changes, line comments, hints),
// all built the same way (D20, D21). A part keeps its items here, in the window; the backend holds
// its text until a prompt takes it.
//
// Every change to a part counts up its revision, and each item remembers the revision it came
// with. The receipt of a prompt names the revision of each part that went out, so exactly those
// items go; what was added while the prompt was being sent stays and is attached again. Without
// this, an item added in that moment was lost, or an old one went out twice.

import { useEffect, useState } from "react";
import { assistantState, attach, onAssistantChanged, type AssistantState } from "./backend";
import { mainHarness } from "./assistant";
import { recall, remember } from "./projectMemory";

export interface Part<T> {
  key: string;
  items: () => T[];
  has: (id: string) => boolean;
  /** Adds what is not attached yet */
  add: (items: T[]) => void;
  remove: (ids: string[]) => void;
  /** Removes them if all are attached, else attaches them */
  toggle: (items: T[]) => void;
  clear: () => void;
  /** The items, for a component: it is drawn again when they change */
  use: () => T[];
}

interface Store {
  key: string;
  sync: () => void;
  sent: (rev: number) => void;
  clear: () => void;
  empty: () => boolean;
  /** Its items with their revisions, to come back with the project (`switchAttachments`) */
  save: () => unknown;
  restore: (saved: unknown) => void;
}

const stores = new Map<string, Store>();
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

/** The state as last heard, and whether the tool takes attachments with a prompt. */
let current: AssistantState | null = null;
let enabled = false;

export function createPart<T>(
  key: string,
  options: {
    id: (item: T) => string;
    text: (items: T[]) => string;
    label: (items: T[]) => string;
    /** Told which items went out with a prompt */
    onSent?: (items: T[]) => void;
  },
): Part<T> {
  let entries: { item: T; rev: number }[] = [];
  let rev = 0;
  const items = () => entries.map((e) => e.item);
  const sync = () => {
    if (!enabled) return;
    const list = items();
    void attach(key, list.length ? options.text(list) : null, options.label(list), rev);
  };
  const change = (next: { item: T; rev: number }[]) => {
    entries = next;
    rev += 1;
    publish();
    sync();
  };
  const ids = (list: T[]) => new Set(list.map(options.id));
  const part: Part<T> = {
    key,
    items,
    has: (id) => entries.some((e) => options.id(e.item) === id),
    add: (list) => {
      const known = ids(items());
      const fresh = list.filter((i) => !known.has(options.id(i)));
      if (fresh.length) change([...entries, ...fresh.map((item) => ({ item, rev: rev + 1 }))]);
    },
    remove: (gone) => {
      const set = new Set(gone);
      if (entries.some((e) => set.has(options.id(e.item)))) change(entries.filter((e) => !set.has(options.id(e.item))));
    },
    toggle: (list) => (list.every((i) => part.has(options.id(i))) ? part.remove(list.map(options.id)) : part.add(list)),
    clear: () => {
      if (entries.length) change([]);
    },
    use: () => {
      const [, redraw] = useState(0);
      useEffect(() => {
        const listener = () => redraw((n) => n + 1);
        listeners.add(listener);
        return () => void listeners.delete(listener);
      }, []);
      return items();
    },
  };
  stores.set(key, {
    key,
    sync,
    sent: (sentRev) => {
      const gone = entries.filter((e) => e.rev <= sentRev);
      if (!gone.length) return;
      entries = entries.filter((e) => e.rev > sentRev);
      publish();
      options.onSent?.(gone.map((e) => e.item));
      // Added while the prompt was being sent: attached again, on its own
      if (entries.length) sync();
    },
    clear: () => {
      entries = [];
      publish();
    },
    empty: () => entries.length === 0,
    save: () => ({ entries, rev }),
    restore: (saved) => {
      const s = saved as { entries: { item: T; rev: number }[]; rev: number } | undefined;
      entries = s?.entries ?? [];
      // Revisions only ever count up: a receipt of the project's last prompt names one of its own
      rev = Math.max(rev, s?.rev ?? 0);
      publish();
    },
  });
  return part;
}

/** Removes a whole part: from the list here and from the next prompt. */
export function removeAttachment(key: string) {
  stores.get(key)?.clear();
  void attach(key, null);
}

/**
 * The window shows another project: what was attached to the old one stays with it (its bridge in the
 * backend keeps the text, so its next prompt still gets it), what the new one had comes back.
 */
export function switchAttachments(from: string | null, to: string | null) {
  remember(from, "attachments", Object.fromEntries([...stores].map(([key, s]) => [key, s.save()])));
  const saved = recall<Record<string, unknown>>(to, "attachments") ?? {};
  stores.forEach((s, key) => s.restore(saved[key]));
  // Called once the backend shows the new project: compared with what it holds for it now
  void assistantState().then(reconcile);
}

/** The backend may have let the project go meanwhile (not on my list, no window): then what came back
 *  here is sent again; what only the backend still has is dropped, as after a reload of the window. */
function reconcile(state: AssistantState) {
  if (!enabled) return;
  for (const store of stores.values()) {
    const there = state.attachments.some((a) => a.key === store.key);
    if (!store.empty() && !there) store.sync();
    else if (store.empty() && there) void attach(store.key, null);
  }
}

let lastReceipt = "";

/** Takes in every state of the backend, not only the ones React gets to draw. */
function heard(state: AssistantState) {
  const first = current === null;
  current = state;
  const was = enabled;
  enabled = mainHarness(state).capabilities.attach === "withNextPrompt";
  if (enabled && (!was || first)) {
    // Now possible, or this window is new: what is here goes out, what only the backend still has
    // (from before the window was reloaded) is gone
    for (const store of stores.values()) {
      if (!store.empty()) store.sync();
      else if (state.attachments.some((a) => a.key === store.key)) void attach(store.key, null);
    }
  }
  const d = state.delivered;
  const receipt = d ? `${d.session}:${d.at}` : "";
  if (d && receipt !== lastReceipt) {
    lastReceipt = receipt;
    for (const p of d.parts) stores.get(p.key)?.sent(p.rev);
  }
  if (was !== enabled) publish();
}

let started = false;
/** Once for the window. */
export function useAttachments() {
  useEffect(() => {
    if (started) return;
    started = true;
    assistantState().then(heard, () => {});
    onAssistantChanged(heard);
  }, []);
}

/** The state as last heard, for decisions outside of drawing (e.g. who a first comment is for). */
export const lastState = () => current;

/** Whether the tool takes attachments with a prompt; components offer attaching only then. */
export function useAttachEnabled(): boolean {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return enabled;
}
