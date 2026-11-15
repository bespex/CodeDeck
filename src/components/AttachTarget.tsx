import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { attachFor, type AssistantState, type Session } from "../backend";
import { shortId, useSessionMarks } from "../assistant";
import { SessionBadge } from "./SessionBadge";
import { t } from "../i18n";

/** Sessions attachments can be meant for: running ones whose tool adds them to their next prompt. */
export function attachTargets(state: AssistantState): Session[] {
  return state.sessions.filter((s) => s.status !== "ended" && s.capabilities.attach === "withNextPrompt");
}

/**
 * Who gets what is queued (D19): whichever session in the project prompts next, or one chosen.
 * One choice for the whole queue; once delivered it is "any" again. A list of its own rather than
 * the native one: the web view draws that in the system's light theme.
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
    void attachFor(id);
  };
  const ids = [...(target && !options.some((s) => s.id === target) ? [target] : []), ...options.map((s) => s.id)];
  const row = (id: string | null) => (
    <button
      key={id ?? ""}
      type="button"
      role="option"
      aria-selected={target === id}
      onClick={() => choose(id)}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-overlay-hover ${target === id ? "text-slate-50" : "text-slate-300"}`}
    >
      {id && marks.of(id) ? <SessionBadge mark={marks.of(id)!} /> : <span className="w-4 shrink-0" />}
      <span className="truncate">{id ? name(id) : any}</span>
      {!id && <span className="shrink-0 text-[11px] text-slate-500">{t("the one you prompt next")}</span>}
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
        className="flex min-w-0 items-center gap-1.5 rounded border border-line px-1.5 py-0.5 text-[12px] text-slate-200 hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-ai"
      >
        {target && marks.of(target) && <SessionBadge mark={marks.of(target)!} />}
        <span className="truncate">{target ? name(target) : any}</span>
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
          {row(null)}
          {ids.map(row)}
        </div>
      )}
    </span>
  );
}

/** Said once when the chosen session ended or left the list, until something is chosen or delivered. */
export function TargetLost({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  if (!state.targetLost || state.target) return null;
  const name = marks.of(state.targetLost)?.title ?? t("session {id}", { id: shortId(state.targetLost) });
  return <span className="text-[12px] text-changed">{t("{name} is gone, so it goes to any session now.", { name })}</span>;
}
