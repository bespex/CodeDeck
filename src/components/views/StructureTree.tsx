import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileInput,
  FileMinus2,
  FilePen,
  FilePlus2,
  Folder,
  FolderGit2,
  FolderInput,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  type LucideIcon,
} from "lucide-react";
import type { Patch, RepoStatus } from "../../backend";
import type { FileDiff } from "../../diff";
import { toProject } from "../../history";
import {
  buildTree,
  countDirs,
  filterTree,
  KINDS,
  modeNote,
  type DirNode,
  type FileNode,
  type Kind,
  type Node,
} from "../../structure";
import { Tooltip, TooltipHint } from "../Tooltip";
import { pathItems, useContextMenu } from "../ContextMenu";
import { reviewKey, toggleReviewed, useReviewed } from "../../reviewed";
import { AttachChange, DiffBody, FileButtons, inUntrackedDir, LineCounts, LookedAt, type Working } from "./DiffParts";

/** A new folder with more files than this opens collapsed. */
const MANY = 12;

const KIND: Record<Kind, { icon: LucideIcon; color: string; plural: string; only: string }> = {
  added: { icon: FilePlus2, color: "text-added", plural: "new", only: "Show only new files" },
  deleted: { icon: FileMinus2, color: "text-problem", plural: "deleted", only: "Show only deleted files" },
  moved: { icon: FileInput, color: "text-moved", plural: "moved or renamed", only: "Show only files that moved or got another name" },
  modified: { icon: FilePen, color: "text-changed", plural: "modified", only: "Show only files whose content changed" },
};

interface Props {
  patch: Patch;
  files: FileDiff[];
  repo: RepoStatus;
  /** For uncommitted changes: the file actions */
  onDone?: () => void;
  /** Selected in the file list (project-relative): opened and scrolled to */
  selected: string | null;
  /** Who changed a file (repository-relative path), as a small sign; nothing when that is not shown */
  who?: (path: string) => ReactNode;
}

/**
 * What changed as a tree: which files and folders are new, gone, moved or renamed, and which
 * only changed inside. A click on a file opens its diff right there.
 */
