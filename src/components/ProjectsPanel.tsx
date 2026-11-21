import type { AssistantState, ProjectInfo } from "../backend";
import OverviewApp, { ProjectsRail, type InWindow } from "./OverviewApp";
import { PathBar } from "./ProjectHeader";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { useProjectLook } from "../projectLook";
import { inkOn, ProjectMark } from "./ProjectMark";
import { Tooltip, ToolTipBody } from "./Tooltip";
import { placeOf } from "./ProjectHeader";
import { t } from "../i18n";

interface Props {
  project: ProjectInfo | null;
  assistant: AssistantState;
  onToggleLog: () => void;
  /** Shows a project in this window or a new one (App's `open`) */
  onOpen: InWindow["onOpen"];
  folded: boolean;
  onFold: (folded?: boolean) => void;
}

/**
 * The left column of a project window (docs/PLAN.md "Projektliste im Fenster statt Übersicht"): on top
 * the project shown, in its colour, with the menus about CodeDeck; below it all projects, as the
 * overview listed them, without their sessions. A click on the project's mark folds the column to a
 * rail of marks, where the same mark opens it again.
 */
export function ProjectsPanel({ project, assistant, onToggleLog, onOpen, folded, onFold }: Props) {
  const inWindow: InWindow = { current: project?.path ?? null, onOpen };
  if (folded) return <FoldedProjects project={project} assistant={assistant} onToggleLog={onToggleLog} inWindow={inWindow} onOpen={() => onFold(false)} />;
  return (
    <aside data-tour="projects" className="zone-side flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <PathBar project={project} onToggleLog={onToggleLog} assistant={assistant} onFold={() => onFold(true)} foldLabel={t("Fold the project list")} />
      <OverviewApp inWindow={inWindow} />
    </aside>
  );
}

function FoldedProjects({ project, assistant, onToggleLog, inWindow, onOpen }: { project: ProjectInfo | null; assistant: AssistantState; onToggleLog: () => void; inWindow: InWindow; onOpen: () => void }) {
  const look = useProjectLook(project?.path);
  const fill = look ? (look.mark?.color ?? look.color) : null;
  const name = project?.crumbs[project.crumbs.length - 1]?.label ?? project?.root ?? "";
  return (
    <aside data-tour="projects" className="zone-side flex min-h-0 min-w-0 flex-col items-center border-r border-line bg-panel">
      <Tooltip area className="block w-full shrink-0" content={<ToolTipBody says={project ? `${name} · ${placeOf(project.root)}` : t("No project open")} hint={t("Show the project list")} />}>
        <header className="zone-tabs flex h-11 w-full items-center justify-center border-b border-line bg-panel" style={fill ? { background: fill, color: inkOn(fill) } : undefined}>
          <button type="button" aria-label={t("Show the project list")} onClick={onOpen} className="rounded-md p-0.5 hover:bg-black/15">
            {look && <ProjectMark mark={look.mark} color={look.color} name={look.name} size={28} shape="bare" />}
          </button>
        </header>
      </Tooltip>
      {/* `relative`: the menus hang under their button and move inside the window by themselves */}
      <div className="flex flex-col items-center gap-0.5 border-b border-line/60 py-1.5">
        <div className="relative">
          <QuickSettings />
        </div>
        <div className="relative">
          <AppMenu onToggleLog={onToggleLog} assistant={assistant} />
        </div>
      </div>
      <ProjectsRail inWindow={inWindow} />
    </aside>
  );
}
