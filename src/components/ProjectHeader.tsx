import { Tooltip, ToolTipBody } from "./Tooltip";
import { useEffect, useRef, useState } from "react";
import type { AssistantState, ProjectInfo } from "../backend";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { useProjectLook } from "../projectLook";
import { ProjectMark } from "./ProjectMark";
import { t } from "../i18n";

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
export function PathBar({ project, onToggleLog, assistant }: { project: ProjectInfo | null; onToggleLog: () => void; assistant: AssistantState }) {
  const crumbs = project?.crumbs ?? [];
  const look = useProjectLook(project?.path);
  const name = crumbs[crumbs.length - 1]?.label ?? project?.root ?? "";
  // Where it lives: the folders above it, the home folder as ~
  const where = (project?.root ?? "").replace(/\/[^/]*\/?$/, "").replace(/^\/home\/[^/]+/, "~") || "/";
  return (
    <Tooltip
      area
      className="block shrink-0"
      content={
        <ToolTipBody
          says={t("Your project's files. At the top is the open project and where it lives, below it the file tree. Folders and files that sessions touched are marked in their colour.")}
          hint={t("The paperclip attaches a file to your next prompt; a double click opens it.")}
        />
      }
    >
    {/* `zone-tabs`: the row of headers across the window is one region, the controls (docs/STYLING.md, `zones`) */}
    <header className="zone-tabs relative shrink-0 border-b border-line bg-panel">
      {/* 43 px plus the border: the same 44 px as the headers beside it, so their lines meet */}
      <div className="flex h-[43px] items-center gap-1 pr-1.5 pl-3">
        {project && (
          <span className="flex min-w-0 items-center gap-2.5" title={project.root}>
            {look && <ProjectMark mark={look.mark} color={look.color} name={look.name} size={28} />}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold text-slate-100">{name}</span>
              <span className="truncate font-mono text-[11px] text-slate-500">{where}</span>
            </span>
          </span>
        )}
        <span className="flex-1" />
        <QuickSettings />
        <AppMenu onToggleLog={onToggleLog} assistant={assistant} />
      </div>
    </header>
    </Tooltip>
  );
}
