import { useCallback, useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import { NewsTag, newsClass } from "../News";
import { markSeen, reportNews, scratchKey, useNews } from "../../news";
import { Check, ChevronDown, ChevronRight, Eye, FileText, Folder, FolderOpen, FolderSearch, GripVertical, SquarePen, Trash2 } from "lucide-react";
import { onFsChanged, openFile, showInFileManager, scratchList, scratchTrash, type AssistantState, type WorkFile } from "../../backend";
import { mainHarness, shortId, useSessionMarks } from "../../assistant";
import type { Markers } from "../../markers";
import { HintsTile } from "./HintsTile";
import { Section, useFold, useShowAll } from "../blocks";
import { Tooltip, ToolTipBody } from "../Tooltip";
import { AppName } from "../../apps";
import { plural } from "../../git";
import { inScratch, useLastMove, SCRATCH_DIR, SCRATCH_DRAG } from "../../scratch";
import { age, size } from "./units";
import { OutsideTile } from "./FoundTiles";
import { T, t } from "../../i18n";

/** Older than this, a file is offered for clearing away. Fixed for now, a setting later. */
const OLD_DAYS = 7;
const DAY = 24 * 3600_000;
/** With more files than this the scratch folder starts closed, until opened once. */
const SCRATCH_OPEN_UP_TO = 20;

/**
 * What else came up that is not part of the project yet? (D23) The Workbench gathers it in tiles,
 * what wants a decision first: what sessions put outside the project (only while there is some),
 * the `@ai` hints left in files, then the scratch folder, the store. Each tile can be closed and
 * keeps its count in the heading; long lists show their first entries. They stand one below the other,
 * a hairline between: side by side each would be too narrow for its rows.
 */
export function WorkbenchView({ marks, assistant }: { marks: Markers; assistant: AssistantState }) {
  const { outside, pages } = assistant.found;
  return (
    <div className="flex min-h-full flex-col">
      {(outside.length > 0 || pages.length > 0) && <OutsideTile files={outside} pages={pages} />}
      <HintsTile marks={marks} harness={mainHarness(assistant)} />
      <ScratchTile />
    </div>
  );
}

/** A folder of the scratch folder, with what is in it. */
interface Dir {
  name: string;
  /** Project-relative */
  path: string;
  files: WorkFile[];
  dirs: Dir[];
  /** Everything below it */
  count: number;
  size: number;
  newest: number;
}

/** The scratch folder's files as a tree: loose files first, newest first, then folders by their newest file. */
function treeOf(files: WorkFile[]): Dir {
  const root: Dir = { name: SCRATCH_DIR, path: SCRATCH_DIR, files: [], dirs: [], count: 0, size: 0, newest: 0 };
  for (const f of files) {
    const parts = f.path.slice(SCRATCH_DIR.length + 1).split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.find((d) => d.name === part);
      if (!next) {
        next = { name: part, path: `${dir.path}/${part}`, files: [], dirs: [], count: 0, size: 0, newest: 0 };
        dir.dirs.push(next);
      }
      dir = next;
    }
    dir.files.push(f);
  }
  const sum = (d: Dir) => {
    d.dirs.forEach(sum);
    d.files.sort((a, b) => b.modified - a.modified);
    d.dirs.sort((a, b) => b.newest - a.newest);
    d.count = d.files.length + d.dirs.reduce((n, c) => n + c.count, 0);
    d.size = d.files.reduce((n, f) => n + f.size, 0) + d.dirs.reduce((n, c) => n + c.size, 0);
    d.newest = Math.max(0, ...d.files.map((f) => f.modified), ...d.dirs.map((c) => c.newest));
  };
  sum(root);
  return root;
}

/**
 * The scratch folder: one folder in the project for drafts, mock-ups, throwaway scripts and test
 * data, which sessions are told to use. Git ignores it. Shown as a tree with closed folders, so a
 * long piece of work is one line; a folder goes to the trash as a whole. A file becomes part of the
 * project by dragging it onto a folder of the file list.
 */