export function StructureTree({ patch, files, repo, onDone, selected, who }: Props) {
  const reviewed = useReviewed();
  const tree = useMemo(() => buildTree(patch), [patch]);
  const diffs = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const status = useMemo(() => new Map(repo.files.map((f) => [f.path, f])), [repo.files]);
  const [only, setOnly] = useState<Kind | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const shown = useMemo(() => (only ? filterTree(tree, (f) => f.kind === only) : tree), [tree, only]);
  const dirCounts = useMemo(() => countDirs(tree), [tree]);

  // A file selected in the list opens here
  useEffect(() => {
    const change = selected && patch.changes.find((c) => toProject(repo, c.path) === selected);
    if (!change) return;
    setOpen((o) => {
      const next = new Set(o).add(`f:${change.path}`);
      for (let dir = dirOf(change.path); dir; dir = dirOf(dir)) {
        next.delete(`-d:${dir}`);
        next.add(`+d:${dir}`);
      }
      return next;
    });
    requestAnimationFrame(() =>
      document.getElementById(`diff:${selected}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, patch]);

  const toggle = (key: string, now: boolean) =>
    setOpen((o) => {
      const next = new Set(o);
      if (key.startsWith("d:")) {
        next.delete(`${now ? "-" : "+"}${key}`);
        next.add(`${now ? "+" : "-"}${key}`);
      } else if (now) next.add(key);
      else next.delete(key);
      return next;
    });

  const contextMenu = useContextMenu();
  const ctx: Ctx = {
    menu: contextMenu.open,
    repo,
    diffs,
    open,
    toggle,
    who,
    reviewed,
    working: onDone
      ? (path) => ({ repo, status: status.get(toProject(repo, path)) ?? inUntrackedDir(repo, toProject(repo, path)), onDone })
      : undefined,
  };

  return (
    <div className="rounded-lg border border-line bg-panel">
      <Summary tree={tree} dirs={dirCounts} only={only} setOnly={setOnly} />
      <ul className="py-1" role="tree">
        {shown.children.map((node) => (
          <TreeNode key={node.path + node.type} node={node} depth={0} ctx={ctx} />
        ))}
      </ul>
      {contextMenu.element}
      {patch.truncated && (
        <p className="border-t border-line px-3 py-1.5 text-[12px] text-changed">
          The diff is very long: the files are all listed, the code only of the first ones.
        </p>
      )}
    </div>
  );
}

interface Ctx {
  repo: RepoStatus;
  diffs: Map<string, FileDiff>;
  /** `+d:path`/`-d:path` overrides a folder's default; `f:path` is an open file */
  open: Set<string>;
  toggle: (key: string, open: boolean) => void;
  who?: (path: string) => ReactNode;
  /** Whether the change with this key is ticked as looked at */
  reviewed: (key: string) => boolean;
  working?: (path: string) => Working;
  menu: ReturnType<typeof useContextMenu>["open"];
}

/** Counts per kind, each a filter: click to see only those, again to see all. */
function Summary(props: {
  tree: DirNode;
  dirs: Record<"new" | "gone" | "moved", number>;
  only: Kind | null;
  setOnly: (k: Kind | null) => void;
}) {
  const { tree, dirs, only, setOnly } = props;
  const folders: [number, LucideIcon, string, string][] = [
    [dirs.new, FolderPlus, "text-added", "new"],
    [dirs.gone, FolderMinus, "text-problem", "deleted"],
    [dirs.moved, FolderInput, "text-moved", "moved"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5 text-[12px]">
      {KINDS.filter((k) => tree.counts[k] > 0).map((k) => {
        const { icon: Icon, color, plural, only: tip } = KIND[k];
        const active = only === k;
        return (
          <Tooltip
            key={k}
            content={
              <>
                <span>
                  {tree.counts[k]} {plural} file{tree.counts[k] === 1 ? "" : "s"}
                </span>
                <TooltipHint>{active ? "Click to show everything again" : `Click: ${tip.toLowerCase()}`}</TooltipHint>
              </>
            }
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => setOnly(active ? null : k)}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                active ? "bg-raised text-slate-100 ring-1 ring-slate-500" : "text-slate-400 hover:bg-raised hover:text-slate-200"
              }`}
            >
              <Icon className={`size-3.5 ${color}`} />
              <span className="font-mono">{tree.counts[k]}</span>
              <span>{plural}</span>
            </button>
          </Tooltip>
        );
      })}
      {folders.some(([n]) => n > 0) && <span className="mx-1 h-4 w-px bg-line" />}
      {folders
        .filter(([n]) => n > 0)
        .map(([n, Icon, color, word]) => (
          <span key={word} className="flex items-center gap-1 px-1 text-slate-400">
            <Icon className={`size-3.5 ${color}`} />
            <span className="font-mono">{n}</span>
            {word} folder{n === 1 ? "" : "s"}
          </span>
        ))}
      <span className="ml-auto pr-1">
        <LineCounts added={tree.added} removed={tree.removed} />
      </span>
    </div>
  );
}

function TreeNode({ node, depth, ctx }: { node: Node; depth: number; ctx: Ctx }) {
  return node.type === "dir" ? <DirRow dir={node} depth={depth} ctx={ctx} /> : <FileRow file={node} depth={depth} ctx={ctx} />;
}

const files = (d: DirNode) => KINDS.reduce((n, k) => n + d.counts[k], 0);

/** Folders open unless what is inside is not news: deleted, moved as a whole, or a big new one. */
const openByDefault = (d: DirNode) =>
  d.state === "changed" || (d.state === "new" && files(d) <= MANY);

