import { useEffect } from "react";
import { Check } from "lucide-react";
import { previewTheme, rolesOf, setReduceTransparency, setTheme, THEMES, useTheme } from "../theme";
import { t } from "../i18n";

/**
 * The themes to choose from. Pointing at one (or moving to it with the keyboard) shows it in the whole
 * window at once; a click keeps it, leaving the list goes back. Trying one out costs nothing.
 */
export function ThemeChoice() {
  const { theme } = useTheme();
  // A list closed while one is shown on trial (Esc, a click elsewhere): back to the chosen one
  useEffect(() => () => previewTheme(null), []);
  return (
    <div role="radiogroup" aria-label={t("Theme")} className="grid grid-cols-2 gap-1" onMouseLeave={() => previewTheme(null)}>
      {THEMES.map((th) => {
        const r = rolesOf(th);
        const on = th.id === theme;
        return (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={on}
            onMouseEnter={() => previewTheme(th.id)}
            onFocus={() => previewTheme(th.id)}
            onBlur={() => previewTheme(null)}
            onClick={() => setTheme(th.id)}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] hover:bg-overlay-hover ${on ? "text-slate-100" : "text-slate-300"} border border-overlay-line`}
          >
            {/* Ground, text, accent, assistant, waiting: what tells themes apart at a glance */}
            <span className="flex shrink-0 overflow-hidden rounded-sm border border-black/30">
              {[r.panel, r.n[50], r.accent, r.ai, r.wait].map((c, i) => (
                <i key={i} className="block h-3.5 w-2.5" style={{ background: c }} />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">{th.name}</span>
            {on && <Check className="size-3.5 shrink-0 text-ai" />}
          </button>
        );
      })}
    </div>
  );
}

/** Glass opaque, whatever the theme says. */
export function ReduceTransparency() {
  const { reduceTransparency } = useTheme();
  return (
    <label className="flex items-center gap-2 text-[12px] text-slate-200">
      <input type="checkbox" checked={reduceTransparency} onChange={(e) => setReduceTransparency(e.target.checked)} className="accent-[var(--color-ai)]" />
      {t("Reduce transparency")}
    </label>
  );
}
