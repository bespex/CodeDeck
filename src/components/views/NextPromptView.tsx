import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, FileText, Paperclip, X } from "lucide-react";
import { openFile, startRules, type AssistantState, type HarnessInfo, type Marker } from "../../backend";
import { mainHarness, shortId, useConnections, useSessionMarks } from "../../assistant";
import { Document, Row, Rows, Section, Toolbar } from "../blocks";
import { markerKey, markers as hints, markerTask, type Markers } from "../../markers";
import { notes as noteList } from "../../notes";
import { attachmentCount, removeAttachment, useAttachEnabled } from "../../attachments";
import { changes as changeList } from "../../changes";
import { plural } from "../../git";
import { Tooltip } from "../Tooltip";
import { SessionBadge } from "../SessionBadge";
import { AttachTarget, TargetLost } from "../AttachTarget";
import { LOCALE } from "../Trail";

const time = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

/**
 * What do you attach to your next prompt? (D20) You write the prompt in the tool; CodeDeck attaches
 * what is listed here: the attachments with the exact text they add, what else can be attached,
 * the `@ai` hints left in files, and apart from that the fixed rules every session gets at its
 * start. Nothing reaches a session that is not shown here.
 */
export function NextPromptView(props: {
  assistant: AssistantState;
  marks: Markers;
  /** Files and folders attached */
  pinned: number;
  onChanges: () => void;
}) {
  const { assistant, marks } = props;
  const harness = mainHarness(assistant);
  const queued = assistant.attachments;
  const notes = noteList.use();
  const changes = changeList.use();

  return (
    <div className="flex min-h-full flex-col">
      <Toolbar>
        <span className="truncate">You write the prompt in {harness.shortName}. CodeDeck attaches this</span>
        {queued.length > 0 && (
          <>
            <span>for</span>
            <AttachTarget state={assistant} className="max-w-72" />
            <TargetLost state={assistant} />
          </>
        )}
      </Toolbar>

      <Queue assistant={assistant} who={harness.shortName} count={attachmentCount(assistant, props.pinned)} />

      <Section title="What you can attach">
        <Rows>
          <Row>
            <span className="w-40 shrink-0 text-slate-200">Files and folders</span>
            <span className="min-w-0 flex-1 truncate">
              {props.pinned
                ? `${plural(props.pinned, "item")} attached`
                : "Click the paperclip of a file in the list on the left, or drag it onto Next prompt."}
            </span>
          </Row>
          <Row>
            <span className="w-40 shrink-0 text-slate-200">Changes</span>
            <span className="min-w-0 flex-1 truncate">
              {changes.length
                ? `${plural(changes.length, "change")} attached`
                : "The paperclip on a turn, commit, snapshot or comparison in Changes, or on one of its files."}
            </span>
            <button type="button" onClick={props.onChanges} className={SMALL}>
              Go to Changes
            </button>
          </Row>
          <Row>
            <span className="w-40 shrink-0 text-slate-200">Lines you commented</span>
            <span className="min-w-0 flex-1 truncate">
              {notes.length ? `${plural(notes.length, "comment")} attached` : "Comment a line of a diff in Changes and it is attached."}
            </span>
          </Row>
          <Row>
            <span className="w-40 shrink-0 text-slate-200">Hints in documents</span>
            <span className="min-w-0 flex-1 truncate">
              {marks.markers?.length ? `${marks.markers.length} open, attach them below` : "None open."}
            </span>
          </Row>
        </Rows>
      </Section>

      <Hints marks={marks} harness={harness} />
      <StartRules assistant={assistant} harness={harness} />
    </div>
  );
}

const SMALL =
  "flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100 disabled:opacity-40";

