import { useEffect, useRef, useState } from "react";
import { Plug, Sparkles } from "lucide-react";
import { live, setClaudeHooks, type AssistantState, type HookSetup } from "../backend";
import { useHookSetup } from "../assistant";
import { plural } from "../git";

/**
 * Claude Code in the status bar: how many sessions work in the project and whether one waits
 * (the sessions themselves are in the right column); a click sets up the hooks through which
 * CodeDeck hears of them.
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
        <div className="surface-overlay absolute right-0 bottom-6 z-30 flex max-h-[60vh] w-[420px] flex-col overflow-y-auto rounded-lg p-3 pt-0 text-[12px] text-slate-300">
          <HookPanel setup={setup} onChange={setSetup} heard={state.heard} />
        </div>
      )}
    </div>
  );
}

export function HookPanel(props: { setup: HookSetup | null; onChange: (s: HookSetup) => void; heard: boolean }) {
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
    <div className="pt-3">
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
