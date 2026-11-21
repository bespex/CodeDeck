import { Tooltip, ToolTipBody } from "./Tooltip";
import { useEffect, useRef, useState } from "react";
import type { AssistantState, ProjectInfo } from "../backend";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { useProjectLook } from "../projectLook";
import { inkOn, ProjectMark } from "./ProjectMark";
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
 * Head of the file list, the counterpart of the account block on the right: the project's mark, its
 * name and below it, quiet, where it lives; at the right the menus about CodeDeck itself (quick
 * settings, the app menu). Projects are opened in the overview.
 */
export function PathBar({ project, assistant, onFold, foldLabel }: { project: ProjectInfo | null; assistant: AssistantState; onFold: () => void; foldLabel: string }) {
  const crumbs = project?.crumbs ?? [];
  const look = useProjectLook(project?.path);
  const name = crumbs[crumbs.length - 1]?.label ?? project?.root ?? "";
  // Where it lives: the folders above it, the home folder as ~
  // The bar takes the project's colour: one look at the top left says which project this is
  const fill = look ? (look.mark?.color ?? look.color) : null;
  const ink = fill ? inkOn(fill) : undefined;
  const where = placeOf(project?.root ?? "");
  return (
    <Tooltip
      area
      className="block shrink-0"
      content={
        <ToolTipBody
          says={t("The project shown in this window and where it lives; below it all your projects. A click on one shows it here.")}
          hint={t("A click on the mark folds the list.")}
        />
      }
    >
    {/* `zone-tabs`: the row of headers across the window is one region, the controls (docs/STYLING.md, `zones`) */}
    <header className="zone-tabs relative shrink-0 border-b border-line bg-panel" style={fill ? { background: fill, color: ink } : undefined}>
      {/* 43 px plus the border: the same 44 px as the headers beside it, so their lines meet */}
      <div className="flex h-[43px] items-center gap-1 pr-1.5 pl-3">
        {project && (
          <span className="flex min-w-0 items-center gap-2.5" title={project.root}>
            {/* The mark folds the column it heads to its rail, where the same mark opens it again (docs/KONZEPT.md 4.7 rule 4) */}
            {look && (
              <button
                type="button"
                aria-label={foldLabel}
                title={foldLabel}
                onClick={onFold}
                className="shrink-0 rounded-md hover:bg-black/15"
              >
                <ProjectMark mark={look.mark} color={look.color} name={look.name} size={32} shape="bare" />
              </button>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className={`truncate text-[14px] font-semibold ${fill ? "" : "text-slate-100"}`}>{name}</span>
              <span className={`truncate font-mono text-[11px] ${fill ? "opacity-70" : "text-slate-500"}`}>{where}</span>
            </span>
          </span>
        )}
        <span className="flex-1" />
        <QuickSettings onColor={!!fill} />
        <AppMenu assistant={assistant} onColor={!!fill} />
      </div>
    </header>
    </Tooltip>
  );
}
