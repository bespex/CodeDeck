import { Eye, GitBranch, GitFork, SquareTerminal } from "lucide-react";
import { aheadBehind, changeSummary, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { RepoTooltip } from "./RepoTooltip";
import type { AssistantState, GitRun } from "../backend";
import { AssistantStatus } from "./AssistantStatus";
import { plural, t } from "../i18n";

interface Props {
  git: GitView;
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  logOpen: boolean;
  onToggleLog: () => void;
  assistant: AssistantState;
}

export function StatusBar({ git, onRepoActions, logOpen, onToggleLog, assistant }: Props) {
  const root = git.rootRepo;
  const inFolders = git.repos.filter((r) => r.path);
  const withChanges = inFolders.filter((r) => r.files.length > 0).length;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] text-slate-500">
      {root && (
        <Tooltip content={<RepoTooltip repo={root} runs={git.runs} />}>
          <button
            type="button"
            aria-label={t("Git actions, branch {branch}", { branch: root.branch ?? t("detached") })}
            onClick={(e) => onRepoActions(root.path, e.currentTarget, true)}
            className={`-mx-1 flex items-center gap-1 rounded px-1 hover:bg-raised ${
              root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-400"
            }`}
          >
            {root.worktreeOf ? <GitFork className="size-3" /> : <GitBranch className="size-3" />}
            {root.branch ?? t("detached")}
            {aheadBehind(root) && <span className="text-slate-500">{aheadBehind(root)}</span>}
          </button>
        </Tooltip>
      )}
      {inFolders.length > 0 && (
        <span
          title={inFolders
            .map((r) => `${r.path} · ${r.branch ?? t("detached")} · ${changeSummary(r)}`)
            .join("\n")}
        >
          {root
            ? t(inFolders.length === 1 ? "{n} nested repository" : "{n} nested repositories", { n: inFolders.length })
            : plural(inFolders.length, "repository")}
          {withChanges > 0 && <span className="text-changed"> · {t("{n} with changes", { n: withChanges })}</span>}
        </span>
      )}
      <LastCommand runs={git.runs} open={logOpen} onToggle={onToggleLog} />
      <span className="flex items-center gap-1">
        <Eye className="size-3" />
        {t("Watching open folders")}
      </span>
      <AssistantStatus state={assistant} />
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
  const where = round.length > 1 ? plural(round.length, "repository") : last?.repo;
  const failed = runs.filter((r) => !r.ok).length;
  return (
    <Tooltip
      className="ml-auto flex min-w-0"
      content={
        <>
          <span>{open ? t("Hide the git commands") : t("Every git command CodeDeck ran, with what git printed")}</span>
          {failed > 0 && <span className="text-problem">{failed} failed</span>}
          <TooltipHint>{t("Click or Ctrl+Shift+G")}</TooltipHint>
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
        <span className="truncate">{last ? last.command : t("Git commands")}</span>
        {where && <span className="shrink-0 font-sans text-slate-500">· {where}</span>}
      </button>
    </Tooltip>
  );
}
