import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
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
  Paperclip,
  Search,
  SquarePen,
  Settings2,
} from "lucide-react";
import { onFsChanged, openPath, readDir, showInFileManager, type Entry, type ProjectInfo, type RepoStatus } from "../backend";
import type { GitState } from "../backend";
import { aheadBehind, stateMeaning, stateSymbol, type GitView } from "../git";
import { Tooltip, ToolTipBody } from "./Tooltip";
import { pathItems, useContextMenu } from "./ContextMenu";
import { AppName, openAs } from "../apps";
import { useSessionMarks } from "../assistant";
import { RepoTooltip } from "./RepoTooltip";
import { PathBar, type OpenProject } from "./ProjectHeader";
import { inScratch, moveIntoProject, SCRATCH_DRAG } from "../scratch";
import { plural, T, t } from "../i18n";

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
  const [rootDrop, setRootDrop] = useState(false);

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <PathBar project={props.project} onOpen={props.onOpenProject} />

      <div className="px-2 pt-2">
        <label className="flex items-center gap-2 rounded-md border border-line bg-base px-2 py-1.5 focus-within:border-ai">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Filter open folders")}
            className="w-full bg-transparent text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto px-1 py-2 ${rootDrop ? "ring-1 ring-ai ring-inset" : ""}`}
        role="tree"
        // A scratch file dropped here, not on a folder: into the project root
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(SCRATCH_DRAG)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setRootDrop(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setRootDrop(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes(SCRATCH_DRAG)) return;
          e.preventDefault();
          setRootDrop(false);
          void moveIntoProject(e.dataTransfer.getData(SCRATCH_DRAG), "");
        }}
      >
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
          {t("{n} changed recently", { n: recentPaths.length })}
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
  // A scratch file can be dropped on a folder of the project, to move it in there
  const [dropping, setDropping] = useState(false);
  const opening = useRef<ReturnType<typeof setTimeout>>(undefined);
  const takes = (e: DragEvent) => entry.isDir && !inScratch(entry.path) && e.dataTransfer.types.includes(SCRATCH_DRAG);
  const leave = () => {
    clearTimeout(opening.current);
    setDropping(false);
  };

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
        onDragOver={(e) => {
          if (!takes(e)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          if (!dropping) {
            setDropping(true);
            // Resting on a closed folder opens it, to get deeper while dragging
            if (!isOpen) opening.current = setTimeout(() => tree.toggle(entry.path), 700);
          }
        }}
        onDragLeave={leave}
        onDrop={(e) => {
          if (!takes(e)) return;
          e.preventDefault();
          e.stopPropagation();
          leave();
          void moveIntoProject(e.dataTransfer.getData(SCRATCH_DRAG), entry.path);
        }}
        onClick={() => (entry.isDir ? tree.toggle(entry.path) : tree.onSelect(entry.path))}
        onDoubleClick={() => !entry.isDir && openAs(entry.path, "view")}
        // Middle button: edit. Its press would otherwise start the scrolling mode
        onMouseDown={(e) => e.button === 1 && !entry.isDir && e.preventDefault()}
        onAuxClick={(e) => e.button === 1 && !entry.isDir && openAs(entry.path, "edit")}
        onContextMenu={(e) => tree.menu(e, entry.path || entry.name, pathItems(entry.path, entry.isDir))}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={`group relative flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-1.5 transition-opacity ${
          dropping ? "bg-ai/20 ring-1 ring-ai" : isSelected ? "bg-ai/25 text-slate-50" : "hover:bg-raised"
        } ${faded ? "opacity-40" : inScratch(entry.path) ? "opacity-55" : ""}`}
        title={entry.path === ".scratch" ? t("Drafts and scratch files of sessions; Git ignores it. See the Workbench view.") : undefined}
      >
        {entry.isDir ? (
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={`size-4 shrink-0 ${entry.isDir ? "text-slate-300" : "text-slate-500"}`} />
        <span
          className={`truncate ${inside ? "text-changed" : ""}`}
          title={inside ? t("{changes} inside", { changes: plural(inside, "uncommitted change") }) : undefined}
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
              title={`${entry.isDir ? t("Changed on disk just now, somewhere inside") : t("Changed on disk just now")}${
                writer ? `; ${t("written by session {short}", { short: marks.of(writer)?.short ?? "" })}` : ""
              }`}
            />
          )}
          {state && (
            <span
              className={`w-3 text-center font-mono text-[11px] ${stateColor[state]}`}
              title={entry.isDir && state === "?" ? t("New folder: nothing in it is in Git yet") : t(stateMeaning[state])}
            >
              {stateSymbol(state)}
            </span>
          )}
          {/* At rest only an attached entry shows its paperclip; on hover it is the toolbar's last tool */}
          <span className="grid w-5 place-items-center group-hover:hidden group-has-[:focus-visible]:hidden">
            {isPinned && <Paperclip className="size-3.5 text-brand-soft" />}
          </span>
        </span>
      </div>
      {isOpen && <Rows dir={entry.path} depth={depth + 1} tree={tree} />}
    </>
  );
}