function DirRow({ dir, depth, ctx }: { dir: DirNode; depth: number; ctx: Ctx }) {
  const key = `d:${dir.path}`;
  const isOpen = ctx.open.has(`+${key}`) || (!ctx.open.has(`-${key}`) && openByDefault(dir));
  const n = files(dir);
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const look = {
    new: { icon: FolderPlus, color: "text-added", note: "new folder", says: `New folder with ${n} file${n === 1 ? "" : "s"}` },
    gone: { icon: FolderMinus, color: "text-problem", note: "folder deleted", says: `Deleted folder: its ${n} file${n === 1 ? " is" : "s are"} gone` },
    moved: {
      icon: FolderInput,
      color: "text-moved",
      note: movedNote(dir.from ?? "", dir.path),
      says: `Moved as a whole from ${dir.from}/ with its ${n} file${n === 1 ? "" : "s"}`,
    },
    changed: { icon: isOpen ? FolderOpen : Folder, color: "text-slate-500", note: "", says: "" },
  }[dir.state];

  return (
    <li role="treeitem" aria-expanded={isOpen}>
      <button
        type="button"
        onClick={() => ctx.toggle(key, !isOpen)}
        onContextMenu={(e) => {
          const path = toProject(ctx.repo, dir.path);
          ctx.menu(e, `${path}/`, pathItems(path, true, dir.state === "gone"));
        }}
        style={{ paddingLeft: 8 + depth * 16 }}
        className="flex h-7 w-full items-center gap-1.5 pr-3 text-left hover:bg-raised"
      >
        <Chevron className="size-3.5 shrink-0 text-slate-500" />
        <Hint text={look.says}>
          <look.icon className={`size-4 shrink-0 ${look.color}`} />
        </Hint>
        <span className="truncate font-mono text-[12px] text-slate-200">{dir.name}</span>
        {look.note && <span className="truncate text-[11px] text-slate-500">{look.note}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {!isOpen && <DirCounts dir={dir} />}
        </span>
      </button>
      {isOpen && (
        <ul role="group">
          {dir.children.map((child) => (
            <TreeNode key={child.path + child.type} node={child} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** For a closed folder: what is inside, as symbols with numbers. */
function DirCounts({ dir }: { dir: DirNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
      {KINDS.filter((k) => dir.counts[k] > 0).map((k) => {
        const { icon: Icon, color } = KIND[k];
        return (
          <span key={k} className="flex items-center gap-0.5">
            <Icon className={`size-3 ${color}`} />
            <span className="font-mono">{dir.counts[k]}</span>
          </span>
        );
      })}
    </span>
  );
}

function FileRow({ file, depth, ctx }: { file: FileNode; depth: number; ctx: Ctx }) {
  const key = `f:${file.path}`;
  const isOpen = ctx.open.has(key);
  const c = file.change;
  const working = ctx.working?.(file.path);
  const look = fileLook(file);
  const lookedKey = reviewKey(ctx.repo.path, file.path, ctx.diffs.get(file.path), `${c.status}:${c.added}:${c.removed}`);
  const looked = ctx.reviewed(lookedKey);
  const notes = [
    file.withFolder ? null : file.renamed ? `was ${nameOf(c.from!)}` : c.status === "R" ? movedNote(dirOf(c.from!), dirOf(c.path), nameOf(c.from!), file.name) : null,
    c.status === "C" ? `copy of ${c.from}` : null,
    (c.status === "R" || c.status === "C") && c.similarity !== null && c.similarity < 100 ? `edited, ${c.similarity} % alike` : null,
    modeNote(c),
    c.added === null ? "binary" : null,
  ].filter(Boolean);

  return (
    <li role="treeitem" aria-expanded={isOpen} id={`diff:${toProject(ctx.repo, file.path)}`} className="scroll-mt-2">
      <div
        className={`group flex h-7 w-full cursor-pointer items-center gap-1.5 pr-2 hover:bg-raised ${isOpen ? "bg-raised/60" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => ctx.toggle(key, !isOpen)}
        onContextMenu={(e) => {
          const path = toProject(ctx.repo, file.path);
          ctx.menu(e, path, pathItems(path, false, file.kind === "deleted"));
        }}
      >
        <LookedAt
          checked={looked}
          name={file.name}
          onChange={() => {
            toggleReviewed(lookedKey);
            // Looked at: its diff has done its job
            if (!looked) ctx.toggle(key, false);
          }}
        />
        <Hint text={look.says}>
          <look.icon className={`size-4 shrink-0 ${look.color}`} />
        </Hint>
        <button
          type="button"
          aria-expanded={isOpen}
          className={`min-w-0 truncate text-left font-mono text-[12px] outline-none focus-visible:underline ${
            file.kind === "deleted" ? "text-slate-400 line-through decoration-problem/50" : looked ? "text-slate-400" : "text-slate-100"
          }`}
        >
          {file.name}
        </button>
        {ctx.who?.(file.path)}
        {notes.length > 0 && <span className="min-w-0 truncate text-[11px] text-slate-500">{notes.join(" · ")}</span>}
        {working?.status?.staged && (
          <Hint text="Staged: part of the next commit">
            <span className="size-1.5 shrink-0 rounded-full bg-slate-400" />
          </Hint>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <LineCounts added={c.added} removed={c.removed} />
          {/* Not a click on the row: that opens the diff */}
          <span className="flex" onClick={(e) => e.stopPropagation()}>
            <AttachChange path={file.path} added={file.kind === "added"} />
          </span>
          {working && <FileButtons path={c.path} from={c.from ?? undefined} added={file.kind === "added"} working={working} />}
        </span>
      </div>
      {isOpen && (
        <div className="mr-2 mb-2 overflow-hidden rounded-md border border-line" style={{ marginLeft: 8 + depth * 16 + 18 }}>
          <DiffBody
            file={ctx.diffs.get(file.path)}
            missing={c.similarity === 100 ? "Same content, only its place changed" : undefined}
            notePath={file.kind === "deleted" ? undefined : toProject(ctx.repo, file.path)}
          />
        </div>
      )}
    </li>
  );
}

function fileLook(file: FileNode): { icon: LucideIcon; color: string; says: string } {
  const c = file.change;
  if (c.newMode === "160000" || c.oldMode === "160000") {
    return { icon: FolderGit2, color: KIND[file.kind].color, says: "A repository of its own inside this one" };
  }
  if (file.withFolder) {
    return c.similarity === 100
      ? { icon: File, color: "text-slate-500", says: "Moved with its folder, content unchanged" }
      : { icon: FilePen, color: "text-changed", says: `Moved with its folder and edited (${c.similarity} % alike)` };
  }
  const { icon, color } = KIND[file.kind];
  const says =
    c.status === "A"
      ? "New file"
      : c.status === "C"
        ? `New file, a copy of ${c.from}`
        : c.status === "D"
          ? "Deleted file"
          : c.status === "R"
            ? `${file.renamed ? "Renamed" : "Moved"} from ${c.from}${c.similarity === 100 ? ", content unchanged" : `, and edited (${c.similarity} % alike)`}`
            : c.status === "T"
              ? "Changed its type (file, link or repository)"
              : "Content changed";
  return { icon, color, says };
}

/** `from src/net/` when only the folder changed, `from src/net/old.rs` when the name too. */
function movedNote(fromDir: string, toDir: string, fromName?: string, toName?: string): string {
  const name = fromName !== undefined && fromName !== toName ? fromName : "";
  if (dirOf(fromDir) === dirOf(toDir) && fromName === undefined) return `renamed from ${nameOf(fromDir)}`;
  return `from ${fromDir ? `${fromDir}/` : "top level/"}${name}`;
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function Hint({ text, children }: { text: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip content={<span>{text}</span>} className="flex shrink-0">
      {children}
    </Tooltip>
  );
}
