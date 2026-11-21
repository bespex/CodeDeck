import { useEffect, useState, type ReactNode } from "react";
import { Copy, X } from "lucide-react";
import { openWelcome, appInfo, autostartState, setAutostart, type AutostartState, machineSettings, setMachineSetting, createDesktopProfile, desktopProfiles, setHarnessConnection, live, type Connection, globalShortcuts, onShortcutsChanged, openUrl, setAccount, trashAccount, type Account, type AppInfo, type AssistantState, type GlobalShortcut } from "../backend";
import { useAccounts } from "../accounts";
import { usePlatform } from "../platform";
import { PlatformFacts, platformFacts } from "./PlatformFacts";
import { AccountMark, MarkPicker } from "./ProjectMark";
import { useConnections } from "../assistant";
import { closeDialog, openDialog, useDialog, type SettingsSection } from "../dialogs";
import { lang, setLang, t, T } from "../i18n";
import { ReduceTransparency, ThemeChoice } from "./ThemeChoice";
import { useWindowHelp, WindowHelp } from "./WindowHelp";
import { AttentionChoice, QuietChoice } from "./AttentionChoice";

/** The page of the app; bespex.run/codedeck once the website has moved to bespex.run. */
export const HOME_URL = "https://bespex.github.io/codedeck/";
export const SOURCE_URL = "https://github.com/bespex/CodeDeck";

/** The open dialog, over the whole window. */
export function Dialogs({ assistant }: { assistant: AssistantState }) {
  const dialog = useDialog();
  useWindowHelp();
  if (!dialog) return null;
  if (dialog.kind === "about") return <About />;
  if (dialog.kind === "windowHelp") return <WindowHelp assistant={assistant} />;
  if (dialog.kind === "shortcuts") return <Shortcuts />;
  return <Settings section={dialog.section} assistant={assistant} />;
}

/** A dialog over a dimmed window; Escape or a click beside it closes it. */
export function Modal(props: { title: string; width: string; children: ReactNode; bare?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDialog();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div role="dialog" aria-modal="true" aria-label={props.title} className={`surface-overlay flex max-h-full max-w-full flex-col overflow-hidden rounded-xl text-[13px] text-slate-300 ${props.width}`}>
        {!props.bare && (
          <header className="flex shrink-0 items-center border-b border-overlay-line px-4 py-3">
            <h2 className="text-[14px] font-semibold text-slate-100">{props.title}</h2>
            <button type="button" aria-label={t("Close")} onClick={closeDialog} className="ml-auto rounded p-1 text-slate-400 hover:bg-overlay-hover hover:text-slate-100">
              <X className="size-4" />
            </button>
          </header>
        )}
        {props.children}
      </div>
    </div>
  );
}

