import { useEffect, useState, type ReactNode } from "react";
import { reportNews, scratchKey, useNews } from "../news";
import { AtSign, GitBranch, History, TriangleAlert } from "lucide-react";
import { onFsChanged, scratchList, type AssistantState } from "../backend";
import { aheadBehind, type GitView } from "../git";
import { useSnapshots } from "../history";
import { useMarkers } from "../markers";
import { inScratch } from "../scratch";
import { turnsOf } from "../turns";
import { openView, type ViewId } from "../view";
import { LOCALE } from "./Trail";
import { plural, t } from "../i18n";

/** Keeps the scratch folder's files reported for "new" (src/news.ts); read again when the folder changes. */
function useNewScratch(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      scratchList()
        .then((files) => {
          // The Workbench's "new" is "not seen yet" (src/news.ts); the scratch folder reports here too, so that it counts while the Workbench is closed
          reportNews("scratch", files.map((f) => ({ key: scratchKey(f.path), time: f.modified, changes: true })));
          setCount(files.length);
        })
        .catch(() => setCount(0));
    load();
    const stop = onFsChanged((change) => {
      if (![...change.dirs, ...change.paths].some((p) => inScratch(p) || p === "")) return;
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  return count;
}

/**
 * In two or three short lines what the file list, the trail and the views show, at the top of the
 * right column in both forms. Each line opens the view that says more (as the sidebar: in the full
 * window).
 */
export function SidebarSummary({ git, assistant }: { git: GitView; assistant: AssistantState }) {
  const root = git.rootRepo;
  const uncommitted = git.repos.reduce((n, r) => n + r.files.length, 0);
  const failed = git.repos.find((r) => r.error);
  const { snapshots } = useSnapshots(git.repos);
  const turns = turnsOf(git.repos, snapshots, assistant.sessions);
  const running = turns.filter((turn) => !turn.to).length;
  // Snapshots of all repositories, newest first
  const last = snapshots[0];
  const { markers } = useMarkers();
  const hints = markers?.length ?? 0;
  useNewScratch();
  const fresh = useNews().count;
  const elsewhere = assistant.found.outside.filter((f) => !f.fetched).length;

  return (
    <section aria-label={t("Overview")} className="flex flex-col border-b border-line py-1 text-[12px]">
      <Line view="changes" icon={failed ? <TriangleAlert className="size-3.5 text-problem" /> : <GitBranch className="size-3.5" />}>
        {root ? (
          <>
            <span className="truncate font-medium text-slate-200">{root.branch ?? t("detached")}</span>
            {aheadBehind(root) && <span className="text-slate-500">{aheadBehind(root)}</span>}
            <span className="text-slate-600">·</span>
            {uncommitted > 0 ? <span className="text-changed">{plural(uncommitted, "uncommitted file")}</span> : <span className="text-slate-500">{t("all committed")}</span>}
          </>
        ) : (
          <span className="text-slate-500">{git.repos.length ? plural(git.repos.length, "repository") : t("No git repository")}</span>
        )}
        {failed && <span className="truncate text-problem">· {t("git reports an error")}</span>}
      </Line>
      {(turns.length > 0 || last) && (
        <Line view="changes" icon={<History className="size-3.5" />}>
          {turns.length > 0 && (
            <span className="text-slate-300">
              {plural(turns.length, "turn")}
              {running > 0 && <span className="text-ai"> · {t("{n} running", { n: running })}</span>}
            </span>
          )}
          {last && (
            <span className="truncate text-slate-500">
              {turns.length > 0 && "· "}
              {t("last snapshot {time}", { time: new Date(last.at * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
        </Line>
      )}
      {(hints > 0 || fresh > 0 || elsewhere > 0) && (
        <Line view="workbench" icon={<AtSign className="size-3.5" />}>
          {[
            hints > 0 && <span key="h" className="text-slate-300">{plural(hints, "hint")}</span>,
            fresh > 0 && <span key="s" className="truncate font-medium text-ai">{t("{n} new in the Workbench", { n: fresh })}</span>,
            elsewhere > 0 && <span key="e" className="truncate text-changed">{t("{n} left elsewhere", { n: elsewhere })}</span>,
          ]
            .filter(Boolean)
            .flatMap((part, i) => (i ? [<span key={`d${i}`} className="text-slate-600">·</span>, part] : [part]))}
        </Line>
      )}
    </section>
  );
}

/** One line of the overview; a click opens the full window at the view that says more. */
function Line({ view, icon, children }: { view: ViewId; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      title={t("Open in the full window")}
      onClick={() => openView(view)}
      className="flex w-full min-w-0 items-start gap-1.5 px-3 py-0.5 text-left text-slate-400 hover:bg-raised/60"
    >
      <span className="mt-px shrink-0 text-slate-500">{icon}</span>
      {/* A narrow column wraps the parts instead of cutting off the last, often the one that counts */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 [&>*]:whitespace-nowrap">{children}</span>
    </button>
  );
}
