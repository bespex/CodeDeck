import { useEffect, useState } from "react";
import { hintKey, lookingAtWorkbench, outsideKey, pageKey, reportNews, useNews } from "../news";
import { Bell } from "lucide-react";
import { Trail, type Point } from "./Trail";
import { ActivityView } from "./views/ActivityView";
import { ChangesView } from "./views/ChangesView";
import { NextPromptView } from "./views/NextPromptView";
import { NoticesPanel } from "./NoticesPanel";
import { WorkbenchView } from "./views/WorkbenchView";
import type { AssistantState } from "../backend";
import { mainHarness } from "../assistant";
import type { GitView } from "../git";
import { lacksGit } from "./GitInit";
import { useHistory, useSnapshots } from "../history";
import { useMarkers } from "../markers";
import { useAttachedCount } from "./AttachmentList";
import { useView, type ViewId } from "../view";
import { plural, t } from "../i18n";
import { Tooltip, ToolTipBody } from "./Tooltip";
import { Splitter } from "./Splitter";
import { usePerProject } from "../projectMemory";
import type { Side } from "../layout";


/** Four views for the four questions that come up when working with an assistant; `who` is its name. */
const views: { id: ViewId; label: string; question: (who: string) => string; story: () => { says: string; hint: string } }[] = [
  { id: "activity", label: "Activity", question: () => t("What are the sessions doing?"), story: () => ({ says: t("Your overview while the assistant works. Every AI session has a row on today's timeline: blue where it worked, a yellow frame where it waited for you, a small triangle where CodeDeck took a snapshot before it wrote. Below that: how safe your work is (what is not committed yet, what is committed but not pushed) and the documents the sessions wrote."), hint: t("Zoom the timeline with Ctrl and the mouse wheel; the ? beside its title explains every sign.") }) },
  { id: "changes", label: "Changes", question: (who) => t("What did {who} change?", { who }), story: () => ({ says: t("What the AI sessions did to your files, shown as a diff. Normally everything that is not yet saved in Git; with a point selected on the trail it is exactly what that turn, commit or snapshot changed. Files carry the colour of the session that wrote them."), hint: t("Comment on lines (they go with your next prompt), mark files as viewed once you have looked at them, save them in Git with a message, or go back to a snapshot if it was not what you wanted.") }) },
  { id: "workbench", label: "Workbench", question: () => t("What else came up that is not part of the project yet?"), story: () => ({ says: t("Everything that came up around the project but is not part of it. The scratch folder holds drafts and throwaway files; below it are pages and files that AI sessions put elsewhere (a published page, a file in /tmp) and the @ai comments you left in your files as instructions."), hint: t("Open a file, drag it into the project if it is worth keeping, or attach it to your next prompt. An @ai comment disappears once the assistant has done what it asks.") }) },
  { id: "next", label: "Next prompt", question: () => t("What do you attach to your next prompt?"), story: () => ({ says: t("The last step before you write: what goes along with your next prompt. The files, changes, comments on lines and @ai hints you attached, each with where it comes from, and the exact text the assistant will receive. At the bottom are the start rules every new AI session gets once."), hint: t("Remove what should not go along. You write the prompt itself in the chat of the AI session; CodeDeck adds only what is listed here.") }) },
];

interface Props {
  git: GitView;
  /** Selected in the file list */
  selected: string | null;
  assistant: AssistantState;
  /** Resizes the file list: its grip also sits left of the trail, which goes with the file list */
  onResize: (side: Side, width: number | null, store: boolean) => void;
}

