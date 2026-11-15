import type { SessionMark } from "../assistant";

/** A session's short name in its colour: the same small sign wherever the session shows up. */
export function SessionBadge({ mark, className = "" }: { mark: SessionMark; className?: string }) {
  return (
    <span
      title={mark.title ?? undefined}
      style={{ color: mark.color, background: `color-mix(in srgb, ${mark.color} 18%, transparent)`, borderColor: `color-mix(in srgb, ${mark.color} 45%, transparent)` }}
      className={`inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 text-[10px] leading-none font-semibold ${className}`}
    >
      {mark.short}
    </span>
  );
}
