import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CodeXml,
  File,
  FileText,
  Folder,
  FolderGit2,
  FolderInput,
  GitBranch,
  GitFork,
  FolderOpen,
  Eye,
  FolderSearch,
  Pin,
  PinOff,
  Search,
  SquarePen,
  Settings2,
} from "lucide-react";
import { onFsChanged, openPath, readDir, showInFileManager, type Entry, type ProjectInfo, type RepoStatus } from "../backend";
import type { GitState } from "../backend";
import { aheadBehind, stateMeaning, stateSymbol, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { pathItems, useContextMenu } from "./ContextMenu";
import { AppName, openAs } from "../apps";
import { useSessionMarks } from "../assistant";
import { RepoTooltip } from "./RepoTooltip";
import { ProjectHeader, type OpenProject } from "./ProjectHeader";

/** MIME type used when dragging a file or folder onto the context area. */
export const DRAG_TYPE = "application/x-codedeck-entry";

/** How long a changed file keeps its dot. */
const RECENT_MS = 2 * 60 * 1000;

/** The three status tones, see index.css. */
export const stateColor: Record<GitState, string> = {
  M: "text-changed",
  R: "text-moved",
  A: "text-added",
  "?": "text-added",
  D: "text-problem",
  U: "text-problem",
};

function iconFor(name: string) {
  if (name.endsWith(".json")) return Braces;
  if (name.endsWith(".xml")) return CodeXml;
  if (name.endsWith(".md")) return FileText;
  if (name.endsWith(".toml")) return Settings2;
  return File;
}

interface Props {
  project: ProjectInfo | null;
  git: GitView;
  selected: string | null;
  pinned: Set<string>;
  onSelect: (path: string) => void;
  onPin: (entry: Entry) => void;
  /** Takes a file or folder out of the assistant's context again */
  onUnpin: (path: string) => void;
  onOpenProject: OpenProject;
  /** Open the Git actions of a repository at the given element */
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  /** Files an assistant wrote, with the time (ms) of its latest write */
  touched: Map<string, number>;
}

/** Listings by directory path. Only directories that were opened are in here. */
type Listings = Record<string, Entry[]>;

export function FilesPanel(props: Props) {
  const [listings, setListings] = useState<Listings>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // What is loaded, readable from the change listener without re-subscribing
  const loaded = useRef<Set<string>>(new Set());

  const load = useCallback(async (dir: string) => {
    try {
      const entries = await readDir(dir);
      loaded.current.add(dir);
      setListings((current) => ({ ...current, [dir]: entries }));
    } catch (e) {
      // The directory is gone: forget it and everything below
      const below = (path: string) => path === dir || path.startsWith(`${dir}/`);
      loaded.current.forEach((path) => below(path) && loaded.current.delete(path));
      setListings((current) => Object.fromEntries(Object.entries(current).filter(([p]) => !below(p))));
      setOpen((current) => new Set([...current].filter((p) => !below(p))));
      if (dir === "") setError(String(e));
    }
  }, []);

  useEffect(() => {
    load("");
    return onFsChanged((change) => {
      change.dirs.filter((dir) => loaded.current.has(dir)).forEach(load);
      const now = Date.now();
      setRecent((current) => ({
        ...current,
        ...Object.fromEntries(change.paths.map((path) => [path, now])),
      }));
    });
  }, [load]);

  // Let the dots expire
  const hasRecent = Object.keys(recent).length > 0;
  useEffect(() => {
    if (!hasRecent) return;
    const timer = setInterval(() => {
      const limit = Date.now() - RECENT_MS;
      setRecent((current) => Object.fromEntries(Object.entries(current).filter(([, t]) => t > limit)));
    }, 10_000);
    return () => clearInterval(timer);
  }, [hasRecent]);

  const toggle = (dir: string) => {
    const next = new Set(open);
    if (next.delete(dir)) {
      setOpen(next);
      return;
    }
    next.add(dir);
    setOpen(next);
    if (!loaded.current.has(dir)) load(dir);
  };

  const needle = query.trim().toLowerCase();
  // Changed on disk recently, or written by an assistant recently
  const since = Date.now() - RECENT_MS;
  const recentPaths = [
    ...new Set([...Object.keys(recent), ...[...props.touched].filter(([, at]) => at > since).map(([path]) => path)]),
  ];
  const contextMenu = useContextMenu();
  const tree: TreeState = { ...props, listings, open, recentPaths, needle, toggle, menu: contextMenu.open };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <ProjectHeader project={props.project} onOpen={props.onOpenProject} />

      <div className="px-2 pt-2">
        <label className="flex items-center gap-2 rounded-md border border-line bg-base px-2 py-1.5 focus-within:border-indigo-500">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter open folders"
            className="w-full bg-transparent text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2" role="tree">
        {error ? (
          <p className="selectable px-2 text-problem">{error}</p>
        ) : (
          <Rows dir="" depth={0} tree={tree} />
        )}
        {contextMenu.element}
      </div>

      {recentPaths.length > 0 && (
        <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2 text-[11px] text-slate-500">
          <span className="ai-dot" />
          {recentPaths.length} changed recently
        </footer>
      )}
    </aside>
  );
}

