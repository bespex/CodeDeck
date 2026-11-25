import "@bespex/themes/appearance";
import { useEffect, useRef } from "react";
import type { Appearance } from "@bespex/themes";
import { AXES_USED, EVENTS, setAppearance, setEvents, setReduceTransparency, useTheme, type Events } from "../theme";
import { lang, t } from "../i18n";

/**
 * Colour theme and style: the kit's picker, the same in every be spex app, offering only the style axes
 * that change something in CodeDeck. A choice applies on the click: pointing at one used to show it at
 * once, which unsettled the window while the pointer merely passed (user, 2026-11-17).
 */
export function ThemeChoice() {
  const { appearance } = useTheme();
  const ref = useRef<HTMLElement & { value: Appearance }>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const changed = (e: Event) => setAppearance((e as CustomEvent<Appearance>).detail);
    el.addEventListener("change", changed);
    return () => el.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.value = appearance;
  }, [appearance]);
  return <sx-appearance ref={ref} layout="compact" lang={lang} axes={AXES_USED.join(" ")} class="block w-[300px] max-w-full" />;
}

const EVENT_LABELS: Record<Events, string> = { quiet: "Quiet", clear: "Distinct", focus: "Focus", loud: "Loud" };

/** How much events stand out: CodeDeck's own, beside the style. */
export function EventsChoice() {
  const { events } = useTheme();
  return (
    <div className="flex rounded-md border border-overlay-line p-0.5" role="radiogroup" aria-label={t("Events")}>
      {EVENTS.map((e) => (
        <button
          key={e}
          type="button"
          role="radio"
          aria-checked={events === e}
          onClick={() => setEvents(e)}
          className={`rounded px-2 py-0.5 text-[12px] ${events === e ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
        >
          {t(EVENT_LABELS[e])}
        </button>
      ))}
    </div>
  );
}

/** Glass opaque, whatever the style says. */
export function ReduceTransparency() {
  const { reduceTransparency } = useTheme();
  return (
    <label className="flex items-center gap-2 text-[12px] text-slate-200">
      <input type="checkbox" checked={reduceTransparency} onChange={(e) => setReduceTransparency(e.target.checked)} className="accent-[var(--color-ai)]" />
      {t("Reduce transparency")}
    </label>
  );
}

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "sx-appearance": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        layout?: string;
        lang?: string;
        axes?: string;
        class?: string;
      };
    }
  }
}
