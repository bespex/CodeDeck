import { Tooltip, ToolTipBody } from "./Tooltip";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ProjectInfo } from "../backend";
import { useProjectLook } from "../projectLook";
import { ProjectMark } from "./ProjectMark";
import { t } from "../i18n";

/** Opens a directory: here, or in a new window of its own. */
export type OpenProject = (path: string, newWindow: boolean) => Promise<void>;

/** Ctrl+click and middle click open in a new window, as with links in a browser. */
const wantsNewWindow = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.button === 1;

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

/** Opening a project, with the error it may give shown for a while. */
function useOpen(onOpen: OpenProject, done: () => void) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  const open = async (path: string, newWindow: boolean) => {
    done();
    try {
      await onOpen(path, newWindow);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };
  return { open, error };
}

/**
 * Head of the file list: the path of the project. Every folder above it can be clicked to make it
 * the project (Ctrl+click: in a new window). The project itself is named in the header bar on the
 * right, which stays in every form of CodeDeck.
 */
export function PathBar({ project, onOpen }: { project: ProjectInfo | null; onOpen: OpenProject }) {
  const { open, error } = useOpen(onOpen, () => {});
  const crumbs = project?.crumbs ?? [];
  const look = useProjectLook(project?.path);
  const name = crumbs[crumbs.length - 1]?.label ?? project?.root ?? "";
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
      <div className="flex h-[43px] items-center gap-3 px-3">
        {/* The project itself, large: the project picker lives in the right column, so this is where you see what is open */}
        {project && (
          <span className="flex max-w-[55%] shrink-0 items-center gap-2.5" title={project.root}>
            {look && <ProjectMark mark={look.mark} color={look.color} name={look.name} size={28} />}
            <span className="truncate text-[15px] leading-none font-semibold text-slate-100">{name}</span>
          </span>
        )}
        {/* The way there is quiet; a long path is cut off on the left, the nearest folders stay visible */}
        <nav aria-label={t("Path")} className="flex min-w-0 flex-1 justify-end overflow-hidden font-mono text-[11px] whitespace-nowrap text-slate-500">
          {crumbs.slice(0, -1).map((crumb, i) => {
            const separator = i > 0 && crumbs[i - 1].label !== "/";
            return (
              <span key={crumb.path} className="flex shrink-0 items-center">
                {separator && <span className="text-slate-600">/</span>}
                <button
                  type="button"
                  title={t("Open {path} here · Ctrl+click: new window", { path: crumb.path })}
                  onClick={(e) => open(crumb.path, wantsNewWindow(e))}
                  onAuxClick={(e) => e.button === 1 && open(crumb.path, true)}
                  className="rounded px-px hover:bg-raised hover:text-slate-200"
                >
                  {crumb.label}
                </button>
              </span>
            );
          })}
        </nav>
      </div>
      {error && <p className="selectable px-3 pb-2 text-[11px] text-problem">{error}</p>}
    </header>
    </Tooltip>
  );
}
