import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, FileText, FolderOpen, GripVertical, Trash2 } from "lucide-react";
import { onFsChanged, openFile, showInFileManager, workbenchList, workbenchTrash, type WorkFile } from "../../backend";
import { shortId, useSessionMarks } from "../../assistant";
import { Rows, Section } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { Tooltip } from "../Tooltip";
import { plural } from "../../git";
import { inWorkbench, useLastMove, WORKBENCH_DIR, WORKBENCH_DRAG } from "../../workbench";
import { LOCALE } from "../Trail";

/** Older than this, a file is offered for clearing away. Fixed for now, a setting later. */
const OLD_DAYS = 7;
const DAY = 24 * 3600_000;

/**
 * What else came up that is not part of the project yet? The workbench: one folder in the project
 * for drafts, mock-ups, throwaway scripts and test data, which sessions are told to use. Git ignores
 * it. A file becomes part of the project by dragging it onto a folder of the file list; what is no
 * longer needed goes to the trash. Pages published elsewhere and files left outside follow (2.2).
 */
export function WorkbenchView() {
  const [files, setFiles] = useState<WorkFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState<string | null>(null);
  const moved = useLastMove();
  const marks = useSessionMarks();

  const load = useCallback(() => {
    workbenchList()
      .then((f) => (setFiles(f), setError(null)))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    // Anything in or around the workbench: read it again (a move out of it lands elsewhere)
    const stop = onFsChanged((change) => {
      if (![...change.dirs, ...change.paths].some((p) => inWorkbench(p) || p === "")) return;
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [load]);
  // A move is told by whoever did it; the list follows
  useEffect(load, [moved, load]);

  const now = Date.now();
  const old = (files ?? []).filter((f) => now - f.modified > OLD_DAYS * DAY);
  const total = (files ?? []).reduce((n, f) => n + f.size, 0);

  const trash = async (paths: string[], what: string) => {
    try {
      await workbenchTrash(paths);
      setCleared(`${what} moved to the trash`);
    } catch (e) {
      setCleared(null);
      setError(String(e));
    }
    load();
  };

  return (
    <div className="flex min-h-full flex-col">
      <Section
        title={`${WORKBENCH_DIR}/`}
        note={files && files.length > 0 ? `${plural(files.length, "file")} · ${size(total)}` : undefined}
        aside={
          <>
            {old.length > 0 && (
              <Tooltip content={<span>Into the trash, where they can still be brought back</span>}>
                <button
                  type="button"
                  onClick={() => trash(old.map((f) => f.path), plural(old.length, "file"))}
                  className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100"
                >
                  <Trash2 className="size-3.5" />
                  Delete {old.length} older than {OLD_DAYS} days ({size(old.reduce((n, f) => n + f.size, 0))})
                </button>
              </Tooltip>
            )}
            {files && files.length > 0 && (
              <Tooltip content={<span>Open the folder in the file manager</span>}>
                <button
                  type="button"
                  aria-label="Open the folder"
                  onClick={() => showInFileManager(WORKBENCH_DIR)}
                  className="rounded-md p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
                >
                  <FolderOpen className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </>
        }
      >
        <p className="mb-2 max-w-prose text-[12px]">
          One folder in the project for drafts, mock-ups, throwaway scripts and test data. Sessions are told to put such
          things here. Git ignores it, so nothing here is committed by accident. To make a file part of the project, drag it
          onto a folder in the file list.
        </p>
        {moved && (
          <p className={`mb-2 flex items-center gap-1.5 text-[12px] ${moved.error ? "text-problem" : "text-slate-300"}`}>
            {moved.error ? (
              <span className="selectable">{moved.error}</span>
            ) : (
              <>
                <Check className="size-3.5 text-added" /> Moved into the project: <code className="font-mono">{moved.to}</code>
              </>
            )}
          </p>
        )}
        {cleared && (
          <p className="mb-2 flex items-center gap-1.5 text-[12px] text-slate-300">
            <Check className="size-3.5 text-added" /> {cleared}
          </p>
        )}
        {error && <p className="selectable mb-2 text-problem">{error}</p>}
        {files && files.length === 0 && <p>The workbench is empty.</p>}
        {files && files.length > 0 && (
          <Rows>
            {files.map((f) => {
              const writer = marks.writer(f.path);
              const mark = marks.of(writer);
              const isOld = now - f.modified > OLD_DAYS * DAY;
              const name = f.path.slice(WORKBENCH_DIR.length + 1);
              return (
                <li
                  key={f.path}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(WORKBENCH_DRAG, f.path);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="group flex min-h-9 cursor-grab items-center gap-2 px-1 py-1 active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
                  <FileText className="size-3.5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[12px] text-slate-200">{name}</div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${isOld ? "text-changed" : "text-slate-500"}`}>
                      <span>{age(f.modified, now)}</span>
                      {writer && (
                        <>
                          <span>·</span>
                          {mark && <SessionBadge mark={mark} />}
                          <span className="truncate text-slate-400">{mark?.title ?? `session ${shortId(writer)}`}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{size(f.size)}</span>
                  <div className="flex shrink-0 gap-0.5">
                    <Tooltip content={<span>Open it in its viewer</span>}>
                      <button
                        type="button"
                        aria-label={`Open ${name}`}
                        onClick={() => openFile(f.path, "view")}
                        className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
                      >
                        <ExternalLink className="size-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content={<span>Into the trash, where it can still be brought back</span>}>
                      <button
                        type="button"
                        aria-label={`Delete ${name}`}
                        onClick={() => trash([f.path], name)}
                        className="rounded p-1 text-slate-500 hover:bg-raised hover:text-problem"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </Rows>
        )}
      </Section>
    </div>
  );
}

/** A size as people read it. */
function size(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** How long ago, in the words of the dummy: today with the time, else days. */
function age(at: number, now: number): string {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  if (at >= midnight) return `today ${new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.ceil((midnight - at) / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
