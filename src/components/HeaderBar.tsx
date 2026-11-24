import { Tooltip, ToolTipBody } from "./Tooltip";
import { lastSwitch } from "../projectMemory";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Bug,
  Check,
  Plus,
  ChevronDown,
  Globe,
  Hand,
  Info,
  Keyboard,
  LayoutDashboard,
  Menu,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { appInfo, diagnostics, openSettings, openUrl, openWelcome, setProject, startSession, stopSession, type Account, type AssistantState, type ProjectInfo, closeWindow } from "../backend";
import { useAccounts } from "../accounts";
import { useAttentionSettings } from "../attention";
import { openDialog } from "../dialogs";
import { lang, t } from "../i18n";
import { AttentionChoice, isQuiet, QuietChoice } from "./AttentionChoice";
import { HOME_URL, manualUrl, SOURCE_URL } from "./Dialogs";
import { placeOf, usePopover } from "./ProjectHeader";
import { useProjectAccount, useProjectLook } from "../projectLook";
import { AccountMark, inkOn, ProjectMark } from "./ProjectMark";

/**
 * The header of the session column, which stays in every form of CodeDeck: the project of this window,
 * its mark, name and below it, quiet, where it lives, on the project's colour (user, 2026-11-24: it
 * moved here from the head of the project list). The AI account is in the line below (`AssistantLine`).
 */
export function HeaderBar({ project }: { project: ProjectInfo | null }) {
  const look = useProjectLook(project?.path);
  const crumbs = project?.crumbs ?? [];
  const name = crumbs[crumbs.length - 1]?.label ?? project?.root ?? "";
  // The bar takes the project's colour: one look at the top says which project this is
  const fill = look ? (look.mark?.color ?? look.color) : null;
  return (
    <Tooltip area className="block shrink-0" content={<ToolTipBody says={t("The project shown in this window and where it lives. Below: its AI sessions and what goes with your next prompt.")} />}>
      {/* 43 px plus the border: the same 44 px as the headers beside it, so their lines meet */}
      <header className="zone-tabs relative flex h-[44px] shrink-0 items-center gap-2.5 border-b border-line bg-panel pr-3 pl-3" style={fill ? { background: fill, color: inkOn(fill) } : undefined} title={project?.root}>
        {look && <ProjectMark mark={look.mark} color={look.color} name={look.name} size={32} shape="bare" />}
        {project && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className={`truncate text-[14px] font-semibold ${fill ? "" : "text-slate-100"}`}>{name}</span>
            <span className={`truncate font-mono text-[11px] ${fill ? "opacity-70" : "text-slate-500"}`}>{placeOf(project.root)}</span>
          </span>
        )}
      </header>
    </Tooltip>
  );
}

export const iconButton = (on: boolean, onColor = false) =>
  onColor
    ? // On the project's colour: the bar's ink, a darkening for hover
      `relative flex items-center gap-0.5 rounded-md p-1.5 text-current opacity-80 hover:bg-black/15 hover:opacity-100 ${on ? "bg-black/15 opacity-100" : ""}`
    : `relative flex items-center gap-0.5 rounded-md p-1.5 text-slate-400 hover:bg-raised hover:text-slate-100 ${on ? "bg-raised text-slate-100" : ""}`;

/** A menu hanging at the right end of the bar. */
/** A menu under its button, right-aligned with it. Where that would leave the window (a button near
 *  the left edge, e.g. in the project bar top left), it moves right just as far as needed. */
export function Panel({ children, width = "w-[300px]" }: { children: ReactNode; width?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Measured where it stands now; the shift moves it back inside, 4 px from the edge
    const left = r.left - shift;
    setShift(left < 4 ? 4 - left : 0);
  }, []);
  return (
    <div ref={box} role="menu" style={shift ? { transform: `translateX(${shift}px)` } : undefined} className={`surface-overlay absolute top-full right-1.5 z-30 mt-1 overflow-hidden rounded-lg text-[13px] ${width}`}>
      {children}
    </div>
  );
}

export const Heading = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{children}</div>
);

