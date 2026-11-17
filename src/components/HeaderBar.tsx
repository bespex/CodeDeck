import { Tooltip, ToolTipBody } from "./Tooltip";
import { useState, type ReactNode } from "react";
import {
  AppWindow,
  Bug,
  ChevronDown,
  CircleHelp,
  Ellipsis,
  Info,
  Keyboard,
  LayoutList,
  Settings,
  SlidersHorizontal,
  Plug,
  Sparkles,
  SquareTerminal,
  Stethoscope,
} from "lucide-react";
import { appInfo, diagnostics, openUrl, openWindow, toggleOverview, type AssistantState, type ProjectInfo } from "../backend";
import { mainHarness, useConnections } from "../assistant";
import { useAttentionSettings } from "../attention";
import { openDialog } from "../dialogs";
import { lang, setLang, t } from "../i18n";
import { AttentionChoice, isQuiet, QuietChoice } from "./AttentionChoice";
import { HookPanel } from "./AssistantStatus";
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
 * (the app menu), and the switch between sidebar and full window. On the start page "All projects"
 * will take the project's place.
 */
export function HeaderBar(props: Props) {
  return (
    // 43 px plus the border: the same 44 px as the headers beside it, so their lines meet
    <Tooltip
      area
      className="block shrink-0"
      content={
        <ToolTipBody
          says={t("The control room beside your AI tool. At the top you see the open project, your AI tool and the settings. Below: the sessions that wait for you, all sessions of the project with what they are doing, and a summary of what goes with your next prompt.")}
          hint={t("The buttons at the top switch the project, connect your AI tool and change settings.")}
        />
      }
    >
    <header className="zone-tabs relative flex h-[44px] shrink-0 items-center gap-1 border-b border-line bg-panel pr-1.5 pl-1.5">
      <ProjectMenu project={props.project} onOpen={props.onOpenProject} />
      <span className="flex-1" />
      <AssistantMenu assistant={props.assistant} />
      <QuickSettings />
      <AppMenu project={props.project} onToggleLog={props.onToggleLog} assistant={props.assistant} />
      <button
        type="button"
        title={t("Overview of all projects · Ctrl+Shift+L, from anywhere Ctrl+Alt+L")}
        aria-label={t("Overview of all projects")}
        aria-keyshortcuts="Control+Alt+L"
        onClick={() => void toggleOverview()}
        className={iconButton(false)}
      >
        <LayoutList className="size-4" />
      </button>
    </header>
    </Tooltip>
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
 * for this machine. A dot on the button tells that "do not disturb" is on.
 */
function QuickSettings() {
  const menu = usePopover<HTMLDivElement>();
  const [settings] = useAttentionSettings();
  const unusual = isQuiet(settings);
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
          <div className="mt-1 border-t border-overlay-line p-1">
            <Item
              strong
              icon={<Settings className="size-4" />}
              label={t("All settings…")}
              aside={<Key>{`${t("Ctrl")}+,`}</Key>}
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

/**
 * Connecting the AI tool has a button of its own: nothing reaches CodeDeck until it is done, so
 * it is not a setting among others. A dot tells that it is not connected yet.
 */
function AssistantMenu({ assistant }: { assistant: AssistantState }) {
  const menu = usePopover<HTMLDivElement>();
  const hooks = useConnections();
  const harness = mainHarness(assistant);
  const unlinked = hooks.setups !== null && !hooks.connected;
  return (
    <div ref={menu.ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={`${harness.name}: ${hooks.connected ? t("connected") : t("not connected")}`}
        onClick={() => menu.setOpen(!menu.open)}
        className={`${iconButton(menu.open)} ${hooks.connected ? "" : "text-changed"}`}
      >
        {hooks.connected ? <Sparkles className="size-4" /> : <Plug className="size-4" />}
        {unlinked && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-changed" />}
      </button>
      {menu.open && (
        <Panel width="w-[380px]">
          <div className="max-h-[60vh] overflow-y-auto p-3 pt-0 text-[12px] text-slate-300">
            <HookPanel hooks={hooks} harness={harness} heard={assistant.heard} />
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Everything about CodeDeck itself. */
function AppMenu({ project, onToggleLog, assistant }: { project: ProjectInfo | null; onToggleLog: () => void; assistant: AssistantState }) {
  const menu = usePopover<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  // What the backend knows, and what only the window knows; for a bug report or a chat
  const copyDiagnostics = async () => {
    const count = (status: string) => assistant.sessions.filter((s) => s.status === status).length;
    const sessions = `Sessions: ${assistant.sessions.length} (working ${count("working")}, waiting ${count("waiting")}, idle ${count("idle")}, ended ${count("ended")}), heard: ${assistant.heard}`;
    const window = `Window: ${innerWidth}×${innerHeight}, language ${lang}, focused ${document.hasFocus()}`;
    const found = `Found: ${assistant.found.outside.length} left elsewhere, ${assistant.found.pages.length} pages; attachments: ${assistant.attachments.length}`;
    await navigator.clipboard.writeText([(await diagnostics()).trimEnd(), sessions, window, found, `Web view: ${navigator.userAgent}`].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
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
            <Item
              icon={<Stethoscope className="size-4" />}
              label={copied ? t("Copied") : t("Copy diagnostics")}
              onClick={() => void copyDiagnostics()}
            />
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
