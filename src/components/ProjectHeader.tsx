import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AppWindow, ChevronDown, FolderOpen } from "lucide-react";
import { pickFolder, recentProjects, type ProjectInfo, type RecentProject } from "../backend";

/** Opens a directory: here, or in a new window of its own. */
export type OpenProject = (path: string, newWindow: boolean) => Promise<void>;

/** Ctrl+click and middle click open in a new window, as with links in a browser. */
const wantsNewWindow = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.button === 1;

/**
 * Head of the file list. Switching projects lives where the project is named: the name opens
 * the recent projects, and every folder of the path above the root can be clicked to move up.
 */
export function ProjectHeader({ project, onOpen }: { project: ProjectInfo | null; onOpen: OpenProject }) {
  const [menu, setMenu] = useState(false);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLElement>(null);

  const open = async (path: string, newWindow: boolean) => {
    setMenu(false);
    try {
      await onOpen(path, newWindow);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const browse = async (newWindow: boolean) => {
    setMenu(false);
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
    if (!menu) return;
    recentProjects().then(setRecent);
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const crumbs = project?.crumbs ?? [];

  return (
    <header ref={box} className="relative shrink-0 border-b border-line">
      {/* 43 px plus the border: the same 44 px as the headers beside it, so their lines meet */}
      <div className="flex h-[43px] items-center gap-2 px-3">
        <img src="/codedeck.svg" alt="" className="size-5" />
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menu}
          title="Switch project"
          onClick={() => setMenu(!menu)}
          className={`-mx-1 flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-slate-100 hover:bg-raised ${
            menu ? "bg-raised" : ""
          }`}
        >
          {project?.name}
          <ChevronDown className={`size-3.5 text-slate-500 transition-transform ${menu ? "rotate-180" : ""}`} />
        </button>

        {/* Right-aligned; a long path is cut off on the left, the project end stays visible */}
        <nav
          aria-label="Path"
          className="ml-auto flex min-w-0 justify-end overflow-hidden font-mono text-[11px] whitespace-nowrap text-slate-500"
          title={project?.root}
        >
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            const separator = i > 0 && crumbs[i - 1].label !== "/";
            return (
              <span key={crumb.path} className="flex shrink-0 items-center">
                {separator && <span className="text-slate-600">/</span>}
                {last ? (
                  <span className="px-px text-slate-400">{crumb.label}</span>
                ) : (
                  <button
                    type="button"
                    title={`Open ${crumb.path} here · Ctrl+click: new window`}
                    onClick={(e) => open(crumb.path, wantsNewWindow(e))}
                    onAuxClick={(e) => e.button === 1 && open(crumb.path, true)}
                    className="rounded px-px hover:bg-raised hover:text-slate-200"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      {error && <p className="selectable px-3 pb-2 text-[11px] text-problem">{error}</p>}

      {menu && (
        <div
          role="menu"
          className="surface-overlay absolute inset-x-2 top-full z-20 mt-1 overflow-hidden rounded-lg"
        >
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            Recent
          </div>
          <div className="max-h-80 overflow-y-auto px-1">
            {recent.length === 0 && <p className="px-2 py-1.5 text-slate-500 italic">No other projects yet</p>}
            {recent.map((item) => (
              <MenuRow
                key={item.path}
                onOpen={(newWindow) => open(item.path, newWindow)}
                label={item.name}
                detail={item.display}
              />
            ))}
          </div>
          <div className="mt-1 border-t border-overlay-line px-1 py-1">
            <MenuRow
              icon={<FolderOpen className="size-4 text-slate-400" />}
              onOpen={browse}
              label="Open folder…"
              shortcut="Ctrl+O"
              single
            />
            <MenuRow
              icon={<AppWindow className="size-4 text-slate-400" />}
              onOpen={() => browse(true)}
              label="Open in new window…"
              shortcut="Ctrl+Shift+O"
              single
            />
          </div>
          <p className="border-t border-overlay-line px-3 py-1.5 text-[11px] text-slate-500">
            Ctrl+click opens in a new window
          </p>
        </div>
      )}
    </header>
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
          {props.detail && (
            <span className="block truncate font-mono text-[11px] text-slate-500">{props.detail}</span>
          )}
        </span>
        {props.shortcut && <kbd className="ml-auto text-[11px] text-slate-500">{props.shortcut}</kbd>}
      </button>
      {!props.single && (
        <button
          type="button"
          title="Open in new window"
          aria-label={`Open ${props.label} in new window`}
          onClick={() => props.onOpen(true)}
          className="mr-1 rounded p-1 text-slate-500 opacity-0 hover:bg-slate-700 hover:text-slate-100 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <AppWindow className="size-3.5" />
        </button>
      )}
    </div>
  );
}
