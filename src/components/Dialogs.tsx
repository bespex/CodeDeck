import { useEffect, useState, type ReactNode } from "react";
import { Copy, X } from "lucide-react";
import { appInfo, globalShortcuts, onShortcutsChanged, openUrl, type AppInfo, type AssistantState, type GlobalShortcut } from "../backend";
import { mainHarness, useConnections } from "../assistant";
import { closeDialog, openDialog, useDialog, type SettingsSection } from "../dialogs";
import { lang, setLang, t } from "../i18n";
import { ReduceTransparency, ThemeChoice } from "./ThemeChoice";
import { HookPanel } from "./AssistantStatus";
import { AttentionChoice, QuietChoice } from "./AttentionChoice";

/** The page of the app; the address codedeck.bespex.run follows once the domain is set up. */
export const HOME_URL = "https://bespex.github.io/codedeck/";
export const SOURCE_URL = "https://github.com/bespex/CodeDeck";

/** The open dialog, over the whole window. */
export function Dialogs({ assistant }: { assistant: AssistantState }) {
  const dialog = useDialog();
  // Ctrl+, opens the settings, F1 the keyboard shortcuts, from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        openDialog({ kind: "settings", section: "general" });
      } else if (e.key === "F1") {
        e.preventDefault();
        openDialog({ kind: "shortcuts" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!dialog) return null;
  if (dialog.kind === "about") return <About />;
  if (dialog.kind === "shortcuts") return <Shortcuts />;
  return <Settings section={dialog.section} assistant={assistant} />;
}

/** A dialog over a dimmed window; Escape or a click beside it closes it. */
function Modal(props: { title: string; width: string; children: ReactNode; bare?: boolean }) {
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

/** The wordmark: two colours only, the part where code and deck meet in the brand orange. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[-0.03em] text-slate-100 ${className}`}>
      co<span className="text-brand">de</span>ck
    </span>
  );
}

/** What CodeDeck is, which version, where to find more; the version copied for a bug report. */
function About() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);
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
    <Modal title={t("About CodeDeck")} width="w-[380px]" bare>
      <div className="relative flex flex-col items-center gap-1.5 px-6 pt-7 pb-4 text-center">
        <button type="button" aria-label={t("Close")} onClick={closeDialog} className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-overlay-hover hover:text-slate-100">
          <X className="size-4" />
        </button>
        <img src="/codedeck.svg" alt="" className="mb-1 size-16" />
        {/* Like a dictionary entry: the wordmark with how it is said, then the full name it is made
            of (the "de" Code and Deck share, in the brand orange) and what it is */}
        {/* The pronunciation hangs beside it, so the wordmark stays in the middle */}
        <div className="relative">
          <Wordmark className="text-[34px] leading-none" />
          <span className="absolute bottom-0.5 left-full ml-2 font-mono text-[12px] whitespace-nowrap text-slate-500" title={t("How codeck is said")}>
            /ˈkoʊdɛk/
          </span>
        </div>
        <p className="text-slate-400">
          <span className="font-medium text-slate-200">
            Co<span className="text-brand-soft">de</span>
            <span className="text-brand-soft">De</span>ck
          </span>{" "}
          – {t("AI session radar for Linux")}
        </p>
        <p className="text-[12px] text-slate-500">{t("Version {version}", { version })}</p>
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
            void navigator.clipboard.writeText(`CodeDeck ${version} · ${info?.os} · ${navigator.userAgent}`);
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

const shortcutAction = (s: GlobalShortcut) =>
  s.action === "showHide" ? t("Show CodeDeck, or hide it when it is in front") : t("Sidebar or full window, from anywhere");

/** Says when a global shortcut does not work; CodeDeck holds it for all its windows. */
function ShortcutState({ shortcut }: { shortcut: GlobalShortcut }) {
  if (shortcut.state === "taken") return <span className="text-changed">{t("Taken by another program: it does nothing.")}</span>;
  if (shortcut.state === "unsupported") return <span className="text-slate-500">{t("This desktop has no global shortcuts (Wayland).")}</span>;
  return null;
}

/** The keyboard shortcuts and mouse gestures CodeDeck knows. */
function Shortcuts() {
  const global = useGlobalShortcuts();
  const rows: [string, ReactNode][] = [
    ...global.map((s): [string, ReactNode] => [
      s.keys.replace("Ctrl", t("Ctrl")),
      <>
        {shortcutAction(s)} <span className="text-slate-500">· {t("also when CodeDeck has no focus")}</span>
        <div className="text-[12px]">
          <ShortcutState shortcut={s} />
        </div>
      </>,
    ]),
    [t("Ctrl+O"), t("Open a folder as project")],
    [t("Ctrl+Shift+O"), t("Open a folder in a new window")],
    [`${t("Ctrl")}+,`, t("Settings")],
    ["F1", t("This overview")],
    [t("Ctrl+Shift+G"), t("Git commands CodeDeck ran")],
    [t("Ctrl+Shift+L"), t("Switch between sidebar and full window")],
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
  ["notifications", "Notifications"],
  ["tools", "AI tools"],
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

function General() {
  const global = useGlobalShortcuts();
  return (
    <>
      <h3 className="mb-1 font-semibold text-slate-100">{t("General")}</h3>
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
      <Setting label={t("Theme")} note={t("Point at one to see it; a click keeps it. Colours keep their meaning in every theme.")} scope="machine">
        <ThemeChoice />
      </Setting>
      <Setting label={t("Transparency")} note={t("Menus and popups of some themes let a blurred picture of what is behind them through.")} scope="machine">
        <ReduceTransparency />
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
                <span className="text-slate-300">{s.action === "showHide" ? t("show / hide") : t("sidebar / full")}</span>
              </span>
              <ShortcutState shortcut={s} />
            </div>
          ))}
        </div>
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

function Tools({ assistant }: { assistant: AssistantState }) {
  const hooks = useConnections();
  return (
    <>
      <h3 className="mb-1 font-semibold text-slate-100">{t("AI tools")}</h3>
      <HookPanel hooks={hooks} harness={mainHarness(assistant)} heard={assistant.heard} />
    </>
  );
}