/**
 * The tools of a row, shown while the mouse is on it, before the branch and status (those stay
 * clickable). From the right: the paperclip (again to remove it), open as project (folders), show in the file manager, and for
 * files view and edit. The paperclip is where an attached entry shows it at rest.
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
            label={t("View")}
            says={<T text="Opens it in {app}" app={<AppName path={entry.path} role="view" />} />}
            hint={t("Also: double-click the file")}
            onClick={() => openAs(entry.path, "view")}
          />
          <Tool
            icon={SquarePen}
            label={t("Edit")}
            says={<T text="Opens it in {app}" app={<AppName path={entry.path} role="edit" />} />}
            hint={t("Also: middle-click the file")}
            onClick={() => openAs(entry.path, "edit")}
          />
          <Gap />
        </>
      )}
      <Tool
        icon={FolderSearch}
        label={t("Show in file manager")}
        says={entry.isDir ? t("Opens this folder in the file manager") : t("Opens its folder in the file manager, with it selected")}
        onClick={() => (entry.isDir ? openPath(entry.path) : showInFileManager(entry.path)).catch(report)}
      />
      {entry.isDir && tree.project && (
        <>
          <Gap />
          <Tool
            icon={FolderInput}
            label={t("Open as project")}
            says={t("Opens this folder as the project of this window · Ctrl+click: in a new window")}
            onClick={(e) => openAsProject(e, e.ctrlKey || e.metaKey)}
            onAuxClick={(e) => e.button === 1 && openAsProject(e, true)}
          />
        </>
      )}
      <Gap />
      <Tool
        icon={Paperclip}
        label={pinned ? t("Remove from next prompt") : t("Attach to next prompt")}
        says={pinned ? t("It is attached to your next prompt; click to remove it") : t("Attaches its path to your next prompt; the assistant reads it as far as it needs")}
        active={pinned}
        onClick={() => (pinned ? tree.onUnpin(entry.path) : tree.onPin(entry))}
      />
    </span>
  );
}

function Tool(props: {
  icon: typeof Paperclip;
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
      content={<ToolTipBody label={props.label} says={props.says} hint={props.hint} />}
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
        aria-label={t("Git actions for {repo}, branch {branch}", { repo: repo.name, branch: repo.branch ?? t("detached") })}
        onClick={(e) => {
          e.stopPropagation();
          tree.onRepoActions(repo.path, e.currentTarget, false);
        }}
        className={`flex max-w-32 items-center gap-1 rounded px-1 font-mono text-[11px] hover:bg-slate-700 ${
          repo.error ? "text-problem" : dirty ? "text-changed" : "text-slate-500"
        }`}
      >
        <GitBranch className="size-3 shrink-0" />
        <span className="truncate">{repo.error ? t("error") : (repo.branch ?? t("detached"))}</span>
        {sync && <span className="shrink-0 text-slate-500">{sync}</span>}
      </button>
    </Tooltip>
  );
}
