import { Tooltip, ToolTipBody } from "./Tooltip";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AppWindow, ChevronDown, Copy, FolderOpen, FolderSearch } from "lucide-react";
import { openPath, pickFolder, recentProjects, type ProjectInfo, type RecentProject } from "../backend";
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
          <span className="max-w-[55%] shrink-0 truncate text-[15px] leading-none font-semibold text-slate-100" title={project.root}>
            {crumbs[crumbs.length - 1]?.label ?? project.root}
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

/**
 * The project in the header bar: its name opens the recent projects, opening a folder here or in
 * a new window, and the project's path. Ctrl+O and Ctrl+Shift+O work from anywhere.
 */
export function ProjectMenu({ project, onOpen }: { project: ProjectInfo | null; onOpen: OpenProject }) {
  const menu = usePopover<HTMLDivElement>();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [copied, setCopied] = useState(false);
  const { open, error } = useOpen(onOpen, () => menu.setOpen(false));

  const browse = async (newWindow: boolean) => {
    menu.setOpen(false);
    const path = await pickFolder();
    if (path) await open(path, newWindow);
  };

  // Ctrl+O: folder dialog, Ctrl+Shift+O: the same into a new window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        browse(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The list is read fresh each time: other windows add to it
  useEffect(() => {
    if (menu.open) recentProjects().then(setRecent);
    setCopied(false);
  }, [menu.open]);

  return (
    <div ref={menu.ref} className="static min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={t("Switch project")}
        onClick={() => menu.setOpen(!menu.open)}
        className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-semibold text-slate-100 hover:bg-raised ${menu.open ? "bg-raised" : ""}`}
      >
        <img src="/codedeck.svg" alt="" className="size-[18px] shrink-0" />
        <span className="truncate">{project?.name}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-slate-500 transition-transform ${menu.open ? "rotate-180" : ""}`} />
      </button>
      {error && <p className="selectable absolute top-full left-2 z-20 mt-1 rounded bg-overlay px-2 py-1 text-[11px] text-problem">{error}</p>}

      {menu.open && (
        <div role="menu" className="surface-overlay absolute inset-x-2 top-full z-30 mt-1 overflow-hidden rounded-lg text-[13px]">
          {project && (
            <div className="flex items-center gap-2 border-b border-overlay-line px-3 py-2">
              <span className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400" title={project.root}>
                {project.root}
              </span>
              <button
                type="button"
                title={t("Copy the path")}
                onClick={() => {
                  void navigator.clipboard.writeText(project.path);
                  setCopied(true);
                }}
                className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
              >
                <Copy className="size-3.5" />
                {copied && t("Copied")}
              </button>
            </div>
          )}
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t("Recent")}</div>
          <div className="max-h-80 overflow-y-auto px-1">
            {recent.length === 0 && <p className="px-2 py-1.5 text-slate-500 italic">{t("No other projects yet")}</p>}
            {recent.map((item) => (
              <MenuRow key={item.path} onOpen={(newWindow) => open(item.path, newWindow)} label={item.name} detail={item.display} />
            ))}
          </div>
          <div className="mt-1 border-t border-overlay-line px-1 py-1">
            <MenuRow icon={<FolderOpen className="size-4 text-slate-400" />} onOpen={browse} label={t("Open folder…")} shortcut={t("Ctrl+O")} single />
            <MenuRow
              icon={<AppWindow className="size-4 text-slate-400" />}
              onOpen={() => browse(true)}
              label={t("Open in new window…")}
              shortcut={t("Ctrl+Shift+O")}
              single
            />
            <MenuRow
              icon={<FolderSearch className="size-4 text-slate-400" />}
              onOpen={() => {
                menu.setOpen(false);
                void openPath("");
              }}
              label={t("Show in file manager")}
              single
            />
          </div>
          <p className="border-t border-overlay-line px-3 py-1.5 text-[11px] text-slate-500">{t("Ctrl+click opens in a new window")}</p>
        </div>
      )}
    </div>
  );
}

function MenuRow(props: {
  label: string;
  detail?: string;
  shortcut?: string;
  icon?: ReactNode;
  /** Only the row itself, without the extra new-window button */
  single?: boolean;
  onOpen: (newWindow: boolean) => void;
}) {
  return (
    <div className="group flex items-center rounded-md hover:bg-overlay-hover">
      <button
        type="button"
        role="menuitem"
        onClick={(e) => props.onOpen(wantsNewWindow(e))}
        onAuxClick={(e) => e.button === 1 && props.onOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
      >
        {props.icon}
        <span className="min-w-0">
          <span className="block truncate text-slate-200">{props.label}</span>
          {props.detail && <span className="block truncate font-mono text-[11px] text-slate-500">{props.detail}</span>}
        </span>
        {props.shortcut && <kbd className="ml-auto text-[11px] text-slate-500">{props.shortcut}</kbd>}
      </button>
      {!props.single && (
        <button
          type="button"
          title={t("Open in new window")}
          aria-label={t("Open {name} in new window", { name: props.label })}
          onClick={() => props.onOpen(true)}
          className="mr-1 rounded p-1 text-slate-500 opacity-0 hover:bg-slate-700 hover:text-slate-100 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <AppWindow className="size-3.5" />
        </button>
      )}
    </div>
  );
}
