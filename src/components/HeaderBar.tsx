import { Tooltip, ToolTipBody } from "./Tooltip";
import { useState, type ReactNode } from "react";
import {
  Bug,
  Check,
  ChevronDown,
  CircleHelp,
  Ellipsis,
  Info,
  Keyboard,
  LayoutList,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Stethoscope,
} from "lucide-react";
import { appInfo, diagnostics, openUrl, setProject, stopSession, toggleOverview, type Account, type AssistantState, type ProjectInfo } from "../backend";
import { useAccounts } from "../accounts";
import { useAttentionSettings } from "../attention";
import { openDialog } from "../dialogs";
import { lang, setLang, t } from "../i18n";
import { AttentionChoice, isQuiet, QuietChoice } from "./AttentionChoice";
import { SOURCE_URL } from "./Dialogs";
import { usePopover, type OpenProject } from "./ProjectHeader";
import { useProjectAccount, useProjectLook } from "../projectLook";
import { AccountMark } from "./ProjectMark";

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
          says={t("The control room beside your AI tool. At the top you see the AI account of this project and the settings. Below: the sessions that wait for you, all sessions of the project with what they are doing, and a summary of what goes with your next prompt.")}
          hint={t("The buttons at the top change settings and switch to the overview.")}
        />
      }
    >
    <header className="zone-tabs relative flex h-[44px] shrink-0 items-center gap-1 border-b border-line bg-panel pr-1.5 pl-1.5">
      <AccountBlock project={props.project} assistant={props.assistant} />
      <span className="flex-1" />
      <QuickSettings />
      <AppMenu onToggleLog={props.onToggleLog} assistant={props.assistant} />
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
 * The AI account of this project, large: its hexagon, its name, the tool below. A project runs with
 * one account; a click offers the others. Sessions still running with the old one go on until they
 * end (or are stopped here); new ones start with the new one. The model belongs to each session.
 */
function AccountBlock({ project, assistant }: { project: ProjectInfo | null; assistant: AssistantState }) {
  const menu = usePopover<HTMLDivElement>();
  const look = useProjectLook(project?.path);
  const { account, harness } = useProjectAccount(assistant, look);
  const accounts = useAccounts().filter((a) => a.kind !== "backup");
  const [asking, setAsking] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Running with another account than the chosen one: what a switch would leave behind
  const runningWith = (dir: string | undefined) =>
    assistant.sessions.filter((s) => s.status !== "ended" && s.alive !== false && s.account && s.account !== dir);
  const close = () => {
    menu.setOpen(false);
    setAsking(null);
    setError(null);
  };
  const choose = async (next: Account, stop: boolean) => {
    if (!look) return;
    try {
      if (stop) {
        for (const s of runningWith(next.dir).filter((s) => s.place?.tmux?.session)) await stopSession(look.path, s.id, false);
      }
      await setProject(look.path, "account", next.dir);
      close();
    } catch (e) {
      setError(String(e));
    }
  };
  const pick = (next: Account) => (runningWith(next.dir).length ? setAsking(next) : void choose(next, false));
  const tools = assistant.harnesses.filter((h) => accounts.some((a) => a.harness === h.id));
  const left = asking ? runningWith(asking.dir) : [];
  const stoppable = left.filter((s) => s.place?.tmux?.session).length;
  return (
    <div ref={menu.ref} className="min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={account ? `${account.name} · ${account.dir}` : t("No AI account known for this project yet")}
        onClick={() => (menu.open ? close() : menu.setOpen(true))}
        className={`flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-raised ${menu.open ? "bg-raised" : ""}`}
      >
        {account ? <AccountMark account={account} size={28} /> : <Sparkles className="size-6 text-slate-500" />}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-1 truncate text-[14px] font-semibold text-slate-100">
            {account?.name ?? harness.name}
            <ChevronDown className="size-3 shrink-0 text-slate-500" />
          </span>
          <span className="truncate text-[11px] text-slate-500">{account ? harness.name : t("no account chosen")}</span>
        </span>
      </button>
      {menu.open && (
        <div role="menu" className="surface-overlay absolute top-full left-1.5 z-30 mt-1 w-[300px] overflow-hidden rounded-lg p-1 text-[13px]">
          {!asking ? (
            <>
              <p className="px-2 pt-1.5 pb-1 text-[11px] text-slate-500">{t("This project's sessions run with")}</p>
              {tools.map((h) => (
                <div key={h.id}>
                  {tools.length > 1 && <Heading>{h.name}</Heading>}
                  {accounts
                    .filter((a) => a.harness === h.id)
                    .map((a) => (
                      <button key={a.dir} type="button" role="menuitem" title={a.dir} onClick={() => a.dir !== account?.dir && pick(a)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-slate-200 hover:bg-overlay-hover">
                        <AccountMark account={a} size={18} />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        {a.dir === account?.dir && <Check className="size-3.5 text-slate-300" />}
                      </button>
                    ))}
                </div>
              ))}
              <div className="mt-1 border-t border-overlay-line pt-1">
                <Item icon={<Settings className="size-4" />} label={t("Set up accounts…")} onClick={() => (close(), openDialog({ kind: "settings", section: "tools" }))} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <p className="font-medium text-slate-100">{t("Use {account} for this project?", { account: asking.name })}</p>
              <p className="text-[12px] text-slate-400">
                {t(left.length === 1 ? "1 session still runs with another account. New sessions start with {account}." : "{n} sessions still run with another account. New sessions start with {account}.", { n: left.length, account: asking.name })}
              </p>
              <button type="button" onClick={() => void choose(asking, false)} className="rounded-md bg-brand-fill px-2.5 py-1 text-left text-[12px] font-medium text-on-accent hover:bg-brand-fill-hover">
                {t("Let them run until they end")}
              </button>
              <button
                type="button"
                disabled={!stoppable}
                title={stoppable < left.length ? t("Sessions started by hand end where they run") : undefined}
                onClick={() => void choose(asking, true)}
                className="rounded-md border border-overlay-line px-2.5 py-1 text-left text-[12px] text-slate-200 hover:bg-overlay-hover disabled:opacity-40"
              >
                {stoppable < left.length ? t("Stop the {n} in tmux now", { n: stoppable }) : t("Stop them now")}
              </button>
              <button type="button" onClick={() => setAsking(null)} className="self-start text-[12px] text-slate-400 hover:text-slate-200">
                {t("Back")}
              </button>
              {error && <p className="selectable text-[12px] text-problem">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Everything about CodeDeck itself. */
function AppMenu({ onToggleLog, assistant }: { onToggleLog: () => void; assistant: AssistantState }) {
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
        </Panel>
      )}
    </div>
  );
}
