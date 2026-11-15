import { useState } from "react";
import { Trail, type Point } from "./Trail";
import { ActivityView } from "./views/ActivityView";
import { ChangesView } from "./views/ChangesView";
import { NextPromptView } from "./views/NextPromptView";
import { WorkbenchView } from "./views/WorkbenchView";
import type { AssistantState } from "../backend";
import { mainHarness } from "../assistant";
import type { GitView } from "../git";
import { useHistory, useSnapshots } from "../history";
import { useMarkers } from "../markers";
import { attachmentCount } from "../attachments";

type ViewId = "activity" | "changes" | "workbench" | "next";

/** Four views for the four questions that come up when working with an assistant; `who` is its name. */
const views: { id: ViewId; label: string; question: (who: string) => string }[] = [
  { id: "activity", label: "Activity", question: () => "What are the sessions doing?" },
  { id: "changes", label: "Changes", question: (who) => `What did ${who} change?` },
  { id: "workbench", label: "Workbench", question: () => "What else came up that is not part of the project yet?" },
  { id: "next", label: "Next prompt", question: () => "What do you attach to your next prompt?" },
];

interface Props {
  git: GitView;
  /** Selected in the file list */
  selected: string | null;
  assistant: AssistantState;
  /** Files and folders attached to the next prompt */
  pinned: number;
}

export function Deck({ git, selected, assistant, pinned }: Props) {
  const [view, setView] = useState<ViewId>("changes");
  const [point, setPoint] = useState<Point>({ kind: "now" });
  const commits = useHistory(git.repos);
  const { snapshots, reload: reloadSnapshots } = useSnapshots(git.repos);
  const marks = useMarkers();
  const openMarkers = marks.markers?.length ?? 0;
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
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);
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
    <main className="flex min-h-0 min-w-0 flex-col bg-base">
      <nav
        className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2"
        role="tablist"
        aria-label="Deck views"
      >
        {views.map(({ id, label }) => {
          const active = id === view;
          // Next prompt: how much is attached (each file on its own), else the hints waiting to be
          const attached = attachmentCount(assistant, pinned);
          const badge =
            id === "changes" && changed > 0 ? changed : id === "next" && (attached || openMarkers) ? attached || openMarkers : undefined;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(id)}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ai ${
                active
                  ? "bg-raised text-slate-50 shadow-[inset_0_-2px_0_var(--color-brand)]"
                  : "text-slate-400 hover:bg-raised/70 hover:text-slate-100"
              }`}
            >
              {label}
              {badge !== undefined && (
                <span className="rounded-full bg-brand/20 px-1.5 text-[11px] font-semibold text-brand-soft">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        {/* The question the open view answers */}
        <span className="mr-2 ml-auto min-w-0 truncate text-[12px] text-slate-400">
          {views.find((v) => v.id === view)?.question(mainHarness(assistant).shortName)}
        </span>
      </nav>

      <div className="flex min-h-0 flex-1">
        <Trail commits={commits} snapshots={shownSnapshots} onCompare={compare} repos={git.repos} point={point} onSelect={select} focusRepo={focusRepo} />
        <section className="min-w-0 flex-1 overflow-y-auto" role="tabpanel">
          {view === "activity" && <ActivityView assistant={assistant} />}
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
          {view === "workbench" && <WorkbenchView />}
          {view === "next" && <NextPromptView assistant={assistant} marks={marks} pinned={pinned} onChanges={() => setView("changes")} />}
        </section>
      </div>
    </main>
  );
}
