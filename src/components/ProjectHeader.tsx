import { Tooltip, ToolTipBody } from "./Tooltip";
import { useEffect, useRef, useState } from "react";
import type { AssistantState } from "../backend";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { t } from "../i18n";

/** Where a project lives: the folders above it, the home folder as ~. */
export const placeOf = (root: string) => root.replace(/\/[^/]*\/?$/, "").replace(/^\/home\/[^/]+/, "~") || "/";

/** Opens a directory: here, or in a new window of its own. */
export type OpenProject = (path: string, newWindow: boolean) => Promise<void>;

/**
 * A menu that hangs at its button and closes on a click elsewhere or Escape. `ref` goes on the
 * element around button and menu.
 */
export function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Head of the project list: the product's title with the menus about CodeDeck itself (quick settings,
 * the app menu). The logo folds the column to its rail (docs/KONZEPT.md 4.7 rule 4). The project of the
 * window is at the top of the session column (`ProjectBlock`). Plain for now; its look is still to be
 * designed (user, 2026-11-24).
 */
export function PathBar({ assistant, onFold, foldLabel }: { assistant: AssistantState; onFold: () => void; foldLabel: string }) {
  return (
    <Tooltip
      area
      className="block shrink-0"
      content={<ToolTipBody says={t("All your projects. A click on one shows it in this window.")} hint={t("A click on the logo folds the list.")} />}
    >
    {/* `zone-tabs`: the row of headers across the window is one region, the controls (docs/STYLING.md, `zones`) */}
    <header className="zone-tabs relative shrink-0 border-b border-line bg-panel">
      {/* 43 px plus the border: the same 44 px as the headers beside it, so their lines meet */}
      <div className="flex h-[43px] items-center gap-1 pr-1.5 pl-3">
        <button type="button" aria-label={foldLabel} title={foldLabel} onClick={onFold} className="shrink-0 rounded-md p-0.5 hover:bg-raised">
          <img src="/codedeck.svg" alt="" className="size-6" />
        </button>
        <span className="min-w-0 truncate text-[14px] font-semibold text-slate-100">CodeDeck</span>
        <span className="flex-1" />
        <QuickSettings />
        <AppMenu assistant={assistant} />
      </div>
    </header>
    </Tooltip>
  );
}
