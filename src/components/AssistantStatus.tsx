import { useEffect, useRef, useState } from "react";
import { Plug, Sparkles } from "lucide-react";
import { live, setHarnessConnection, type AssistantState, type Connection, type HarnessInfo } from "../backend";
import { mainHarness, useConnections, type Connections } from "../assistant";
import { plural } from "../git";
import { T, t } from "../i18n";

/**
 * The coding tool in the status bar: how many sessions work in the project and whether one waits
 * (the sessions themselves are in the right column); a click sets up the connection through which
 * CodeDeck hears of them.
 */
export function AssistantStatus({ state }: { state: AssistantState }) {
  const [open, setOpen] = useState(false);
  const hooks = useConnections();
  const harness = mainHarness(state);
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
  const label = !hooks.connected
    ? `${harness.shortName}: ${t("not connected")}`
    : active.length === 0
      ? `${harness.shortName}: ${t("no session")}`
      : `${harness.shortName}: ${plural(active.length, "session")}${working ? ` · ${t("{n} working", { n: working })}` : ""}${waiting ? ` · ${t("{n} waiting", { n: waiting })}` : ""}`;

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
        {hooks.connected ? <Sparkles className="size-3" /> : <Plug className="size-3" />}
        {label}
      </button>
      {open && (
        <div className="surface-overlay absolute right-0 bottom-6 z-30 flex max-h-[60vh] w-[420px] flex-col overflow-y-auto rounded-lg p-3 pt-0 text-[12px] text-slate-300">
          <HookPanel hooks={hooks} harness={harness} heard={state.heard} />
        </div>
      )}
    </div>
  );
}

/**
 * Connecting per account of the tool: several are common (each with a configuration of its
 * own); a session only reports through the one it runs with.
 */
export function HookPanel({ hooks, harness, heard }: { hooks: Connections; harness: HarnessInfo; heard: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!hooks.setups) return null;
  const change = async (c: Connection, install: boolean) => {
    setBusy(c.dir);
    setError(null);
    try {
      hooks.update(await setHarnessConnection(c.harness, c.dir, install));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };
  const button = "shrink-0 rounded-md px-2.5 py-1 font-medium disabled:opacity-40";
  const command = hooks.setups[0]?.command;
  return (
    <div className="pt-3">
      <p className="text-slate-400">
        {hooks.connected
          ? t("{tool} tells CodeDeck what it does through hooks in its settings.", { tool: harness.name })
          : t("Connecting adds hooks to the settings of {tool} for every session.", { tool: harness.name })}{" "}
        <T
          text="They run {command}, which tells the open CodeDeck windows which session works where and which files it writes, and lets CodeDeck keep a snapshot before an assistant's first write in a turn. Nothing else in the file changes; the file as it was is kept next to it."
          command={<code className="font-mono text-[11px]">{command}</code>}
        />
        {hooks.connected && !heard && ` ${t("Sessions started before connecting report from their next step on.")}`}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {hooks.setups.map((s) => (
          <li key={`${s.harness} ${s.dir}`} className="flex items-center gap-2 rounded-md border border-overlay-line px-2 py-1.5">
            <div className="min-w-0 flex-1">
              {/* Said in words: the button on the right names the action, not the state */}
              <span className={`flex items-center gap-1.5 text-[11px] font-medium ${s.installed ? "text-added" : "text-slate-400"}`}>
                <span className={`size-2 shrink-0 rounded-full ${s.installed ? "bg-added" : "bg-slate-600"}`} />
                {s.installed ? t("Connected") : t("Not connected")}
              </span>
              <code className="block truncate font-mono text-[11px] text-slate-200">{s.dir}</code>
              {s.other && <span className="block truncate text-[11px] text-changed">{t("runs another CodeDeck: {other}", { other: s.other })}</span>}
            </div>
            {s.other && (
              <button type="button" disabled={!!busy} onClick={() => change(s, true)} className={`${button} bg-brand-fill text-white hover:bg-brand-fill-hover`}>
                {t("Use this one")}
              </button>
            )}
            {s.installed ? (
              <button type="button" disabled={!!busy} onClick={() => change(s, false)} className={`${button} border border-overlay-line hover:bg-overlay-hover`}>
                {t("Disconnect")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!!busy || !live}
                onClick={() => change(s, true)}
                className={`${button} bg-brand-fill text-white hover:bg-brand-fill-hover`}
              >
                {t("Connect")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="selectable mt-2 text-problem">{error}</p>}
    </div>
  );
}
