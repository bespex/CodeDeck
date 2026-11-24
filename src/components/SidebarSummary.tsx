import { useEffect, useState } from "react";
import { reportNews, scratchKey, useNews } from "../news";
import { onFsChanged, reportSummary, scratchList, type AssistantState, type ProjectInfo } from "../backend";
import { aheadBehind, type GitView } from "../git";
import { inScratch } from "../scratch";
import { AssistantLine } from "./StatusBar";
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
 * The line under the session column's header: the project's AI account, new session, usage (the branch is at
 * the head of the file list, turns and snapshots on the trail). Unseen, it reports the project's summary to the
 * overview and the project list (docs/UEBERSICHT.md) and counts the scratch folder for "new".
 */
export function SidebarSummary({ git, assistant, project }: { git: GitView; assistant: AssistantState; project: ProjectInfo | null }) {
  const root = git.rootRepo;
  const uncommitted = git.repos.reduce((n, r) => n + r.files.length, 0);
  const failed = git.repos.find((r) => r.error);
  useNewScratch();
  const fresh = useNews().count;
  // The project list shows the same in a few words (docs/UEBERSICHT.md)
  const gitWords = root
    ? [root.branch ?? t("detached"), aheadBehind(root), uncommitted > 0 ? plural(uncommitted, "uncommitted file") : t("all committed")].filter(Boolean).join(" · ")
    : t("No git repository");
  const next = assistant.attachments.length;
  useEffect(() => {
    void reportSummary({ git: gitWords, gitFailed: !!failed, uncommitted, next, news: fresh });
  }, [gitWords, failed, uncommitted, next, fresh]);
  return <AssistantLine project={project} assistant={assistant} />;
}
