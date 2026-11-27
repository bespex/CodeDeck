import { useContext, useEffect, useState } from "react";
import { ArrowDownToLine, Bookmark, Coffee, Eye, FileArchive, Folder, Sparkles, Globe, ExternalLink, LocateFixed, Paperclip } from "lucide-react";
import { fetchOutside, openFile, openOutside, openUrl, scratchThumbnail, type OutsideFile, type PublishedPage, type WorkFile } from "../../backend";
import { shortId, useSessionMarks } from "../../assistant";
import { files as attachedFiles, pinFromEntry } from "../../files";
import { useAttachEnabled } from "../../attachments";
import { markSeen, outsideKey, pageKey, scratchKey, useNews, type NewsItem } from "../../news";
import { isImage, isKept, KeptContext, SCRATCH_DRAG, topFolderOf, unitOf } from "../../scratch";
import { revealInTree, showScratchKind } from "../../fileView";
import { NewsTag } from "../News";
import { SessionBadge } from "../SessionBadge";
import { Tooltip } from "../Tooltip";
import { age, size } from "./units";
import { plural, t } from "../../i18n";
import { KindIcon, MoreButton, Zone, ZoneEmpty, ZoneHead, ZoneLine, ZoneTag } from "./zones";

/** How many groups (sessions) show before "all". */
const GROUPS = 3;

type Thing =
  | { kind: "scratch"; file: WorkFile; time: number; session: string | null; news: NewsItem }
  | { kind: "outside"; file: OutsideFile; time: number; session: string; news: NewsItem }
  | { kind: "page"; page: PublishedPage; time: number; session: string; news: NewsItem };

/**
 * "New" in the Workbench (roadmap U8.4): what came up since you last looked, by the session that made
 * it: files in the scratch folder (pictures as thumbnails, so four icon variants are seen at once),
 * files a session left outside the project and not fetched yet, pages published elsewhere. A click
 * marks an entry seen; leaving the Workbench after a look makes all of it seen (`news.ts`). The full
 * lists stay in the stores below.
 */
export function NewZone({ files, outside, pages }: { files: WorkFile[]; outside: OutsideFile[]; pages: PublishedPage[] }) {
  const news = useNews();
  const marks = useSessionMarks();
  const [all, setAll] = useState(false);

  const things: Thing[] = [
    ...files.map((f): Thing => ({ kind: "scratch", file: f, time: f.modified, session: marks.writer(f.path), news: { key: scratchKey(f.path), time: f.modified, changes: true } })),
    ...outside.filter((f) => !f.fetched).map((f): Thing => ({ kind: "outside", file: f, time: f.at, session: f.session, news: { key: outsideKey(f.path), time: f.at } })),
    ...pages.map((p): Thing => ({ kind: "page", page: p, time: p.at, session: p.session, news: { key: pageKey(p.url), time: p.at } })),
  ].filter((x) => news.of(x.news) !== null);

  // By session, the newest group first; a group's time is its newest entry
  const groups = new Map<string, Thing[]>();
  for (const x of things) groups.set(x.session ?? "", [...(groups.get(x.session ?? "") ?? []), x]);
  const sorted = [...groups].map(([session, list]) => ({ session, list: list.sort((a, b) => b.time - a.time) })).sort((a, b) => b.list[0].time - a.list[0].time);
  const shown = all ? sorted : sorted.slice(0, GROUPS);

  return (
    <Zone>
      <ZoneHead
        icon={Sparkles}
        title={t("New")}
        count={new Set(things.map((x) => (x.kind === "scratch" ? unitOf(x.file.path) : x.news.key))).size}
        note={things.length > 0 ? t("since you last looked") : undefined}
        help={<span>{t("What came up since you last looked at the Workbench, by the AI session that made it: files in the scratch folder, files left outside the project, pages published elsewhere. Pictures show as thumbnails. Everything stays in the scratch folder and in the lists below; to keep a file, drag it onto a folder of the file list.")}</span>}
      />
      {things.length === 0 && <ZoneEmpty icon={Coffee}>{t("Nothing new since you last looked.")}</ZoneEmpty>}
      {shown.map((g) => (
        <Group key={g.session} session={g.session || null} list={g.list} />
      ))}
      {sorted.length > GROUPS && <MoreButton all={all} count={sorted.length} onClick={() => setAll(!all)} />}
    </Zone>
  );
}

