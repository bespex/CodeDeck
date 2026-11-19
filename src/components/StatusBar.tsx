import { GitBranch, GitFork, Plug, SquareTerminal } from "lucide-react";
import { aheadBehind, changeSummary, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { RepoTooltip } from "./RepoTooltip";
import { GitInitButton, lacksGit } from "./GitInit";
import type { AssistantState, GitRun } from "../backend";
import { openDialog } from "../dialogs";
import { useProjectAccount, useProjectLook, type ProjectAccount } from "../projectLook";
import { UsageChip } from "./UsagePanel";
import { plural, t } from "../i18n";

interface GitProps {
  /** Files changed lately (on disk or by a session): one quiet note beside the git button */
  recent: number;
  git: GitView;
  onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void;
  logOpen: boolean;
  onToggleLog: () => void;
}

/**
 * The bar at the foot of the file column: the branch and git (user, 2026-11-17: one bar per column
 * instead of one across the window; the middle has none). One line, never two: what can be clicked
 * is bright, with an icon and a short word; what only informs stays quiet grey and gives way first
 * when the column is narrow. Details are in the tooltips.
 */
/**
 * The left status bar reaches under the trail (user, 2026-11-19): the trail ends above it, the bar runs
 * on to the trail's right edge (`w-11`, 44 px), so it has more room, and the folded rail's foot too.
 * Above the grips of the lines it crosses; its own right border carries the trail's line down.
 */
export const UNDER_TRAIL = "relative z-30 -mr-11 border-r border-line";

/** Whether the trail is shown, so the bar reaches under it (without git there is none, see `Deck`) */
export const trailShown = (git: GitView) => !lacksGit(git);

export function GitStatusBar({ git, onRepoActions, logOpen, onToggleLog, recent }: GitProps) {
  const root = git.rootRepo;
  const inFolders = git.repos.filter((r) => r.path);
  const withChanges = inFolders.filter((r) => r.files.length > 0).length;

  return (
    <footer className={`zone-bar @container flex h-7 shrink-0 items-center gap-3 overflow-x-clip border-t border-line bg-panel px-3 text-[12px] whitespace-nowrap text-slate-500 ${trailShown(git) ? UNDER_TRAIL : ""}`}>
      {root && (
        <Tooltip className="flex min-w-0" content={<RepoTooltip repo={root} runs={git.runs} />}>
          <button
            type="button"
            aria-label={t("Git actions, branch {branch}", { branch: root.branch ?? t("detached") })}
            onClick={(e) => onRepoActions(root.path, e.currentTarget, true)}
            className={`${CLICKABLE.replace("shrink-0", "min-w-0")} ${root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-200"}`}
          >
            {root.worktreeOf ? <GitFork className="size-3.5 shrink-0" /> : <GitBranch className="size-3.5 shrink-0" />}
            <span className="min-w-0 max-w-56 truncate">{root.branch ?? t("detached")}</span>
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
      {recent > 0 && (
        <span className="flex min-w-0 items-center gap-1.5" title={t("{n} changed recently", { n: recent })}>
          <span className="ai-dot shrink-0" />
          <span className="truncate">{t("{n} changed recently", { n: recent })}</span>
        </span>
      )}
      {inFolders.length > 0 && (
        <span
          // The first to go when the column is narrow; the tooltip has the details
          className="hidden min-w-0 truncate @sm:inline"
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
      {/* At the right edge, away from the branch: it opens the log of every git command */}
      <span className="ml-auto" />
      <GitCommands runs={git.runs} open={logOpen} onToggle={onToggleLog} />
    </footer>
  );
}

/** The bar at the foot of the right column: the state of the project's AI account, usage first. */
export function AssistantStatusBar({ assistant }: { assistant: AssistantState }) {
  const look = useProjectLook(undefined);
  const mine = useProjectAccount(assistant, look);
  return (
    <footer className="zone-bar flex h-7 shrink-0 items-center gap-3 overflow-x-clip border-t border-line bg-panel px-3 text-[12px] whitespace-nowrap text-slate-500">
      <NotConnected mine={mine} />
      <span className="ml-auto" />
      <UsageChip assistant={assistant} account={mine.account?.dir} />
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
export function GitCommands({ runs, open, onToggle, compact = false }: { runs: GitRun[]; open: boolean; onToggle: () => void; compact?: boolean }) {
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
        // Compact, in the foot of the folded file list's rail: the icon alone
        className={`${compact ? "flex items-center rounded-md p-1 hover:bg-raised" : CLICKABLE} ${open ? "bg-raised text-slate-50" : last && !last.ok ? "text-problem" : compact ? "text-slate-400 hover:text-slate-100" : "text-slate-200"}`}
      >
        <SquareTerminal className={compact ? "size-4" : "size-3.5"} />
        {!compact && "git"}
      </button>
    </Tooltip>
  );
}

/**
 * Only when it matters: the AI account of this project does not report to CodeDeck, so nothing of
 * its sessions arrives. Connected, the bar says nothing; the sessions are in the column beside.
 */
function NotConnected({ mine: { account, harness } }: { mine: ProjectAccount }) {
  if (!account || account.connected) return null;
  return (
    <button
      type="button"
      title={t("{tool} does not report to CodeDeck in {account}: connect it in the settings", { tool: harness.name, account: account.name })}
      onClick={() => openDialog({ kind: "settings", section: "tools" })}
      className={`${CLICKABLE} text-changed`}
    >
      <Plug className="size-3.5" />
      {account.name}: {t("not connected")}
    </button>
  );
}
