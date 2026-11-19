import { FolderTree, GitBranch, GitFork } from "lucide-react";
import type { GitView } from "../git";
import { RepoTooltip } from "./RepoTooltip";
import { Tooltip } from "./Tooltip";
import { lacksGit } from "./GitInit";
import { GitCommands, trailShown, UNDER_TRAIL } from "./StatusBar";
import { t } from "../i18n";

interface Props {
  git: GitView;
  /** Files changed lately: the tree's icon gets the dot the tree would show */
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
 * the tree. On top the tree's icon, which opens the list again (a dot says that files changed lately);
 * at the foot what the status bar holds: the log of git commands and the branch, which opens the git
 * actions. The project and the menus are in the project list at the left.
 */
export function FilesRail({ git, recent, onToggleLog, logOpen, onRepoActions, onOpen }: Props) {
  const root = git.rootRepo;
  return (
    <aside className="zone-files flex min-h-0 min-w-0 flex-col items-center border-l border-line bg-panel">
      {/* As high as the headers beside it; the tree's icon opens the list again. The project's colour
          and the menus are in the project list, at the left */}
      <header className="zone-tabs flex h-11 w-full shrink-0 items-center justify-center border-b border-line bg-panel">
        <button
          type="button"
          aria-label={t("Show the file list")}
          title={`${t("Show the file list")} (${t("Ctrl")}+B)${recent > 0 ? ` · ${t("{n} changed recently", { n: recent })}` : ""}`}
          onClick={onOpen}
          className="relative rounded-md p-1.5 text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          <FolderTree className="size-4" />
          {/* The dot the tree would show beside recently changed files */}
          {recent > 0 && <span className="ai-dot absolute top-0.5 right-0.5" />}
        </button>
      </header>

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
