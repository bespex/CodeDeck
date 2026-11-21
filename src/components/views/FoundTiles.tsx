import { useState, type ReactNode } from "react";
import { NewsTag, newsClass } from "../News";
import { markSeen, outsideKey, pageKey, useNews } from "../../news";
import { ArrowDownToLine, Check, Copy, ExternalLink, Eye, FileText, FolderOpen, Globe, X } from "lucide-react";
import { fetchOutside, forgetFound, openOutside, openUrl, type OutsideFile, type PublishedPage } from "../../backend";
import { shortId, useSessionMarks } from "../../assistant";
import { Rows, Section, useFold, useShowAll } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { Tooltip } from "../Tooltip";
import { age, size } from "./units";
import { plural, T, t } from "../../i18n";

/** Which session it was, with its badge, as in the scratch folder. */
function Who({ session }: { session: string }) {
  const marks = useSessionMarks();
  const mark = marks.of(session);
  return (
    <>
      {mark && <SessionBadge mark={mark} />}
      <span className="truncate text-slate-400">{mark?.title ?? t("session {id}", { id: shortId(session) })}</span>
    </>
  );
}

function IconButton(props: { tip: string; label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <Tooltip content={<span>{props.tip}</span>}>
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        className={`rounded p-1 text-slate-500 hover:bg-raised ${props.danger ? "hover:text-problem" : "hover:text-slate-100"}`}
      >
        {props.children}
      </button>
    </Tooltip>
  );
}

/**
 * What sessions of this project put outside of it, in one tile, shown only while there is some:
 * files on this computer, away from every repository (in `/tmp`, the home folder, the tool's
 * plans; only while they are there), and pages online (a claude.ai artifact, a gist, a paste),
 * of which there is no file, only an address. "Into scratch" copies a file into the scratch folder,
 * the original stays; a page stays where it is, because such pages often only work there.
 */
export function OutsideTile({ files, pages }: { files: OutsideFile[]; pages: PublishedPage[] }) {
  const fold = useFold("outside", true);
  const open = files.filter((f) => !f.fetched).length;
  const note = [open > 0 && t("{n} not fetched", { n: open }), pages.length > 0 && t("{n} online", { n: pages.length })].filter(Boolean).join(" · ");
  return (
    <Section
      fold={fold}
      title={t("Outside the project")}
      note={note || plural(files.length, "file")}
      help={
        <>
          <span>{t("Files: written by an AI session of this project outside of it and outside every repository. Into scratch copies one into the scratch folder, from where you drag it into the project; the original stays where it is.")}</span>
          <span className="mt-1.5">{t("Online: pages an AI session put on the web, such as a claude.ai artifact, a gist or a paste. There is no file of them, only the address, which the session names at the end of its turn; CodeDeck keeps it so it does not get lost in the chat.")}</span>
        </>
      }
    >
      <p className="mb-2 text-[12px]">{t("What AI sessions of this project put elsewhere: files on this computer, pages online.")}</p>
      {files.length > 0 && <OutsideFiles files={files} />}
      {pages.length > 0 && <OnlinePages pages={pages} />}
    </Section>
  );
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className="mt-2 mb-0.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase first:mt-0">{children}</div>
);

