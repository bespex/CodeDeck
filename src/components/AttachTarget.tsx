import { attachFor, type AssistantState, type Session } from "../backend";
import { shortId, useSessionMarks } from "../assistant";
import { SessionBadge } from "./SessionBadge";

/** Sessions attachments can be meant for: running ones whose tool adds them to their next prompt. */
export function attachTargets(state: AssistantState): Session[] {
  return state.sessions.filter((s) => s.status !== "ended" && s.capabilities.attach === "withNextPrompt");
}

/**
 * Who gets what is queued (D19): whichever session in the project prompts next, or one chosen.
 * One choice for the whole queue; once delivered it is "any" again.
 */
export function AttachTarget({ state, className = "" }: { state: AssistantState; className?: string }) {
  const marks = useSessionMarks();
  const options = attachTargets(state);
  const target = state.target;
  const mark = marks.of(target);
  const name = (id: string) => marks.of(id)?.title ?? `session ${shortId(id)}`;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {mark && <SessionBadge mark={mark} />}
      <select
        aria-label="Who gets it"
        value={target ?? ""}
        onChange={(e) => void attachFor(e.target.value || null)}
        className="min-w-0 truncate rounded border border-line bg-base px-1 py-0.5 text-[12px] text-slate-200 outline-none hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-ai"
      >
        <option value="" className="bg-panel">any session: the one you prompt next</option>
        {target && !options.some((s) => s.id === target) && (
          <option value={target} className="bg-panel">
            {name(target)}
          </option>
        )}
        {options.map((s) => (
          <option key={s.id} value={s.id} className="bg-panel">
            {s.short} · {name(s.id)}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Said once when the chosen session ended or left the list, until something is chosen or delivered. */
export function TargetLost({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  if (!state.targetLost || state.target) return null;
  const name = marks.of(state.targetLost)?.title ?? `session ${shortId(state.targetLost)}`;
  return <span className="text-[12px] text-changed">{name} is gone, so it goes to any session now.</span>;
}
