import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
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
  FolderTree,
  PanelRightClose,
  AppWindow,
  Copy,
  Ellipsis,
  EyeOff,
  FileDiff,
  FilePlus,
  FolderPlus,
  Highlighter,
  Pencil,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { onFsChanged, openPath, openSettings, openTerminalIn, pathCreate, pathRename, pathStats, pathTrash, readDir, showInFileManager, tokensFor, type Entry, type ProjectInfo, type RepoStatus } from "../backend";
import { hiddenBy, isImportant, onReveal, under, useFileMarks, useFileSettings, type FileSettings } from "../fileView";
import type { FileMarks } from "../backend";
import { useHintFiles } from "../markers";
import { openView } from "../view";
import { usePopover } from "./ProjectHeader";
import { Heading, Panel } from "./HeaderBar";
import { size } from "./views/units";
import type { AssistantState, GitState } from "../backend";
import { aheadBehind, stateMeaning, stateSymbol, type GitView } from "../git";
import { Tooltip } from "./Tooltip";
import { AtRest, HoverTools, Tool } from "./RowTools";
import { pathItems, useContextMenu, type MenuItem } from "./ContextMenu";
import { AppName, openAs } from "../apps";
import { useSessionMarks } from "../assistant";
import { RepoTooltip } from "./RepoTooltip";
import { type OpenProject } from "./ProjectHeader";
import { BranchButton, GitStatusBar } from "./StatusBar";
import { FilesRail } from "./FilesRail";
import { usePerProject } from "../projectMemory";
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
  onToggleLog: () => void;
  logOpen: boolean;
  assistant: AssistantState;
  /** Open the Git actions of a repository at the given element */
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  /** Files an assistant wrote, with the time (ms) of its latest write */
  touched: Map<string, number>;
  /** Folded to its rail (`FilesRail`); the tree keeps its state meanwhile */
  folded: boolean;
  onFold: (folded?: boolean) => void;
}

/** Listings by directory path. Only directories that were opened are in here. */
type Listings = Record<string, Entry[]>;

