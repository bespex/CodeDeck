import type { SessionMark } from "../assistant";

/** A session's short name in its colour: the same small sign wherever the session shows up. */
export function SessionBadge({ mark, className = "", large = false }: { mark: SessionMark; className?: string; large?: boolean }) {
  return (
    <span
      title={mark.title ?? undefined}
      style={{ color: mark.color, background: `color-mix(in srgb, ${mark.color} 18%, transparent)`, borderColor: `color-mix(in srgb, ${mark.color} 45%, transparent)` }}
      className={`inline-flex shrink-0 items-center justify-center border leading-none font-semibold ${large ? "h-8 min-w-8 rounded-md px-1.5 text-[14px]" : "h-4 min-w-4 rounded px-1 text-[10px]"} ${className}`}
    >
      {mark.short}
    </span>
  );
}
