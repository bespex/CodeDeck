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
