import { useState } from "react";
import { GitBranch } from "lucide-react";
import { gitInit } from "../backend";
import type { GitView } from "../git";
import { t } from "../i18n";
import { Tooltip, TooltipHint } from "./Tooltip";

/** Whether the project has no repository at all, as far as is known yet. */
export const lacksGit = (git: GitView) => git.loaded && git.repos.length === 0;

/**
 * "git init" for a project without a repository. It changes the project, so it is a button the
 * user presses, never something CodeDeck does by itself; the command is in the git log like any other.
 */
export function GitInitButton({ git, className }: { git: GitView; className: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await gitInit();
      if (!done.ok) setError(done.output);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      git.refresh();
    }
  };
  return (
    <Tooltip
      className="flex shrink-0"
      content={
        <>
          <span>{t("Make this folder a git repository")}</span>
          <span className="text-slate-500">{t("Without one there are no snapshots to go back to")}</span>
          {error && <span className="text-problem">{error}</span>}
          <TooltipHint>{t("Runs git init -b main")}</TooltipHint>
        </>
      }
    >
      <button type="button" disabled={busy} onClick={() => void run()} className={className}>
        <GitBranch className="size-3.5" />
        git init
      </button>
    </Tooltip>
  );
}

/** Why a repository matters, in the words the bell and the empty Changes view both use. */
export function WhyGit({ tool }: { tool: string }) {
  return (
    <>
      <span>{t("With a local repository (no server, no account) CodeDeck can keep a snapshot before {tool} writes, show what changed in each turn and go back to any earlier state.", { tool })}</span>
      <span className="text-slate-400">{t("Without one, none of that is possible: the trail, the changes per turn and Go back stay empty.")}</span>
    </>
  );
}

/**
 * The empty Changes view of a project without a repository. Every project opens in Changes, so this
 * is where a new folder is first seen, and where git init is offered first (user, 2026-11-21: nobody
 * looks for it behind the bell).
 */
export function NoRepository({ git, tool }: { git: GitView; tool: string }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="flex max-w-md flex-col gap-2.5 rounded-lg border border-dashed border-line px-4 py-3.5 text-[13px] text-slate-200">
        <span className="flex items-center gap-2 font-semibold text-slate-100">
          <GitBranch className="size-4 text-brand-soft" />
          {t("This folder has no git repository")}
        </span>
        <WhyGit tool={tool} />
        <GitInitButton git={git} className="flex items-center gap-1.5 self-start rounded-md bg-brand-fill px-2.5 py-1 font-medium text-on-accent hover:bg-brand-fill-hover" />
      </div>
    </div>
  );
}
