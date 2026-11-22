import type { SessionMark } from "../assistant";
import { t } from "../i18n";

/**
 * A session's short name in its colour: the same small sign wherever the session shows up. A session
 * of another project (an umbrella project and the ones below it see each other's) carries that
 * project's colour at its corner, so it reads the same in every list, however small the sign: a
 * filled dot at the bottom for one that runs in a project below, a ring at the top for one that
 * runs in the project above.
 */
export function SessionBadge({ mark, className = "", large = false }: { mark: SessionMark; className?: string; large?: boolean }) {
  const other = mark.elsewhere;
  const title = other ? [mark.title, otherLine(other.where, other.name)].filter(Boolean).join(" · ") : (mark.title ?? undefined);
  const size = large ? "size-3" : "size-2.5";
  return (
    <span
      title={title}
      style={{ color: mark.color, background: `color-mix(in srgb, ${mark.color} 18%, transparent)`, borderColor: `color-mix(in srgb, ${mark.color} 45%, transparent)` }}
      className={`relative inline-flex shrink-0 items-center justify-center border leading-none font-semibold ${large ? "h-8 min-w-8 rounded-md px-1.5 text-[14px]" : "h-4 min-w-4 rounded px-1 text-[10px]"} ${className}`}
    >
      {mark.short}
      {other &&
        (other.where === "below" ? (
          <span aria-hidden style={{ background: other.color }} className={`absolute -right-1 -bottom-1 rounded-full border-2 border-base ${size}`} />
        ) : (
          <span aria-hidden style={{ borderColor: other.color }} className={`absolute -top-1 -right-1 rounded-full border-2 bg-base ${size}`} />
        ))}
    </span>
  );
}

/** Where a session of another project runs, in words: the tooltip and the line on the card. */
export function otherLine(where: "below" | "above", name: string): string {
  return where === "below" ? t("Runs in {name}", { name }) : t("Runs in {name} (above)", { name });
}
