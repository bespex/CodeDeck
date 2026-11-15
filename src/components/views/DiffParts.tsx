// Pieces both ways of showing a change use: the commands an action runs, the actions on one
// uncommitted file, and a file's diff.

import { Fragment, useContext, useState } from "react";
import { MessageSquarePlus, Minus, Paperclip, Plus, Trash2, Undo2, X } from "lucide-react";
import type { FileStatus, RepoStatus } from "../../backend";
import { commandLine, type Steps } from "../../git";
import type { FileDiff } from "../../diff";
import { fileActions, useGitRun } from "../../history";
import { addNote, NoteSessionContext, notes as noteList, removeNote, type Note } from "../../notes";
import { useAttachEnabled } from "../../attachments";
import { useSessionMarks } from "../../assistant";
import { changeRef, changes, useChangeScope, type ChangeScope } from "../../changes";
import { Tooltip, TooltipHint } from "../Tooltip";
import { T, t } from "../../i18n";

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
    ? actions.unstage && { steps: actions.unstage, label: t("Unstage"), icon: Minus, says: t("Takes it out of the next commit; the change stays") }
    : actions.stage && { steps: actions.stage, label: t("Stage"), icon: Plus, says: t("Marks it for the next commit") };

  if (confirm && actions.discard) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[12px]">
        <span className="text-problem">{actions.discardMeans && t(actions.discardMeans)}. {t("Cannot be undone.")}</span>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            setConfirm(false);
            await run(actions.discard!);
          }}
          className="rounded-md border border-problem/60 px-2 py-0.5 text-problem hover:bg-problem/15"
        >
          {t("Discard")}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirm(false);
          }}
          className="rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised"
        >
          {t("Keep")}
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {failed && (
        <Tooltip content={<><span className="text-problem">{t("{command} failed", { command: failed.command })}</span><span className="font-mono text-[11px]">{failed.output}</span></>}>
          <span className="text-[11px] text-problem">{t("failed")}</span>
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
              <span>{actions.discardMeans && t(actions.discardMeans)}</span>
              <Commands steps={actions.discard} />
              <TooltipHint>{t("Asks before it runs: this cannot be undone")}</TooltipHint>
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
            aria-label={t("Discard changes to {path}", { path })}
            className="rounded-md p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-problem focus-visible:opacity-100"
          >
            {added && !from ? <Trash2 className="size-3.5" /> : <Undo2 className="size-3.5" />}
          </button>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * @param missing what to say when the patch has nothing for this file (it was cut off)
 * @param notePath the file's project-relative path: with it, lines can be commented for the next prompt
 */
export function DiffBody({ file, missing, notePath }: { file: FileDiff | undefined; missing?: string; notePath?: string }) {
  const notes = noteList.use();
  const offered = useAttachEnabled();
  if (!file) {
    return (
      <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">
        {missing ?? t("The diff is too long to show here.")}
      </p>
    );
  }
  if (file.binary) return <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">{t("Binary file")}</p>;
  if (file.hunks.length === 0) {
    return (
      <p className="border-t border-line px-3 py-2 text-[12px] text-slate-500">
        {file.status === "R" ? t("Same content, only its place changed") : t("No lines changed")}
      </p>
    );
  }
  return (
    <div className="selectable overflow-x-auto border-t border-line bg-base font-mono text-[12px] leading-[19px]">
      <table className="w-full border-collapse">
        <tbody>
          {file.hunks.map((hunk, h) => (
            <HunkRows key={h} hunk={hunk} notePath={offered ? notePath : undefined} notes={notePath ? notes.filter((n) => n.path === notePath) : []} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HunkRows({ hunk, notePath, notes }: { hunk: FileDiff["hunks"][number]; notePath?: string; notes: Note[] }) {
  /** The line (new side) a comment is being written for */
  const [draft, setDraft] = useState<number | null>(null);
  // Who the comment is preferably for: the session of the turn shown, else the one that wrote the file last
  const turnSession = useContext(NoteSessionContext);
  const { writer } = useSessionMarks();
  return (
    <>
      <tr className="bg-panel/60 text-slate-500">
        <td colSpan={3} className="px-3 py-0.5 text-[11px]">
          {hunk.context || "…"}
        </td>
      </tr>
      {hunk.lines.map((line, i) => {
        if (line.kind === "note") {
          return (
            <tr key={i}>
              <td colSpan={3} className="px-3 text-[11px] text-slate-500 italic">
                {line.text}
              </td>
            </tr>
          );
        }
        // Only lines that are in the file now can be pointed at
        const at = line.kind === "del" ? undefined : line.new;
        const said = at === undefined ? [] : notes.filter((n) => n.line === at);
        const canNote = notePath !== undefined && at !== undefined && draft !== at;
        return (
          <Fragment key={i}>
            <tr className={`group/line ${line.kind === "add" ? "bg-added/10" : line.kind === "del" ? "bg-problem/10" : ""}`}>
              <td className="w-10 pr-2 text-right text-slate-600 select-none">{line.old ?? ""}</td>
              <td className="relative w-10 pr-2 text-right text-slate-600 select-none">
                {line.new ?? ""}
                {canNote && (
                  <button
                    type="button"
                    aria-label={t("Comment line {n} for the next prompt", { n: at })}
                    title={t("Comment this line for the next prompt")}
                    onClick={() => setDraft(at!)}
                    className="absolute inset-y-0 right-0 hidden w-7 items-center justify-center rounded-sm bg-brand-fill text-white group-hover/line:flex hover:bg-brand-fill-hover focus-visible:flex"
                  >
                    <MessageSquarePlus className="size-3.5" />
                  </button>
                )}
              </td>
              <td className="pr-4 whitespace-pre text-slate-300">
                <span
                  className={`inline-block w-4 select-none ${line.kind === "add" ? "text-added" : line.kind === "del" ? "text-problem" : "text-slate-700"}`}
                >
                  {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                </span>
                {line.text}
              </td>
            </tr>
            {said.map((note) => (
              <tr key={`n${note.id}`}>
                <td colSpan={3} className="bg-[var(--color-area-you)] px-3 py-1.5 font-sans text-[12px] leading-[18px]">
                  <div className="flex max-w-3xl items-start gap-2 border-l-2 border-brand pl-2">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-slate-100">{note.text}</p>
                    <span className="shrink-0 text-[11px] text-brand-soft">{t("attached")}</span>
                    <button
                      type="button"
                      aria-label={t("Remove this comment")}
                      title={t("Remove this comment")}
                      onClick={() => removeNote(note.id)}
                      className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-raised hover:text-slate-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {notePath !== undefined && at !== undefined && draft === at && (
              <tr>
                <td colSpan={3} className="bg-[var(--color-area-you)] px-3 py-2 font-sans text-[12px]">
                  <NoteForm
                    onCancel={() => setDraft(null)}
                    onAdd={(text) => {
                      addNote(notePath, at, line.text, text, turnSession ?? writer(notePath));
                      setDraft(null);
                    }}
                  />
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** Writing a comment on one line; it goes out with the next prompt. */
function NoteForm({ onAdd, onCancel }: { onAdd: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  return (
    <div className="flex max-w-3xl flex-col gap-1.5">
      <textarea
        autoFocus
        value={text}
        rows={2}
        placeholder={t("What should change here?")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && e.ctrlKey && ready) {
            e.preventDefault();
            onAdd(text);
          }
        }}
        className="selectable block w-full resize-y rounded-md border border-line bg-base px-2 py-1 leading-[18px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-brand"
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">{t("Attached to your next prompt, with the file, the line and its text.")}</span>
        <button type="button" onClick={onCancel} className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised">
          {t("Cancel")}
        </button>
        <button
          type="button"
          aria-disabled={!ready}
          title={t("Ctrl+Enter")}
          onClick={() => ready && onAdd(text)}
          className="rounded-md bg-brand-fill px-2.5 py-0.5 font-medium text-white not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          {t("Attach to next prompt")}
        </button>
      </div>
    </div>
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

/**
 * "Looked at": a tick per file, kept with the change as it is shown.
 *
 * @param name what the file is called, for screen readers
 */
export function LookedAt({ checked, onChange, name }: { checked: boolean; onChange: () => void; name: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={t("Looked at {name}", { name })}
      title={t("Tick it when you have looked at it. The tick goes away when the file changes again.")}
      className="size-3.5 shrink-0 cursor-pointer accent-ai [color-scheme:dark]"
    />
  );
}

/**
 * Attaches the change shown (the scope around, or the one given) to the next prompt, or one file
 * of it: as the git command that shows it. Only where the tool takes attachments.
 */
export function AttachChange({ path, added, scope: given }: { path?: string; added?: boolean; scope?: ChangeScope }) {
  const around = useChangeScope();
  const attached = changes.use();
  const offered = useAttachEnabled();
  const scope = given ?? around;
  if (!scope || !offered) return null;
  const ref = changeRef(scope, path, added);
  const on = attached.some((c) => c.id === ref.id);
  const what = path ? t("this file's change") : t("this change");
  return (
    <Tooltip
      content={
        <>
          <span>{on ? t("Attached to your next prompt; click to remove it") : t("Attach {what} to your next prompt", { what })}</span>
          <TooltipHint>
            {ref.command ? (
              <>
                <T text="As the command that shows it, not the diff itself: {command}" command={<code className="font-mono">{ref.command}</code>} />
              </>
            ) : (
              t("A new file: attached as its path, to be read")
            )}
          </TooltipHint>
        </>
      }
      className="flex shrink-0"
    >
      <button
        type="button"
        aria-label={on ? t("Remove {what} from the next prompt", { what }) : t("Attach {what} to the next prompt", { what })}
        aria-pressed={on}
        onClick={() => changes.toggle([ref])}
        className={
          path
            ? `rounded-md p-1 hover:bg-raised ${on ? "text-brand-soft" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-100 focus-visible:opacity-100"}`
            : `flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] ${on ? "border-brand/50 text-brand-soft" : "border-line text-slate-300 hover:bg-raised hover:text-slate-100"}`
        }
      >
        <Paperclip className="size-3.5" />
        {!path && (on ? t("Attached") : t("Attach"))}
      </button>
    </Tooltip>
  );
}

/** Who changed a file last: a session, or nobody CodeDeck heard of, so the user. */
export function You() {
  return (
    <span
      title={t("No session reported changing it since the last commit")}
      className="shrink-0 rounded-full border border-line px-1.5 text-[10px] leading-4 text-slate-400"
    >
      {t("You")}
    </span>
  );
}
