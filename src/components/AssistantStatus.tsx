import { useEffect, useRef, useState } from "react";
import { Plug, Sparkles } from "lucide-react";
import { live, setClaudeHooks, type AssistantState, type HookSetup, type Session } from "../backend";
import { shortId, useHookSetup } from "../assistant";
import { plural } from "../git";

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

/**
 * Claude Code in the status bar: how many sessions work in the project and whether one waits;
 * a click shows them, and sets up the hooks through which CodeDeck hears of them.
 */
export function AssistantStatus({ state }: { state: AssistantState }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useHookSetup();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const active = state.sessions.filter((s) => s.status !== "ended");
  const working = active.filter((s) => s.status === "working").length;
  const waiting = active.filter((s) => s.status === "waiting").length;
  const label = !setup?.installed
    ? "Claude: not connected"
    : active.length === 0
      ? "Claude: no session"
      : `Claude: ${plural(active.length, "session")}${working ? ` · ${working} working` : ""}${waiting ? ` · ${waiting} waiting` : ""}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`-mx-1 flex items-center gap-1 rounded px-1 hover:bg-raised ${
          open ? "bg-raised text-slate-200" : waiting ? "text-changed" : working ? "text-ai" : "text-slate-500"
        }`}
      >
        {setup?.installed ? <Sparkles className="size-3" /> : <Plug className="size-3" />}
        {label}
      </button>
      {open && (
        <div className="surface-overlay absolute right-0 bottom-6 z-30 flex max-h-[60vh] w-[420px] flex-col overflow-y-auto rounded-lg p-3 text-[12px] text-slate-300">
          <Sessions state={state} />
          <HookPanel setup={setup} onChange={setSetup} heard={state.heard} />
        </div>
      )}
    </div>
  );
}

function Sessions({ state }: { state: AssistantState }) {
  if (state.sessions.length === 0) {
    return <p className="mb-3 text-slate-500">No Claude Code session has worked in this project since CodeDeck opened it.</p>;
  }
  return (
    <ul className="mb-3 flex flex-col gap-2">
      {state.sessions.map((s) => (
        <li key={s.id} className={`rounded-md border border-overlay-line p-2 ${s.status === "ended" ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${STATUS_COLOR[s.status]} ${s.status === "working" ? "animate-pulse" : ""}`} />
            <span className="font-medium text-slate-100">{STATUS_WORDS[s.status]}</span>
            <code className="font-mono text-[11px] text-slate-500">{shortId(s.id)}</code>
            <span className="ml-auto text-slate-500">{s.cwd === "" ? "project root" : s.cwd}</span>
          </div>
          {s.message && <p className="mt-1 text-changed">{s.message}</p>}
          {s.prompt && <p className="mt-1 line-clamp-2 text-slate-400 italic">“{s.prompt}”</p>}
          {s.handed && <p className="mt-1 text-ai">Got the hand-over with this prompt</p>}
          {s.touched.length > 0 && (
            <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={s.touched.map((t) => t.path).join("\n")}>
              wrote {s.touched.length === 1 ? s.touched[0].path : `${s.touched.length} files: ${s.touched.slice(0, 3).map((t) => t.path).join(", ")}${s.touched.length > 3 ? ", …" : ""}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function HookPanel(props: { setup: HookSetup | null; onChange: (s: HookSetup) => void; heard: boolean }) {
  const { setup } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!setup) return null;
  const change = async (install: boolean) => {
    setBusy(true);
    setError(null);
    try {
      props.onChange(await setClaudeHooks(install));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const button = "rounded-md px-2.5 py-1 font-medium disabled:opacity-40";
  return (
    <div className="border-t border-overlay-line pt-3">
      {setup.installed ? (
        <>
          <p className="text-slate-400">
            Claude Code tells CodeDeck what it does through hooks in <code className="font-mono text-[11px]">{setup.settings}</code>.
            {!props.heard && " Sessions started before connecting report from their next step on."}
          </p>
          {setup.other && (
            <p className="mt-1 text-changed">
              They run another CodeDeck: <code className="font-mono text-[11px]">{setup.other}</code>
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {setup.other && (
              <button type="button" disabled={busy} onClick={() => change(true)} className={`${button} bg-brand-fill text-white hover:bg-brand-fill-hover`}>
                Use this CodeDeck
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => change(false)} className={`${button} border border-overlay-line hover:bg-overlay-hover`}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-slate-400">
            Connecting adds hooks to <code className="font-mono text-[11px]">{setup.settings}</code> for every Claude Code
            session. They run <code className="font-mono text-[11px]">{setup.command}</code>, which tells the open CodeDeck
            windows which session works where and which files it writes, and lets CodeDeck keep a snapshot before an
            assistant's first write in a turn. Nothing else in the file changes; the file as it was is kept next to it.
          </p>
          <button
            type="button"
            disabled={busy || !live}
            onClick={() => change(true)}
            className={`${button} mt-2 bg-brand-fill text-white hover:bg-brand-fill-hover`}
          >
            Connect Claude Code
          </button>
        </>
      )}
      {error && <p className="selectable mt-2 text-problem">{error}</p>}
    </div>
  );
}
