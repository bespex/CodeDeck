import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMarkSpec } from "../backend";
import { EMOJI, inkOn, MARK_COLORS, markOf, searchIcons, useLucide } from "../marks";
import { t } from "../i18n";

/** The shape tells what a mark stands for: a project is a circle, an account a hexagon (sessions
 *  have rounded squares, `SessionBadge`). */
export type MarkShape = "circle" | "hexagon" | "bare";

export { inkOn } from "../marks";
const HEXAGON = "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)";

/** A project's or account's mark: its icon, emoji or first letter on its colour (docs/UEBERSICHT.md). */
export function ProjectMark({ mark, color, name, size = 20, shape = "circle" }: { mark: ProjectMarkSpec | null | undefined; color: string; name: string; size?: number; shape?: MarkShape }) {
  const m = markOf(mark);
  const lucide = useLucide();
  const fill = m.color ?? color;
  const inner = m.kind === "icon" && m.value ? lucide?.icons[m.value] : undefined;
  // Bare: no shape, only the sign itself, large, in the ink that suits the colour it stands on
  if (shape === "bare") {
    const ink = inkOn(fill);
    return (
      <span aria-hidden style={{ height: size, width: size, color: ink, fontSize: Math.round(size * (m.kind === "emoji" ? 0.85 : 0.8)) }} className="inline-flex shrink-0 items-center justify-center leading-none font-bold">
        {inner ? (
          <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: inner }} />
        ) : m.kind === "emoji" && m.value ? (
          m.value
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </span>
    );
  }
  // Letter and icon in the same ink, the one that reads on the colour (an icon was always white)
  const ink = inkOn(fill);
  return (
    <span
      aria-hidden
      style={{
        height: size,
        color: ink,
        // An emoji brings its own colours: a lighter shape, on a circle with a ring of the colour
        background: m.kind === "emoji" ? `color-mix(in srgb, ${fill} ${shape === "hexagon" ? 55 : 40}%, transparent)` : fill,
        boxShadow: m.kind === "emoji" && shape === "circle" ? `inset 0 0 0 ${Math.max(1, size / 14)}px ${fill}` : undefined,
        clipPath: shape === "hexagon" ? HEXAGON : undefined,
        width: shape === "hexagon" ? Math.round(size * 1.12) : size,
        fontSize: Math.round(size * (m.kind === "emoji" ? 0.6 : 0.52)),
      }}
      className={`inline-flex shrink-0 items-center justify-center leading-none font-bold ${shape === "circle" ? "rounded-full" : ""}`}
    >
      {inner ? (
        <svg
          viewBox="0 0 24 24"
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.6)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: inner }}
        />
      ) : m.kind === "emoji" && m.value ? (
        m.value
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

type Tab = "icon" | "emoji" | "letter";

/**
 * Choosing a project's mark: every Lucide icon with a search over names and keywords, emoji in
 * groups, or the first letter; and its colour. Fits the narrow overview.
 */
export function MarkPicker(props: {
  name: string;
  color: string;
  mark: ProjectMarkSpec | null;
  shape?: MarkShape;
  /** What the mark is shown with; the project's places by default */
  note?: string;
  onDone: (mark: ProjectMarkSpec | null) => void;
  onCancel: () => void;
}) {
  const shape = props.shape ?? "circle";
  const [mark, setMark] = useState<ProjectMarkSpec>(markOf(props.mark));
  const [tab, setTab] = useState<Tab>(mark.kind === "letter" ? "icon" : mark.kind);
  const [query, setQuery] = useState("");
  const lucide = useLucide();
  const found = useMemo(() => (lucide ? searchIcons(lucide, query) : []), [lucide, query]);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tab === "icon") search.current?.focus();
  }, [tab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);
  const color = mark.color ?? props.color;
  const cell = (on: boolean) => `flex h-9 items-center justify-center rounded-md text-[18px] ${on ? "bg-ai text-white" : "text-slate-300 hover:bg-overlay-hover"}`;
  return (
    <div role="dialog" aria-label={t("Mark for {name}", { name: props.name })} onClick={props.onCancel} className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2">
      <div onClick={(e) => e.stopPropagation()} className="surface-overlay flex max-h-full w-full max-w-[420px] flex-col gap-2.5 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <ProjectMark mark={mark} color={props.color} name={props.name} size={44} shape={shape} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-100">{t("Mark for {name}", { name: props.name })}</p>
            <p className="text-[11px] text-slate-500">{props.note ?? t("Shows in the overview, the window and its taskbar icon")}</p>
          </div>
          <span className="ml-auto">
            <ProjectMark mark={mark} color={props.color} name={props.name} size={16} shape={shape} />
          </span>
        </div>
        <div className="flex rounded-md border border-overlay-line p-0.5 text-[12px]" role="tablist">
          {(
            [
              ["icon", "Icons"],
              ["emoji", "Emoji"],
              ["letter", "Letter"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                if (k === "letter") setMark({ kind: "letter", color: mark.color });
              }}
              className={`flex-1 rounded px-2 py-1 ${tab === k ? "bg-overlay-hover text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
            >
              {t(l)}
            </button>
          ))}
        </div>
        {tab === "icon" && (
          <>
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search: rocket, bill, weather, book…")}
              className="rounded-md border border-overlay-line bg-base px-2 py-1 text-[12px] text-slate-200 outline-none focus:border-slate-500"
            />
            <p className="text-[11px] text-slate-500">
              {!lucide ? t("Loading icons…") : query.trim() ? t("{n} of {all} icons", { n: found.length, all: Object.keys(lucide.icons).length }) : t("Suggested · type to search all {all} icons", { all: Object.keys(lucide.icons).length })}
            </p>
            <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1 overflow-y-auto">
              {lucide &&
                found.slice(0, 300).map((n) => (
                  <button key={n} type="button" title={n} onClick={() => setMark({ kind: "icon", value: n, color: mark.color })} className={cell(mark.kind === "icon" && mark.value === n)}>
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: lucide.icons[n] }} />
                  </button>
                ))}
            </div>
          </>
        )}
        {tab === "emoji" && (
          <div className="max-h-64 overflow-y-auto">
            {EMOJI.map(([group, list]) => (
              <div key={group}>
                <p className="pt-1.5 pb-1 text-[11px] text-slate-500">{t(group)}</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1">
                  {list.split(" ").map((e) => (
                    <button key={e} type="button" onClick={() => setMark({ kind: "emoji", value: e, color: mark.color })} className={cell(mark.kind === "emoji" && mark.value === e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "letter" && <p className="text-[12px] text-slate-400">{t("The first letter of the project's name. New projects start like this, each in a colour of its own.")}</p>}
        <div>
          <p className="pb-1 text-[11px] text-slate-500">{t("Colour")}</p>
          <div className="flex flex-wrap gap-1.5">
            {MARK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setMark({ ...mark, color: c })}
                style={{ background: c }}
                className={`size-6 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={props.onCancel} className="rounded-md border border-overlay-line px-3 py-1 text-[12px] text-slate-300 hover:bg-overlay-hover">
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => props.onDone(mark.kind === "letter" && !mark.color ? null : mark)}
            className="rounded-md bg-ai px-3 py-1 text-[12px] font-medium text-white hover:brightness-110"
          >
            {t("Use")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** An account's mark: a hexagon, so it is never taken for a project (circle) or a session. */
export function AccountMark({ account, size = 14 }: { account: { mark: ProjectMarkSpec | null; color: string; name: string }; size?: number }) {
  return <ProjectMark mark={account.mark} color={account.color} name={account.name} size={size} shape="hexagon" />;
}
