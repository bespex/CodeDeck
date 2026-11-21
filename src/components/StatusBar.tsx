import { ArrowDown, ArrowUp, FilePen, GitBranch, GitFork, Plug, SquareTerminal } from "lucide-react";
import { changeSummary, type GitView } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";
import { RepoTooltip } from "./RepoTooltip";
import { GitInitButton, lacksGit } from "./GitInit";
import type { AssistantState, GitRun, RepoStatus } from "../backend";
import { openDialog } from "../dialogs";
import { useProjectAccount, useProjectLook, type ProjectAccount } from "../projectLook";
import { UsageChip } from "./UsagePanel";
import { plural, t } from "../i18n";

interface GitProps {
  /** Files changed lately (on disk or by a session): one quiet note in the bar */
  recent: number;
  git: GitView;
  logOpen: boolean;
  onToggleLog: () => void;
}

/**
 * The bar at the foot of the file column: what changed lately and git (user, 2026-11-17: one bar per column
 * instead of one across the window; the middle has none). One line, never two: what can be clicked
 * is bright, with an icon and a short word; what only informs stays quiet grey and gives way first
 * when the column is narrow. Details are in the tooltips.
 */
/**
 * The file list's status bar reaches under the trail (user, 2026-11-19): the trail ends above it, the
 * bar runs on to the trail's left edge (`w-11`, 44 px), so it has more room, and the folded rail's foot
 * too. Above the grips of the lines it crosses; its own left border carries the trail's line down.
 */
export const UNDER_TRAIL = "relative z-30 -ml-11 border-l border-line";

/** Whether the trail is shown, so the bar reaches under it (without git there is none, see `Deck`) */
export const trailShown = (git: GitView) => !lacksGit(git);

/**
 * The branch of the project's repository, as text in the header of the file list, between its title
 * and the fold button (user, 2026-11-21: at the foot it went under). Tinted while there are
 * uncommitted changes; a click opens the git actions below it.
 */

export function BranchButton({ git, onRepoActions }: { git: GitView; onRepoActions: (repo: string, at: HTMLElement, above: boolean) => void }) {
  const root = git.rootRepo;
  if (!root) return null;
  return (
    <Tooltip className="flex min-w-0" content={<RepoTooltip repo={root} runs={git.runs} />}>
      <button
        type="button"
        data-git-actions
        aria-label={t("Git actions, branch {branch}", { branch: root.branch ?? t("detached") })}
        onClick={(e) => onRepoActions(root.path, e.currentTarget, false)}
        className={`${CLICKABLE.replace("shrink-0", "min-w-0")} text-[12px] ${root.error ? "text-problem" : root.files.length > 0 ? "text-changed" : "text-slate-200"}`}
      >
        {root.worktreeOf ? <GitFork className="size-3.5 shrink-0" /> : <GitBranch className="size-3.5 shrink-0" />}
        <span className="min-w-0 truncate">{root.branch ?? t("detached")}</span>
        <RepoCounts repo={root} />
      </button>
    </Tooltip>
  );
}

/**
 * Two numbers with a sign each, short enough for the header (user, 2026-11-21): a document for the
 * files with uncommitted changes, the least safe work, so in the colour of changes; the arrows for
 * commits not pushed (↑) or not pulled (↓), quiet. The repository's tooltip says it in words.
 */
export function RepoCounts({ repo, stacked = false }: { repo: RepoStatus; stacked?: boolean }) {
  const changed = repo.files.length;
  // Stacked in the folded rail only the numbers stand, one below the other, without signs; there
  // only the commits to push count, the ones to pull would be a third number nobody could tell apart
  // (user, 2026-11-21). In the header the arrows are icons: the text ↑ read like a 1
  const counts: [number, typeof ArrowUp][] = [
    [repo.ahead, ArrowUp],
    [stacked ? 0 : repo.behind, ArrowDown],
  ];
  if (!changed && !counts.some(([n]) => n > 0)) return null;
  return (
    <span className={`flex shrink-0 items-center ${stacked ? "flex-col gap-1 text-[11px] leading-none font-medium" : "gap-2 font-normal"}`}>
      {changed > 0 && (
        <span className="flex items-center gap-0.5 text-changed">
          {!stacked && <FilePen className="size-3.5" />}
          {changed}
        </span>
      )}
      {counts
        .filter(([n]) => n > 0)
        .map(([n, Icon], i) => (
          <span key={i} className="flex items-center text-slate-400">
            {!stacked && <Icon className="size-3.5" strokeWidth={2.5} />}
            {n}
          </span>
        ))}
    </span>
  );
}

export function GitStatusBar({ git, logOpen, onToggleLog, recent }: GitProps) {
  const root = git.rootRepo;
  const inFolders = git.repos.filter((r) => r.path);
  const withChanges = inFolders.filter((r) => r.files.length > 0).length;

  return (
    <footer className={`zone-bar @container flex h-7 shrink-0 items-center gap-3 overflow-x-clip border-t border-line bg-panel px-3 text-[12px] whitespace-nowrap text-slate-500 ${trailShown(git) ? UNDER_TRAIL : ""}`}>
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

/** The line under the session column's header, as high as the bars under the other headers (h-9): the state of the project's AI account, usage first.
 *  (It was the bar at the column's foot; user, 2026-11-19: up there instead of branch and time.) */
export function AssistantLine({ assistant }: { assistant: AssistantState }) {
  const look = useProjectLook(undefined);
  const mine = useProjectAccount(assistant, look);
  return (
    <section aria-label={t("AI usage")} className="flex h-9 shrink-0 items-center gap-3 overflow-x-clip border-b border-line px-3 text-[12px] whitespace-nowrap text-slate-500">
      <UsageChip assistant={assistant} account={mine.account?.dir} wide />
      <NotConnected mine={mine} />
    </section>
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