export function Item(props: { icon: ReactNode; label: string; aside?: ReactNode; onClick: () => void; strong?: boolean }) {
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
export function QuickSettings({ onColor = false }: { onColor?: boolean }) {
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
        className={iconButton(menu.open, onColor)}
      >
        <SlidersHorizontal className="size-4" />
        <ChevronDown className={`size-3 ${onColor ? "opacity-70" : "text-slate-500"}`} />
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
          <div className="mt-1 border-t border-overlay-line p-1">
            <Item
              strong
              icon={<Settings className="size-4" />}
              label={t("All settings…")}
              onClick={() => {
                menu.setOpen(false);
                void openSettings();
              }}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

/**
 * Starts a session of this project, always at hand: ▶ takes up the latest conversation again in a
 * new tmux session (nothing starts while one runs there already), ＋ begins a new conversation.
 * Both start with the project's account and Remote Control, as in the overview.
 */
export function StartButtons({ project, canStart }: { project: ProjectInfo | null; canStart: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);
  // Only new conversations start here; an ended one is continued on its own card, where it is clear which
  const start = () =>
    project &&
    startSession(project.path, true)
      .then((name) => setNote(name ? t("Started in tmux {name}", { name }) : t("A session runs there already")))
      .catch((e) => setNote(String(e)));
  // The backend knows: the project's tool starts sessions, and tmux is there (the bell says what lacks)
  if (!canStart) return null;
  return (
    <>
      <button type="button" disabled={!project} title={t("Start a new conversation")} aria-label={t("New session")} onClick={() => void start()} className={iconButton(false)}>
        <Plus className="size-4" />
      </button>
      {note && <p className="selectable surface-overlay absolute top-full right-1.5 z-30 mt-1 max-w-[340px] rounded-md px-2.5 py-1.5 text-[12px] text-slate-200">{note}</p>}
    </>
  );
}

/**
 * The AI account of this project, large: its hexagon, its name, the tool below. A project runs with
 * one account; a click offers the others. Sessions still running with the old one go on until they
 * end (or are stopped here); new ones start with the new one. The model belongs to each session.
 */
export function AccountBlock({ project, assistant }: { project: ProjectInfo | null; assistant: AssistantState }) {
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
        for (const s of runningWith(next.dir).filter((s) => s.actions.includes("stop"))) await stopSession(look.path, s.id, false);
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
  const stoppable = left.filter((s) => s.actions.includes("stop")).length;
  return (
    <div ref={menu.ref} className="min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={account ? `${account.name} · ${account.dir}` : t("No AI account known for this project yet")}
        onClick={() => (menu.open ? close() : menu.setOpen(true))}
        className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] font-semibold text-slate-100 hover:bg-raised ${menu.open ? "bg-raised" : ""}`}
      >
        {account ? <AccountMark account={account} size={18} /> : <Sparkles className="size-4 shrink-0 text-slate-500" />}
        <span className="min-w-0 truncate">{account?.name ?? harness.name}</span>
        <ChevronDown className="size-3 shrink-0 text-slate-500" />
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
                <Item icon={<Settings className="size-4" />} label={t("Set up accounts…")} onClick={() => (close(), void openSettings("tools"))} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              <p className="font-medium text-slate-100">{t("Use {account} for this project?", { account: asking.name })}</p>
              <p className="text-[12px] text-slate-400">
                {t(left.length === 1 ? "1 AI session still runs with another account. New sessions start with {account}." : "{n} AI sessions still run with another account. New sessions start with {account}.", { n: left.length, account: asking.name })}
              </p>
              <button type="button" onClick={() => void choose(asking, false)} className="rounded-md bg-brand-fill px-2.5 py-1 text-left text-[12px] font-medium text-on-accent hover:bg-brand-fill-hover">
                {t("Let them run until they end")}
              </button>
              <button
                type="button"
                disabled={!stoppable}
                title={stoppable < left.length ? t("AI sessions CodeDeck did not start end where they run") : undefined}
                onClick={() => void choose(asking, true)}
                className="rounded-md border border-overlay-line px-2.5 py-1 text-left text-[12px] text-slate-200 hover:bg-overlay-hover disabled:opacity-40"
              >
                {stoppable < left.length ? t("Stop the {n} CodeDeck started now", { n: stoppable }) : t("Stop them now")}
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
/** What the backend knows, what this window knows and `extra` from the caller, into the clipboard:
 *  for a bug report or a chat. Also on the start page, without a project. */
export async function copyDiagnostics(extra: string[] = []) {
  const window = `Window: ${innerWidth}×${innerHeight}, language ${lang}, focused ${document.hasFocus()}`;
  await navigator.clipboard.writeText([(await diagnostics()).trimEnd(), ...extra, window, `Web view: ${navigator.userAgent}`].join("\n"));
}

/** A new issue on GitHub with the version and system filled in. */
export async function reportProblem() {
  const info = await appInfo();
  const body = `\n\n---\nCodeDeck ${info.version}${info.commit ? ` (${info.commit})` : ""} · ${info.os}`;
  void openUrl(`${SOURCE_URL}/issues/new?body=${encodeURIComponent(body)}`);
}

export function AppMenu({ assistant, onColor = false }: { assistant: AssistantState; onColor?: boolean }) {
  const menu = usePopover<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  // What the backend knows, and what only the window knows; for a bug report or a chat
  const copy = async () => {
    const count = (status: string) => assistant.sessions.filter((s) => s.status === status).length;
    const sessions = `Sessions: ${assistant.sessions.length} (working ${count("working")}, waiting ${count("waiting")}, idle ${count("idle")}, ended ${count("ended")}), heard: ${assistant.heard}`;
    const found = `Found: ${assistant.found.outside.length} left elsewhere, ${assistant.found.pages.length} pages; attachments: ${assistant.attachments.length}`;
    const switched = `Last project switch: ${lastSwitch === null ? "none yet" : `${lastSwitch} ms`}`;
    await copyDiagnostics([sessions, found, switched]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const run = (action: () => void) => () => {
    menu.setOpen(false);
    action();
  };
  return (
    <div ref={menu.ref}>
      <button type="button" aria-haspopup="menu" aria-expanded={menu.open} title={t("CodeDeck menu")} onClick={() => menu.setOpen(!menu.open)} className={iconButton(menu.open, onColor)}>
        {/* Not ⋯ (the project list has its own right below) and not the logo, which folds the column (user, 2026-11-24) */}
        <Menu className="size-4" />
      </button>
      {menu.open && (
        <Panel width="w-[270px]">
          {/* Order and names: user, 2026-11-21; git's commands stay at the status bar and Ctrl+Shift+G */}
          <div className="p-1">
            <Item icon={<Info className="size-4" />} label={t("About CodeDeck")} onClick={run(() => openDialog({ kind: "about" }))} />
          </div>
          <div className="border-t border-overlay-line p-1">
            <Item icon={<Hand className="size-4" />} label={t("Welcome and computer check")} onClick={run(() => void openWelcome())} />
            <Item icon={<LayoutDashboard className="size-4" />} label={t("Tutorial: project window")} onClick={run(() => openDialog({ kind: "windowHelp" }))} />
            <Item icon={<Keyboard className="size-4" />} label={t("Tutorial: keyboard shortcuts")} onClick={run(() => openDialog({ kind: "shortcuts" }))} />
          </div>
          <div className="border-t border-overlay-line p-1">
            <Item icon={<BookOpen className="size-4" />} label={t("Manual")} onClick={run(() => void openUrl(manualUrl()))} />
            <Item icon={<Globe className="size-4" />} label={t("Website")} onClick={run(() => void openUrl(HOME_URL))} />
          </div>
          <div className="border-t border-overlay-line p-1">
            <Item
              icon={<Stethoscope className="size-4" />}
              label={copied ? t("Copied") : t("Copy diagnostics")}
              onClick={() => void copy()}
            />
            <Item icon={<Bug className="size-4" />} label={t("Report a problem…")} onClick={run(() => void reportProblem())} />
          </div>
          {/* Closes the window with its project; the last one leaves the start page */}
          <div className="border-t border-overlay-line p-1">
            <Item icon={<X className="size-4" />} label={t("Close project")} aside={<Key>{`${t("Ctrl")}+W`}</Key>} onClick={run(() => void closeWindow())} />
          </div>
        </Panel>
      )}
    </div>
  );
}
