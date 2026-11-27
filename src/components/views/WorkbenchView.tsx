import { useCallback, useContext, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { NewsTag, newsClass } from "../News";
import { markSeen, reportNews, scratchKey, useNews } from "../../news";
import { Bookmark, Brush, Check, ChevronDown, ChevronRight, Eye, FileText, Folder, FolderOpen, FolderSearch, GripVertical, SquarePen, Trash2 } from "lucide-react";
import { onFsChanged, openFile, showInFileManager, scratchList, scratchTrash, scratchTwins, type AssistantState, type WorkFile } from "../../backend";
import { tidyPlan, type TidyGroup, type TidyItem } from "../../tidy";
import { files as attachedFiles } from "../../files";
import { mainHarness, shortId, useSessionMarks } from "../../assistant";
import type { Markers } from "../../markers";
import { TodoZone } from "./TodoZone";
import { NewZone } from "./NewZone";
import { usePlan } from "../../plan";
import { shownProject } from "../../projectMemory";
import { Section, useFold, useShowAll } from "../blocks";
import { Tooltip, ToolTipBody } from "../Tooltip";
import { AppName } from "../../apps";
import { plural } from "../../git";
import { expiresAt, inScratch, isKept, KeptContext, scratchKind, unitOf, useExpiry, useLastMove, SCRATCH_DIR, SCRATCH_DRAG, type ScratchKind } from "../../scratch";
import { showScratchKind, useFileMarks } from "../../fileView";
import { age, size } from "./units";
import { OutsideTile } from "./FoundTiles";
import { PlanTile } from "./PlanTile";
import { plural as pluralOf, T, t } from "../../i18n";

const DAY = 24 * 3600_000;

/**
 * What else came up that is not part of the project yet? (D23, roadmap U8.4) The Workbench in zones,
 * by how much they want from you: on top the plan from the project's planning files, the one surface
 * of the view; below in two columns without frames what you asked of the AI and is not done yet (To
 * do) and what came up since you last looked (New); at the bottom, folded, the stores: what sessions
 * put outside the project and the scratch folder, with everything they could do before.
 */
export function WorkbenchView({ marks, assistant }: { marks: Markers; assistant: AssistantState }) {
  const { outside, pages } = assistant.found;
  // A panel is made anew for each project: the one shown now is its project
  const project = useRef(shownProject() ?? "preview").current;
  const plan = usePlan(project);
  const scratch = useScratchFiles();
  const [fileMarks, setFileMark] = useFileMarks(project === "preview" ? "preview" : project);
  const kept = useMemo(() => ({ kept: fileMarks.kept ?? [], keep: (path: string, on: boolean) => setFileMark("kept", path, on) }), [fileMarks.kept, setFileMark]);
  return (
    <KeptContext.Provider value={kept}>
    <div className="@container flex min-h-full flex-col">
      <PlanTile plan={plan} />
      <div className="grid grid-cols-1 items-start gap-4 px-4 pt-4 pb-2 @2xl:grid-cols-2">
        <TodoZone marks={marks} harness={mainHarness(assistant)} plan={plan} />
        <NewZone files={scratch.files ?? []} outside={outside} pages={pages} />
      </div>
      <div className="mt-auto pt-4">
        {(outside.length > 0 || pages.length > 0) && <OutsideTile files={outside} pages={pages} />}
        <ScratchTile assistant={assistant} scratch={scratch} />
      </div>
    </div>
    </KeptContext.Provider>
  );
}

/** The scratch folder's files, read again when something in or around it changes; once for the view. */
function useScratchFiles(): { files: WorkFile[] | null; error: string | null; load: () => void } {
  const [files, setFiles] = useState<WorkFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moved = useLastMove();
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
  return { files, error, load };
}

const KIND_NOUN: [ScratchKind, string, string][] = [
  ["draft", "draft", "drafts"],
  ["image", "image", "images"],
  ["script", "script", "scripts"],
  ["data", "data file", "data files"],
  ["backup", "backup", "backups"],
  ["other", "other file", "other files"],
];

/** How soon counts as "soon" for expiry: said in the scratch line and in amber on a file. */
const SOON_MS = 3 * DAY;

/**
 * `12 drafts · 20 images · 3 kept · 9 expire within 3 days · 3.1 MB`: what the scratch folder holds.
 * A kind is a button: the file list shows those files (U8.5).
 */
function KindsLine({ files, bytes }: { files: WorkFile[]; bytes: number }) {
  const { kept } = useContext(KeptContext);
  const [rules] = useExpiry();
  const now = Date.now();
  // A backup folder counts once, however many files a copy of a repository holds
  const count = new Map<ScratchKind, number>();
  for (const unit of new Set(files.map((f) => unitOf(f.path)))) count.set(scratchKind(unit), (count.get(scratchKind(unit)) ?? 0) + 1);
  const keptCount = files.filter((f) => isKept(f.path, kept)).length;
  const soon = files.filter((f) => {
    const at = expiresAt(f.path, f.modified, rules);
    return at !== null && at - now < SOON_MS && !isKept(f.path, kept);
  }).length;
  const sep = <span className="text-slate-600">·</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      {KIND_NOUN.filter(([k]) => count.get(k)).map(([k, one, many]) => (
        <span key={k} className="flex items-center gap-1.5">
          <button type="button" onClick={() => showScratchKind(k)} title={t("Show them in the file list")} className="action-text">
            {pluralOf(count.get(k)!, one, many)}
          </button>
          {sep}
        </span>
      ))}
      {keptCount > 0 && (
        <span className="flex items-center gap-1 text-slate-400">
          <Bookmark className="size-3" /> {t("{n} kept", { n: keptCount })} {sep}
        </span>
      )}
      {soon > 0 && (
        <span className="flex items-center gap-1.5 text-changed" title={t("Old files go to the trash by the rules in the settings, unless kept, attached or named in a guide file.")}>
          {t("{n} expire within 3 days", { n: soon })} {sep}
        </span>
      )}
      <span>{size(bytes)}</span>
    </span>
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
function ScratchTile({ assistant, scratch }: { assistant: AssistantState; scratch: ReturnType<typeof useScratchFiles> }) {
  const { files, load } = scratch;
  const [failed, setError] = useState<string | null>(null);
  const error = failed ?? scratch.error;
  const [cleared, setCleared] = useState<string | null>(null);
  const [tidying, setTidying] = useState(false);
  const moved = useLastMove();
  // One line at the bottom of the view until opened: the files are in the file list too, what is
  // new is under New (U8.4)
  const fold = useFold("scratch.zone", false);

  const tree = useMemo(() => treeOf(files ?? []), [files]);
  const now = Date.now();

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
      note={files && files.length > 0 ? <KindsLine files={files} bytes={tree.size} /> : undefined}
      help={t("One folder in the project for drafts, mock-ups, throwaway scripts and test data. AI sessions are told to put such things here. Git ignores it, so nothing here is committed by accident. To make a file part of the project, drag it onto a folder in the file list. Double click views a file, middle click edits it.")}
      aside={
        <>
          {files && files.length > 0 && !tidying && (
            <Tooltip content={<ToolTipBody label={t("Tidy up…")} says={t("Shows what can probably go, what to look at first and what stays; what you tick goes to the trash")} />}>
              <button
                type="button"
                onClick={() => setTidying(true)}
                className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100"
              >
                <Brush className="size-3.5" />
                {t("Tidy up…")}
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
      {tidying && files && files.length > 0 && (
        <TidyPanel
          files={files}
          assistant={assistant}
          onCancel={() => setTidying(false)}
          onTrash={(paths) => {
            setTidying(false);
            void trash(paths, plural(paths.length, "file"));
          }}
        />
      )}
      {files && files.length === 0 && <p>{t("The scratch folder is empty.")}</p>}
      {files && files.length > 0 && (
        <ul>
          <DirContent dir={tree} depth={0} now={now} onTrash={trash} />
        </ul>
      )}
    </Section>
  );
}

/**
 * Tidying up the scratch folder (src/tidy.ts): what can probably go (ticked), what to look at first
 * (not ticked), what stays (counted only), grouped by their reason. What is ticked goes to the trash.
 */
function TidyPanel({ files, assistant, onCancel, onTrash }: { files: WorkFile[]; assistant: AssistantState; onCancel: () => void; onTrash: (paths: string[]) => void }) {
  const marks = useSessionMarks();
  const news = useNews();
  const pins = attachedFiles.use();
  const [twins, setTwins] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    scratchTwins()
      .then((list) => alive && setTwins(new Map(list.map((x) => [x.scratch, x.project]))))
      .catch(() => alive && setTwins(new Map()));
    return () => {
      alive = false;
    };
  }, []);
  const plan = useMemo(() => {
    if (!twins) return null;
    const now = Date.now();
    return tidyPlan(files, {
      now,
      twins,
      writer: (path) => marks.writer(path),
      session: (id) => assistant.sessions.find((x) => x.id === id),
      unseen: (f) => news.of(scratchItem(f)) !== null,
      attached: new Set(pins.map((p) => p.id)),
    });
  }, [files, twins, marks, assistant.sessions, news, pins]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (plan && chosen === null) setChosen(new Set(plan.filter((i) => i.group === "away").map((i) => i.file.path)));
  }, [plan, chosen]);
  if (!plan || !chosen) return <p className="mb-2 text-[12px] text-slate-400">{t("Looking…")}</p>;
  const of = (g: TidyGroup) => plan.filter((i) => i.group === g);
  const picked = plan.filter((i) => chosen.has(i.file.path));
  const bytes = picked.reduce((n, i) => n + i.file.size, 0);
  const toggle = (path: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const now = Date.now();
  // One line per file; why it is proposed stays out of the line (user, 2026-11-23: a reason under each
  // file made the list long): its group says it once, the tooltip over the name says it for this file
  const row = (i: TidyItem) => (
    <li key={i.file.path} className="flex items-center gap-2 py-0.5 pl-5 text-[12px]">
      <input type="checkbox" checked={chosen.has(i.file.path)} onChange={() => toggle(i.file.path)} aria-label={i.file.path} />
      <Tooltip content={<span>{t(i.reason, { path: i.path ?? "" })}</span>} className="flex min-w-0 flex-1">
        <span className="truncate font-mono text-slate-200">{i.file.path.slice(SCRATCH_DIR.length + 1)}</span>
      </Tooltip>
      <span className="shrink-0 text-slate-500">{age(i.file.modified, now)}</span>
      <span className="w-16 shrink-0 text-right text-slate-500">{size(i.file.size)}</span>
      <button type="button" aria-label={t("View")} title={t("View")} onClick={() => openFile(i.file.path, "view")} className={ACTION}>
        <Eye className="size-3.5" />
      </button>
    </li>
  );
  const setAll = (items: TidyItem[], on: boolean) =>
    setChosen((c) => {
      const next = new Set(c);
      for (const i of items) {
        if (on) next.add(i.file.path);
        else next.delete(i.file.path);
      }
      return next;
    });
  // What can go is ticked already and needs no look: its reasons start folded. What to look at
  // first is there to be looked at: open
  const group = (title: string, items: TidyItem[], folded: boolean) =>
    items.length > 0 && (
      <div className="mb-2">
        <div className="mb-0.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          {title} <span className="font-normal tracking-normal normal-case">{plural(items.length, "file")} · {size(items.reduce((n, i) => n + i.file.size, 0))}</span>
        </div>
        <ul>
          {byReason(items).map(([reason, list]) => (
            <ReasonGroup key={reason} reason={reason} items={list} folded={folded} chosen={chosen} onAll={setAll}>
              {list.map(row)}
            </ReasonGroup>
          ))}
        </ul>
      </div>
    );
  const keep = of("keep");
  return (
    <div className="mb-3 rounded-md border border-line bg-raised/40 px-3 py-2">
      <p className="mb-2 text-[12px] text-slate-300">{t("A proposal from what CodeDeck knows about each file. What you tick goes to the trash, where it can still be brought back.")}</p>
      {group(t("Can go"), of("away"), true)}
      {group(t("Look first"), of("check"), false)}
      {keep.length > 0 && (
        <p className="mb-2 text-[12px] text-slate-500">
          {t("{files} stay: new, attached, changed today or in use by an AI session.", { files: plural(keep.length, "file") })}
        </p>
      )}
      {of("away").length + of("check").length === 0 && <p className="mb-2 text-[12px] text-slate-400">{t("Nothing to tidy up right now.")}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onTrash(picked.map((i) => i.file.path))}
          className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 text-[12px] font-medium text-on-accent hover:bg-brand-fill-hover disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          {t("Move {files} ({size}) to the trash", { files: plural(picked.length, "file"), size: size(bytes) })}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

/** The files of a group by their reason, in the order the reasons first come. */
function byReason(items: TidyItem[]): [string, TidyItem[]][] {
  const groups = new Map<string, TidyItem[]>();
  for (const i of items) groups.set(i.reason, [...(groups.get(i.reason) ?? []), i]);
  return [...groups];
}

/** A reason, once for all files it applies to: folds open, and its box ticks or unticks them all. */
function ReasonGroup(props: { reason: string; items: TidyItem[]; folded: boolean; chosen: Set<string>; onAll: (items: TidyItem[], on: boolean) => void; children: ReactNode }) {
  const [open, setOpen] = useState(!props.folded);
  const box = useRef<HTMLInputElement>(null);
  const ticked = props.items.filter((i) => props.chosen.has(i.file.path)).length;
  const all = ticked === props.items.length;
  useEffect(() => {
    if (box.current) box.current.indeterminate = ticked > 0 && !all;
  }, [ticked, all]);
  const Chevron = open ? ChevronDown : ChevronRight;
  // A reason with a path in it (the same file in the project) names it per file, in the tooltip
  const said = props.reason.includes("{path}") ? t(props.reason.replace(/:\s*\{path\}$/, "")) : t(props.reason);
  return (
    <li>
      <div className="flex items-center gap-1 py-0.5 text-[12px]">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="rounded p-0.5 text-slate-500 hover:bg-raised hover:text-slate-200">
          <Chevron className="size-3.5" />
        </button>
        <input ref={box} type="checkbox" checked={all} onChange={() => props.onAll(props.items, !all)} aria-label={said} />
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-slate-300 hover:text-slate-100">
          {said}
        </button>
        <span className="shrink-0 text-slate-500">
          {plural(props.items.length, "file")} · {size(props.items.reduce((n, i) => n + i.file.size, 0))}
        </span>
      </div>
      {open && <ul>{props.children}</ul>}
    </li>
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
  whenTitle?: string;
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
      <span title={props.whenTitle} className={`w-24 shrink-0 text-right text-[11px] whitespace-nowrap ${props.old ? "text-changed" : "text-slate-500"}`}>{props.when}</span>
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
            <KeepFolder path={dir.path} />
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

/** Keeps a whole folder from expiry, e.g. a design worth looking at again. */
function KeepFolder({ path }: { path: string }) {
  const { kept, keep } = useContext(KeptContext);
  const on = kept.includes(path);
  return (
    <Tooltip content={<ToolTipBody label={on ? t("Do not keep") : t("Keep")} says={on ? t("Its files may expire again by the rules") : t("Nothing in this folder goes to the trash by itself")} />}>
      <button type="button" aria-label={on ? t("Do not keep") : t("Keep")} aria-pressed={on} onClick={() => keep(path, !on)} className={`${ACTION} ${on ? "text-slate-200" : ""}`}>
        <Bookmark className={`size-3.5 ${on ? "fill-current" : ""}`} />
      </button>
    </Tooltip>
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
  const { kept, keep } = useContext(KeptContext);
  const [rules] = useExpiry();
  const isKeptHere = isKept(f.path, kept);
  const expires = isKeptHere ? null : expiresAt(f.path, f.modified, rules);
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
          {isKeptHere && <Bookmark className="size-3 shrink-0 fill-current text-slate-400" aria-label={t("Kept")} />}
        </>
      }
      when={age(f.modified, now)}
      old={expires !== null && expires - now < SOON_MS}
      whenTitle={expires !== null ? t("Goes to the trash {when}, unless kept", { when: new Date(expires).toLocaleDateString() }) : isKeptHere ? t("Kept: does not expire") : undefined}
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
          <Tooltip content={<ToolTipBody label={isKeptHere ? t("Do not keep") : t("Keep")} says={isKeptHere ? t("It may expire again by the rules") : t("Kept files never go to the trash by themselves")} />}>
            <button type="button" aria-label={isKeptHere ? t("Do not keep") : t("Keep")} aria-pressed={isKeptHere} onClick={() => keep(f.path, !isKeptHere)} className={`${ACTION} ${isKeptHere ? "text-slate-200" : ""}`}>
              <Bookmark className={`size-3.5 ${isKeptHere ? "fill-current" : ""}`} />
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
