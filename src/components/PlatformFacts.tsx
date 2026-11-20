import { Check, X } from "lucide-react";
import type { Platform } from "../backend";
import { t } from "../i18n";

export interface Fact {
  label: string;
  value: string;
  ok: boolean;
  /** What is missing means for the user, and what helps */
  note?: string;
}

/** What CodeDeck found on this computer, one line each, with what a gap means (docs/SITZUNGEN-PRUEFUNG.md S3). */
export function platformFacts(p: Platform): Fact[] {
  return [
    {
      label: "tmux",
      value: p.tmux ?? t("not installed"),
      ok: p.tmux !== null,
      note: p.tmux === null ? t("Sessions are started and continued in tmux: without it, ▶ and Continue are not offered. Install the package tmux and restart CodeDeck.") : undefined,
    },
    {
      label: t("Terminal"),
      value: p.terminal ?? t("none found"),
      ok: p.terminal !== null,
      note: p.terminal === null ? t("No session can be opened in a terminal from here. Install a terminal program or set $TERMINAL, then restart CodeDeck.") : undefined,
    },
    {
      label: t("Window system"),
      value: p.wayland ? "Wayland" : p.raiseWindows ? "X11" : t("unknown"),
      ok: p.raiseWindows,
      note: p.raiseWindows ? undefined : t("The window of a session started by hand in a terminal cannot be brought to the front: switch to it yourself. Sessions in tmux open as usual."),
    },
    { label: t("Desktop"), value: p.desktop.replace(/^X-/, "") || t("unknown"), ok: true },
    {
      label: t("Global shortcuts"),
      value: p.globalShortcuts ? t("possible") : t("not possible"),
      ok: p.globalShortcuts,
      note: p.globalShortcuts ? undefined : t("The desktop does not let programs hold global shortcuts. Use the tray icon or the taskbar."),
    },
    {
      label: t("Tray"),
      value: p.tray ? t("available") : t("no tray host"),
      ok: p.tray,
      note: p.tray ? undefined : t("The tray icon is not shown (on GNOME it needs the AppIndicator extension). The windows work without it."),
    },
  ];
}

/** The facts as a list; `notes`: with what a gap means, under its line. */
export function PlatformFacts({ platform, notes = true }: { platform: Platform; notes?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      {platformFacts(platform).map((f) => (
        <div key={f.label} className="flex flex-col text-[12px]">
          <div className={`flex items-center gap-2 ${f.ok ? "text-slate-200" : "text-slate-300"}`}>
            {f.ok ? <Check className="size-3.5 shrink-0 text-added" /> : <X className="size-3.5 shrink-0 text-changed" />}
            <span className="w-36 shrink-0 text-slate-400">{f.label}</span>
            <span className="min-w-0 truncate">{f.value}</span>
          </div>
          {notes && f.note && <p className="mb-1 pl-[22px] text-[11px] text-slate-400">{f.note}</p>}
        </div>
      ))}
    </div>
  );
}