/** The wordmark: the name in small letters, which is also the command (D26); "code" in the
 *  brand orange: what the deck is about. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[-0.03em] text-slate-100 ${className}`}>
      <span className="text-brand">code</span>deck
    </span>
  );
}

/** What CodeDeck is, which version, where to find more; the version copied for a bug report. */
function About() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const machine = usePlatform();
  useEffect(() => {
    appInfo().then(setInfo);
  }, []);
  const version = info ? `${info.version}${info.commit ? ` (${info.commit})` : ""}` : "…";
  const link = (label: string, url: string) => (
    <button type="button" onClick={() => openUrl(url)} className="text-[12px] text-brand-soft hover:underline">
      {label}
    </button>
  );
  return (
    <Modal title={t("About CodeDeck")} width="w-[420px]" bare>
      <div className="relative flex flex-col items-center gap-1.5 px-6 pt-7 pb-4 text-center">
        <button type="button" aria-label={t("Close")} onClick={closeDialog} className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-overlay-hover hover:text-slate-100">
          <X className="size-4" />
        </button>
        <img src="/codedeck.svg" alt="" className="mb-1 size-16" />
        {/* The wordmark, what CodeDeck is, and the play on "co" as its motto (D26) */}
        <Wordmark className="text-[34px] leading-none" />
        <p className="text-slate-400">
          <span className="font-medium text-slate-200">CodeDeck</span> – {t("AI session radar for Linux")}
        </p>
        <p className="text-[12px] text-slate-500 italic">{t("Your co-deck for AI sessions")}</p>
        <p className="text-[12px] text-slate-500">{t("Version {version}", { version })}</p>
        {/* What CodeDeck found here: what a missing button is missing (docs/SITZUNGEN-PRUEFUNG.md S3) */}
        <div className="mt-2 w-full rounded-md bg-panel px-3 py-2 text-left">
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{t("Detected on this computer")}</div>
          <PlatformFacts platform={machine} />
        </div>
        <div className="mt-1 flex gap-3">
          {link(t("Website"), HOME_URL)}
          {link(t("Source code"), SOURCE_URL)}
          {link(t("License: MIT"), `${SOURCE_URL}/blob/main/LICENSE`)}
        </div>
      </div>
      <footer className="flex items-center border-t border-overlay-line px-4 py-2.5">
        <button
          type="button"
          disabled={!info}
          onClick={() => {
            void navigator.clipboard.writeText(`CodeDeck ${version} · ${info?.os} · ${platformFacts(machine).map((f) => `${f.label}: ${f.value}`).join(" · ")} · ${navigator.userAgent}`);
            setCopied(true);
          }}
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
        >
          <Copy className="size-3.5" />
          {copied ? t("Copied") : t("Copy version")}
        </button>
        <span className="ml-auto font-extrabold tracking-[-0.03em] text-slate-100">
          <span className="text-brand">be</span> spex
        </span>
      </footer>
    </Modal>
  );
}

/** The global shortcuts and who holds them; read again when that changes. */
function useGlobalShortcuts(): GlobalShortcut[] {
  const [keys, setKeys] = useState<GlobalShortcut[]>([]);
  useEffect(() => {
    const load = () => void globalShortcuts().then(setKeys);
    load();
    return onShortcutsChanged(load);
  }, []);
  return keys;
}

/** What the global shortcut does (there is one, Ctrl+Alt+L). */
const shortcutAction = () => t("CodeDeck to the front from anywhere, or away when it is in front; without a project window the start page");

/** Says when a global shortcut does not work; CodeDeck holds it for all its windows. */
function ShortcutState({ shortcut }: { shortcut: GlobalShortcut }) {
  if (shortcut.state === "taken") return <span className="text-changed">{t("Taken by another program: it does nothing.")}</span>;
  if (shortcut.state === "unsupported") return <UnsupportedShortcut />;
  return null;
}

/** Under Wayland: the way that works instead, a key bound in the desktop to `codedeck --toggle`. */
function UnsupportedShortcut() {
  const command = usePlatform().toggleCommand;
  return (
    <span className="text-slate-500">
      {t("This desktop has no global shortcuts (Wayland). Instead, bind this to a key in its keyboard settings:")}{" "}
      <code className="selectable rounded bg-base/70 px-1 font-mono text-[11px] text-slate-300">{command}</code>
    </span>
  );
}

