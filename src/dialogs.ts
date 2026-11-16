// Which dialog is open over the window: settings, About, keyboard shortcuts. One at a time; any
// component can open one, `Dialogs` in `App` shows it.

import { useSyncExternalStore } from "react";

export type SettingsSection = "general" | "notifications" | "tools";
export type DialogState = { kind: "settings"; section: SettingsSection } | { kind: "about" } | { kind: "shortcuts" } | null;

let current: DialogState = null;
const listeners = new Set<() => void>();

export function openDialog(next: DialogState) {
  current = next;
  listeners.forEach((l) => l());
}
export const closeDialog = () => openDialog(null);

export const useDialog = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
