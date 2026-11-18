// The tools of a row, shown while the mouse is on it: one look for every list (file tree, changes,
// overview). A framed box with dividers between kinds of tools, so it reads as this row's toolbar
// and one sees what belongs together. It appears left of what a row always shows (numbers, status,
// marks) and takes its room from the name only, so nothing that is always there moves.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, ToolTipBody } from "./Tooltip";

/**
 * The box. `show` names the hover that reveals it (a Tailwind class written out in full, so the
 * build finds it); `open` keeps it shown, e.g. while a menu it opened is up. Its clicks are its own,
 * not the row's (that may fold, select or open).
 */
export function HoverTools({ show = "group-hover:flex group-has-[:focus-visible]:flex", open = false, children }: { show?: string; open?: boolean; children: ReactNode }) {
  return (
    <span
      // An empty title: the row's own tooltip (e.g. "double-click: …") stays away while the
      // tools speak with theirs, so no two tooltips show at once
      title=""
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onAuxClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={`${open ? "flex" : `hidden ${show}`} h-[22px] shrink-0 items-center gap-0.5 rounded-md border border-overlay-line bg-raised px-1`}
    >
      {children}
    </span>
  );
}

/** Between kinds of tools in the box. */
export const ToolGap = () => <span className="mx-0.5 h-3.5 w-px bg-overlay-line" />;

/** One tool: an icon, its name and what it does in the tooltip, and how else to reach it. */
export function Tool(props: {
  icon: LucideIcon;
  label: string;
  says?: ReactNode;
  /** How else to reach it, in its own quiet line */
  hint?: string;
  /** On, e.g. attached: in the accent */
  active?: boolean;
  /** Destroys something: red on hover */
  danger?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onAuxClick?: (e: React.MouseEvent) => void;
}) {
  const tone = props.active ? "text-brand-soft" : "text-slate-400";
  return (
    <Tooltip className="flex" content={<ToolTipBody label={props.label} says={props.says ?? ""} hint={props.hint} />}>
      <button
        type="button"
        aria-label={props.label}
        aria-pressed={props.active}
        disabled={props.disabled}
        onClick={props.onClick}
        onAuxClick={props.onAuxClick}
        className={`grid size-5 place-items-center rounded hover:bg-overlay-hover disabled:opacity-40 ${tone} ${props.danger ? "hover:text-problem" : "hover:text-slate-100"}`}
      >
        <props.icon className="size-3.5" />
      </button>
    </Tooltip>
  );
}

/**
 * Where a row shows at rest that something is on (attached): the place stays, so nothing moves when
 * the box appears and the same icon is its last tool. `hide` names the hover that hides it.
 */
export function AtRest({ show, hide = "group-hover:invisible group-has-[:focus-visible]:invisible", children }: { show: boolean; hide?: string; children: ReactNode }) {
  return <span className={`grid w-5 shrink-0 place-items-center ${hide}`}>{show && children}</span>;
}
