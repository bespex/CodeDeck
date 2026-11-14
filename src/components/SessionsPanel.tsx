import { useState, type DragEvent } from "react";
import { ChevronDown, ChevronRight, File, Folder, Layers, Send, Sparkles, TextSelect, Trash2, X } from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import { HookPanel } from "./AssistantStatus";
import { Tooltip } from "./Tooltip";
import { handOver, type AssistantState, type Entry, type Session } from "../backend";
import { shortId, useHookSetup } from "../assistant";
import { FOCUS_KEY, focusText, type Pin } from "../focus";
import { plural } from "../git";
import { LOCALE } from "./Trail";

interface Props {
  assistant: AssistantState;
  pins: Pin[];
  onPin: (entry: Entry) => void;
  onUnpin: (id: string) => void;
  onClear: () => void;
  /** Shows a file the assistant wrote: selects it in the file list and the deck */
  onShowFile: (path: string) => void;
}

/**
 * The right column: the Claude Code sessions working in the project (one track each) and the
 * focus one can hand to Claude with the next prompt.
 */
export function SessionsPanel(props: Props) {
  return (
    <aside className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,3fr)_minmax(0,2fr)] border-l border-line bg-panel">
      <Sessions state={props.assistant} onShowFile={props.onShowFile} />
      <Focus {...props} />
    </aside>
  );
}

/* ── Sessions ──────────────────────────────────────────────────────────────── */

const STATUS_WORDS: Record<Session["status"], string> = {
  working: "working",
  waiting: "waiting for you",
  idle: "turn done",
  ended: "ended",
};

const STATUS_COLOR: Record<Session["status"], string> = {
  working: "bg-ai",
  waiting: "bg-changed",
  idle: "bg-slate-500",
  ended: "bg-slate-700",
};

function Sessions({ state, onShowFile }: { state: AssistantState; onShowFile: (path: string) => void }) {
  const [setup, setSetup] = useHookSetup();
  const active = state.sessions.filter((s) => s.status !== "ended").length;
  return (
    <section className="flex min-h-0 flex-col border-b border-line">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="size-4 text-ai" />
        <h2 className="font-semibold text-slate-100">Sessions</h2>
        {active > 0 && <span className="text-slate-500">{active}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.sessions.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {state.sessions.map((s) => (
              <SessionItem key={s.id} session={s} onShowFile={onShowFile} />
            ))}
          </ul>
        ) : setup && !setup.installed ? (
          <div className="p-1 text-[12px] text-slate-300">
            <HookPanel setup={setup} onChange={setSetup} heard={state.heard} />
          </div>
        ) : (
          <p className="grid h-full place-items-center px-6 text-center text-slate-500">
            No Claude Code session has worked in this project since CodeDeck opened it. Start one in the
            project's folder: it shows up here with its first step.
          </p>
        )}
      </div>
    </section>
  );
}