/** The keyboard shortcuts and mouse gestures CodeDeck knows. */
function Shortcuts() {
  const global = useGlobalShortcuts();
  const rows: [string, ReactNode][] = [
    ...global.map((s): [string, ReactNode] => [
      s.keys.replace("Ctrl", t("Ctrl")),
      <>
        {shortcutAction()} <span className="text-slate-500">· {t("also when CodeDeck has no focus")}</span>
        <div className="text-[12px]">
          <ShortcutState shortcut={s} />
        </div>
      </>,
    ]),
    [`${t("Ctrl")}+B`, t("Fold or show the file list")],
    [`${t("Ctrl")}+W`, t("Close project (its window; the last one leaves the start page)")],
    [`${t("Ctrl")}+Tab`, t("Back to the project shown before")],
    [`${t("Ctrl")}+G`, t("Git actions of the project's repository: commit, pull, push, fetch")],
    [t("Ctrl+Shift+G"), t("Git commands CodeDeck ran")],
    [t("Ctrl+Shift+L"), t("Fold or show the project list")],
    [t("Ctrl+click"), t("On a project or folder: open it in a new window. On the trail: compare with the point shown")],
    [t("Middle click"), t("On a file: edit it. On a project: open it in a new window")],
    [t("Ctrl+Enter"), t("Commit, or save a line comment")],
    ["Esc", t("Close a menu or dialog")],
    [t("Shift+right click"), t("The web view's own menu (developer tools)")],
  ];
  return (
    <Modal title={t("Keyboard shortcuts")} width="w-[560px]">
      <table className="m-4 text-[13px]">
        <tbody>
          {rows.map(([key, what]) => (
            <tr key={key} className="border-b border-overlay-line/60 last:border-0">
              <td className="py-1.5 pr-4 align-top whitespace-nowrap">
                <kbd className="rounded border border-overlay-line bg-base px-1.5 py-0.5 font-mono text-[11px] text-slate-200">{key}</kbd>
              </td>
              <td className="py-1.5 text-slate-300">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

const SECTIONS: [SettingsSection, string][] = [
  ["general", "General"],
  ["interface", "Interface"],
  ["notifications", "Notifications"],
  ["tools", "Coding agents"],
];

/**
 * All settings, by area. Each says what it applies to; a change takes effect at once, there is
 * nothing to save. Areas come as their values become settable (docs/KOPFLEISTE.md).
 */
function Settings({ section, assistant }: { section: SettingsSection; assistant: AssistantState }) {
  return (
    <Modal title={t("Settings")} width="w-[760px] h-[520px]">
      {/* In the sidebar the areas come as a row above the settings */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-overlay-line p-2 sm:block sm:w-44 sm:border-r sm:border-b-0">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => openDialog({ kind: "settings", section: id })}
              className={`block shrink-0 rounded-md px-2.5 py-1.5 text-left whitespace-nowrap sm:w-full ${section === id ? "bg-overlay-hover text-slate-50" : "text-slate-300 hover:bg-overlay-hover/60"}`}
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {section === "general" && <General />}
          {section === "interface" && <Interface />}
          {section === "notifications" && <Notifications />}
          {section === "tools" && <Tools assistant={assistant} />}
        </div>
      </div>
    </Modal>
  );
}

/** One setting: what it is, a sentence why, the control, and what it applies to. */
function Setting(props: { label: string; note?: string; scope: "machine" | "project"; children: ReactNode }) {
  return (
    // Narrow (the sidebar): one below the other
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-overlay-line/60 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div>
        <div className="text-slate-100">{props.label}</div>
        {props.note && <div className="text-[12px] text-slate-500">{props.note}</div>}
      </div>
      <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">{props.children}</div>
      <span className="col-start-2 row-start-1 self-start rounded-full sm:col-start-auto sm:row-start-auto sm:self-center border border-overlay-line px-2 text-center text-[11px] whitespace-nowrap text-slate-400">
        {props.scope === "machine" ? t("this computer") : t("this project")}
      </span>
    </div>
  );
}

/** CodeDeck at login: not at all, or in the tray without a window (an entry in the desktop's autostart folder). */
function AtLogin() {
  const [state, setState] = useState<AutostartState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void autostartState().then(setState).catch((e) => setError(String(e))), []);
  const choose = (on: boolean) => {
    setError(null);
    void setAutostart(on)
      .then(setState)
      .catch((e) => setError(String(e)));
  };
  const on = !!state?.on;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex rounded-md border border-overlay-line p-0.5" role="radiogroup" aria-label={t("At login")}>
        {(
          [
            [false, t("Off")],
            [true, t("In the tray")],
          ] as const
        ).map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on === v}
            // A development build cannot be the entry (the backend refuses it too); turning it off still works
            disabled={!state || (v && state.dev)}
            onClick={() => choose(v)}
            className={`rounded px-2 py-0.5 text-[12px] ${on === v ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* An entry with a development build shows empty windows at login: the dev server is not running then */}
      {state?.needs_server && (
        <span className="max-w-64 text-right text-[11px] break-all text-problem">
          {t("Starts the development build {program}. It needs the dev server, so its windows stay empty at login.", { program: state.program ?? "" })}
        </span>
      )}
      {state?.dev && !state.on && <span className="max-w-64 text-right text-[11px] text-slate-500">{t("A development build cannot start at login. Use an installed CodeDeck.")}</span>}
      {/* Another installation in the entry (a build, a package): say which, choosing again takes this one */}
      {state?.on && !state.this && !state.needs_server && !state.dev && state.program && (
        <span className="max-w-64 text-right text-[11px] break-all text-changed">{t("Starts {program}. Choose “In the tray” again for this one.", { program: state.program })}</span>
      )}
      {error && <span className="selectable max-w-64 text-right text-[11px] text-problem">{error}</span>}
    </div>
  );
}

/** Today's list when CodeDeck starts ("at start", docs/SITZUNGEN.md A12): left alone, or its sessions start. */
function TodayAtStart() {
  const [on, setOn] = useState(false);
  useEffect(() => void machineSettings().then((m) => setOn(m.startTodayAtStart === true)), []);
  const choose = (v: boolean) => {
    setOn(v);
    void setMachineSetting("startTodayAtStart", v || null);
  };
  return (
    <div className="flex rounded-md border border-overlay-line p-0.5" role="radiogroup" aria-label={t("Today's list")}>
      {(
        [
          [false, t("Off")],
          [true, t("Start with CodeDeck")],
        ] as const
      ).map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={on === v}
          onClick={() => choose(v)}
          className={`rounded px-2 py-0.5 text-[12px] ${on === v ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The screen CodeDeck opens on: the main one, or wherever the window manager puts it. */
function StartScreen() {
  const [value, setValue] = useState<"primary" | "last">("primary");
  useEffect(() => void machineSettings().then((m) => setValue(m.startMonitor === "last" ? "last" : "primary")), []);
  const choose = (v: "primary" | "last") => {
    setValue(v);
    void setMachineSetting("startMonitor", v === "primary" ? null : v);
  };
  return (
    <div className="flex rounded-md border border-overlay-line p-0.5" role="radiogroup" aria-label={t("Starts on")}>
      {(
        [
          ["primary", t("Main screen")],
          ["last", t("Where the system puts it")],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => choose(v)}
          className={`rounded px-2 py-0.5 text-[12px] ${value === v ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function General() {
  const global = useGlobalShortcuts();
  return (
    <>
      <h3 className="mb-1 font-semibold text-slate-100">{t("General")}</h3>
      <Setting
        label={t("At login")}
        note={t("CodeDeck starts without a window and hears your AI sessions from the start; the tray icon brings it to the front.")}
        scope="machine"
      >
        <AtLogin />
      </Setting>
      <Setting
        label={t("Today's list")}
        note={t("When CodeDeck starts (also at login), every project on today's list without a running AI session starts its session, as ▶ in the project list does. Nothing starts twice.")}
        scope="machine"
      >
        <TodayAtStart />
      </Setting>
      <Setting label={t("Welcome")} note={t("What CodeDeck looked for on this computer and what it does for CodeDeck; shown at every start until you turn it off there.")} scope="machine">
        <button type="button" onClick={() => void openWelcome()} className="rounded px-1.5 py-0.5 text-[12px] text-brand-soft hover:underline">
          {t("Show")}
        </button>
      </Setting>
      <Setting label={t("Starts on")} note={t("The screen CodeDeck opens on. Windows opened later follow the start page.")} scope="machine">
        <StartScreen />
      </Setting>
      <Setting
        label={t("Global shortcuts")}
        note={t("Work also when CodeDeck has no focus or is hidden. With several windows one of them holds them and acts for all.")}
        scope="machine"
      >
        <div className="flex flex-col gap-1 text-[12px]">
          {global.map((s) => (
            <div key={s.keys} className="flex flex-col">
              <span className="flex items-center gap-2 whitespace-nowrap">
                <kbd className="rounded border border-overlay-line bg-base px-1.5 py-0.5 font-mono text-[11px] text-slate-200">{s.keys.replace("Ctrl", t("Ctrl"))}</kbd>
                <span className="text-slate-300">{t("to the front")}</span>
              </span>
              <ShortcutState shortcut={s} />
            </div>
          ))}
        </div>
      </Setting>
    </>
  );
}

/** How CodeDeck looks and speaks: language, theme, transparency. */
function Interface() {
  return (
    <>
      <h3 className="mb-1 font-semibold text-slate-100">{t("Interface")}</h3>
      <Setting label={t("Language")} note={t("Follows the system until chosen here. What the assistant gets stays in English.")} scope="machine">
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
      </Setting>
      <Setting label={t("Theme")} note={t("A click chooses it. Colours keep their meaning in every theme.")} scope="machine">
        <ThemeChoice />
      </Setting>
      <Setting label={t("Transparency")} note={t("Menus and popups of some themes let a blurred picture of what is behind them through.")} scope="machine">
        <ReduceTransparency />
      </Setting>
    </>
  );
}

function Notifications() {
  return (
    <>
      <h3 className="mb-1 font-semibold text-slate-100">{t("Notifications")}</h3>
      <Setting label={t("Do not disturb")} note={t("No taskbar and no notification for a while; the window title still counts.")} scope="machine">
        <QuietChoice />
      </Setting>
      <Setting label={t("Tell me when I look elsewhere")} note={t("While CodeDeck is hidden or another window has the focus.")} scope="machine">
        <AttentionChoice />
      </Setting>
    </>
  );
}

/** One account: its name and colour, the desktop app's profile, what its folder is (step 3.2). */
function AccountRow({ account, profiles, connection, hasProfiles }: { account: Account; profiles: string[]; connection: Connection | undefined; hasProfiles: boolean }) {
  const hooks = useConnections();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = (install: boolean) => run(async () => hooks.update(await setHarnessConnection(account.harness, account.dir, install)));
  const button = "shrink-0 rounded-md px-2.5 py-0.5 text-[12px] font-medium disabled:opacity-40";
  const [name, setName] = useState(account.name);
  const [confirm, setConfirm] = useState(false);
  const [picking, setPicking] = useState(false);
  useEffect(() => setName(account.name), [account.name]);
  const home = (p: string) => p.replace(/^\/home\/[^/]+/, "~");
  const options = [...new Set([...profiles, ...(account.desktopProfile ? [account.desktopProfile] : [])])];
  return (
    <li className="flex flex-col gap-2 border-b border-overlay-line/60 py-3">
      <div className="flex items-center gap-2">
        {/* A hexagon: accounts never look like projects (circles) or sessions */}
        <button type="button" title={t("Change mark and colour…")} onClick={() => setPicking(true)} className="mark-switch flex shrink-0">
          <AccountMark account={account} size={22} />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== account.name && void setAccount(account.dir, "name", name)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={t("Name")}
          className="w-40 rounded-md border border-overlay-line bg-base px-2 py-0.5 text-slate-100 outline-none focus:border-slate-500"
        />
        <span className="truncate font-mono text-[12px] text-slate-500" title={account.dir}>
          {home(account.dir)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* Said in words: the button names the action, the dot and word the state */}
          <span className={`flex items-center gap-1.5 text-[11px] font-medium ${account.connected ? "text-added" : "text-slate-400"}`}>
            <span className={`size-2 rounded-full ${account.connected ? "bg-added" : "bg-slate-600"}`} />
            {account.connected ? t("Connected") : t("Not connected")}
          </span>
          {connection?.other && (
            <button type="button" disabled={busy} onClick={() => void connect(true)} className={`${button} bg-brand-fill text-on-accent hover:bg-brand-fill-hover`}>
              {t("Use this one")}
            </button>
          )}
          {account.connected ? (
            <button type="button" disabled={busy} onClick={() => void connect(false)} className={`${button} border border-overlay-line hover:bg-overlay-hover`}>
              {t("Disconnect")}
            </button>
          ) : (
            <button type="button" disabled={busy || !live} onClick={() => void connect(true)} className={`${button} bg-brand-fill text-on-accent hover:bg-brand-fill-hover`}>
              {t("Connect")}
            </button>
          )}
        </span>
      </div>
      {connection?.other && <p className="pl-8 text-[11px] text-changed">{t("runs another CodeDeck: {other}", { other: connection.other })}</p>}
      {error && <p className="selectable pl-8 text-[12px] text-problem">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
        {hasProfiles && (
        <label className="flex items-center gap-2 text-[12px] text-slate-400">
          {t("Desktop App Profile")}
          <select
            value={account.desktopProfile ?? ""}
            onChange={(e) => void setAccount(account.dir, "desktopProfile", e.target.value || null)}
            className="rounded-md border border-overlay-line bg-base px-1.5 py-0.5 text-slate-200"
          >
            <option value="">{t("the app's default")}</option>
            {options.map((p) => (
              <option key={p} value={p}>
                {home(p)}
              </option>
            ))}
          </select>
        </label>
        )}
        {hasProfiles && (
          <button
            type="button"
            disabled={busy || !live}
            title={t("Starts the desktop app with a folder of its own. Sign in there with this account; CodeDeck keeps the profile for it.")}
            onClick={() => void run(() => createDesktopProfile(account.dir))}
            className="text-[12px] text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline disabled:opacity-40"
          >
            {t("Create a new profile…")}
          </button>
        )}
        {account.kind !== "used" &&
          (confirm ? (
            <span className="flex items-center gap-2 text-[12px]">
              <span className="text-changed">{t("Move {folder} to the trash?", { folder: home(account.dir) })}</span>
              <button type="button" onClick={() => void trashAccount(account.dir)} className="rounded-md bg-problem px-2 py-0.5 text-white">
                {t("Move to trash")}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-md border border-overlay-line px-2 py-0.5 text-slate-300">
                {t("Cancel")}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="text-[12px] text-slate-400 underline-offset-2 hover:text-slate-100 hover:underline">
              {t("Delete folder…")}
            </button>
          ))}
      </div>
      {picking && (
        <MarkPicker
          name={account.name}
          color={account.color}
          mark={account.mark ? { ...account.mark, color: account.color } : { kind: "letter", color: account.color }}
          shape="hexagon"
          note={t("Shows at the projects and AI sessions of this account")}
          onCancel={() => setPicking(false)}
          onDone={(mark) => {
            // The colour is the account's own, the mark keeps only its sign
            if (mark?.color && mark.color !== account.color) void setAccount(account.dir, "color", mark.color);
            void setAccount(account.dir, "mark", mark && mark.kind !== "letter" ? { kind: mark.kind, value: mark.value } : null);
            setPicking(false);
          }}
        />
      )}
    </li>
  );
}

/**
 * The AI tools, each with its accounts: connecting, name, mark and colour, the desktop app's
 * profile, backups to delete (step 3.2). One page, so a tool and what belongs to it stay together.
 */
function Tools({ assistant }: { assistant: AssistantState }) {
  const hooks = useConnections();
  const accounts = useAccounts();
  const [profiles, setProfiles] = useState<string[]>([]);
  useEffect(() => void desktopProfiles().then(setProfiles), []);
  const command = hooks.setups?.[0]?.command;
  return (
    <>
      {assistant.harnesses.map((h) => {
        const own = accounts.filter((a) => a.harness === h.id);
        return (
          <section key={h.id} className="mb-6">
            <h3 className="mb-1 font-semibold text-slate-100">{h.name}</h3>
            <p className="text-[12px] text-slate-500">
              {t("Each configuration of {tool} is an account: its name, mark and colour show at projects and sessions.", { tool: h.name })}{" "}
              <T
                text="Connecting adds hooks to its settings that run {command}: they tell CodeDeck which AI session works where and which files it writes, and let CodeDeck keep a snapshot before the first write of a turn. Nothing else in the file changes; the file as it was is kept next to it."
                command={<code className="font-mono text-[11px]">{command ?? "codedeck hook"}</code>}
              />
            </p>
            {own.length ? (
              <ul>
                {own.map((a) => (
                  <AccountRow key={a.dir} account={a} profiles={profiles} hasProfiles={h.capabilities.desktopProfiles} connection={hooks.setups?.find((c) => c.harness === a.harness && c.dir === a.dir)} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[12px] text-slate-500">{t("No configuration found.")}</p>
            )}
          </section>
        );
      })}
    </>
  );
}
