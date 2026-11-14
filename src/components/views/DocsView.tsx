import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Eye, ExternalLink, FileText, MessageSquareText, Send, Sparkles, X } from "lucide-react";
import { handOver, openFile, type AssistantState, type Marker } from "../../backend";
import { touchedFiles, useHooks } from "../../assistant";
import { markerKey, type Markers } from "../../markers";
import { LOCALE } from "../Trail";
import { plural } from "../../git";
import { Tooltip } from "../Tooltip";

/**
 * Documents with comments for the assistant. One writes `<!-- @ai: … -->` (or `[!AI: …]`) in
 * an outside editor; here they are collected and handed to Claude as one task: copied, or given
 * along with the next prompt in this project.
 */
export function DocsView({ assistant, marks }: { assistant: AssistantState; marks: Markers }) {
  const { markers, error, handed, done, markHanded } = marks;
  const [copied, setCopied] = useState<string | null>(null);
  const { connected } = useHooks();
  const written = recentDocs(assistant);
  const waiting = assistant.handovers.find((h) => h.key === MARKERS_KEY);

  const byFile = useMemo(() => {
    const files = new Map<string, Marker[]>();
    for (const m of markers ?? []) files.set(m.path, [...(files.get(m.path) ?? []), m]);
    return [...files];
  }, [markers]);

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-2 border-b border-line bg-base px-4 text-[12px] text-slate-400">
        <MessageSquareText className="size-3.5" />
        Comments for the assistant
        {markers && markers.length > 0 && (
          <div className="ml-auto flex gap-1.5">
            <TaskButtons
              markers={markers}
              connected={connected}
              copied={copied === "all"}
              onCopy={(t) => copy(t, "all")}
              onHanded={markHanded}
            />
          </div>
        )}
      </div>

      {waiting && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-ai/40 bg-ai/10 px-3 py-2 text-slate-300">
          <Send className="size-3.5 shrink-0 text-ai" />
          <span className="flex-1">
            Waiting for the next prompt in this project: <b className="font-semibold">{waiting.label}</b>
          </span>
          <button
            type="button"
            onClick={() => handOver(MARKERS_KEY, null)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-slate-400 hover:bg-raised hover:text-slate-100"
          >
            <X className="size-3.5" /> Take back
          </button>
        </div>
      )}

      {handed.length > 0 && (
        <HandedProgress handed={handed} done={done} waiting={!!waiting} />
      )}

      {error && <p className="selectable p-4 text-problem">{error}</p>}
      {markers && markers.length === 0 && (
        <div className="grid flex-1 place-items-center p-8">
          <div className="max-w-sm text-center text-slate-500">
            <p>No comments for the assistant in this project.</p>
            <p className="mt-2">
              Write <code className="font-mono text-slate-300">{"<!-- @ai: … -->"}</code> into a Markdown or HTML file, or{" "}
              <code className="font-mono text-slate-300">[!AI: …]</code> into any text, and save: it shows up here.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {byFile.map(([path, list]) => (
          <section key={path} className="rounded-lg border border-line bg-panel">
            <header className="flex items-center gap-2 border-b border-line px-3 py-1.5">
              <FileText className="size-3.5 text-slate-400" />
              <span className="font-mono text-[12px] text-slate-200">{path}</span>
              <span className="text-[11px] text-slate-500">{plural(list.length, "comment")}</span>
              <div className="ml-auto flex gap-1">
                <Tooltip content={<span>Open in its editor</span>}>
                  <button
                    type="button"
                    aria-label={`Edit ${path}`}
                    onClick={() => openFile(path, "edit")}
                    className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                </Tooltip>
                <TaskButtons
                  markers={list}
                  connected={connected}
                  small
                  copied={copied === path}
                  onCopy={(t) => copy(t, path)}
                  onHanded={markHanded}
                />
              </div>
            </header>
            <ul className="px-3 py-1.5">
              {list.map((m) => (
                <li key={m.line} className="flex gap-3 py-0.5">
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-500 tabular-nums">{m.line}</span>
                  <span className="selectable text-slate-300">{m.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {written.length > 0 && <RecentDocs docs={written} />}
    </div>
  );
}

/** Documents the assistant wrote: the results of its work, to read first. */
const DOC_TYPES = /\.(md|markdown|html?|txt|adoc|rst)$/i;
/** How far back "recently" goes. */
const RECENT_DOCS_MS = 24 * 3600_000;

function recentDocs(state: AssistantState): [string, number][] {
  const since = Date.now() - RECENT_DOCS_MS;
  return [...touchedFiles(state)].filter(([path, at]) => DOC_TYPES.test(path) && at > since).sort((a, b) => b[1] - a[1]);
}

function RecentDocs({ docs }: { docs: [string, number][] }) {
  return (
    <section className="mx-4 mb-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-400">
        <Sparkles className="size-3.5 text-ai" /> Recently written by the assistant
      </h3>
      <ul className="rounded-lg border border-line bg-panel py-1">
        {docs.map(([path, at]) => (
          <li key={path} className="group flex items-center gap-2 px-3 py-1 hover:bg-raised">
            <FileText className="size-3.5 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{path}</span>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}
            </span>
            <Tooltip content={<span>View</span>}>
              <button
                type="button"
                aria-label={`View ${path}`}
                onClick={() => openFile(path, "view")}
                className="rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100"
              >
                <Eye className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={<span>Edit, e.g. to add comments for the assistant</span>}>
              <button
                type="button"
                aria-label={`Edit ${path}`}
                onClick={() => openFile(path, "edit")}
                className="rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100"
              >
                <ExternalLink className="size-3.5" />
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What became of the comments handed over: a comment that is gone counts as done. */
function HandedProgress({ handed, done, waiting }: { handed: Marker[]; done: Set<string>; waiting: boolean }) {
  const [open, setOpen] = useState(false);
  const all = done.size === handed.length;
  return (
    <div className="mx-4 mt-3 rounded-lg border border-line bg-panel px-3 py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <Check className={`size-3.5 ${all ? "text-added" : "text-slate-500"}`} />
        <span className="flex-1 text-slate-300">
          Handed to Claude: {done.size} of {handed.length} done
          {waiting ? " · not picked up yet" : ""}
        </span>
        <span className="text-[11px] text-slate-500">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-5">
          {handed.map((m) => {
            const ok = done.has(markerKey(m));
            return (
              <li key={markerKey(m)} className={ok ? "text-slate-500 line-through" : "text-slate-300"}>
                <span className="font-mono text-[11px] text-slate-500">{m.path}</span> {m.text}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The part of the hand-over that comments make. */
const MARKERS_KEY = "markers";

/** The task for Claude, as one would write it. */
export function markerTask(markers: Marker[]): string {
  const lines = markers.map((m) => `- ${m.path}:${m.line}: ${m.text}`);
  return [
    "Work in these comments that I left for you in documents of this project (`<!-- @ai: … -->` or `[!AI: …]`).",
    "Change the text around each one as it asks, then remove the comment. Leave a comment in place if you are unsure, and tell me why.",
    "",
    ...lines,
  ].join("\n");
}

function TaskButtons(props: {
  markers: Marker[];
  connected: boolean;
  small?: boolean;
  copied: boolean;
  onCopy: (text: string) => void;
  onHanded: (markers: Marker[]) => void;
}) {
  const task = markerTask(props.markers);
  const files = new Set(props.markers.map((m) => m.path)).size;
  const label = `${plural(props.markers.length, "comment")}${files > 1 ? ` in ${files} files` : ` in ${props.markers[0]?.path}`}`;
  const base = props.small
    ? "rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
    : "flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100";
  return (
    <>
      <Tooltip content={<span>{props.copied ? "Copied" : "Copy as a task to paste into Claude"}</span>}>
        <button type="button" aria-label="Copy as a task" onClick={() => props.onCopy(task)} className={base}>
          <ClipboardCopy className={`size-3.5 ${props.copied ? "text-added" : ""}`} />
          {!props.small && (props.copied ? "Copied" : "Copy task")}
        </button>
      </Tooltip>
      <Tooltip
        content={
          <>
            <span>Give to Claude with the next prompt you send in this project</span>
            {!props.connected && <span className="text-slate-400">Needs Claude Code connected (status bar)</span>}
          </>
        }
      >
        <button
          type="button"
          aria-label="Hand to Claude"
          disabled={!props.connected}
          onClick={() => handOver(MARKERS_KEY, task, label).then(() => props.onHanded(props.markers))}
          className={`${base} disabled:opacity-40`}
        >
          <Send className="size-3.5" />
          {!props.small && "Hand to Claude"}
        </button>
      </Tooltip>
    </>
  );
}
