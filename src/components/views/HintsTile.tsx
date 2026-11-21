import { useMemo, useState } from "react";
import { NewsTag, newsClass } from "../News";
import { hintKey, markSeen, useNews } from "../../news";
import { ClipboardCopy, ExternalLink, LocateFixed, Paperclip } from "lucide-react";
import { revealInTree } from "../../fileView";
import { openFile, type HarnessInfo, type Marker } from "../../backend";
import { useConnections } from "../../assistant";
import { Section, useFold, useShowAll } from "../blocks";
import { markerKey, markers as hints, markerTask, type Markers } from "../../markers";
import { useAttachEnabled } from "../../attachments";
import { T, t } from "../../i18n";
import { Tooltip, TooltipHint } from "../Tooltip";

/**
 * A tile of the Workbench (D23): the `@ai` comments left in files. Like the scratch folder they are
 * not part of the project for good; they go when the assistant has done what they ask. One writes
 * `@ai …` at the start of a line, or right after the comment sign that begins it, in an outside
 * editor. The paperclip attaches a hint to the next prompt, as in the file list: shown on hover,
 * staying lit once attached.
 */
export function HintsTile({ marks, harness }: { marks: Markers; harness: HarnessInfo }) {
  const news = useNews();
  const { markers, error, sent, done } = marks;
  const attached = hints.use();
  const enabled = useAttachEnabled();
  const { connected } = useConnections();
  const [copied, setCopied] = useState(false);
  const isAttached = (m: Marker) => attached.some((a) => markerKey(a) === markerKey(m));
  const all = useMemo(() => markers ?? [], [markers]);
  const allAttached = all.length > 0 && all.every(isAttached);
  const canAttach = enabled && connected;

  const byFile = useMemo(() => {
    const files = new Map<string, Marker[]>();
    for (const m of all) files.set(m.path, [...(files.get(m.path) ?? []), m]);
    return [...files];
  }, [all]);

  const fold = useFold("hints", true);
  const shown = useShowAll(byFile);
  const note = [
    all.length > 0 && t("{n} open", { n: all.length }),
    sent.length > 0 && t("{done} of {all} sent done", { done: done.size, all: sent.length }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Section
      fold={fold}
      title={t("Hints in your files")}
      help={
        <>
          <span>
            <T
              text="Write {ai} and what you want at the start of a line, in your own editor, or right after the comment sign that begins the line: {html}, {slash}, {hash}. Save, and it shows up here. {tool} removes the comment when it is done; that is how CodeDeck knows. Examples in Markdown code blocks do not count."
              ai={<Code>@ai</Code>}
              html={<Code>{"<!-- @ai …"}</Code>}
              slash={<Code>// @ai …</Code>}
              hash={<Code># @ai …</Code>}
              tool={harness.shortName}
            />
          </span>
          <TooltipHint>{t("The paperclip attaches a hint to your next prompt.")}</TooltipHint>
        </>
      }
      note={note || undefined}
      aside={
        <>
          {all.length > 0 && (
            <Tooltip content={<span>{copied ? t("Copied") : t("Copy as a task to paste into {tool}", { tool: harness.shortName })}</span>}>
              <button
                type="button"
                aria-label={t("Copy as a task")}
                onClick={async () => {
                  await navigator.clipboard.writeText(markerTask(all));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
                className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
              >
                <ClipboardCopy className={`size-3.5 ${copied ? "text-added" : ""}`} />
              </button>
            </Tooltip>
          )}
          {all.length > 1 && canAttach && (
            <button
              type="button"
              onClick={() => hints.toggle(all)}
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px] hover:bg-raised ${
                allAttached ? "border-brand/50 text-brand-soft" : "border-line text-slate-300 hover:text-slate-100"
              }`}
            >
              <Paperclip className="size-3.5" />
              {allAttached ? t("Remove all") : t("Attach all")}
            </button>
          )}
        </>
      }
    >
      {error && <p className="selectable text-problem">{error}</p>}
      {markers && all.length === 0 && (
        <p className="text-[12px]">
          <T text="None open. Write {ai} at the start of a line in any file of the project." ai={<Code>@ai</Code>} />
        </p>
      )}
      {!canAttach && all.length > 0 && (
        <p className="mb-1.5 text-[12px] text-changed">
          {enabled
            ? t("Needs {tool} connected (status bar) to attach them.", { tool: harness.name })
            : t("{tool} takes nothing with a prompt: copy them as a task instead.", { tool: harness.name })}
        </p>
      )}
      {byFile.length > 0 && (
        <ul className="divide-y divide-line/60 border-y border-line/60">
          {shown.items.map(([path, list]) => (
            <li key={path} className="group/file py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 truncate font-mono text-[12px] text-slate-300">{path}</span>
                <Tooltip content={<span>{t("Open in its editor")}</span>}>
                  <button
                    type="button"
                    aria-label={t("Edit {path}", { path })}
                    onClick={() => openFile(path, "edit")}
                    className="rounded p-0.5 text-slate-600 opacity-0 group-hover/file:opacity-100 hover:text-slate-100 focus-visible:opacity-100"
                  >
                    <ExternalLink className="size-3" />
                  </button>
                </Tooltip>
                <Tooltip content={<span>{t("Show in tree")}</span>}>
                  <button
                    type="button"
                    aria-label={t("Show in tree")}
                    onClick={() => revealInTree(path)}
                    className="rounded p-0.5 text-slate-600 opacity-0 group-hover/file:opacity-100 hover:text-slate-100 focus-visible:opacity-100"
                  >
                    <LocateFixed className="size-3" />
                  </button>
                </Tooltip>
              </div>
              <ul>
                {list.map((m) => {
                  const on = isAttached(m);
                  const item = { key: hintKey(m.path, m.text), time: 0 };
                  const fresh = news.of(item);
                  return (
                    <li
                      key={m.line}
                      onClickCapture={() => fresh && markSeen(item)}
                      // A be spex viewer opens at the hint's line; the editor gets the file
                      onDoubleClick={() => void openFile(m.path, "view", m.line)}
                      title={t("Double-click: view at this line")}
                      className={`group flex min-h-6 items-start gap-2 rounded px-1 py-0.5 hover:bg-raised/50 ${newsClass(fresh)}`}
                    >
                      <span className="w-7 shrink-0 pt-px text-right font-mono text-[11px] text-slate-500 tabular-nums">{m.line}</span>
                      <span className="selectable min-w-0 flex-1 text-slate-300">{m.text}</span>
                      <NewsTag news={fresh} />
                      {canAttach && (
                        <Tooltip content={<span>{on ? t("Attached to your next prompt; click to remove it") : t("Attach to next prompt")}</span>} className="flex shrink-0">
                          <button
                            type="button"
                            aria-pressed={on}
                            aria-label={on ? t("Remove from next prompt") : t("Attach hint in {path}, line {n}", { path, n: m.line })}
                            onClick={() => hints.toggle([m])}
                            className={`rounded p-0.5 hover:bg-raised ${
                              on ? "text-brand-soft" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-100 focus-visible:opacity-100"
                            }`}
                          >
                            <Paperclip className="size-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {shown.more}
    </Section>
  );
}

const Code = ({ children }: { children: string }) => <code className="font-mono whitespace-nowrap text-slate-300">{children}</code>;
