import type { GitRun, RepoStatus } from "../backend";
import { ago, changeSummary, syncSummary } from "../git";
import { TooltipHint } from "./Tooltip";

/** What a repository's branch badge says on hover: facts first, then the quiet hints. */
export function RepoTooltip({ repo, runs }: { repo: RepoStatus; runs: GitRun[] }) {
  const last = [...runs].reverse().find((run) => run.repo === repo.name);
  return (
    <>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-semibold text-slate-100">{repo.name}</span>
        <code className="rounded bg-base px-1 font-mono text-[11px] text-slate-200">
          {repo.branch ?? "detached HEAD"}
        </code>
      </span>
      {repo.error ? (
        <span className="text-problem">{repo.error}</span>
      ) : (
        <>
          <span className={repo.files.length > 0 ? "text-changed" : ""}>{changeSummary(repo)}</span>
          <span>{syncSummary(repo)}</span>
          {repo.worktreeOf && (
            <span className="text-slate-400">
              Worktree of <span className="font-semibold">{repo.worktreeOf}</span>: shares its history, own branch
            </span>
          )}
        </>
      )}
      <TooltipHint>
        Click for commit, pull and push
        {last && (
          <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
            {last.command} · {ago(last.at)}
          </span>
        )}
      </TooltipHint>
    </>
  );
}
