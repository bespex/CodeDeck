import { FolderTree, GitBranch, GitFork } from "lucide-react";
import type { AssistantState, ProjectInfo } from "../backend";
import type { GitView } from "../git";
import { useProjectLook } from "../projectLook";
import { AppMenu, QuickSettings } from "./HeaderBar";
import { placeOf } from "./ProjectHeader";
import { inkOn, ProjectMark } from "./ProjectMark";
import { RepoTooltip } from "./RepoTooltip";
import { Tooltip, ToolTipBody } from "./Tooltip";
import { lacksGit } from "./GitInit";
import { GitCommands, trailShown, UNDER_TRAIL } from "./StatusBar";
import { t } from "../i18n";

interface Props {
  project: ProjectInfo | null;
  git: GitView;
  assistant: AssistantState;
  /** Files changed lately: the mark gets the dot the tree would show */
  recent: number;
  onToggleLog: () => void;
  /** The log of git commands is open below the deck */
  logOpen: boolean;
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  /** Opens the file list again */
  onOpen: () => void;
}

/**
 * The folded file list (docs/KONZEPT.md 4.7 rule 4): a rail that keeps what the column holds besides
 * the tree, so folding never hides the project or a menu. From the top: the project's mark in its
 * colour (the 44 px header row stays whole; a click opens the list again, as it folded it, a dot says that
 * files changed lately), quick settings and the app menu, and at the foot what the status bar holds: the
 * log of git commands and the branch, which opens the git actions.
 */
export function FilesRail({ project, git, assistant, recent, onToggleLog, logOpen, onRepoActions, onOpen }: Props) {
  const look = useProjectLook(project?.path);
  const fill = look ? (look.mark?.color ?? look.color) : null;
  const root = git.rootRepo;
  const name = project?.crumbs[project.crumbs.length - 1]?.label ?? project?.root ?? "";
  return (
    <aside className="zone-files flex min-h-0 min-w-0 flex-col items-center border-r border-line bg-panel">
      <Tooltip
        area
        className="block w-full shrink-0"
        content={<ToolTipBody says={project ? `${name} · ${placeOf(project.root)}` : t("No project open")} hint={[t("Show the file list ({keys})", { keys: `${t("Ctrl")}+B` }), recent > 0 ? t("{n} changed recently", { n: recent }) : ""].filter(Boolean).join(" · ")} />}
      >
        <header
          className="zone-tabs flex h-11 w-full items-center justify-center border-b border-line bg-panel"
          style={fill ? { background: fill, color: inkOn(fill) } : undefined}
        >
          {/* The mark opens the list again, as it folded it */}
          <button type="button" aria-label={t("Show the file list")} onClick={onOpen} className="relative rounded-md p-0.5 hover:bg-black/15">
            {look ? <ProjectMark mark={look.mark} color={look.color} name={look.name} size={28} shape="bare" /> : <FolderTree className="size-4" />}
            {/* The dot the tree would show beside recently changed files */}
            {recent > 0 && <span className="ai-dot absolute -top-0.5 -right-0.5" />}
          </button>
        </header>
      </Tooltip>

      <div className="flex flex-col items-center gap-0.5 py-1.5">
        {/* `relative`: the menus hang under their button and move inside the window by themselves */}
        <div className="relative">
          <QuickSettings />
        </div>
        <div className="relative">
          <AppMenu onToggleLog={onToggleLog} assistant={assistant} />
        </div>
      </div>


      <span className="flex-1" />

      {/* The height of the status bar beside it, so the lines at the foot meet; under the trail like the
          status bar, which gives its two buttons room */}
      <footer className={`zone-bar flex h-7 shrink-0 items-center justify-center gap-2 self-stretch border-t border-line bg-panel ${trailShown(git) ? UNDER_TRAIL : ""}`}>
        {root && (
          <Tooltip content={<RepoTooltip repo={root} runs={git.runs} />}>
            <button
              type="button"
              aria-label={t("Git actions, branch {branch}", { branch: root.branch ?? t("detached") })}
              onClick={(e) => onRepoActions(root.path, e.currentTarget, true)}
              className={`rounded-md p-1 hover:bg-raised ${root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-300"}`}
            >
              {root.worktreeOf ? <GitFork className="size-4" /> : <GitBranch className="size-4" />}
            </button>
          </Tooltip>
        )}
        {/* Without a repository: `git init` changes something, so it stays the labelled button of the open list */}
        {lacksGit(git) && (
          <button type="button" title={t("No git repository")} onClick={onOpen} className="rounded-md p-1 text-slate-500 hover:bg-raised hover:text-slate-200">
            <GitBranch className="size-4" />
          </button>
        )}
        {/* The status bar's "git", the log of every git command: in the foot, so the open log, which
            ends above it, never covers it */}
        <GitCommands runs={git.runs} open={logOpen} onToggle={onToggleLog} compact />
      </footer>
    </aside>
  );
}