export function Deck({ git, selected, assistant, onResize }: Props) {
  const [view, setView] = useView();
  // The point on the trail and the session filter come back with the project (projectMemory)
  const [point, setPoint] = usePerProject<Point>("point", () => ({ kind: "now" }));
  const [notices, setNotices] = useState(false);
  const commits = useHistory(git.repos);
  const { snapshots, reload: reloadSnapshots } = useSnapshots(git.repos);
  const marks = useMarkers();
  const attachedCount = useAttachedCount();
  const openMarkers = marks.markers?.length ?? 0;
  const news = useNews();
  // What the Workbench shows besides the scratch folder, for "new" (the scratch folder reports itself)
  useEffect(() => {
    reportNews("outside", assistant.found.outside.filter((f) => !f.fetched).map((f) => ({ key: outsideKey(f.path), time: f.at })));
    reportNews("pages", assistant.found.pages.map((p) => ({ key: pageKey(p.url), time: p.at })));
  }, [assistant.found]);
  useEffect(() => {
    if (marks.markers) reportNews("hints", marks.markers.map((m) => ({ key: hintKey(m.path, m.text), time: 0 })));
  }, [marks.markers]);
  // Looking at the Workbench: leaving it after a real look makes what is there seen
  useEffect(() => {
    lookingAtWorkbench(view === "workbench");
    return () => lookingAtWorkbench(false);
  }, [view]);
  const changed = git.changed;

  // The repository of the selection: on the trail its commits stay bright, others fade
  const focusRepo =
    selected === null || git.repos.length < 2
      ? null
      : ([...git.repoAt.keys()]
          .filter((path) => selected === path || selected.startsWith(`${path}/`))
          .sort((a, b) => b.length - a.length)[0] ?? (git.rootRepo ? "" : null));

  const select = (next: Point) => {
    setPoint(next);
    setView("changes");
  };

  // Snapshots of one session only, when asked for in the snapshot view
  const [sessionFilter, setSessionFilter] = usePerProject<string | null>("sessionFilter", () => null);
  const shownSnapshots = sessionFilter ? snapshots.filter((s) => s.session === sessionFilter || s.back) : snapshots;

  /** Unix seconds of a point on the trail, to put the older one first. */
  const timeOf = (repo: string, hash: string) =>
    commits.find((c) => c.repo === repo && c.commit.hash === hash)?.commit.at ??
    snapshots.find((s) => s.repo === repo && s.hash === hash)?.at ??
    0;
  /** Ctrl+click: the point shown and this one, as a comparison; alone if there is nothing to compare with. */
  const compare = (repo: string, hash: string) => {
    const kind = snapshots.some((s) => s.repo === repo && s.hash === hash) ? "snapshot" : "commit";
    if (point.kind === "now" || point.repo !== repo) return select({ kind, repo, hash });
    const other = point.kind === "compare" ? point.from : point.hash;
    if (other === hash) return select({ kind, repo, hash });
    const [from, to] = timeOf(repo, other) <= timeOf(repo, hash) ? [other, hash] : [hash, other];
    select({ kind: "compare", repo, from, to });
  };


  return (
    <main className="deck-stage relative flex min-h-0 min-w-0 flex-col bg-base">
      <Tooltip
        area
        className="block shrink-0"
        content={
          <ToolTipBody
            says={t("This is where the work happens, from left to right: watch what the AI sessions do (Activity), check what they changed (Changes), collect what else came up (Workbench) and see what goes with your next prompt (Next prompt). The narrow column on the right, beside the file list, is the trail: the history of your project with its commits and CodeDeck's snapshots.")}
            hint={t("A click on a point in the trail shows in Changes what it changed.")}
          />
        }
      >
      <nav data-tour="deck-tabs"
        className="zone-tabs flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2"
        role="tablist"
        aria-label={t("Deck views")}
      >
        {views.map(({ id, label, story }) => {
          const active = id === view;
          // Next prompt: how much is attached (every item counts); Workbench: the hints still open
          // and the files left elsewhere not fetched yet
          const attached = attachedCount;
          const workbench = openMarkers + assistant.found.outside.filter((f) => !f.fetched).length;
          const badge =
            id === "changes" && changed > 0
              ? changed
              : id === "next" && attached > 0
                ? attached
                : id === "workbench" && workbench > 0
                  ? workbench
                  : undefined;
          return (
            <Tooltip key={id} pointer className="flex shrink-0" content={<ToolTipBody label={t(label)} says={story().says} hint={story().hint} />}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(id)}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ai ${
                active
                  ? "bg-raised text-slate-50 shadow-[inset_0_-2px_0_var(--color-brand)]"
                  : "text-slate-400 hover:bg-raised/70 hover:text-slate-100"
              }`}
            >
              {t(label)}
              {id === "workbench" && news.count > 0 && (
                <span title={plural(news.count, "new entry")} className="size-1.5 shrink-0 rounded-full bg-brand" />
              )}
              {badge !== undefined && (
                <span className="count-badge rounded-full bg-brand/20 px-1.5 text-[11px] font-semibold text-brand-soft">
                  {badge}
                </span>
              )}
            </button>
            </Tooltip>
          );
        })}
        {/* The question the open view answers */}
        <span className="mr-2 ml-auto min-w-0 truncate text-[12px] text-slate-400 italic">
          {views.find((v) => v.id === view)?.question(mainHarness(assistant).shortName)}
        </span>
        <button
          type="button"
          aria-label={t("Notices and tips")}
          aria-expanded={notices}
          title={t("Notices and tips")}
          onClick={() => setNotices(!notices)}
          className={`rounded-md p-1.5 text-slate-400 hover:bg-raised hover:text-slate-100 ${notices ? "bg-raised text-slate-100" : ""}`}
        >
          <Bell className="size-4" />
        </button>
      </nav>
      </Tooltip>

      <div className="flex min-h-0 flex-1">
        <section data-tour="deck-view" className="min-w-0 flex-1 overflow-y-auto" role="tabpanel">
          {view === "activity" && <ActivityView assistant={assistant} git={git} snapshots={snapshots} />}
          {view === "changes" && (
            <ChangesView
              git={git}
              point={point}
              commits={commits}
              snapshots={snapshots}
              sessionFilter={sessionFilter}
              onSessionFilter={setSessionFilter}
              onRestored={() => {
                reloadSnapshots();
                git.refresh();
              }}
              selected={selected}
              onShowNow={() => setPoint({ kind: "now" })}
              onSelect={setPoint}
              assistant={assistant}
            />
          )}
          {view === "workbench" && <WorkbenchView marks={marks} assistant={assistant} />}
          {view === "next" && <NextPromptView assistant={assistant} />}
        </section>
        {/* Commits and snapshots are git objects: without a repository the trail would only be empty.
            At the right, beside the file list it goes with; it opens to the left, over the deck */}
        {!lacksGit(git) && (
          <>
            <Splitter side="files" onResize={onResize} />
            <Trail commits={commits} snapshots={shownSnapshots} onCompare={compare} repos={git.repos} point={point} onSelect={select} focusRepo={focusRepo} />
          </>
        )}
      </div>
      {notices && <NoticesPanel assistant={assistant} git={git} view={view} onClose={() => setNotices(false)} />}
    </main>
  );
}
