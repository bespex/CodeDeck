// The parts the zones of the Workbench share (roadmap U8.4). A zone is a quiet surface of its own,
// lighter than the plan's, never framed by a line (docs/UMSETZUNG.md "U8 und U9": tiles must not
// bring new lines); its heading has a symbol and a count, its rows a symbol per kind, the title in
// full strength and what else there is to say quietly at the right.

import type { ReactNode } from "react";
import { CircleHelp, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText, File as FileIcon, type LucideIcon } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { scratchKind } from "../../scratch";
import { t } from "../../i18n";

export function Zone({ children }: { children: ReactNode }) {
  // A container of its own: its lists go to two columns by the zone's width, not the window's
  return <section className="@container/zone min-w-0 rounded-lg bg-raised/25 px-3 pt-2.5 pb-3">{children}</section>;
}

export function ZoneHead({ icon: Icon, title, count, note, aside, help }: { icon: LucideIcon; title: string; count?: number; note?: string; aside?: ReactNode; help?: ReactNode }) {
  return (
    <h3 className="mb-2 flex min-h-7 items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ai/15 text-ai">
        <Icon className="size-3.5" />
      </span>
      <span className="text-[14px] font-semibold text-slate-100">{title}</span>
      {!!count && <span className="rounded-full bg-raised px-1.5 text-[11px] font-semibold text-slate-300 tabular-nums">{count}</span>}
      {note && <span className="truncate text-[12px] font-normal text-slate-500">{note}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1 font-normal">
        {aside}
        {help && (
          <Tooltip content={<span className="flex flex-col">{help}</span>}>
            <span className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label={t("More about this")}>
              <CircleHelp className="size-3.5" />
            </span>
          </Tooltip>
        )}
      </span>
    </h3>
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
  const cls = tone === "changed" ? "bg-changed/15 text-changed" : "bg-moved/15 text-moved";
  return <span className={`rounded px-1 py-px text-[10px] font-medium ${cls}`}>{children}</span>;
}

const KIND_ICON: Record<string, [LucideIcon, string]> = {
  draft: [FileText, "text-moved"],
  image: [FileImage, "text-added"],
  script: [FileCode, "text-ai"],
  data: [FileSpreadsheet, "text-changed"],
  backup: [FileArchive, "text-slate-400"],
  other: [FileIcon, "text-slate-400"],
};

/** The symbol of a file by its kind, in the kind's colour: the eye finds pictures, code and data. */
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