export function FilesPanel(props: Props) {
  const [listings, setListings] = useState<Listings>({});
  // Open folders and the filter come back with the project (projectMemory)
  const [open, setOpen] = usePerProject<Set<string>>("openFolders", () => new Set());
  const [recent, setRecent] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = usePerProject("fileFilter", () => "");
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
    // Folders that were open when the project was left: their listings again
    open.forEach((dir) => void load(dir));
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

  const [fileSettings, changeFileSettings] = useFileSettings();
  const [marks, setMark] = useFileMarks(props.project?.path);
  const hints = useHintFiles();
  const ignored = useMemo(() => props.git.repos.flatMap((r) => r.ignored ?? []), [props.git.repos]);
  // Deleted and not committed: no longer on disk, still worth a grey line where they were
  const deleted = useMemo(() => props.git.repos.flatMap((r) => r.files.filter((f) => f.state === "D" && !f.dir).map((f) => f.path)), [props.git.repos]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // "Show in tree" from anywhere: the list opens, the folders on the way too, the entry lights up
  const fold = props.onFold;
  useEffect(
    () =>
      onReveal((path) => {
        fold(false);
        const parts = path.split("/");
        const dirs = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
        setOpen((current) => new Set([...current, ...dirs]));
        dirs.forEach((dir) => !loaded.current.has(dir) && void load(dir));
        setFlash(path);
        setTimeout(() => document.querySelector(`[data-tree-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
        setTimeout(() => setFlash((f) => (f === path ? null : f)), 2600);
      }),
    [load, fold, setOpen],
  );

  const needle = query.trim().toLowerCase();
  // Changed on disk recently, or written by an assistant recently; with "keep the dots" every file
  // a session wrote that is still uncommitted
  const since = Date.now() - RECENT_MS;
  const recentPaths = [
    ...new Set([
      ...Object.keys(recent),
      ...[...props.touched].filter(([path, at]) => at > since || (fileSettings.keepDots && props.git.stateOf(path))).map(([path]) => path),
    ]),
  ];
  const contextMenu = useContextMenu();
  const tree: TreeState = {
    ...props,
    listings,
    open,
    recentPaths,
    needle,
    toggle,
    menu: contextMenu.open,
    fileSettings,
    marks,
    setMark,
    hints,
    ignored,
    deleted,
    editing,
    setEditing,
    flash,
    fail: setProblem,
    reload: (dir: string) => void load(dir),
    openDir: (dir: string) => {
      if (!open.has(dir) && dir) toggle(dir);
    },
  };
  const [rootDrop, setRootDrop] = useState(false);

  if (props.folded)
    return (
      <FilesRail
        git={props.git}
        recent={recentPaths.length}
        onToggleLog={props.onToggleLog}
        logOpen={props.logOpen}
        onRepoActions={props.onRepoActions}
        onOpen={() => props.onFold(false)}
      />
    );

  return (
    <aside data-tour="files" className="zone-files flex min-h-0 min-w-0 flex-col border-l border-line bg-panel">
      {/* As high as the headers beside it. The project and the menus are in the project list at the left */}
      <header className="zone-tabs flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel pr-1.5 pl-3">
        <FolderTree className="size-4 text-slate-500" />
        <span className="shrink-0 text-[12px] font-semibold tracking-wider text-slate-400 uppercase">{t("Files")}</span>
        {/* The branch in the middle between the title and the fold button */}
        <span className="flex min-w-0 flex-1 justify-center">
          <BranchButton git={props.git} onRepoActions={props.onRepoActions} />
        </span>
        <FileQuickSettings settings={fileSettings} onChange={changeFileSettings} />
        <button
          type="button"
          aria-label={t("Fold the file list")}
          title={`${t("Fold the file list")} (${t("Ctrl")}+B)`}
          onClick={() => props.onFold(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          <PanelRightClose className="size-4" />
        </button>
      </header>

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
        {problem && (
          <p className="selectable mx-1 mb-1 flex items-start gap-2 rounded-md bg-problem/10 px-2 py-1 text-[12px] text-problem">
            <span className="flex-1">{problem}</span>
            <button type="button" aria-label={t("Close")} onClick={() => setProblem(null)} className="text-slate-400 hover:text-slate-100">
              ×
            </button>
          </p>
        )}
        {error ? (
          <p className="selectable px-2 text-problem">{error}</p>
        ) : (
          <Rows dir="" depth={0} tree={tree} />
        )}
        {contextMenu.element}
      </div>

      <GitStatusBar recent={recentPaths.length} git={props.git} logOpen={props.logOpen} onToggleLog={props.onToggleLog} />
    </aside>
  );
}

/** A name being typed in the tree: a new one for a file or folder, or a new file or folder. */
type Editing = { kind: "rename"; path: string } | { kind: "create"; dir: string; folder: boolean };

interface TreeState extends Props {
  listings: Listings;
  open: Set<string>;
  recentPaths: string[];
  /** Lower-case filter text, empty for none */
  needle: string;
  toggle: (dir: string) => void;
  menu: ReturnType<typeof useContextMenu>["open"];
  fileSettings: FileSettings;
  marks: FileMarks;
  setMark: (kind: "hidden" | "shown" | "important", path: string, on: boolean) => void;
  /** Path → number of @ai hints */
  hints: Map<string, number>;
  ignored: string[];
  deleted: string[];
  editing: Editing | null;
  setEditing: (editing: Editing | null) => void;
  /** Just shown by "Show in tree": lights up, and shows even when hidden */
  flash: string | null;
  fail: (message: string) => void;
  reload: (dir: string) => void;
  openDir: (dir: string) => void;
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
  const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const ghosts = tree.needle ? [] : tree.deleted.filter((path) => parentOf(path) === dir && !entries.some((e) => e.path === path));
  const creating = tree.editing?.kind === "create" && tree.editing.dir === dir ? tree.editing : null;
  return (
    <>
      {creating && <NewRow dir={dir} folder={creating.folder} depth={depth} tree={tree} />}
      {entries
        .filter((entry) => matches(entry, tree))
        // Hidden and set to "do not show": gone, unless "Show in tree" asks for it or something in it
        .filter((entry) => !(tree.fileSettings.look === "hide" && hiddenOf(entry.path, tree) && !(tree.flash && under(tree.flash, entry.path))))
        .map((entry) => (
          <Row key={entry.path} entry={entry} depth={depth} tree={tree} />
        ))}
      {ghosts.map((path) => (
        <GhostRow key={path} path={path} depth={depth} tree={tree} />
      ))}
    </>
  );
}

const hiddenOf = (path: string, tree: TreeState) => hiddenBy(path, tree.fileSettings, tree.marks, tree.ignored);

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
  const hidden = hiddenOf(entry.path, tree);
  const important = isImportant(entry.path, tree.marks);
  const flashing = tree.flash === entry.path;
  const renaming = tree.editing?.kind === "rename" && tree.editing.path === entry.path;
  const hintCount = tree.fileSettings.hints && !entry.isDir ? (tree.hints.get(entry.path) ?? 0) : 0;

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
        onContextMenu={(e) => tree.menu(e, entry.path || entry.name, entryMenu(entry, tree))}
        data-tree-path={entry.path}
        style={{ paddingLeft: 6 + depth * 14 }}
        className={`group relative flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-1.5 transition-opacity ${
          dropping
            ? "bg-ai/20 ring-1 ring-ai"
            : flashing
              ? "bg-ai/20 ring-1 ring-ai"
              : isSelected
                ? "bg-ai/25 text-slate-50"
                : important
                  ? "bg-brand/10 hover:bg-brand/20"
                  : "hover:bg-raised"
        } ${faded || hidden ? "opacity-45" : ""}`}
        title={
          entry.path === ".scratch"
            ? t("Drafts and scratch files of AI sessions; Git ignores it. See the Workbench view.")
            : entry.isDir
              ? undefined
              : t("Double-click: view · middle click: edit · right click: more")
        }
      >
        {entry.isDir ? (
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={`size-4 shrink-0 ${entry.isDir ? "text-slate-300" : "text-slate-500"}`} />
        {renaming ? (
          <NameInput
            initial={entry.name}
            onCancel={() => tree.setEditing(null)}
            onDone={(name) => {
              tree.setEditing(null);
              if (name === entry.name) return;
              const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
              pathRename(entry.path, name)
                .then(() => tree.reload(parent))
                .catch((e) => tree.fail(String(e)));
            }}
          />
        ) : entry.isDir ? (
          <Tooltip content={<FolderCard entry={entry} tree={tree} inside={tree.git.changesIn(entry.path)} hidden={hidden} important={important} />} className="min-w-0">
            <span className={`block truncate ${inside ? "text-changed" : ""} ${important ? "font-semibold text-slate-50" : ""}`}>{entry.name}</span>
          </Tooltip>
        ) : (
          <span
            className={`truncate ${important ? "font-semibold text-slate-50" : ""}`}
            title={important ? t("Marked as important") : hidden ? hiddenWhy(hidden) : undefined}
          >
            {entry.name}
          </span>
        )}
        {inside > 0 && (
          <span className="shrink-0 text-[11px] text-changed" title={t("{changes} inside", { changes: plural(inside, "uncommitted change") })}>
            {inside}
          </span>
        )}
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
          {hintCount > 0 && (
            <span className="font-mono text-[11px] text-ai" title={plural(hintCount, "@ai hint")}>
              @
            </span>
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
          <AtRest show={isPinned}>
            <Paperclip className="size-3.5 text-brand-soft" />
          </AtRest>
        </span>
      </div>
      {isOpen && <Rows dir={entry.path} depth={depth + 1} tree={tree} />}
    </>
  );
}

/**
 * The tools of a row, shown while the mouse is on it: only what is done often (user, 2026-11-21).
 * Edit (files; also middle click), the paperclip (again to remove it), and ⋯ with everything else,
 * the same menu as the right mouse button. Viewing is the double click.
 */
function RowTools({ entry, tree, pinned }: { entry: Entry; tree: TreeState; pinned: boolean }) {
  return (
    <HoverTools>
      {!entry.isDir && (
        <Tool
          icon={SquarePen}
          label={t("Edit")}
          says={<T text="Opens it in {app}" app={<AppName path={entry.path} role="edit" />} />}
          hint={t("Also: middle-click the file")}
          onClick={() => openAs(entry.path, "edit")}
        />
      )}
      <Tool
        icon={Paperclip}
        label={pinned ? t("Remove from next prompt") : t("Attach to next prompt")}
        says={pinned ? t("It is attached to your next prompt; click to remove it") : t("Attaches its path to your next prompt; the assistant reads it as far as it needs")}
        active={pinned}
        onClick={() => (pinned ? tree.onUnpin(entry.path) : tree.onPin(entry))}
      />
      <Tool icon={Ellipsis} label={t("More (also right click)")} onClick={(e) => tree.menu(e, entry.path || entry.name, entryMenu(entry, tree))} />
    </HoverTools>
  );
}

const hiddenWhy = (why: ReturnType<typeof hiddenBy>) =>
  why === "git" ? t("Hidden: git ignores it") : why === "default" ? t("Hidden in every project (Settings)") : t("Hidden by you");

/**
 * Everything one can do with a file or folder, in groups: open, then what it is to CodeDeck
 * (attached, important, hidden), then where it lies (path, name, trash). The right mouse button and ⋯.
 */
function entryMenu(entry: Entry, tree: TreeState): MenuItem[] {
  const path = entry.path;
  const report = (e: unknown) => tree.fail(String(e));
  const absolute = tree.project ? (path ? `${tree.project.path}/${path}` : tree.project.path) : path;
  const why = hiddenOf(path, tree);
  const important = isImportant(path, tree.marks);
  const pinned = tree.pinned.has(path);
  const state = tree.git.stateOf(path);
  const items: MenuItem[] = [];
  if (!entry.isDir) {
    const [view, edit, viewWith, editWith] = pathItems(path, false);
    items.push({ ...view, hint: t("double-click") }, { ...edit, hint: t("middle click") }, viewWith, editWith);
    if (state && state !== "D") {
      items.push({
        icon: FileDiff,
        label: t("Show the change"),
        hint: t("in Changes"),
        run: () => {
          tree.onSelect(path);
          openView("changes");
        },
      });
    }
  } else if (tree.project) {
    const open = (newWindow: boolean) => void tree.onOpenProject(absolute, newWindow).catch(() => {});
    items.push(
      { icon: FolderInput, label: t("Open as project"), run: () => open(false) },
      { icon: AppWindow, label: t("Open as project in a new window"), run: () => open(true) },
      {
        icon: FilePlus,
        label: t("New file…"),
        divider: true,
        run: () => {
          tree.openDir(path);
          tree.setEditing({ kind: "create", dir: path, folder: false });
        },
      },
      {
        icon: FolderPlus,
        label: t("New folder…"),
        run: () => {
          tree.openDir(path);
          tree.setEditing({ kind: "create", dir: path, folder: true });
        },
      },
    );
  }
  items.push(
    {
      icon: Paperclip,
      label: pinned ? t("Remove from next prompt") : t("Attach to next prompt"),
      divider: true,
      run: () => (pinned ? tree.onUnpin(path) : tree.onPin(entry)),
    },
    { icon: Highlighter, label: important ? t("Remove the important mark") : t("Mark as important"), run: () => tree.setMark("important", path, !important) },
    why
      ? { icon: Eye, label: t("Show again"), hint: hiddenWhy(why), run: () => (why === "mark" ? tree.setMark("hidden", path, false) : tree.setMark("shown", path, true)) }
      : { icon: EyeOff, label: t("Hide"), run: () => tree.setMark("hidden", path, true) },
    {
      icon: FolderSearch,
      label: t("Path"),
      divider: true,
      run: () => {},
      more: async () => ({
        title: path || absolute,
        items: [
          { icon: Copy, label: t("Copy the path in the project"), hint: path, disabled: !path, run: () => void navigator.clipboard.writeText(path) },
          { icon: Copy, label: t("Copy the full path"), run: () => void navigator.clipboard.writeText(absolute) },
          {
            icon: FolderSearch,
            label: t("Open in file manager"),
            divider: true,
            run: () => void (entry.isDir ? openPath(path) : showInFileManager(path)).catch(report),
          },
          { icon: SquareTerminal, label: t("Open in terminal"), hint: entry.isDir ? undefined : t("its folder"), run: () => void openTerminalIn(path).catch(report) },
        ],
      }),
    },
    { icon: Pencil, label: t("Rename…"), disabled: !path, run: () => tree.setEditing({ kind: "rename", path }) },
    entry.isDir
      ? {
          icon: Trash2,
          label: t("Move to trash"),
          disabled: !path,
          run: () => {},
          // A folder takes everything in it along: asked once more, in the menu itself
          more: async () => ({
            title: t("{folder} with everything in it into the trash?", { folder: entry.name }),
            items: [
              { icon: Trash2, label: t("Yes, into the trash"), run: () => void pathTrash([path]).catch(report) },
              { label: t("Cancel"), run: () => {} },
            ],
          }),
        }
      : { icon: Trash2, label: t("Move to trash"), hint: t("can be brought back"), run: () => void pathTrash([path]).catch(report) },
  );
  return items;
}

/** A name typed in place: Enter takes it, Escape or a click elsewhere leaves it. */
function NameInput({ initial, onDone, onCancel }: { initial: string; onDone: (name: string) => void; onCancel: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // The name without its extension is what one usually changes
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <input
      ref={input}
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const name = e.currentTarget.value.trim();
          if (name) onDone(name);
          else onCancel();
        } else if (e.key === "Escape") onCancel();
      }}
      onBlur={onCancel}
      className="min-w-0 flex-1 rounded border border-ai bg-base px-1 text-slate-100 outline-none"
    />
  );
}

/** The line where the name of a new file or folder is typed, first in its folder. */
function NewRow({ dir, folder, depth, tree }: { dir: string; folder: boolean; depth: number; tree: TreeState }) {
  const Icon = folder ? Folder : File;
  return (
    <div style={{ paddingLeft: 6 + depth * 14 }} className="flex h-[26px] items-center gap-1.5 pr-1.5">
      <span className="w-3.5 shrink-0" />
      <Icon className="size-4 shrink-0 text-slate-400" />
      <NameInput
        initial=""
        onCancel={() => tree.setEditing(null)}
        onDone={(name) => {
          tree.setEditing(null);
          pathCreate(dir, name, folder)
            .then((made) => {
              tree.reload(dir);
              // A new file is made to be written: it opens in the editor
              if (!folder) openAs(made, "edit");
            })
            .catch((e) => tree.fail(String(e)));
        }}
      />
    </div>
  );
}

/** A file deleted and not committed: grey where it was, so the tree shows what went. */
function GhostRow({ path, depth, tree }: { path: string; depth: number; tree: TreeState }) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return (
    <div
      data-tree-path={path}
      onContextMenu={(e) => tree.menu(e, path, pathItems(path, false, true))}
      style={{ paddingLeft: 6 + depth * 14 }}
      className="flex h-[26px] cursor-default items-center gap-1.5 rounded-md pr-1.5 text-slate-500"
      title={t("Deleted, not committed yet")}
    >
      <span className="w-3.5 shrink-0" />
      <File className="size-4 shrink-0" />
      <span className="truncate line-through">{name}</span>
      <span className={`ml-auto w-3 text-center font-mono text-[11px] ${stateColor.D}`}>{stateSymbol("D")}</span>
    </div>
  );
}

/** What a folder holds, when the mouse rests on its name (docs/DATEISPALTE.md, C3). */
function FolderCard({ entry, tree, inside, hidden, important }: { entry: Entry; tree: TreeState; inside: number; hidden: ReturnType<typeof hiddenBy>; important: boolean }) {
  const [stats, setStats] = useState<{ files: number; bytes: number; truncated: boolean } | null>(null);
  const marks = useSessionMarks();
  useEffect(() => {
    let alive = true;
    pathStats(entry.path)
      .then((s) => alive && setStats(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [entry.path]);
  const writers = [...new Set([...tree.touched.keys()].filter((p) => p.startsWith(`${entry.path}/`)).map((p) => marks.writer(p)).filter(Boolean))];
  return (
    <span className="flex flex-col gap-0.5 text-[12px]">
      <span className="font-mono text-slate-100">{entry.path}/</span>
      {stats ? (
        <span>
          {stats.truncated ? t("more than {files}", { files: plural(stats.files, "file") }) : plural(stats.files, "file")} · {size(stats.bytes)} · ≈ {tokensFor(stats.bytes).toLocaleString()} {t("tokens")}
        </span>
      ) : (
        <span className="text-slate-500">{t("Looking…")}</span>
      )}
      {inside > 0 && <span className="text-changed">{t("{changes} inside", { changes: plural(inside, "uncommitted change") })}</span>}
      {writers.length > 0 && (
        <span>
          {t("Written by")} {writers.map((w) => marks.of(w)?.short ?? "?").join(", ")}
        </span>
      )}
      {important && <span>{t("Marked as important")}</span>}
      {hidden && <span className="text-slate-500">{hiddenWhy(hidden)}</span>}
    </span>
  );
}

/**
 * The file list's own quick settings: how hidden things show, whether git's ignored counts as
 * hidden, whether the sessions' dots stay, whether @ai hints are marked; the rest in the settings.
 */
function FileQuickSettings({ settings, onChange }: { settings: FileSettings; onChange: (change: Partial<FileSettings>) => void }) {
  const menu = usePopover<HTMLDivElement>();
  const check = (label: string, on: boolean, flip: () => void) => (
    <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-slate-200 hover:bg-overlay-hover">
      <input type="checkbox" checked={on} onChange={flip} />
      {label}
    </label>
  );
  return (
    <div ref={menu.ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={t("Show in the file list")}
        onClick={() => menu.setOpen(!menu.open)}
        className={`rounded-md p-1.5 hover:bg-raised hover:text-slate-100 ${menu.open ? "bg-raised text-slate-100" : "text-slate-400"}`}
      >
        <SlidersHorizontal className="size-4" />
      </button>
      {menu.open && (
        <Panel width="w-[280px]">
          <Heading>{t("Show in the file list")}</Heading>
          <div className="flex items-center gap-2 px-3 py-1 text-slate-200">
            <span className="flex-1">{t("Hidden things")}</span>
            <select value={settings.look} onChange={(e) => onChange({ look: e.target.value as FileSettings["look"] })} className="rounded border border-line bg-base px-1 py-0.5 text-[12px]">
              <option value="dim">{t("faded")}</option>
              <option value="hide">{t("not shown")}</option>
            </select>
          </div>
          {check(t("Hide what git ignores"), settings.gitIgnored, () => onChange({ gitIgnored: !settings.gitIgnored }))}
          {check(t("Keep the dots of the sessions until the commit"), settings.keepDots, () => onChange({ keepDots: !settings.keepDots }))}
          {check(t("Mark files with @ai hints"), settings.hints, () => onChange({ hints: !settings.hints }))}
          <div className="mt-1 border-t border-overlay-line p-1">
            <button
              type="button"
              onClick={() => {
                menu.setOpen(false);
                void openSettings("files");
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left font-medium text-slate-50 hover:bg-overlay-hover"
            >
              <Settings className="size-4 text-slate-400" />
              {t("Settings…")}
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

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