interface TreeState extends Props {
  listings: Listings;
  open: Set<string>;
  recentPaths: string[];
  /** Lower-case filter text, empty for none */
  needle: string;
  toggle: (dir: string) => void;
  menu: ReturnType<typeof useContextMenu>["open"];
}

/** With a filter: files that match, and folders with a match somewhere in what is loaded. */
function matches(entry: Entry, tree: TreeState): boolean {
  if (!tree.needle) return true;
  if (!entry.isDir) return entry.name.toLowerCase().includes(tree.needle);
  return (tree.listings[entry.path] ?? []).some((child) => matches(child, tree));
}

function Rows({ dir, depth, tree }: { dir: string; depth: number; tree: TreeState }) {
  const entries = tree.listings[dir];
  if (!entries) return null;
  if (entries.length === 0 && depth > 0) {
    return (
      <div style={{ paddingLeft: 26 + depth * 14 }} className="h-[26px] text-slate-500 italic">
        empty
      </div>
    );
  }
  return entries
    .filter((entry) => matches(entry, tree))
    .map((entry) => <Row key={entry.path} entry={entry} depth={depth} tree={tree} />);
}

function Row({ entry, depth, tree }: { entry: Entry; depth: number; tree: TreeState }) {
  const marks = useSessionMarks();
  // The session that wrote here: its colour on the dot; hovered in the list, its files stand out
  const writer = marks.writer(entry.path, entry.isDir);
  const dot = marks.of(writer)?.color;
  const faded = marks.hovered !== null && writer !== marks.hovered;
  const isOpen = entry.isDir && (tree.open.has(entry.path) || (!!tree.needle && !!tree.listings[entry.path]));
  const isSelected = tree.selected === entry.path;
  const isPinned = tree.pinned.has(entry.path);
  const changed = entry.isDir
    ? !isOpen && tree.recentPaths.some((path) => path.startsWith(`${entry.path}/`))
    : tree.recentPaths.includes(entry.path);
  const repo = entry.isDir ? tree.git.repoAt.get(entry.path) : undefined;
  const state = tree.git.stateOf(entry.path);
  // A plain folder has no symbol of its own: while closed, its name says that changes lie inside
  const inside = entry.isDir && !repo && !state && !isOpen ? tree.git.changesIn(entry.path) : 0;
  const Icon = repo ? (repo.worktreeOf ? GitFork : FolderGit2) : entry.isDir ? (isOpen ? FolderOpen : Folder) : iconFor(entry.name);
  const Chevron = isOpen ? ChevronDown : ChevronRight;


  return (
    <>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={entry.isDir ? isOpen : undefined}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(entry));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => (entry.isDir ? tree.toggle(entry.path) : tree.onSelect(entry.path))}
        onDoubleClick={() => !entry.isDir && openAs(entry.path, "view")}
        // Middle button: edit. Its press would otherwise start the scrolling mode
        onMouseDown={(e) => e.button === 1 && !entry.isDir && e.preventDefault()}
        onAuxClick={(e) => e.button === 1 && !entry.isDir && openAs(entry.path, "edit")}
        onContextMenu={(e) => tree.menu(e, entry.path || entry.name, pathItems(entry.path, entry.isDir))}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={`group relative flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-1.5 transition-opacity ${
          isSelected ? "bg-indigo-500/25 text-slate-50" : "hover:bg-raised"
        } ${faded ? "opacity-40" : ""}`}
      >
        {entry.isDir ? (
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={`size-4 shrink-0 ${entry.isDir ? "text-slate-300" : "text-slate-500"}`} />
        <span
          className={`truncate ${inside ? "text-changed" : ""}`}
          title={inside ? `${inside} uncommitted change${inside === 1 ? "" : "s"} inside` : undefined}
        >
          {entry.name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <RowTools entry={entry} tree={tree} pinned={isPinned} />
          {repo && <RepoBadge repo={repo} tree={tree} />}
          {changed && (
            <span
              className={`ai-dot ${entry.isDir ? "opacity-60" : ""}`}
              style={dot ? ({ "--dot": dot } as CSSProperties) : undefined}
              title={`${entry.isDir ? "Changed on disk just now, somewhere inside" : "Changed on disk just now"}${
                writer ? `; written by session ${marks.of(writer)?.short ?? ""}` : ""
              }`}
            />
          )}
          {state && (
            <span
              className={`w-3 text-center font-mono text-[11px] ${stateColor[state]}`}
              title={entry.isDir && state === "?" ? "New folder: nothing in it is in Git yet" : stateMeaning[state]}
            >
              {stateSymbol(state)}
            </span>
          )}
          {/* At rest only a pinned entry shows its pin; on hover it is the toolbar's last tool */}
          <span className="grid w-5 place-items-center group-hover:hidden group-has-[:focus-visible]:hidden">
            {isPinned && <Pin className="size-3.5 text-brand-soft" fill="currentColor" />}
          </span>
        </span>
      </div>
      {isOpen && <Rows dir={entry.path} depth={depth + 1} tree={tree} />}
    </>
  );
}

/**
 * The tools of a row, shown while the mouse is on it, before the branch and status (those stay
 * clickable). From the right: the pin (again to unpin), open as project (folders), show in the file manager, and for
 * files view and edit. The pin is where a pinned entry shows it at rest.
 */
function RowTools({ entry, tree, pinned }: { entry: Entry; tree: TreeState; pinned: boolean }) {
  const report = (e: unknown) => console.error(e);
  const openAsProject = (e: React.MouseEvent, newWindow: boolean) => {
    e.stopPropagation();
    tree.onOpenProject(`${tree.project!.path}/${entry.path}`, newWindow).catch(() => {});
  };
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onAuxClick={(e) => e.stopPropagation()}
      className="hidden h-[22px] items-center gap-0.5 rounded-md border border-overlay-line bg-raised px-1 group-hover:flex group-has-[:focus-visible]:flex"
    >
      {!entry.isDir && (
        <>
          <Tool
            icon={Eye}
            label="View"
            says={<>Opens it in <AppName path={entry.path} role="view" /></>}
            hint="Also: double-click the file"
            onClick={() => openAs(entry.path, "view")}
          />
          <Tool
            icon={SquarePen}
            label="Edit"
            says={<>Opens it in <AppName path={entry.path} role="edit" /></>}
            hint="Also: middle-click the file"
            onClick={() => openAs(entry.path, "edit")}
          />
          <Gap />
        </>
      )}
      <Tool
        icon={FolderSearch}
        label="Show in file manager"
        says={entry.isDir ? "Opens this folder in the file manager" : "Opens its folder in the file manager, with it selected"}
        onClick={() => (entry.isDir ? openPath(entry.path) : showInFileManager(entry.path)).catch(report)}
      />
      {entry.isDir && tree.project && (
        <>
          <Gap />
          <Tool
            icon={FolderInput}
            label="Open as project"
            says="Opens this folder as the project of this window · Ctrl+click: in a new window"
            onClick={(e) => openAsProject(e, e.ctrlKey || e.metaKey)}
            onAuxClick={(e) => e.button === 1 && openAsProject(e, true)}
          />
        </>
      )}
      <Gap />
      <Tool
        icon={pinned ? PinOff : Pin}
        label={pinned ? "Unpin" : "Pin"}
        says={pinned ? "Takes it out of the assistant's context" : "Adds it to the assistant's context"}
        active={pinned}
        onClick={() => (pinned ? tree.onUnpin(entry.path) : tree.onPin(entry))}
      />
    </span>
  );
}

