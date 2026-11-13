import { useState, type DragEvent, type FormEvent } from "react";
import {
  ArrowUp,
  File,
  Folder,
  Layers,
  Sparkles,
  TextSelect,
  Trash2,
  X,
} from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import type { Entry } from "../backend";
import { config, initialChat, type ChatMessage, type Pin } from "../mock";

interface Props {
  pins: Pin[];
  budget: number;
  onPin: (entry: Entry) => void;
  onUnpin: (id: string) => void;
  onClear: () => void;
}

export function AssistantPanel(props: Props) {
  return (
    <aside className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,2fr)_minmax(0,3fr)] border-l border-line bg-panel">
      <Context {...props} />
      <Chat pinCount={props.pins.length} />
    </aside>
  );
}

/* ── Context: what the assistant gets to see ─────────────────────────────────── */

const kindIcon = { file: File, folder: Folder, snippet: TextSelect };

function Context({ pins, budget, onPin, onUnpin, onClear }: Props) {
  const [over, setOver] = useState(false);
  const used = pins.reduce((sum, p) => sum + p.tokens, 0);
  const share = Math.min(1, used / budget);
  const barColor = share > 0.9 ? "bg-problem" : share > 0.7 ? "bg-changed" : "bg-ai";

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData(DRAG_TYPE);
    if (data) onPin(JSON.parse(data) as Entry);
  };

  return (
    <section
      className="flex min-h-0 flex-col border-b border-line"
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
        <h2 className="font-semibold text-slate-100">Context</h2>
        <span className="text-slate-500">{pins.length}</span>
        {pins.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="Clear context"
            aria-label="Clear context"
            className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </header>

      {/* Token usage */}
      <div className="shrink-0 px-3 pt-2.5">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-base"
          role="meter"
          aria-label="Context size"
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={used}
        >
          <div
            className={`h-full rounded-full transition-[width] ${barColor}`}
            style={{ width: `${Math.max(share * 100, used ? 1.5 : 0)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500">
          <span>
            <span className="text-slate-300">{formatTokens(used)}</span> of {formatTokens(budget)} tokens
          </span>
          <span>{(share * 100).toFixed(share < 0.1 ? 1 : 0)} %</span>
        </div>
      </div>

      <div
        className={`m-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed p-1 transition-colors ${
          over ? "border-indigo-400 bg-indigo-500/10" : "border-transparent"
        }`}
      >
        {pins.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-slate-500">
            <p>
              Drag files or folders here, or use the pin in the file list. Selections sent from
              jayq, xaq and marq land here too.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {pins.map((pin) => {
              const Icon = kindIcon[pin.kind];
              return (
                <li
                  key={pin.id}
                  className="group flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1.5"
                >
                  <Icon className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-slate-100 ${pin.kind === "snippet" ? "font-mono text-[12px]" : ""}`}
                    >
                      {pin.label}
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                      {pin.via && (
                        <span className="rounded bg-indigo-400/15 px-1 text-indigo-300">from {pin.via}</span>
                      )}
                      <span className="truncate">{pin.detail}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                    {formatTokens(pin.tokens)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnpin(pin.id)}
                    aria-label={`Remove ${pin.label} from context`}
                    className="shrink-0 rounded p-0.5 text-slate-600 hover:bg-slate-700 hover:text-slate-100"
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

/* ── Chat with the assistant ─────────────────────────────────────────────────── */

function Chat({ pinCount }: { pinCount: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat);
  const [draft, setDraft] = useState("");

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { id: `m${m.length + 1}`, from: "you", text }]);
    setDraft("");
  };

  return (
    <section className="flex min-h-0 flex-col bg-base/45">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
        <Sparkles className="size-4 text-indigo-300" />
        <h2 className="font-semibold text-slate-100">Assistant</h2>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-slate-400">
          {config.assistant.model}
        </span>
      </header>

      <ol className="selectable flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.map((m) =>
          m.from === "you" ? (
            <li
              key={m.id}
              className="ml-6 self-end rounded-xl rounded-br-sm border border-line bg-raised px-3 py-2 text-slate-50"
            >
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="mr-2 text-slate-300">
              <p>{m.text}</p>
              {m.changed && (
                <ul className="mt-2 flex flex-col gap-0.5 border-l-2 border-indigo-400/50 pl-2.5">
                  {m.changed.map((path) => (
                    <li key={path} className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                      <span className="ai-dot" />
                      {path}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ),
        )}
      </ol>

      <form onSubmit={send} className="shrink-0 p-2 pt-0">
        <div className="rounded-xl border border-line bg-base focus-within:border-indigo-500">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask the assistant"
            aria-label="Message to the assistant"
            className="selectable block w-full resize-none bg-transparent px-3 pt-2 text-slate-100 outline-none placeholder:text-slate-600"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <Layers className="size-3" />
              {pinCount === 0 ? "No context" : `${pinCount} in context`}
            </span>
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="ml-auto grid size-7 place-items-center rounded-lg bg-brand-fill text-white hover:bg-brand-fill-hover disabled:bg-raised disabled:text-slate-600"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
