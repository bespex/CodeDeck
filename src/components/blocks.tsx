// The five forms a deck view is built from (docs/KONZEPT.md 4.7): what has a different job looks
// different, so the eye is led. A view uses these instead of framing everything as equal cards.
//
//   Toolbar   choosing and triggering: flush on top, in the grey of the side columns
//   Section   reporting and explaining: heading and running text straight on the surface
//   Rows/Row  listing: plain lines with a hairline, only the chosen one has a background
//   Document  the subject itself (a diff, a timeline, the attachments' text): the one framed element
//   Decision  something you have to decide: lighter, with a shadow, there only when needed

import { useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { plural, t } from "../i18n";

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 py-1 text-[12px] text-slate-400">
      {children}
    </div>
  );
}

/**
 * A heading with its content. `fold` makes it one that can be closed: the heading with its note
 * (a count) stays, so a closed section still says what is in it. `help` is the longer explanation,
 * behind a "?" beside the heading; the section itself says it in one line.
 */
export function Section(props: {
  title: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  help?: ReactNode;
  fold?: { open: boolean; toggle: () => void };
  children: ReactNode;
}) {
  const open = props.fold?.open ?? true;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    // No extra lines (a view has enough): sections are told apart by room above and a faint band behind the heading
    <section className="pb-1 first:pt-0 last:pb-4 [&:not(:first-child)]:pt-5">
      <header className={`${open ? "mb-2" : ""} flex min-h-9 items-center gap-2 border-y border-line/40 bg-raised/40 px-4`}>
        {props.fold ? (
          <button type="button" aria-expanded={open} onClick={props.fold.toggle} className="-ml-1 flex min-w-0 items-center gap-1 rounded px-1 hover:bg-raised">
            <Chevron className="size-3.5 shrink-0 text-slate-500" />
            <h3 className="truncate text-[14px] font-semibold text-slate-100">{props.title}</h3>
          </button>
        ) : (
          <h3 className="text-[14px] font-semibold text-slate-100">{props.title}</h3>
        )}
        {props.note && <span className="truncate text-[12px] text-slate-500">{props.note}</span>}
        {/* The buttons, then the "?" always at the far right, the same in every section */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {props.aside && open && props.aside}
          {props.help && (
            <Tooltip content={<span className="flex flex-col">{props.help}</span>}>
              <span className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label={t("More about this")}>
                <CircleHelp className="size-3.5" />
              </span>
            </Tooltip>
          )}
        </div>
      </header>
      {open && <div className="px-4 text-slate-400">{props.children}</div>}
    </section>
  );
}

/**
 * Whether a section is open, kept for this machine once chosen; until then `auto` decides (e.g.
 * closed while it holds a long list).
 */
export function useFold(key: string, auto: boolean): { open: boolean; toggle: () => void } {
  const storeKey = `codedeck.fold.${key}`;
  const [chosen, setChosen] = useState<boolean | null>(() => {
    const v = localStorage.getItem(storeKey);
    return v === null ? null : v === "1";
  });
  const open = chosen ?? auto;
  return {
    open,
    toggle: () => {
      localStorage.setItem(storeKey, open ? "0" : "1");
      setChosen(!open);
    },
  };
}

/** How many entries of a long list show before "Show all". */
export const SHOWN = 8;

/** A long list shows its first entries; this opens the rest, and closes them again. */
export function useShowAll<T>(items: T[], shown = SHOWN): { items: T[]; more: ReactNode } {
  const [all, setAll] = useState(false);
  const hidden = items.length - shown;
  if (hidden <= 1) return { items, more: null };
  return {
    items: all ? items : items.slice(0, shown),
    more: (
      <button type="button" onClick={() => setAll(!all)} className="mt-1 px-1 text-[12px] text-slate-500 hover:text-slate-200">
        {all ? t("Show fewer") : t("Show all {count}", { count: plural(items.length, "item") })}
      </button>
    ),
  };
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line/70 border-y border-line/70">{children}</ul>;
}

export function Row(props: { selected?: boolean; className?: string; children: ReactNode; onContextMenu?: (e: ReactMouseEvent) => void; onDoubleClick?: () => void; title?: string }) {
  return (
    <li onContextMenu={props.onContextMenu} onDoubleClick={props.onDoubleClick} title={props.title} className={`group flex min-h-8 items-center gap-2 px-1 py-1 ${props.selected ? "bg-raised" : ""} ${props.className ?? ""}`}>
      {props.children}
    </li>
  );
}

export function Document({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel ${className}`}>{children}</div>;
}

export function Decision(props: { icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-overlay-line bg-overlay px-3 py-2 text-slate-200 shadow-lg shadow-black/30">
      {props.icon}
      <div className="min-w-0 flex-1">{props.children}</div>
      {props.actions}
    </div>
  );
}