function OutsideFiles({ files }: { files: OutsideFile[] }) {
  const [error, setError] = useState<string | null>(null);
  const { items, more } = useShowAll(files);
  const now = Date.now();
  const news = useNews();
  const fetch = async (path: string) => {
    try {
      await fetchOutside(path);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <Group>{t("Files")}</Group>
      {error && <p className="selectable mb-2 text-problem">{error}</p>}
      <Rows>
        {items.map((f) => {
          const slash = f.path.lastIndexOf("/");
          const [dir, name] = [f.path.slice(0, slash + 1), f.path.slice(slash + 1)];
          const item = { key: outsideKey(f.path), time: f.at };
          const fresh = f.fetched ? null : news.of(item);
          return (
            <li
              key={f.path}
              onClickCapture={() => fresh && markSeen(item)}
              // As in the file list: double click views, middle click edits
              onDoubleClick={() => void openOutside(f.path, "view")}
              onAuxClick={(e) => e.button === 1 && void openOutside(f.path, "edit")}
              className={`group flex min-h-9 items-center gap-2 px-1 py-1 ${newsClass(fresh)}`}
            >
              <FileText className="size-3.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline font-mono text-[12px]" title={f.path}>
                  {/* A long folder is cut at its start; the name stays */}
                  <span className="min-w-0 truncate text-slate-500 [direction:rtl]">{dir}</span>
                  <span className="shrink-0 text-slate-200">{name}</span>
                  <span className="ml-2 inline-flex">
                    <NewsTag news={fresh} />
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  {f.fetched ? (
                    <span className="flex min-w-0 items-center gap-1 text-added">
                      <Check className="size-3 shrink-0" />
                      <T text="Copied to {path}" path={<code className="truncate font-mono">{f.fetched}</code>} />
                    </span>
                  ) : (
                    <span>{age(f.at, now)}</span>
                  )}
                  <span>·</span>
                  <Who session={f.session} />
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{size(f.size)}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {!f.fetched && (
                  <Tooltip content={<span>{t("Copy it into the scratch folder; the original stays")}</span>}>
                    <button
                      type="button"
                      onClick={() => fetch(f.path)}
                      className="mr-1 flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100"
                    >
                      <ArrowDownToLine className="size-3.5" />
                      {t("Into scratch")}
                    </button>
                  </Tooltip>
                )}
                <IconButton tip={t("Open it in its viewer")} label={t("Open {name}", { name })} onClick={() => void openOutside(f.path, "view")}>
                  <Eye className="size-3.5" />
                </IconButton>
                <IconButton tip={t("Show it in the file manager")} label={t("Show {name} in the file manager", { name })} onClick={() => void openOutside(f.path, null)}>
                  <FolderOpen className="size-3.5" />
                </IconButton>
                <IconButton tip={t("Take it off this list; the file stays")} label={t("Forget {name}", { name })} onClick={() => void forgetFound(f.path)} danger>
                  <X className="size-3.5" />
                </IconButton>
              </div>
            </li>
          );
        })}
      </Rows>
      {more}
    </>
  );
}

function OnlinePages({ pages }: { pages: PublishedPage[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const { items, more } = useShowAll(pages);
  const now = Date.now();
  const news = useNews();
  return (
    <>
      <Group>{t("Online")}</Group>
      <Rows>
        {items.map((p) => {
          const item = { key: pageKey(p.url), time: p.at };
          const fresh = news.of(item);
          return (
          <li key={p.url} onClickCapture={() => fresh && markSeen(item)} className={`group flex min-h-9 items-center gap-2 px-1 py-1 ${newsClass(fresh)}`}>
            <Globe className="size-3.5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] text-slate-200">{p.title}</span>
                <NewsTag news={fresh} />
              </div>
              <div className="truncate font-mono text-[11px] text-slate-500">{p.url}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>{age(p.at, now)}</span>
                <span>·</span>
                <Who session={p.session} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton tip={t("Open the page in the browser")} label={t("Open {name}", { name: p.title })} onClick={() => void openUrl(p.url)}>
                <ExternalLink className="size-3.5" />
              </IconButton>
              <IconButton
                tip={copied === p.url ? t("Copied") : t("Copy the link")}
                label={t("Copy the link")}
                onClick={() => {
                  void navigator.clipboard.writeText(p.url);
                  setCopied(p.url);
                }}
              >
                {copied === p.url ? <Check className="size-3.5 text-added" /> : <Copy className="size-3.5" />}
              </IconButton>
              <IconButton tip={t("Take it off this list; the page stays")} label={t("Forget {name}", { name: p.title })} onClick={() => void forgetFound(p.url)} danger>
                <X className="size-3.5" />
              </IconButton>
            </div>
          </li>
          );
        })}
      </Rows>
      {more}
    </>
  );
}