/** Per group: thumbnails and lines shown before "all"; a folder with more new files than this is one line. */
const THUMBS = 6;
const ROWS = 8;
const FOLDER_FROM = 4;

type ScratchThing = Extract<Thing, { kind: "scratch" }>;
type Line = { key: string; time: number; node: React.ReactNode };

function Group({ session, list }: { session: string | null; list: Thing[] }) {
  const marks = useSessionMarks();
  const mark = marks.of(session);
  const [all, setAll] = useState(false);
  const now = Date.now();

  // Folders as one line: a backup folder always (a copy of a repository is hundreds of files with
  // names nobody reads), any other folder of the scratch folder from FOLDER_FROM new files on that
  // are not pictures
  const scratch = list.filter((x): x is ScratchThing => x.kind === "scratch");
  const folders = new Map<string, ScratchThing[]>();
  for (const x of scratch) {
    const unit = unitOf(x.file.path);
    // Pictures stay pictures (thumbnails are the point of them), unless they lie in a backup
    const key = unit !== x.file.path ? unit : isImage(x.file.path) ? null : topFolderOf(x.file.path);
    if (key) folders.set(key, [...(folders.get(key) ?? []), x]);
  }
  const bundles = [...folders].filter(([key, xs]) => unitOf(xs[0].file.path) === key || xs.length >= FOLDER_FROM);
  const bundled = new Set(bundles.flatMap(([, xs]) => xs.map((x) => x.file.path)));

  const images = scratch.filter((x) => !bundled.has(x.file.path) && isImage(x.file.path));
  const thumbs = useThumbnails(images.slice(0, THUMBS + 4).map((x) => x.file));
  // A picture without a thumbnail (too big, unreadable) is a line like any file
  const pictures = images.filter((x) => thumbs.get(x.file.path));
  const shownPictures = pictures.slice(0, THUMBS);

  const lines: Line[] = [
    ...bundles.map(([folder, xs]) => ({ key: folder, time: Math.max(...xs.map((x) => x.time)), node: <FolderRow key={folder} folder={folder} things={xs} /> })),
    ...list
      .filter((x) => !(x.kind === "scratch" && (bundled.has(x.file.path) || pictures.includes(x))))
      .map((x) => ({
        key: x.kind === "page" ? x.page.url : x.file.path,
        time: x.time,
        node: x.kind === "scratch" ? <ScratchRow key={x.file.path} file={x.file} item={x.news} /> : x.kind === "outside" ? <OutsideRow key={x.file.path} file={x.file} item={x.news} /> : <PageRow key={x.page.url} page={x.page} item={x.news} />,
      })),
  ].sort((a, b) => b.time - a.time);

  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex min-w-0 items-center gap-2 px-1.5 text-[12px]">
        {mark ? <SessionBadge mark={mark} /> : <span className="size-4 shrink-0 rounded border border-dashed border-slate-600" />}
        <span className="truncate font-medium text-slate-300">{session ? (mark?.title ?? t("session {id}", { id: shortId(session) })) : t("no session known")}</span>
        <span className="ml-auto shrink-0 text-[11px] text-slate-500">{age(list[0].time, now)}</span>
      </div>
      {shownPictures.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-2 pl-7">
          {shownPictures.map((x) => (
            <Thumb key={x.file.path} file={x.file} item={x.news} src={thumbs.get(x.file.path)!} />
          ))}
          {images.length > THUMBS && (
            <button
              type="button"
              onClick={() => showScratchKind("image")}
              title={t("Show all pictures of the scratch folder in the file list")}
              className="action-text flex h-16 w-20 flex-col items-center justify-center rounded-md bg-base text-[11px] leading-tight text-slate-400"
            >
              <span className="text-[16px] font-semibold text-slate-200">+{images.length - THUMBS}</span>
              {t("in the file list")}
            </button>
          )}
        </div>
      )}
      <ul className="grid grid-cols-1 gap-x-5 @lg/zone:grid-cols-2">{(all ? lines : lines.slice(0, ROWS)).map((l) => l.node)}</ul>
      {lines.length > ROWS + 1 && <MoreButton all={all} count={lines.length} onClick={() => setAll(!all)} />}
    </div>
  );
}

