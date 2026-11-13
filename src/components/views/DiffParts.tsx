// Pieces both ways of showing a change use: the commands an action runs, the actions on one
// uncommitted file, and a file's diff.

import { useState } from "react";
import { Minus, Plus, Trash2, Undo2 } from "lucide-react";
import type { FileStatus, RepoStatus } from "../../backend";
import { commandLine, type Steps } from "../../git";
import type { FileDiff } from "../../diff";
import { fileActions, useGitRun } from "../../history";
import { Tooltip, TooltipHint } from "../Tooltip";

export function Commands({ steps }: { steps: Steps }) {
  return (
    <span className="mt-1 flex flex-col font-mono text-[11px] text-slate-400">
      {steps.map((args, i) => (
        <span key={i}>$ {commandLine(args)}</span>
      ))}
    </span>
  );
}

/** An uncommitted file in its repository, with what Git's status says about it. */
export interface Working {
  repo: RepoStatus;
  status: FileStatus | undefined;
  onDone: () => void;
}

/** Files inside an untracked folder have no status line of their own; they are new as well. */
export function inUntrackedDir(repo: RepoStatus, path: string): FileStatus | undefined {
  const dir = repo.files.find((f) => f.dir && (f.path === "" || path.startsWith(`${f.path}/`)));
  return dir && { path, state: "?", staged: false, dir: false };
}

/**
 * Stage or unstage, and discard with a confirmation in place. Each shows its command on hover.
 * They appear while the mouse is on the row (a parent with the `group` class).
 *
 * @param path repository-relative
 * @param from repository-relative old path of a rename
 */
export function FileButtons({ path, from, added, working }: { path: string; from?: string; added: boolean; working: Working }) {
  const { repo, status } = working;
  const actions = fileActions(repo, status, path, from);
  const { run, running, done } = useGitRun(repo.path, working.onDone);
  const [confirm, setConfirm] = useState(false);
  const failed = done.find((d) => !d.ok);
  const toggle = status?.staged
    ? actions.unstage && { steps: actions.unstage, label: "Unstage", icon: Minus, says: "Takes it out of the next commit; the change stays" }
    : actions.stage && { steps: actions.stage, label: "Stage", icon: Plus, says: "Marks it for the next commit" };

  if (confirm && actions.discard) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12px]">
        <span className="text-problem">{actions.discardMeans}. Cannot be undone.</span>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            setConfirm(false);
            await run(actions.discard!);
          }}
          className="rounded-md border border-problem/60 px-2 py-0.5 text-problem hover:bg-problem/15"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm(false);
          }}
          className="rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {failed && (
        <Tooltip content={<><span className="text-problem">{failed.command} failed</span><span className="font-mono text-[11px]">{failed.output}</span></>}>
          <span className="text-[11px] text-problem">failed</span>
        </Tooltip>
      )}
      {toggle && (
        <Tooltip content={<><span>{toggle.says}</span><Commands steps={toggle.steps} /></>}>
          <button
            type="button"
            disabled={running}
            onClick={(e) => {
              e.stopPropagation();
              run(toggle.steps);
            }}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-slate-100 focus-visible:opacity-100"
          >
            <toggle.icon className="size-3.5" />
            {toggle.label}
          </button>
        </Tooltip>
      )}
      {actions.discard && (
        <Tooltip
          content={
            <>
              <span>{actions.discardMeans}</span>
              <Commands steps={actions.discard} />
              <TooltipHint>Asks before it runs: this cannot be undone</TooltipHint>
            </>
          }
        >
          <button
            type="button"
            disabled={running}
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(true);
            }}
            aria-label={`Discard changes to ${path}`}
            className="rounded-md p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-problem focus-visible:opacity-100"
          >
            {added && !from ? <Trash2 className="size-3.5" /> : <Undo2 className="size-3.5" />}
          </button>
        </Tooltip>
      )}
    </span>
  );
}

/** @param missing what to say when the patch has nothing for this file (it was cut off) */
export function DiffBody({ file, missing }: { file: FileDiff | undefined; missing?: string }) {
  if (!file) {
    return (
      <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">
        {missing ?? "The diff is too long to show here."}
      </p>
    );
  }
  if (file.binary) return <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">Binary file</p>;
  if (file.hunks.length === 0) {
    return (
      <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">
        {file.status === "R" ? "Same content, only its place changed" : "No lines changed"}
      </p>
    );
  }
  return (
    <div className="selectable overflow-x-auto border-t border-line bg-base font-mono text-[12px] leading-[19px]">
      <table className="w-full border-collapse">
        <tbody>
          {file.hunks.map((hunk, h) => (
            <HunkRows key={h} hunk={hunk} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HunkRows({ hunk }: { hunk: FileDiff["hunks"][number] }) {
  return (
    <>
      <tr className="bg-panel/60 text-slate-500">
        <td colSpan={3} className="px-3 py-0.5 text-[11px]">
          {hunk.context || "…"}
        </td>
      </tr>
      {hunk.lines.map((line, i) =>
        line.kind === "note" ? (
          <tr key={i}>
            <td colSpan={3} className="px-3 text-[11px] text-slate-500 italic">
              {line.text}
            </td>
          </tr>
        ) : (
          <tr
            key={i}
            className={line.kind === "add" ? "bg-added/10" : line.kind === "del" ? "bg-problem/10" : ""}
          >
            <td className="w-10 pr-2 text-right text-slate-600 select-none">{line.old ?? ""}</td>
            <td className="w-10 pr-2 text-right text-slate-600 select-none">{line.new ?? ""}</td>
            <td className="pr-4 whitespace-pre text-slate-300">
              <span
                className={`inline-block w-4 select-none ${line.kind === "add" ? "text-added" : line.kind === "del" ? "text-problem" : "text-slate-700"}`}
              >
                {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
              </span>
              {line.text}
            </td>
          </tr>
        ),
      )}
    </>
  );
}

/** `+12 −3`, nothing for zero; binary files have no lines. */
export function LineCounts({ added, removed }: { added: number | null; removed: number | null }) {
  return (
    <span className="shrink-0 font-mono text-[11px]">
      {added ? <span className="text-added">+{added} </span> : null}
      {removed ? <span className="text-problem">−{removed}</span> : null}
    </span>
  );
}