/** What is attached, part by part, and the exact text it makes; the receipt once a session took it. */
function Queue({ assistant, who, count }: { assistant: AssistantState; who: string; count: number }) {
  const marks = useSessionMarks();
  const queued = assistant.attachments;
  const { delivered } = assistant;
  return (
    <Section title="Attached" note={count ? plural(count, "attachment") : undefined}>
      {queued.length === 0 && delivered && (
        <p className="mb-1 flex items-center gap-1.5 text-slate-300">
          <Check className="size-3.5 shrink-0 text-added" />
          Sent at {time(delivered.at)} to
          {marks.of(delivered.session) && <SessionBadge mark={marks.of(delivered.session)!} />}
          {marks.of(delivered.session)?.title ?? `session ${shortId(delivered.session)}`}
          <span className="text-slate-500">: {delivered.labels.filter(Boolean).join(", ") || "the attachments"}</span>
        </p>
      )}
      {queued.length === 0 && <p>Nothing attached. {who} only gets what you write, and what is listed here.</p>}
      {queued.length > 0 && (
        <>
          <Rows>
            {queued.map((h) => (
              <Row key={h.key}>
                <Paperclip className="size-3.5 shrink-0 text-ai" />
                <span className="min-w-0 flex-1 truncate text-slate-200">{h.label || h.key}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(h.key)}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
                >
                  <X className="size-3.5" /> Remove
                </button>
              </Row>
            ))}
          </Rows>
          <p className="mt-3 mb-1.5 text-[12px]">Exactly this text is added to your prompt, below what you write:</p>
          <Document className="max-w-3xl">
            <pre className="selectable max-h-96 overflow-auto p-3 font-mono text-[12px] whitespace-pre-wrap text-slate-300">{assistant.preview}</pre>
          </Document>
        </>
      )}
    </Section>
  );
}

/**
 * The comments left in documents: one writes `@ai …` at the start of a line, or right after the
 * comment sign that begins it, in an outside editor; here they are collected and handed over as
 * one task, copied or attached to the next prompt.
 */