function Tool(props: {
  icon: typeof Pin;
  label: string;
  says: React.ReactNode;
  /** How else to reach it, in its own quiet line */
  hint?: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onAuxClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip
      className="flex"
      content={
        <>
          <span className="font-semibold text-slate-100">{props.label}</span>
          <span>{props.says}</span>
          {props.hint && <TooltipHint>{props.hint}</TooltipHint>}
        </>
      }
    >
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        onAuxClick={props.onAuxClick}
        className={`grid size-5 place-items-center rounded hover:bg-slate-700 hover:text-slate-100 ${
          props.active ? "text-brand-soft" : "text-slate-400"
        }`}
      >
        <props.icon className="size-3.5" />
      </button>
    </Tooltip>
  );
}

const Gap = () => <span className="mx-0.5 h-3.5 w-px bg-slate-600" />;

/**
 * On the row of a repository's folder: its branch, tinted when there are uncommitted changes.
 * A click opens the Git actions right here.
 */
function RepoBadge({ repo, tree }: { repo: RepoStatus; tree: TreeState }) {
  const sync = aheadBehind(repo);
  const dirty = repo.files.length > 0;
  return (
    <Tooltip content={<RepoTooltip repo={repo} runs={tree.git.runs} />}>
      <button
        type="button"
        aria-label={`Git actions for ${repo.name}, branch ${repo.branch ?? "detached"}`}
        onClick={(e) => {
          e.stopPropagation();
          tree.onRepoActions(repo.path, e.currentTarget, false);
        }}
        className={`flex max-w-32 items-center gap-1 rounded px-1 font-mono text-[11px] hover:bg-slate-700 ${
          repo.error ? "text-problem" : dirty ? "text-changed" : "text-slate-500"
        }`}
      >
        <GitBranch className="size-3 shrink-0" />
        <span className="truncate">{repo.error ? "error" : (repo.branch ?? "detached")}</span>
        {sync && <span className="shrink-0 text-slate-500">{sync}</span>}
      </button>
    </Tooltip>
  );
}
