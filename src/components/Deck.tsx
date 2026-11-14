import { useState } from "react";
import {
  BookOpen,
  FlaskConical,
  GitCompareArrows,
  Settings2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { Trail, type Point } from "./Trail";
import { WorkspaceView } from "./views/WorkspaceView";
import { ComingView } from "./views/ComingView";
import { ChangesView } from "./views/ChangesView";
import { DocsView } from "./views/DocsView";
import type { AssistantState, ProjectInfo } from "../backend";
import type { GitView } from "../git";
import { useHistory, useSnapshots } from "../history";

type ViewId = "workspace" | "map" | "changes" | "docs" | "tests";

const views: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "workspace", label: "Workspace", icon: Settings2 },
  { id: "map", label: "Map", icon: Waypoints },
  { id: "changes", label: "Changes", icon: GitCompareArrows },
  { id: "docs", label: "Docs", icon: BookOpen },
  { id: "tests", label: "Tests", icon: FlaskConical },
];

interface Props {
  project: ProjectInfo | null;
  git: GitView;
  /** Selected in the file list */
  selected: string | null;
  assistant: AssistantState;
}

export function Deck({ project, git, selected, assistant }: Props) {
  const [view, setView] = useState<ViewId>("changes");
  const [point, setPoint] = useState<Point>({ kind: "now" });
  const commits = useHistory(git.repos);
  const { snapshots, reload: reloadSnapshots } = useSnapshots(git.repos);
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

  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-base">
      <nav
        className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2"
        role="tablist"
        aria-label="Deck views"
      >
        {views.map(({ id, label, icon: Icon }) => {
          const active = id === view;
          const badge = id === "changes" && changed > 0 ? changed : undefined;
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
              <Icon className="size-4" />
              {label}
              {badge !== undefined && (
                <span className="rounded-full bg-brand/20 px-1.5 text-[11px] font-semibold text-brand-soft">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1">
        <Trail commits={commits} snapshots={snapshots} repos={git.repos} point={point} onSelect={select} focusRepo={focusRepo} />
        <section className="min-w-0 flex-1 overflow-y-auto" role="tabpanel">
          {view === "workspace" && <WorkspaceView project={project} />}
          {view === "map" && (
            <ComingView
              icon={Waypoints}
              title="Map"
              text="Modules and how they depend on each other, drawn as a graph you can pin parts of."
              phase="after Phase 5"
            />
          )}
          {view === "changes" && (
            <ChangesView
              git={git}
              point={point}
              commits={commits}
              snapshots={snapshots}
              onRestored={() => {
                reloadSnapshots();
                git.refresh();
              }}
              selected={selected}
              onShowNow={() => setPoint({ kind: "now" })}
              onSelect={setPoint}
            />
          )}
          {view === "docs" && <DocsView assistant={assistant} />}
          {view === "tests" && (
            <ComingView
              icon={FlaskConical}
              title="Tests"
              text="Test runs and their results, with failures one click away from the assistant."
              phase="after Phase 5"
            />
          )}
        </section>
      </div>
    </main>
  );
}