function SessionItem({ session: s, onShowFile }: { session: Session; onShowFile: (path: string) => void }) {
  const [open, setOpen] = useState(s.status !== "ended");
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={`rounded-md border border-line bg-raised ${s.status === "ended" ? "opacity-55" : ""}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left">
        <Chevron className="size-3.5 shrink-0 text-slate-500" />
        <span className={`size-2 shrink-0 rounded-full ${STATUS_COLOR[s.status]} ${s.status === "working" ? "animate-pulse" : ""}`} />
        <span className="font-medium text-slate-100">{STATUS_WORDS[s.status]}</span>
        <code className="font-mono text-[11px] text-slate-500">{shortId(s.id)}</code>
        <span className="ml-auto truncate text-[11px] text-slate-500">{s.cwd === "" ? "project root" : s.cwd}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 pl-[30px] text-[12px]">
          {s.message && <p className="text-changed">{s.message}</p>}
          {s.prompt && <p className="line-clamp-3 text-slate-400 italic">“{s.prompt}”</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {plural(s.prompts, "prompt")} · last step {new Date(s.last).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}
            {s.handed && <span className="text-ai"> · got the hand-over</span>}
          </p>
          {s.touched.length > 0 && (
            <ul className="mt-1.5 flex flex-col">
              {s.touched.map((t) => (
                <li key={t.path}>
                  <button
                    type="button"
                    onClick={() => onShowFile(t.path)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[11px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
                  >
                    <span className="ai-dot shrink-0" />
                    <span className="truncate">{t.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/* ── Focus: what Claude gets pointed at, only when asked ───────────────────── */

const kindIcon = { file: File, folder: Folder, snippet: TextSelect };

/** The context window the token meter measures against. */
const CONTEXT_TOKENS = 200_000;

function Focus({ assistant, pins, onPin, onUnpin, onClear }: Props) {
  const [over, setOver] = useState(false);
  const used = pins.reduce((sum, p) => sum + p.tokens, 0);
  const share = Math.min(1, used / CONTEXT_TOKENS);
  const barColor = share > 0.5 ? "bg-problem" : share > 0.25 ? "bg-changed" : "bg-ai";
  const waiting = assistant.handovers.find((h) => h.key === FOCUS_KEY);
  const [setup] = useHookSetup();

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData(DRAG_TYPE);
    if (data) onPin(JSON.parse(data) as Entry);
  };

  return (
    <section
      className="flex min-h-0 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Layers className="size-4 text-brand-soft" />
        <h2 className="font-semibold text-slate-100">Focus</h2>
        <span className="text-slate-500">{pins.length || ""}</span>
        <div className="ml-auto flex items-center gap-1">
          {pins.length > 0 && (
            <Tooltip
              content={
                <>
                  <span>Give the focus to Claude with the next prompt you send in this project</span>
                  {!setup?.installed && <span className="text-slate-400">Needs Claude Code connected (status bar)</span>}
                </>
              }
            >
              <button
                type="button"
                disabled={!setup?.installed}
                onClick={() => handOver(FOCUS_KEY, focusText(pins), plural(pins.length, "item"))}
                className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100 disabled:opacity-40"
              >
                <Send className="size-3.5" />
                Hand to Claude
              </button>
            </Tooltip>
          )}
          {pins.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              title="Clear the focus"
              aria-label="Clear the focus"
              className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-200"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {waiting && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-md border border-ai/40 bg-ai/10 px-2 py-1 text-[12px] text-slate-300">
          <Send className="size-3.5 shrink-0 text-ai" />
          <span className="flex-1">Waiting for the next prompt: {waiting.label}</span>
          <button
            type="button"
            onClick={() => handOver(FOCUS_KEY, null)}
            aria-label="Take back"
            className="rounded p-0.5 text-slate-400 hover:bg-raised hover:text-slate-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {pins.length > 0 && (
        <div className="shrink-0 px-3 pt-2.5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-base"
            role="meter"
            aria-label="Size of the focus"
            aria-valuemin={0}
            aria-valuemax={CONTEXT_TOKENS}
            aria-valuenow={used}
          >
            <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            about <span className="text-slate-300">{formatTokens(used)}</span> tokens if Claude reads all of it
          </div>
        </div>
      )}

      <div
        className={`m-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed p-1 transition-colors ${
          over ? "border-ai bg-ai/10" : "border-transparent"
        }`}
      >
        {pins.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-slate-500">
            <p>
              Empty: Claude works without extra context. To point it at something, drag files or folders here or use
              the pin in the file list, then hand the focus over.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {pins.map((pin) => {
              const Icon = kindIcon[pin.kind];
              return (
                <li key={pin.id} className="group flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1.5">
                  <Icon className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-slate-100 ${pin.kind === "snippet" ? "font-mono text-[12px]" : ""}`}>{pin.label}</div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                      {pin.via && <span className="rounded bg-ai/15 px-1 text-ai">from {pin.via}</span>}
                      <span className="truncate">{pin.detail}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{formatTokens(pin.tokens)}</span>
                  <button
                    type="button"
                    onClick={() => onUnpin(pin.id)}
                    aria-label={`Remove ${pin.label} from the focus`}
                    className="shrink-0 rounded p-0.5 text-slate-600 hover:bg-overlay-hover hover:text-slate-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}
