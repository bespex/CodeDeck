import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Eye, FileText, Folder, FolderOpen, GripVertical, Trash2 } from "lucide-react";
import { onFsChanged, openFile, showInFileManager, scratchList, scratchTrash, type AssistantState, type WorkFile } from "../../backend";
import { mainHarness, shortId, useSessionMarks } from "../../assistant";
import type { Markers } from "../../markers";
import { HintsTile } from "./HintsTile";
import { Section, useFold, useShowAll } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { Tooltip } from "../Tooltip";
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
 * keeps its count in the heading; long lists show their first entries. With room (a wide deck) the
 * first two stand side by side and the scratch folder takes the whole width below.
 */
export function WorkbenchView({ marks, assistant }: { marks: Markers; assistant: AssistantState }) {
  const { outside, pages } = assistant.found;
  return (
    <div className="@container flex min-h-full flex-col">
      <div className="grid items-start @5xl:grid-cols-2">
        {(outside.length > 0 || pages.length > 0) && <OutsideTile files={outside} pages={pages} />}
        <HintsTile marks={marks} harness={mainHarness(assistant)} />
        <div className="min-w-0 @5xl:col-span-2">
          <ScratchTile />
        </div>
      </div>
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
      .then((f) => (setFiles(f), setError(null)))
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
      help={t("One folder in the project for drafts, mock-ups, throwaway scripts and test data. Sessions are told to put such things here. Git ignores it, so nothing here is committed by accident. To make a file part of the project, drag it onto a folder in the file list. Double click views a file, middle click edits it.")}
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
            <Tooltip content={<span>{t("Open the folder in the file manager")}</span>}>
              <button
                type="button"
                aria-label={t("Open the folder")}
                onClick={() => showInFileManager(SCRATCH_DIR)}
                className="rounded-md p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
              >
                <FolderOpen className="size-3.5" />
              </button>
            </Tooltip>
          )}
        </>
      }
    >
      <p className="mb-2 text-[12px]">{t("Drafts and test data of the sessions; git ignores it. Drag a file onto a folder of the file list to keep it.")}</p>
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
        <ul className="divide-y divide-line/70 border-y border-line/70">
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

/** A folder: closed, with how many files, their size and the newest change; opens on click. */
function DirRow({ dir, depth, now, onTrash }: { dir: Dir; depth: number; now: number; onTrash: (paths: string[], what: string) => void }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const Icon = open ? FolderOpen : Folder;
  const name = dir.path.slice(SCRATCH_DIR.length + 1);
  return (
    <>
      <li className="group flex min-h-8 items-center gap-2 py-1 pr-1" style={{ paddingLeft: 4 + depth * 18 }}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
          <Icon className="size-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-mono text-[12px] text-slate-200">{dir.name}/</span>
          <span className="shrink-0 text-[11px] text-slate-500">
            {plural(dir.count, "file")} · {age(dir.newest, now)}
          </span>
        </button>
        <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{size(dir.size)}</span>
        <div className="flex shrink-0 gap-0.5">
          <Tooltip content={<span>{t("Show it in the file manager")}</span>}>
            <button
              type="button"
              aria-label={t("Show {name} in the file manager", { name })}
              onClick={() => showInFileManager(dir.path)}
              className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
            >
              <FolderOpen className="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip content={<span>{t("The whole folder into the trash, where it can still be brought back")}</span>}>
            <button
              type="button"
              aria-label={t("Delete {name}", { name })}
              onClick={() => onTrash([dir.path], `${name}/ (${plural(dir.count, "file")})`)}
              className="rounded p-1 text-slate-500 hover:bg-raised hover:text-problem"
            >
              <Trash2 className="size-3.5" />
            </button>
          </Tooltip>
        </div>
      </li>
      {open && <DirContent dir={dir} depth={depth + 1} now={now} onTrash={onTrash} />}
    </>
  );
}

/** A file: dragged onto a folder of the file list it moves into the project. */
function FileRow({ file: f, depth, now, onTrash }: { file: WorkFile; depth: number; now: number; onTrash: (paths: string[], what: string) => void }) {
  const marks = useSessionMarks();
  const writer = marks.writer(f.path);
  const mark = marks.of(writer);
  const isOld = now - f.modified > OLD_DAYS * DAY;
  const name = f.path.split("/").pop() ?? f.path;
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SCRATCH_DRAG, f.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      // As in the file list: double click views, middle click edits
      onDoubleClick={() => openFile(f.path, "view")}
      onAuxClick={(e) => e.button === 1 && openFile(f.path, "edit")}
      className="group flex min-h-9 cursor-grab items-center gap-2 py-1 pr-1 active:cursor-grabbing"
      style={{ paddingLeft: 4 + depth * 18 }}
    >
      <GripVertical className="size-3.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
      <FileText className="size-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[12px] text-slate-200" title={f.path}>
          {name}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] ${isOld ? "text-changed" : "text-slate-500"}`}>
          <span>{age(f.modified, now)}</span>
          {writer && (
            <>
              <span>·</span>
              {mark && <SessionBadge mark={mark} />}
              <span className="truncate text-slate-400">{mark?.title ?? t("session {id}", { id: shortId(writer) })}</span>
            </>
          )}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{size(f.size)}</span>
      <div className="flex shrink-0 gap-0.5">
        <Tooltip content={<span>{t("Open it in its viewer")}</span>}>
          <button type="button" aria-label={t("Open {name}", { name })} onClick={() => openFile(f.path, "view")} className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100">
            <Eye className="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip content={<span>{t("Into the trash, where it can still be brought back")}</span>}>
          <button type="button" aria-label={t("Delete {name}", { name })} onClick={() => onTrash([f.path], name)} className="rounded p-1 text-slate-500 hover:bg-raised hover:text-problem">
            <Trash2 className="size-3.5" />
          </button>
        </Tooltip>
      </div>
    </li>
  );
}
