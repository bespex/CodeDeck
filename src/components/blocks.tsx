// The five forms a deck view is built from (docs/KONZEPT.md 4.7): what has a different job looks
// different, so the eye is led. A view uses these instead of framing everything as equal cards.
//
//   Toolbar   choosing and triggering: flush on top, in the grey of the side columns
//   Section   reporting and explaining: heading and running text straight on the surface
//   Rows/Row  listing: plain lines with a hairline, only the chosen one has a background
//   Document  the subject itself (a diff, a timeline, the attachments' text): the one framed element
//   Decision  something you have to decide: lighter, with a shadow, there only when needed

import type { ReactNode } from "react";

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex min-h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 py-1 text-[12px] text-slate-400">
      {children}
    </div>
  );
}

export function Section(props: { title: ReactNode; note?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-4 pt-5 first:pt-4 last:pb-4">
      <header className="mb-1.5 flex min-h-6 items-center gap-2">
        <h3 className="text-[14px] font-semibold text-slate-100">{props.title}</h3>
        {props.note && <span className="text-[12px] text-slate-500">{props.note}</span>}
        {props.aside && <div className="ml-auto flex items-center gap-1.5">{props.aside}</div>}
      </header>
      <div className="text-slate-400">{props.children}</div>
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line/70 border-y border-line/70">{children}</ul>;
}

export function Row(props: { selected?: boolean; className?: string; children: ReactNode }) {
  return (
    <li className={`group flex min-h-8 items-center gap-2 px-1 py-1 ${props.selected ? "bg-raised" : ""} ${props.className ?? ""}`}>
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
