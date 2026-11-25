import type { AssistantState, ProjectInfo } from "../backend";
import OverviewApp, { ProjectsRail, type InWindow } from "./OverviewApp";
import { PathBar } from "./ProjectHeader";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { Tooltip, ToolTipBody } from "./Tooltip";
import { t } from "../i18n";

interface Props {
  project: ProjectInfo | null;
  assistant: AssistantState;
  /** Shows a project in this window or a new one (App's `open`) */
  onOpen: InWindow["onOpen"];
  folded: boolean;
  onFold: (folded?: boolean) => void;
}

/**
 * The left column of a project window (docs/PLAN.md "Projektliste im Fenster statt Übersicht"): on top
 * the title CodeDeck with its menus; below it all projects, as the overview listed them, without
 * their sessions. A click on the logo folds the column to a rail of marks, where the logo opens it again.
 */
export function ProjectsPanel({ project, assistant, onOpen, folded, onFold }: Props) {
  const inWindow: InWindow = { current: project?.path ?? null, onOpen };
  if (folded) return <FoldedProjects assistant={assistant} inWindow={inWindow} onOpen={() => onFold(false)} />;
  return (
    <aside data-tour="projects" className="zone-files flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <PathBar assistant={assistant} onFold={() => onFold(true)} foldLabel={t("Fold the project list")} />
      <OverviewApp inWindow={inWindow} />
    </aside>
  );
}

function FoldedProjects({ assistant, inWindow, onOpen }: { assistant: AssistantState; inWindow: InWindow; onOpen: () => void }) {
  return (
    <aside data-tour="projects" className="zone-files flex min-h-0 min-w-0 flex-col items-center border-r border-line bg-panel">
      <Tooltip area className="block w-full shrink-0" content={<ToolTipBody says={t("All your projects")} hint={t("Show the project list")} />}>
        <header className="zone-tabs flex h-11 w-full items-center justify-center border-b border-line bg-panel">
          <button type="button" aria-label={t("Show the project list")} onClick={onOpen} className="rounded-md p-0.5 hover:bg-raised">
            <img src="/codedeck.svg" alt="" className="size-6" />
          </button>
        </header>
      </Tooltip>
      {/* `relative`: the menus hang under their button and move inside the window by themselves */}
      <div className="flex flex-col items-center gap-0.5 border-b border-line/60 py-1.5">
        <div className="relative">
          <QuickSettings />
        </div>
        <div className="relative">
          <AppMenu assistant={assistant} />
        </div>
      </div>
      <ProjectsRail inWindow={inWindow} />
    </aside>
  );
}