/** A folder of the scratch folder with many new files, as one line: how many, how big, where. */
function FolderRow({ folder, things }: { folder: string; things: ScratchThing[] }) {
  const name = folder.slice(folder.lastIndexOf("/") + 1);
  const backup = unitOf(things[0].file.path) === folder;
  const bytes = things.reduce((n, x) => n + x.file.size, 0);
  const { kept } = useContext(KeptContext);
  return (
    <ZoneLine
      icon={backup ? <FileArchive className="size-4 text-slate-400" /> : <Folder className="size-4 text-moved" />}
      name={`${name}/`}
      tag={<span className="text-[11px] text-slate-500">{plural(things.length, "new file")}</span>}
      rest={isKept(folder, kept) && <Bookmark className="size-3 fill-current text-slate-400" />}
      meta={size(bytes)}
      title={backup ? `${folder}\n${t("A backup, kept and expired as a whole")}` : folder}
      onClick={() => things.forEach((x) => markSeen(x.news))}
      onDoubleClick={() => revealInTree(folder)}
      tools={
        <>
          <Tool label={t("Show in tree")} onClick={() => revealInTree(folder)}>
            <LocateFixed className="size-3.5" />
          </Tool>
          <Keep path={folder} />
        </>
      }
    />
  );
}

/** The thumbnails of pictures, path → `data:` address, or null where there is none; filled as they come. */
function useThumbnails(files: WorkFile[]): Map<string, string | null> {
  const [found, setFound] = useState<Map<string, string | null>>(new Map());
  const key = files.map((f) => `${f.path}@${f.modified}`).join("|");
  useEffect(() => {
    let alive = true;
    for (const f of files) {
      scratchThumbnail(f.path)
        .catch(() => null)
        .then((src) => alive && setFound((m) => new Map(m).set(f.path, src)));
    }
    return () => {
      alive = false;
    };
    // The list is known by its key; the array itself is new on every draw
  }, [key]);
  return found;
}

const dragScratch = (path: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData(SCRATCH_DRAG, path);
  e.dataTransfer.effectAllowed = "move";
};

/** A picture as a thumbnail: click views it; drag it onto a folder of the file list to keep it. */
function Thumb({ file, item, src }: { file: WorkFile; item: NewsItem; src: string }) {
  const news = useNews();
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  const fresh = news.of(item);
  return (
    <figure className="group relative w-20" draggable onDragStart={dragScratch(file.path)}>
      <button
        type="button"
        onClick={() => {
          markSeen(item);
          void openFile(file.path, "view");
        }}
        title={`${file.path} · ${size(file.size)}\n${t("Click: view · drag onto a folder of the file list to keep it")}`}
        className={`flex h-16 w-20 items-center justify-center overflow-hidden rounded-md bg-base shadow-sm hover:ring-1 hover:ring-slate-500 ${fresh === "changed" ? "ring-1 ring-changed/60" : ""}`}
      >
        <img src={src} alt={name} className="max-h-full max-w-full object-contain p-1.5" draggable={false} />
      </button>
      <figcaption className="mt-1 line-clamp-2 text-center text-[11px] leading-tight break-all text-slate-400" title={name}>
        {name}
      </figcaption>
      <span className="absolute top-1 right-1 rounded bg-base/80">
        <Keep path={file.path} />
      </span>
    </figure>
  );
}

/** Keeps a scratch file from expiry (U8.5): lit while kept, on hover otherwise. */
function Keep({ path }: { path: string }) {
  const { kept, keep } = useContext(KeptContext);
  const on = isKept(path, kept);
  return (
    <Tool label={on ? t("Kept: click to let it expire again") : t("Keep: never goes to the trash by itself")} on={on} onClick={() => keep(path, !on)}>
      <Bookmark className={`size-3.5 ${on ? "fill-current" : ""}`} />
    </Tool>
  );
}

