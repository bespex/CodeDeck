import { useState, type ReactNode } from "react";
import { ArrowDownToLine, Check, Copy, ExternalLink, FileText, FolderOpen, Globe, X } from "lucide-react";
import { fetchOutside, forgetFound, openOutside, openUrl, type OutsideFile, type PublishedPage } from "../../backend";
import { shortId, useSessionMarks } from "../../assistant";
import { Rows, Section } from "../blocks";
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
 * Files sessions of this project wrote outside of it, away from every repository: in `/tmp`, the
 * home folder, the tool's plans. Shown only while there are some and only while they are there.
 * "Into scratch" copies one into the scratch folder, from where it can be dragged into the
 * project; the original stays where it is.
 */
export function OutsideTile({ files }: { files: OutsideFile[] }) {
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const fetch = async (path: string) => {
    try {
      await fetchOutside(path);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };
  const open = files.filter((f) => !f.fetched).length;
  return (
    <div className="min-w-0">
      <Section title={t("Left elsewhere")} note={open > 0 ? t("{n} not fetched", { n: open }) : plural(files.length, "file")}>
        <p className="mb-2 max-w-prose text-[12px]">
          {t("Files sessions of this project wrote outside of it, away from every repository. Into scratch copies one into the scratch folder; the original stays where it is.")}
        </p>
        {error && <p className="selectable mb-2 text-problem">{error}</p>}
        <Rows>
          {files.map((f) => {
            const slash = f.path.lastIndexOf("/");
            const [dir, name] = [f.path.slice(0, slash + 1), f.path.slice(slash + 1)];
            return (
              <li key={f.path} className="group flex min-h-9 items-center gap-2 px-1 py-1">
                <FileText className="size-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline font-mono text-[12px]" title={f.path}>
                    {/* A long folder is cut at its start; the name stays */}
                    <span className="min-w-0 truncate text-slate-500 [direction:rtl]">{dir}</span>
                    <span className="shrink-0 text-slate-200">{name}</span>
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
                    <ExternalLink className="size-3.5" />
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
      </Section>
    </div>
  );
}

/**
 * Pages the project's sessions published elsewhere: mock-ups, reports, gists. They stay where they
 * are, because such pages often only work there; CodeDeck keeps the link, as the session named it
 * at the end of its turn (the start rules ask for that).
 */
export function PagesTile({ pages }: { pages: PublishedPage[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const now = Date.now();
  return (
    <div className="min-w-0">
      <Section title={t("Published pages")} note={pages.length > 0 ? plural(pages.length, "page") : undefined}>
        <p className="mb-2 max-w-prose text-[12px]">
          {t("Mock-ups and reports a session published elsewhere. They stay there; CodeDeck keeps the link the session named.")}
        </p>
        {pages.length === 0 ? (
          <p>{t("No session of this project has published a page.")}</p>
        ) : (
          <Rows>
            {pages.map((p) => (
              <li key={p.url} className="group flex min-h-9 items-center gap-2 px-1 py-1">
                <Globe className="size-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-slate-200">{p.title}</div>
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
            ))}
          </Rows>
        )}
      </Section>
    </div>
  );
}
