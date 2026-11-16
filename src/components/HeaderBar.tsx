import type { ReactNode } from "react";
import { AppWindow, Bug, ChevronDown, ChevronRight, CircleHelp, Ellipsis, Info, Keyboard, Settings, SlidersHorizontal, Sparkles, SquareTerminal } from "lucide-react";
import { appInfo, openUrl, openWindow, type AssistantState, type ProjectInfo } from "../backend";
import { mainHarness, useConnections } from "../assistant";
import { useAttentionSettings } from "../attention";
import { openDialog } from "../dialogs";
import { lang, setLang, t } from "../i18n";
import { AttentionChoice, isQuiet, QuietChoice } from "./AttentionChoice";
import { SOURCE_URL } from "./Dialogs";
import { ProjectMenu, usePopover, type OpenProject } from "./ProjectHeader";

interface Props {
  project: ProjectInfo | null;
  onOpenProject: OpenProject;
  assistant: AssistantState;
  onToggleLog: () => void;
}

/**
 * The header of the right column, which stays in every form of CodeDeck (docs/KOPFLEISTE.md):
 * where am I (the project), how does CodeDeck behave right now (quick settings), what is CodeDeck
 * (the app menu). Later the sidebar switch joins them, and on the start page "All projects"
 * takes the project's place.
 */
export function HeaderBar(props: Props) {
  return (
    // 43 px plus the border: the same 44 px as the headers beside it, so their lines meet
    <header className="relative flex h-[44px] shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-1.5">
      <ProjectMenu project={props.project} onOpen={props.onOpenProject} />
      <span className="flex-1" />
      <QuickSettings assistant={props.assistant} />
      <AppMenu project={props.project} onToggleLog={props.onToggleLog} />
    </header>
  );
}

const iconButton = (on: boolean) =>
  `relative flex items-center gap-0.5 rounded-md p-1.5 text-slate-400 hover:bg-raised hover:text-slate-100 ${on ? "bg-raised text-slate-100" : ""}`;

/** A menu hanging at the right end of the bar. */
function Panel({ children, width = "w-[300px]" }: { children: ReactNode; width?: string }) {
  return <div role="menu" className={`surface-overlay absolute top-full right-1.5 z-30 mt-1 overflow-hidden rounded-lg text-[13px] ${width}`}>{children}</div>;
}

const Heading = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{children}</div>
);

function Item(props: { icon: ReactNode; label: string; aside?: ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-overlay-hover ${props.strong ? "font-medium text-slate-50" : "text-slate-200"}`}
    >
      <span className="text-slate-400">{props.icon}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.aside}
    </button>
  );
}

const Key = ({ children }: { children: string }) => <kbd className="text-[11px] text-slate-500">{children}</kbd>;

/**
 * What one switches in the course of a day, without a dialog; all takes effect at once and is kept
 * for this machine. A dot on the button tells what is unusual: "do not disturb" on, or the AI tool
 * not connected.
 */
function QuickSettings({ assistant }: { assistant: AssistantState }) {
  const menu = usePopover<HTMLDivElement>();
  const [settings] = useAttentionSettings();
  const { connected, setups } = useConnections();
  const harness = mainHarness(assistant);
  const quiet = isQuiet(settings);
  const unusual = quiet || (setups !== null && !connected);
  const linked = setups?.filter((s) => s.installed).length ?? 0;
  return (
    <div ref={menu.ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={t("Quick settings")}
        onClick={() => menu.setOpen(!menu.open)}
        className={iconButton(menu.open)}
      >
        <SlidersHorizontal className="size-4" />
        <ChevronDown className="size-3 text-slate-500" />
        {unusual && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-changed" />}
      </button>
      {menu.open && (
        <Panel>
          <Heading>{t("Quick settings")}</Heading>
          <div className="flex items-center gap-2 px-3 py-1 text-slate-200">
            <span className="flex-1">{t("Do not disturb")}</span>
            <QuietChoice />
          </div>
          <Heading>{t("Tell me when I look elsewhere")}</Heading>
          <div className="px-3 pb-1">
            <AttentionChoice />
          </div>
          <Heading>{t("Display")}</Heading>
          <div className="flex items-center gap-2 px-3 py-1 text-slate-200">
            <span className="flex-1">{t("Language")}</span>
            <div className="flex rounded-md border border-overlay-line p-0.5" role="radiogroup" aria-label={t("Language")}>
              {(["en", "de"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lang === l}
                  onClick={() => setLang(l)}
                  className={`rounded px-2 py-0.5 text-[12px] ${lang === l ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
                >
                  {l === "en" ? "English" : "Deutsch"}
                </button>
              ))}
            </div>
          </div>
          <Heading>{t("AI tool")}</Heading>
          <div className="px-1">
            <Item
              icon={<Sparkles className="size-4" />}
              label={harness.shortName}
              aside={
                <>
                  <span className={`text-[12px] ${connected ? "text-added" : "text-changed"}`}>{connected ? t("connected") : t("not connected")}</span>
                  {linked > 1 && <span className="text-[11px] text-slate-500">{t("{n} configurations", { n: linked })}</span>}
                  <ChevronRight className="size-3.5 text-slate-500" />
                </>
              }
              onClick={() => {
                menu.setOpen(false);
                openDialog({ kind: "settings", section: "tools" });
              }}
            />
          </div>
          <div className="mt-1 border-t border-overlay-line p-1">
            <Item
              strong
              icon={<Settings className="size-4" />}
              label={t("All settings…")}
              aside={<Key>Ctrl+,</Key>}
              onClick={() => {
                menu.setOpen(false);
                openDialog({ kind: "settings", section: "general" });
              }}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Everything about CodeDeck itself. */
function AppMenu({ project, onToggleLog }: { project: ProjectInfo | null; onToggleLog: () => void }) {
  const menu = usePopover<HTMLDivElement>();
  const run = (action: () => void) => () => {
    menu.setOpen(false);
    action();
  };
  const report = async () => {
    const info = await appInfo();
    const body = `\n\n---\nCodeDeck ${info.version}${info.commit ? ` (${info.commit})` : ""} · ${info.os}`;
    void openUrl(`${SOURCE_URL}/issues/new?body=${encodeURIComponent(body)}`);
  };
  return (
    <div ref={menu.ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={menu.open} title="CodeDeck" onClick={() => menu.setOpen(!menu.open)} className={iconButton(menu.open)}>
        <Ellipsis className="size-[18px]" />
      </button>
      {menu.open && (
        <Panel width="w-[270px]">
          <div className="p-1">
            <Item icon={<Info className="size-4" />} label={t("About CodeDeck")} onClick={run(() => openDialog({ kind: "about" }))} />
            <Item icon={<Keyboard className="size-4" />} label={t("Keyboard shortcuts")} aside={<Key>F1</Key>} onClick={run(() => openDialog({ kind: "shortcuts" }))} />
            <Item icon={<CircleHelp className="size-4" />} label={t("Help")} onClick={run(() => void openUrl(`${SOURCE_URL}#readme`))} />
          </div>
          <div className="border-t border-overlay-line p-1">
            <Item icon={<SquareTerminal className="size-4" />} label={t("Git commands")} aside={<Key>{t("Ctrl+Shift+G")}</Key>} onClick={run(onToggleLog)} />
            <Item icon={<Bug className="size-4" />} label={t("Report a problem…")} onClick={run(() => void report())} />
          </div>
          {project && (
            <div className="border-t border-overlay-line p-1">
              <Item icon={<AppWindow className="size-4" />} label={t("New window")} onClick={run(() => void openWindow(project.path))} />
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