function ScratchTile() {
  const [files, setFiles] = useState<WorkFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState<string | null>(null);
  const moved = useLastMove();
  const fold = useFold("scratch", (files?.length ?? 0) <= SCRATCH_OPEN_UP_TO);

  const load = useCallback(() => {
    scratchList()
      .then((f) => {
        setFiles(f);
        setError(null);
        reportNews("scratch", f.map(scratchItem));
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    // Anything in or around the scratch folder: read it again (a move out of it lands elsewhere)
    const stop = onFsChanged((change) => {
      if (![...change.dirs, ...change.paths].some((p) => inScratch(p) || p === "")) return;
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [load]);
  // A move is told by whoever did it; the list follows
  useEffect(load, [moved, load]);

  const tree = useMemo(() => treeOf(files ?? []), [files]);
  const now = Date.now();
  const old = (files ?? []).filter((f) => now - f.modified > OLD_DAYS * DAY);

  const trash = async (paths: string[], what: string) => {
    try {
      await scratchTrash(paths);
      setCleared(t("{what} moved to the trash", { what }));
    } catch (e) {
      setCleared(null);
      setError(String(e));
    }
    load();
  };

  return (
    <Section
      fold={fold}
      title={
        <>
          {t("Scratch folder")} <code className="ml-1 font-mono text-[12px] font-normal text-slate-400">{SCRATCH_DIR}/</code>
        </>
      }
      note={files && files.length > 0 ? `${plural(files.length, "file")} · ${size(tree.size)}` : undefined}
      help={t("One folder in the project for drafts, mock-ups, throwaway scripts and test data. AI sessions are told to put such things here. Git ignores it, so nothing here is committed by accident. To make a file part of the project, drag it onto a folder in the file list. Double click views a file, middle click edits it.")}
      aside={
        <>
          {old.length > 0 && (
            <Tooltip content={<span>{t("Into the trash, where they can still be brought back")}</span>}>
              <button
                type="button"
                onClick={() => trash(old.map((f) => f.path), plural(old.length, "file"))}
                className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100"
              >
                <Trash2 className="size-3.5" />
                {t("Delete {n} older than {days} days ({size})", { n: old.length, days: OLD_DAYS, size: size(old.reduce((n, f) => n + f.size, 0)) })}
              </button>
            </Tooltip>
          )}
          {files && files.length > 0 && (
            <Tooltip content={<ToolTipBody label={t("Show in file manager")} says={t("Opens this folder in the file manager")} />}>
              <button
                type="button"
                aria-label={t("Show in file manager")}
                onClick={() => showInFileManager(SCRATCH_DIR)}
                className="rounded-md p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
              >
                <FolderSearch className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </>
      }
    >
      <p className="mb-2 text-[12px]">{t("Drafts and test data of the AI sessions; git ignores it. Drag a file onto a folder of the file list to keep it.")}</p>
      {moved && (
        <p className={`mb-2 flex items-center gap-1.5 text-[12px] ${moved.error ? "text-problem" : "text-slate-300"}`}>
          {moved.error ? (
            <span className="selectable">{moved.error}</span>
          ) : (
            <>
              <Check className="size-3.5 text-added" /> <T text="Moved into the project: {path}" path={<code className="font-mono">{moved.to}</code>} />
            </>
          )}
        </p>
      )}
      {cleared && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-slate-300">
          <Check className="size-3.5 text-added" /> {cleared}
        </p>
      )}
      {error && <p className="selectable mb-2 text-problem">{error}</p>}
      {files && files.length === 0 && <p>{t("The scratch folder is empty.")}</p>}
      {files && files.length > 0 && (
        <ul>
          <DirContent dir={tree} depth={0} now={now} onTrash={trash} />
        </ul>
      )}
    </Section>
  );
}

/** What is in a folder: its loose files, then its folders; long lists show their first entries. */
function DirContent({ dir, depth, now, onTrash }: { dir: Dir; depth: number; now: number; onTrash: (paths: string[], what: string) => void }) {
  const entries = useMemo(() => [...dir.files.map((f) => ({ file: f })), ...dir.dirs.map((d) => ({ dir: d }))], [dir]);
  const { items, more } = useShowAll(entries);
  return (
    <>
      {items.map((e) =>
        "file" in e ? (
          <FileRow key={e.file.path} file={e.file} depth={depth} now={now} onTrash={onTrash} />
        ) : (
          <DirRow key={e.dir.path} dir={e.dir} depth={depth} now={now} onTrash={onTrash} />
        ),
      )}
      {more && (
        <li className="py-0.5" style={{ paddingLeft: 8 + depth * 18 }}>
          {more}
        </li>
      )}
    </>
  );
}

const ACTION = "rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100";

/**
 * One line of the scratch folder, the same columns for folders and files so they line up:
 * handle or chevron, icon, name, then to the right the time, the size, a gap, the four actions
 * (view, edit, file manager, trash; a folder leaves the first two empty).
 */
function ScratchLine(props: {
  depth: number;
  lead: ReactNode;
  icon: ReactNode;
  name: ReactNode;
  when: string;
  old?: boolean;
  size: number;
  actions: ReactNode;
  rowProps?: HTMLAttributes<HTMLLIElement> & { draggable?: boolean };
}) {
  const { className, ...rest } = props.rowProps ?? {};
  return (
    <li {...rest} className={`group flex min-h-8 items-center gap-2 rounded py-0.5 pr-1 hover:bg-raised/50 ${className ?? ""}`} style={{ paddingLeft: 4 + props.depth * 18 }}>
      <span className="flex size-3.5 shrink-0 items-center justify-center">{props.lead}</span>
      {props.icon}
      <span className="flex min-w-0 flex-1 items-baseline gap-2">{props.name}</span>
      <span className={`w-24 shrink-0 text-right text-[11px] whitespace-nowrap ${props.old ? "text-changed" : "text-slate-500"}`}>{props.when}</span>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-slate-500 tabular-nums">{size(props.size)}</span>
      <div className="ml-4 flex shrink-0 gap-0.5">{props.actions}</div>
    </li>
  );
}

/** A folder: closed, with how many files, their size and the newest change; opens on click. */
function DirRow({ dir, depth, now, onTrash }: { dir: Dir; depth: number; now: number; onTrash: (paths: string[], what: string) => void }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = open ? FolderOpen : Folder;
  const name = dir.path.slice(SCRATCH_DIR.length + 1);
  const news = useNews();
  // A closed folder says how much in it is new, so one need not open each
  const fresh = filesIn(dir).filter((f) => news.of(scratchItem(f))).length;
  return (
    <>
      <ScratchLine
        depth={depth}
        // As in the file list, a folder opens with a click, a double click or a middle click (the second
        // click of a double click is not counted, or it would close it again); the buttons in the line do their own thing
        rowProps={{
          onClick: (e) => e.detail <= 1 && !(e.target as HTMLElement).closest("button") && setOpen(!open),
          onAuxClick: (e) => e.button === 1 && setOpen(!open),
          className: "cursor-pointer",
        }}
        lead={<Chevron className="size-3.5 text-slate-500" />}
        icon={<Icon className="size-3.5 shrink-0 text-slate-400" />}
        name={
          <button type="button" aria-expanded={open} onClick={(e) => e.detail <= 1 && setOpen(!open)} className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
            <span className="truncate font-mono text-[12px] text-slate-200">{dir.name}/</span>
            <span className="shrink-0 text-[11px] text-slate-500">{plural(dir.count, "file")}</span>
            {fresh > 0 && <span className="news-tag shrink-0">{plural(fresh, "new entry")}</span>}
          </button>
        }
        when={age(dir.newest, now)}
        size={dir.size}
        actions={
          <>
            <span className="size-[22px]" />
            <span className="size-[22px]" />
            <Tooltip content={<ToolTipBody label={t("Show in file manager")} says={t("Opens this folder in the file manager")} />}>
              <button type="button" aria-label={t("Show in file manager")} onClick={() => showInFileManager(dir.path)} className={ACTION}>
                <FolderSearch className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={<ToolTipBody label={t("Move to trash")} says={t("The whole folder into the trash, where it can still be brought back")} />}>
              <button
                type="button"
                aria-label={t("Move to trash")}
                onClick={() => onTrash([dir.path], `${name}/ (${plural(dir.count, "file")})`)}
                className="rounded p-1 text-slate-500 hover:bg-raised hover:text-problem"
              >
                <Trash2 className="size-3.5" />
              </button>
            </Tooltip>
          </>
        }
      />
      {open && <DirContent dir={dir} depth={depth + 1} now={now} onTrash={onTrash} />}
    </>
  );
}

/** A scratch file as an entry of the Workbench for "new": changed when it was changed after it was seen. */
const scratchItem = (f: WorkFile) => ({ key: scratchKey(f.path), time: f.modified, changes: true });
/** All files below a folder. */
const filesIn = (d: Dir): WorkFile[] => [...d.files, ...d.dirs.flatMap(filesIn)];

/** A file: dragged onto a folder of the file list it moves into the project. */
function FileRow({ file: f, depth, now, onTrash }: { file: WorkFile; depth: number; now: number; onTrash: (paths: string[], what: string) => void }) {
  const marks = useSessionMarks();
  const writer = marks.writer(f.path);
  const mark = marks.of(writer);
  const name = f.path.split("/").pop() ?? f.path;
  // One line only: who wrote it is in the tooltip
  const by = writer ? t("written by {who}", { who: mark?.title ?? t("session {id}", { id: shortId(writer) }) }) : "";
  const news = useNews().of(scratchItem(f));
  return (
    <ScratchLine
      depth={depth}
      rowProps={{
        draggable: true,
        // Anything done with it means it was seen
        onClickCapture: () => news && markSeen(scratchItem(f)),
        onDragStart: (e) => {
          e.dataTransfer.setData(SCRATCH_DRAG, f.path);
          e.dataTransfer.effectAllowed = "move";
        },
        // As in the file list: double click views, middle click edits
        onDoubleClick: () => openFile(f.path, "view"),
        onAuxClick: (e) => e.button === 1 && openFile(f.path, "edit"),
        className: `cursor-grab active:cursor-grabbing ${newsClass(news)}`,
        onDragStartCapture: () => news && markSeen(scratchItem(f)),
      }}
      lead={<GripVertical className="size-3.5 text-slate-600 group-hover:text-slate-400" />}
      icon={<FileText className="size-3.5 shrink-0 text-slate-400" />}
      name={
        <>
          <span className="truncate font-mono text-[12px] text-slate-200" title={by ? `${f.path}\n${by}` : f.path}>
            {name}
          </span>
          <NewsTag news={news} />
        </>
      }
      when={age(f.modified, now)}
      old={now - f.modified > OLD_DAYS * DAY}
      size={f.size}
      actions={
        <>
          <Tooltip
            content={
              <ToolTipBody
                label={t("View")}
                says={<T text="Opens it in {app}" app={<AppName path={f.path} role="view" />} />}
                hint={t("Also: double-click the file")}
              />
            }
          >
            <button type="button" aria-label={t("View")} onClick={() => openFile(f.path, "view")} className={ACTION}>
              <Eye className="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip
            content={
              <ToolTipBody
                label={t("Edit")}
                says={<T text="Opens it in {app}" app={<AppName path={f.path} role="edit" />} />}
                hint={t("Also: middle-click the file")}
              />
            }
          >
            <button type="button" aria-label={t("Edit")} onClick={() => openFile(f.path, "edit")} className={ACTION}>
              <SquarePen className="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={<ToolTipBody label={t("Show in file manager")} says={t("Opens its folder in the file manager, with it selected")} />}>
            <button type="button" aria-label={t("Show in file manager")} onClick={() => showInFileManager(f.path)} className={ACTION}>
              <FolderSearch className="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={<ToolTipBody label={t("Move to trash")} says={t("Into the trash, where it can still be brought back")} />}>
            <button type="button" aria-label={t("Move to trash")} onClick={() => onTrash([f.path], name)} className="rounded p-1 text-slate-500 hover:bg-raised hover:text-problem">
              <Trash2 className="size-3.5" />
            </button>
          </Tooltip>
        </>
      }
    />
  );
}
