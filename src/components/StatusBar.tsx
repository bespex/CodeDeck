import { Eye, GitBranch, GitFork, SquareTerminal } from "lucide-react";
import { aheadBehind, changeSummary, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { RepoTooltip } from "./RepoTooltip";
import { GitInitButton, lacksGit } from "./GitInit";
import type { AssistantState, GitRun } from "../backend";
import { AssistantStatus } from "./AssistantStatus";
import { UsageChip } from "./UsagePanel";
import { plural, t } from "../i18n";

interface Props {
  git: GitView;
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  logOpen: boolean;
  onToggleLog: () => void;
  assistant: AssistantState;
}

/**
 * One line, never two: what can be clicked is bright, with an icon and a short word (on the left
 * branch and git, on the right the coding tool); what only informs stays quiet grey and gives way first when the window is
 * narrow. Details are in the tooltips.
 */
export function StatusBar({ git, onRepoActions, logOpen, onToggleLog, assistant }: Props) {
  const root = git.rootRepo;
  const inFolders = git.repos.filter((r) => r.path);
  const withChanges = inFolders.filter((r) => r.files.length > 0).length;

  return (
    <footer className="@container flex h-7 shrink-0 items-center gap-4 overflow-x-clip border-t border-line bg-panel px-3 text-[12px] whitespace-nowrap text-slate-500">
      {root && (
        <Tooltip className="flex shrink-0" content={<RepoTooltip repo={root} runs={git.runs} />}>
          <button
            type="button"
            aria-label={t("Git actions, branch {branch}", { branch: root.branch ?? t("detached") })}
            onClick={(e) => onRepoActions(root.path, e.currentTarget, true)}
            className={`${CLICKABLE} ${root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-200"}`}
          >
            {root.worktreeOf ? <GitFork className="size-3.5" /> : <GitBranch className="size-3.5" />}
            <span className="max-w-56 truncate">{root.branch ?? t("detached")}</span>
            {aheadBehind(root) && <span className="text-slate-500">{aheadBehind(root)}</span>}
          </button>
        </Tooltip>
      )}
      {lacksGit(git) && (
        <>
          <span className="shrink-0">{t("No git repository")}</span>
          <GitInitButton git={git} className={`${CLICKABLE} text-slate-200`} />
        </>
      )}
      {/* Git on the left, next to the branch: what is clicked there is all git */}
      <GitCommands runs={git.runs} open={logOpen} onToggle={onToggleLog} />
      {inFolders.length > 0 && (
        <span
          className="min-w-0 truncate"
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
      <span className="ml-auto" />
      <span className="flex shrink-0 items-center gap-1" title={t("Watching open folders")}>
        <Eye className="size-3.5" />
        <span className="@max-5xl:hidden">{t("Watching open folders")}</span>
      </span>
      <UsageChip assistant={assistant} />
      <AssistantStatus state={assistant} />
    </footer>
  );
}

/** How everything clickable in the status bar looks, apart from its colour. */
export const CLICKABLE = "-mx-1 flex shrink-0 items-center gap-1.5 rounded px-1 font-medium hover:bg-raised";

/**
 * The git commands CodeDeck ran: one short word in the bar, red when the last one failed; the
 * command itself is in the tooltip, as one would type it. The same command in several repos within
 * a moment (one status round) counts once, with the number of repos.
 */
function GitCommands({ runs, open, onToggle }: { runs: GitRun[]; open: boolean; onToggle: () => void }) {
  const last = runs.at(-1);
  const round = last ? runs.filter((r) => r.command === last.command && last.at - r.at < 1000) : [];
  const where = round.length > 1 ? plural(round.length, "repository") : last?.repo;
  const failed = runs.filter((r) => !r.ok).length;
  return (
    <Tooltip
      className="flex shrink-0"
      content={
        <>
          <span>{open ? t("Hide the git commands") : t("Every git command CodeDeck ran, with what git printed")}</span>
          {last && (
            <span className={`font-mono text-[11px] ${last.ok ? "text-slate-300" : "text-problem"}`}>
              {t("Last:")} {last.command}
              {where && <span className="font-sans text-slate-500"> · {where}</span>}
            </span>
          )}
          {failed > 0 && <span className="text-problem">{plural(failed, "failed command")}</span>}
          <TooltipHint>{t("Click or Ctrl+Shift+G")}</TooltipHint>
        </>
      }
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={t("Git commands")}
        onClick={onToggle}
        className={`${CLICKABLE} ${open ? "bg-raised text-slate-50" : last && !last.ok ? "text-problem" : "text-slate-200"}`}
      >
        <SquareTerminal className="size-3.5" />
        git
      </button>
    </Tooltip>
  );
}
