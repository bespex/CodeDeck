import { Eye, GitBranch, GitFork, Plug, SquareTerminal } from "lucide-react";
import { aheadBehind, changeSummary, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { RepoTooltip } from "./RepoTooltip";
import type { GitRun } from "../backend";

interface Props {
  git: GitView;
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  logOpen: boolean;
  onToggleLog: () => void;
}

export function StatusBar({ git, onRepoActions, logOpen, onToggleLog }: Props) {
  const root = git.rootRepo;
  const inFolders = git.repos.filter((r) => r.path);
  const withChanges = inFolders.filter((r) => r.files.length > 0).length;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-slate-500">
      {root && (
        <Tooltip content={<RepoTooltip repo={root} runs={git.runs} />}>
          <button
            type="button"
            aria-label={`Git actions, branch ${root.branch ?? "detached"}`}
            onClick={(e) => onRepoActions(root.path, e.currentTarget, true)}
            className={`-mx-1 flex items-center gap-1 rounded px-1 hover:bg-raised ${
              root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-400"
            }`}
          >
            {root.worktreeOf ? <GitFork className="size-3" /> : <GitBranch className="size-3" />}
            {root.branch ?? "detached"}
            {aheadBehind(root) && <span className="text-slate-500">{aheadBehind(root)}</span>}
          </button>
        </Tooltip>
      )}
      {inFolders.length > 0 && (
        <span
          title={inFolders
            .map((r) => `${r.path} · ${r.branch ?? "detached"} · ${changeSummary(r).toLowerCase()}`)
            .join("\n")}
        >
          {inFolders.length} {root ? "nested " : ""}
          {inFolders.length === 1 ? "repository" : "repositories"}
          {withChanges > 0 && <span className="text-changed"> · {withChanges} with changes</span>}
        </span>
      )}
      <LastCommand runs={git.runs} open={logOpen} onToggle={onToggleLog} />
      <span className="flex items-center gap-1">
        <Eye className="size-3" />
        Watching open folders
      </span>
      <span className="flex items-center gap-1 text-slate-500">
        <Plug className="size-3" />
        Tool socket: not yet
      </span>
    </footer>
  );
}

/**
 * The git command that ran last, as one would type it. The same command in several repos within
 * a moment (one status round) is shown once, with the number of repos.
 */
function LastCommand({ runs, open, onToggle }: { runs: GitRun[]; open: boolean; onToggle: () => void }) {
  const last = runs.at(-1);
  const round = last ? runs.filter((r) => r.command === last.command && last.at - r.at < 1000) : [];
  const where = round.length > 1 ? `${round.length} repos` : last?.repo;
  const failed = runs.filter((r) => !r.ok).length;
  return (
    <Tooltip
      className="ml-auto flex min-w-0"
      content={
        <>
          <span>{open ? "Hide the git commands" : "Every git command CodeDeck ran, with what git printed"}</span>
          {failed > 0 && <span className="text-problem">{failed} failed</span>}
          <TooltipHint>Click or Ctrl+Shift+G</TooltipHint>
        </>
      }
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`-mx-1 flex min-w-0 items-center gap-1 rounded px-1 font-mono hover:bg-raised ${
          open ? "bg-raised text-slate-200" : last && !last.ok ? "text-problem" : "text-slate-500"
        }`}
      >
        <SquareTerminal className="size-3 shrink-0" />
        <span className="truncate">{last ? last.command : "Git commands"}</span>
        {where && <span className="shrink-0 font-sans text-slate-500">· {where}</span>}
      </button>
    </Tooltip>
  );
}
