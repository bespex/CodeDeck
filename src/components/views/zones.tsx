// The parts the zones of the Workbench share (roadmap U8.4). A zone is a quiet surface of its own,
// lighter than the plan's, never framed by a line (docs/UMSETZUNG.md "U8 und U9": tiles must not
// bring new lines); its heading has a symbol and a count, its rows a symbol per kind, the title in
// full strength and what else there is to say quietly at the right.

import { createContext, useContext, type ReactNode } from "react";
import { CircleHelp, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, File as FileIcon, type LucideIcon } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { scratchKind } from "../../scratch";
import { t } from "../../i18n";

export type SectionId = "plan" | "todo" | "new";

/** The symbol in a card's head: no colour (user, 2026-11-27: "no colour, but marks that structure"). */
const GLYPH: Record<SectionId, string> = { plan: "text-slate-400", todo: "text-slate-400", new: "text-slate-400" };
const SectionContext = createContext<SectionId>("todo");

/**
 * A section of the Workbench as a card: a calm surface with a hairline and a light shadow, its head
 * set off by a line, not by colour (look A of the sketch, user 2026-11-27: cards yes, but not colourful).
 * A container of its own, so its lists go to two columns by the card's width, not the window's.
 */
export function Zone({ section = "todo", children }: { section?: SectionId; children: ReactNode }) {
  return (
    <SectionContext.Provider value={section}>
      <section className="@container/zone min-w-0 overflow-hidden rounded-xl border border-line bg-panel px-3 pb-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">{children}</section>
    </SectionContext.Provider>
  );
}

/** The head of a card: symbol in the section's colour, title, count, where from, and one sentence on what is in it. */
export function ZoneHead({ icon: Icon, title, count, note, says, aside, help }: { icon: LucideIcon; title: string; count?: number; note?: ReactNode; says?: string; aside?: ReactNode; help?: ReactNode }) {
  const section = useContext(SectionContext);
  return (
    <div className="-mx-3 mb-2.5 border-b border-line/60 bg-raised/40 px-3 py-2.5">
      <div className="flex min-h-7 items-center gap-2">
        <Icon className={`size-4 shrink-0 ${GLYPH[section]}`} />
        <span className="text-[15px] font-semibold text-slate-100">{title}</span>
        {!!count && <span className="rounded-full bg-raised px-1.5 text-[11px] font-semibold text-slate-300 tabular-nums">{count}</span>}
        {note && <span className="min-w-0 truncate text-[12px] text-slate-500">{note}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {aside}
          {help && (
            <Tooltip content={<span className="flex flex-col">{help}</span>}>
              <span className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label={t("More about this")}>
                <CircleHelp className="size-3.5" />
              </span>
            </Tooltip>
          )}
        </span>
      </div>
      {says && <div className="pl-6 text-[12px] text-slate-500">{says}</div>}
    </div>
  );
}

/** Nothing in a zone: one calm line with a symbol, not an empty box. */
export function ZoneEmpty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-md px-1 py-1.5 text-[12px] text-slate-500">
      <Icon className="size-4 shrink-0 text-slate-600" />
      <span>{children}</span>
    </p>
  );
}

export function ZoneRow(props: {
  icon: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  /** Quiet, at the right before the tools: size, time */
  meta?: ReactNode;
  aside?: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <li
      title={props.title}
      onClickCapture={props.onClick}
      onDoubleClick={props.onDoubleClick}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      className={`group flex min-h-9 items-center gap-2.5 rounded-md px-1.5 py-1 hover:bg-raised/60 ${props.className ?? ""}`}
    >
      <span className="flex w-7 shrink-0 justify-center">{props.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-slate-200">{props.children}</span>
        {props.sub && <span className="block truncate text-[11px] text-slate-500">{props.sub}</span>}
      </span>
      {props.meta && <span className="shrink-0 text-right text-[11px] whitespace-nowrap text-slate-500 tabular-nums">{props.meta}</span>}
      {props.aside && <span className="flex shrink-0 items-center gap-0.5">{props.aside}</span>}
    </li>
  );
}

/**
 * A file on one line, for long lists (New): symbol, name, a short tag, the size in a column of its
 * own so sizes line up, and the tools laid over the right end on hover instead of taking room.
 * What stays lit at rest (kept, attached) shows after the name.
 */
export function ZoneLine(props: {
  icon: ReactNode;
  name: ReactNode;
  tag?: ReactNode;
  rest?: ReactNode;
  meta?: ReactNode;
  tools?: ReactNode;
  title?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <li
      title={props.title}
      onClickCapture={props.onClick}
      onDoubleClick={props.onDoubleClick}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      className="group relative flex h-7 min-w-0 items-center gap-2 rounded px-1.5 hover:bg-raised/60"
    >
      <span className="flex w-4 shrink-0 justify-center">{props.icon}</span>
      <span className="min-w-0 truncate text-[13px] text-slate-200">{props.name}</span>
      {props.tag && <span className="shrink-0">{props.tag}</span>}
      {props.rest && <span className="flex shrink-0 items-center gap-0.5">{props.rest}</span>}
      <span className="flex-1" />
      <span className="w-14 shrink-0 text-right text-[11px] whitespace-nowrap text-slate-500 tabular-nums">{props.meta}</span>
      {props.tools && (
        <span className="absolute inset-y-0 right-0 hidden items-center gap-0.5 rounded-r bg-raised pr-1 pl-2 group-focus-within:flex group-hover:flex">{props.tools}</span>
      )}
    </li>
  );
}

/** A short coloured word after a name: where a file lies when that is the news (outside the project). */
export function ZoneTag({ tone = "changed", children }: { tone?: "changed" | "moved"; children: ReactNode }) {
  // A frame, not a colour; `tone` is kept for the callers
  void tone;
  return <span className="rounded border border-line px-1 text-[10px] font-medium text-slate-300">{children}</span>;
}

const KIND_ICON: Record<string, [LucideIcon, string]> = {
  draft: [FileText, "text-slate-400"],
  image: [FileImage, "text-slate-400"],
  script: [FileCode, "text-slate-400"],
  data: [FileSpreadsheet, "text-slate-400"],
  backup: [FileArchive, "text-slate-400"],
  other: [FileIcon, "text-slate-400"],
};

/** The symbol of a file by its kind: its shape tells pictures, code and data apart, without colour. */
export function KindIcon({ path }: { path: string }) {
  const [Icon, tone] = KIND_ICON[scratchKind(path)] ?? KIND_ICON.other;
  return <Icon className={`size-4 ${tone}`} />;
}

/** "all 12" / "fewer" under a zone's first entries. */
export function MoreButton({ all, count, onClick }: { all: boolean; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 ml-10 text-[12px] text-slate-500 hover:text-slate-200">
      {all ? t("Show fewer") : t("all {n}", { n: count })}
    </button>
  );
}