function Attach({ path, name, fileSize }: { path: string; name: string; fileSize: number }) {
  const pins = attachedFiles.use();
  const enabled = useAttachEnabled();
  if (!enabled) return null;
  const on = pins.some((p) => p.id === path);
  return (
    <Tool
      label={on ? t("Remove from next prompt") : t("Attach to next prompt")}
      on={on}
      onClick={() => (on ? attachedFiles.remove([path]) : void pinFromEntry({ name, path, isDir: false, size: fileSize }).then((p) => attachedFiles.add([p])))}
    >
      <Paperclip className="size-3.5" />
    </Tool>
  );
}

function Tool({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={<span>{label}</span>} className="flex">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`rounded p-0.5 hover:bg-raised ${on ? "text-brand-soft" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-100 focus-visible:opacity-100"}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ScratchRow({ file, item }: { file: WorkFile; item: NewsItem }) {
  const news = useNews();
  const fresh = news.of(item);
  const { kept } = useContext(KeptContext);
  const pins = attachedFiles.use();
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  return (
    <ZoneLine
      icon={<KindIcon path={file.path} />}
      name={name}
      tag={fresh === "changed" ? <NewsTag news={fresh} /> : undefined}
      rest={
        <>
          {pins.some((p) => p.id === file.path) && <Paperclip className="size-3 text-brand-soft" />}
          {isKept(file.path, kept) && <Bookmark className="size-3 fill-current text-slate-400" />}
        </>
      }
      meta={size(file.size)}
      title={`${file.path}\n${t("Double-click: view · drag onto a folder of the file list to keep it")}`}
      onClick={() => markSeen(item)}
      onDoubleClick={() => void openFile(file.path, "view")}
      draggable
      onDragStart={dragScratch(file.path)}
      tools={
        <>
          <Tool label={t("View")} onClick={() => void openFile(file.path, "view")}>
            <Eye className="size-3.5" />
          </Tool>
          <Tool label={t("Show in tree")} onClick={() => revealInTree(file.path)}>
            <LocateFixed className="size-3.5" />
          </Tool>
          <Attach path={file.path} name={name} fileSize={file.size} />
          <Keep path={file.path} />
        </>
      }
    />
  );
}

function OutsideRow({ file, item }: { file: OutsideFile; item: NewsItem }) {
  const [error, setError] = useState<string | null>(null);
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  return (
    <ZoneLine
      icon={<KindIcon path={file.path} />}
      name={name}
      tag={error ? <span className="text-[11px] text-problem">{error}</span> : <ZoneTag>{t("outside")}</ZoneTag>}
      meta={size(file.size)}
      title={`${file.path.replace(/^\/home\/[^/]+/, "~")}\n${t("Outside the project: not part of it until you fetch it into the scratch folder")}`}
      onClick={() => markSeen(item)}
      onDoubleClick={() => void openOutside(file.path, "view")}
      tools={
        <>
          <Tool label={`${t("Into scratch")}: ${t("Copy it into the scratch folder; the original stays")}`} onClick={() => void fetchOutside(file.path).then(() => setError(null), (e) => setError(String(e)))}>
            <ArrowDownToLine className="size-3.5" />
          </Tool>
          <Tool label={t("Open it in its viewer")} onClick={() => void openOutside(file.path, "view")}>
            <Eye className="size-3.5" />
          </Tool>
        </>
      }
    />
  );
}

function PageRow({ page, item }: { page: PublishedPage; item: NewsItem }) {
  return (
    <ZoneLine
      icon={<Globe className="size-4 text-moved" />}
      name={page.title}
      tag={<ZoneTag tone="moved">{t("online")}</ZoneTag>}
      title={page.url}
      onClick={() => markSeen(item)}
      onDoubleClick={() => void openUrl(page.url)}
      tools={
        <Tool label={t("Open the page in the browser")} onClick={() => void openUrl(page.url)}>
          <ExternalLink className="size-3.5" />
        </Tool>
      }
    />
  );
}
