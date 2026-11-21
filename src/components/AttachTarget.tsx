import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { attachFor, type AssistantState, type Session } from "../backend";
import { shortId, useSessionMarks } from "../assistant";
import { SessionBadge } from "./SessionBadge";
import { t } from "../i18n";

/** Sessions attachments can be meant for: running ones whose tool adds them to their next prompt (as the backend counts them). */
export function attachTargets(state: AssistantState): Session[] {
  return state.sessions.filter((s) => s.status !== "ended" && s.capabilities.attach === "withNextPrompt" && s.alive !== false);
}

/**
 * Who gets what is queued (D19): one session chosen, or "any session" chosen on purpose (whichever
 * prompts next). Without a choice the one session that could take it gets it; with several the
 * attachments wait (`ChooseTarget`). One choice for the whole queue; once delivered nothing is
 * chosen again. A list of its own rather than the native one: the web view draws that in the
 * system's light theme.
 */
export function AttachTarget({ state, className = "" }: { state: AssistantState; className?: string }) {
  const marks = useSessionMarks();
  const [open, setOpen] = useState(false);
  // Placed against the window, not the column: a scrolling column would cut it off. Near the
  // bottom of the window (the right column) it opens upwards
  const [at, setAt] = useState<DOMRect | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const options = attachTargets(state);
  const target = state.target;
  const name = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  const any = t("any session");
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const choose = (id: string | null) => {
    setOpen(false);
    void attachFor(id, id === null);
  };
  // What shows without a choice: the only session that could take it, else that it waits
  const only = options.length === 1 ? options[0].id : null;
  const shown = target ?? (state.any ? null : only);
  const label = shown ? name(shown) : state.any ? any : options.length > 1 ? t("Choose…") : t("the next session");
  const ids = [...(target && !options.some((s) => s.id === target) ? [target] : []), ...options.map((s) => s.id)];
  const row = (id: string | null) => (
    <button
      key={id ?? ""}
      type="button"
      role="option"
      aria-selected={id ? target === id : state.any}
      onClick={() => choose(id)}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-overlay-hover ${(id ? target === id : state.any) ? "text-slate-50" : "text-slate-300"}`}
    >
      {id && marks.of(id) ? <SessionBadge mark={marks.of(id)!} /> : <span className="w-4 shrink-0" />}
      <span className="truncate">{id ? name(id) : any}</span>
      {!id && <span className="shrink-0 text-[11px] text-slate-500">{t("whichever you prompt first")}</span>}
    </button>
  );
  return (
    <span ref={box} className={`relative inline-flex min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Who gets it")}
        onClick={() => {
          setAt(box.current?.getBoundingClientRect() ?? null);
          setOpen(!open);
        }}
        className={`flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[12px] focus-visible:ring-2 focus-visible:ring-ai ${
          state.held ? "border-changed/70 text-changed hover:border-changed" : "border-line text-slate-200 hover:border-slate-500"
        }`}
      >
        {shown && marks.of(shown) && <SessionBadge mark={marks.of(shown)!} />}
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
      </button>
      {open && at && (
        <div
          role="listbox"
          style={{
            left: Math.min(at.left, window.innerWidth - 328),
            minWidth: at.width,
            ...(at.bottom > window.innerHeight - 220 ? { bottom: window.innerHeight - at.top + 4 } : { top: at.bottom + 4 }),
          }}
          className="surface-overlay fixed z-40 w-max max-w-80 rounded-lg p-1 text-[12px]"
        >
          {ids.map(row)}
          {/* The race on purpose, set apart: not the way to go with several sessions */}
          {ids.length > 1 && <div className="mx-2 my-1 h-px bg-overlay-line" />}
          {row(null)}
        </div>
      )}
    </span>
  );
}

/**
 * Several sessions could take the attachments and none is chosen: they wait, and this asks who
 * gets them, one click per session. Prominent, since otherwise nothing goes out.
 */
export function ChooseTarget({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  const name = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  return (
    <div className="flex flex-col gap-1 rounded-md border border-changed/60 bg-changed/10 px-2 py-1.5 text-[12px]">
      {/* Why it waits in the tooltip: the column is narrow, the sessions need the room */}
      <span title={t("Several AI sessions are running. Nothing goes out until you choose one.")} className="flex items-center gap-1.5 font-medium text-changed">
        <span className="size-1.5 shrink-0 rounded-full bg-changed" />
        {t("Waiting: who should get it?")}
      </span>
      <TargetLost state={state} />
      <div className="flex flex-col gap-0.5">
        {attachTargets(state).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => void attachFor(s.id)}
            className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-slate-200 hover:bg-overlay-hover"
          >
            {marks.of(s.id) && <SessionBadge mark={marks.of(s.id)!} />}
            <span className="truncate">{name(s.id)}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => void attachFor(null, true)}
          className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-slate-400 hover:bg-overlay-hover hover:text-slate-200"
        >
          <span className="w-4 shrink-0" />
          <span className="truncate">{t("any session")}</span>
          <span className="shrink-0 text-[11px] text-slate-500">{t("whichever you prompt first")}</span>
        </button>
      </div>
    </div>
  );
}

/** Said once when the chosen session ended or left the list, until something is chosen or delivered. */
export function TargetLost({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  if (!state.targetLost || state.target || state.any) return null;
  const name = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  const left = attachTargets(state);
  const says =
    left.length > 1
      ? t("{name} is gone.", { name: name(state.targetLost) })
      : left.length === 1
        ? t("{name} is gone, so {other} gets it now.", { name: name(state.targetLost), other: name(left[0].id) })
        : t("{name} is gone; it waits for the next session.", { name: name(state.targetLost) });
  return <span className="text-[12px] text-changed">{says}</span>;
}