function Hints({ marks, harness }: { marks: Markers; harness: HarnessInfo }) {
  const { markers, error, sent, done } = marks;
  // Attached and not sent yet: marked where they are listed
  const attached = hints.use();
  const isAttached = (m: Marker) => attached.some((a) => markerKey(a) === markerKey(m));
  const [copied, setCopied] = useState<string | null>(null);
  const { connected } = useConnections();

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
    <>
      <Section
        title="Hints you left in documents"
        note={markers && markers.length > 0 ? `${markers.length} open` : undefined}
        aside={
          markers &&
          markers.length > 0 && (
            <TaskButtons markers={markers} harness={harness} connected={connected} copied={copied === "all"} onCopy={(t) => copy(t, "all")} />
          )
        }
      >
        <p className="mb-2 max-w-prose text-[12px]">
          Write <Code>@ai</Code> and what you want at the start of a line, in your own editor, or right after the comment sign
          that begins the line: <Code>{"<!-- @ai …"}</Code>, <Code>// @ai …</Code>, <Code># @ai …</Code>. Save, and it shows up
          here. {harness.shortName} removes the comment when it is done; that is how CodeDeck knows. Examples in Markdown code
          blocks do not count.
        </p>
        {error && <p className="selectable text-problem">{error}</p>}
        {markers && markers.length === 0 && <p>None in this project.</p>}
        {byFile.length > 0 && (
          <Rows>
            {byFile.map(([path, list]) => (
              <Row key={path} className="flex-wrap">
                <FileText className="size-3.5 shrink-0 text-slate-400" />
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
                  <TaskButtons markers={list} harness={harness} connected={connected} small copied={copied === path} onCopy={(t) => copy(t, path)} />
                </div>
                <ul className="w-full pb-0.5">
                  {list.map((m) => (
                    <li key={m.line} className="flex gap-3 py-0.5">
                      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-500 tabular-nums">{m.line}</span>
                      <span className="selectable text-slate-300">{m.text}</span>
                      {isAttached(m) && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-brand-soft">
                          <Paperclip className="size-3" /> attached
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Row>
            ))}
          </Rows>
        )}
        {sent.length > 0 && <SentProgress sent={sent} done={done} to={harness.shortName} />}
      </Section>
    </>
  );
}

const Code = ({ children }: { children: string }) => <code className="font-mono whitespace-nowrap text-slate-300">{children}</code>;

/** The fixed text every new session gets at its start, word for word, and who got it last. */
function StartRules({ assistant, harness }: { assistant: AssistantState; harness: HarnessInfo }) {
  const [rules, setRules] = useState<string | null>(null);
  const marks = useSessionMarks();
  useEffect(() => {
    startRules().then(setRules, () => setRules(null));
  }, []);
  const ruled = assistant.ruled;
  return (
    <Section title="Every session gets this when it starts">
      <p className="mb-2 max-w-prose text-[12px]">
        Not an attachment: short rules, fixed and always on. A session gets them once when it starts while this project is
        open in CodeDeck, and again after its context was cleared or compacted. Nothing else is added without you.
      </p>
      {!harness.capabilities.startRules && (
        <p className="mb-2 text-[12px] text-changed">{harness.name} cannot take text when a session starts, so these rules do not reach it.</p>
      )}
      <Document className="max-w-3xl">
        <pre className="selectable p-3 font-mono text-[12px] whitespace-pre-wrap text-slate-300">{rules ?? "…"}</pre>
      </Document>
      {ruled && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px]">
          Last given at {time(ruled.at)} to
          {marks.of(ruled.session) && <SessionBadge mark={marks.of(ruled.session)!} />}
          {marks.of(ruled.session)?.title ?? `session ${shortId(ruled.session)}`}
        </p>
      )}
    </Section>
  );
}

/** What became of the hints sent: a hint that is gone from its file counts as done. */
function SentProgress({ sent, done, to }: { sent: Marker[]; done: Set<string>; to: string }) {
  const [open, setOpen] = useState(false);
  const all = done.size === sent.length;
  return (
    <div className="mt-2 border-y border-line/70 px-1 py-1.5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left">
        <Check className={`size-3.5 ${all ? "text-added" : "text-slate-500"}`} />
        <span className="flex-1 text-slate-300">
          Hints sent to {to}: {done.size} of {sent.length} done
        </span>
        <span className="text-[11px] text-slate-500">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-5">
          {sent.map((m) => {
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

function TaskButtons(props: {
  markers: Marker[];
  /** The tool the task goes to: its name, and whether it can take it with a prompt */
  harness: HarnessInfo;
  connected: boolean;
  small?: boolean;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const task = markerTask(props.markers);
  const { shortName, name } = props.harness;
  const enabled = useAttachEnabled();
  // Attaching adds to what is attached; when all of these are attached, the same button removes them
  hints.use();
  const all = props.markers.every((m) => hints.has(markerKey(m)));
  const base = props.small
    ? "rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
    : "flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100";
  return (
    <>
      <Tooltip content={<span>{props.copied ? "Copied" : `Copy as a task to paste into ${shortName}`}</span>}>
        <button type="button" aria-label="Copy as a task" onClick={() => props.onCopy(task)} className={base}>
          <ClipboardCopy className={`size-3.5 ${props.copied ? "text-added" : ""}`} />
          {!props.small && (props.copied ? "Copied" : "Copy task")}
        </button>
      </Tooltip>
      {enabled && (
        <Tooltip
          content={
            <>
              <span>
                {all ? "Attached; click to remove them from the next prompt" : "Attach as a task to your next prompt. Who gets it is chosen at the top of this view."}
              </span>
              {!props.connected && <span className="text-slate-400">Needs {name} connected (status bar)</span>}
            </>
          }
        >
          <button
            type="button"
            aria-label={all ? "Remove from next prompt" : "Attach to next prompt"}
            aria-pressed={all}
            disabled={!props.connected}
            onClick={() => hints.toggle(props.markers)}
            className={`${base} disabled:opacity-40 ${all ? "text-brand-soft" : ""}`}
          >
            <Paperclip className="size-3.5" />
            {!props.small && (all ? "Attached" : "Attach")}
          </button>
        </Tooltip>
      )}
    </>
  );
}
