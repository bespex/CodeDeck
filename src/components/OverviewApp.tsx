import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader, Check, Ellipsis, GitBranch, Inbox, Monitor, Paperclip, Play, Plus, RotateCcw, Square, SquareTerminal, TriangleAlert } from "lucide-react";
import { pendingSession, addProject, focusProject, onOverviewChanged, openSession, overviewState, pickFolder, quit, removeProject, setProject, showProject, startSession, startToday, stopSession, toggleProjectWindow, type OverviewProject, type Session } from "../backend";
import { accountLook, useAccounts } from "../accounts";
import { usePending } from "../pending";
import { AccountMark, MarkPicker, ProjectMark as SharedMark } from "./ProjectMark";
import { DONE_SHOWN_MS, needsYou, useNow } from "../attention";
import { SessionBadge } from "./SessionBadge";
import { t } from "../i18n";

// The overview of all projects (docs/UEBERSICHT.md): one window for every project, always there.
// Calm by default: what waits, the projects with their sessions and status, which windows are
// open. Everything occasional appears on hover or sits behind an icon of the toolbar.

/** Keeps the state of every open project, asked again whenever the backend says it changed. */
function useOverview(): OverviewProject[] {
  const [projects, setProjects] = useState<OverviewProject[]>([]);
  useEffect(() => {
    let alive = true;
    // Several changes in a row (a turn ends: status, files, snapshot) are asked for once
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      overviewState()
        .then((p) => alive && setProjects(p))
        .catch(() => {});
    load();
    const stop = onOverviewChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 120);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
      stop();
    };
  }, []);
  return projects;
}

const titleOf = (s: Session) => s.title ?? t("Session {id}", { id: s.id.slice(0, 8) });
const markOf = (s: Session) => ({ color: `var(--color-session-${s.color})`, short: s.short, title: s.title });

/** What a session is doing, in one word and its colour. */
function statusOf(s: Session): { word: string; className: string } {
  const needs = needsYou(s);
  if (needs === "asks") return { word: t("asks"), className: "text-changed" };
  if (s.status === "working") return { word: t("working"), className: "text-ai" };
  if (needs === "done") return { word: t("done"), className: "text-added" };
  return { word: t("idle"), className: "text-slate-500" };
}

/** The project's mark, as chosen in the picker; its first letter on its colour until then. */
function ProjectMark({ project, size = 20 }: { project: OverviewProject; size?: number }) {
  return <SharedMark mark={project.mark} color={project.color} name={project.name} size={size} />;
}

/** Opens the picker for a project's mark, from its row menu. */
let pickListener: ((project: OverviewProject) => void) | null = null;

/** A small icon button in a project's row: what changed there, or an action. Never taller than the
 *  row, so nothing moves when one appears. */
function RowIcon({ title, onClick, tone = "text-slate-400", children }: { title: string; onClick: () => void; tone?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`flex size-6 items-center justify-center rounded hover:bg-overlay-hover hover:text-slate-100 ${tone}`}
    >
      {children}
    </button>
  );
}

/** How long a session whose process is not known stays in the overview after its last sign of life. */
const RECENT_MS = 60 * 60_000;

/**
 * Whether a session belongs in the overview (user, 2026-11-17: old ones crowded it): its process
 * still runs, or, where that is not known, it was active within the hour or waits for you. Ended
 * ones and those whose process is gone stay in the project window under "Earlier".
 */
function relevant(s: Session, now: number): boolean {
  if (s.status === "ended" || s.alive === false) return false;
  if (s.alive === true) return true;
  return needsYou(s) === "asks" || now - s.last < RECENT_MS;
}

/** The menu of a project's row: what is done now and then, kept out of sight (docs/UEBERSICHT.md). */
function RowMenu({ project, onClose }: { project: OverviewProject; onClose: () => void }) {
  // Accounts in use or new; a backup copy is no configuration to run with
  const accounts = useAccounts().filter((a) => a.kind !== "backup");
  useEffect(() => {
    const close = () => onClose();
    // Next tick: the click that opened the menu must not close it
    const timer = setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
    };
  }, [onClose]);
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-slate-200 hover:bg-overlay-hover";
  const label = project.label;
  return (
    <div onClick={(e) => e.stopPropagation()} className="surface-overlay absolute top-8 right-2 z-30 flex w-64 flex-col rounded-lg p-1">
      <button type="button" className={item} onClick={() => (onClose(), label ? void toggleProjectWindow(label) : void showProject(project.path))}>
        {label ? (project.visible ? t("Hide its window") : t("Show its window")) : t("Load its window")}
      </button>
      <div className="my-1 h-px bg-overlay-line" />
      {project.listed && (
        <button type="button" className={item} onClick={() => (onClose(), void setProject(project.path, "daily", !project.daily))}>
          <span className="flex size-3.5 items-center justify-center">
            <span className="size-3 rounded-full border-2" style={{ borderColor: project.daily ? ((project.mark as { color?: string } | null)?.color ?? project.color) : "var(--color-slate-500)" }} />
          </span>
          <span className="flex-1">{t("On today's list")}</span>
          {project.daily && <Check className="size-3.5 text-slate-300" />}
        </button>
      )}
      {project.listed && accounts.length > 0 && (
        <>
          <div className="my-1 h-px bg-overlay-line" />
          <p className="px-2 pt-0.5 pb-1 text-[11px] text-slate-500">{t("AI configuration its sessions run with")}</p>
          {accounts.map((a) => (
            <button key={a.dir} type="button" title={a.dir} className={item} onClick={() => (onClose(), void setProject(project.path, "account", a.dir))}>
              <AccountMark account={a} size={14} />
              <span className="flex-1 truncate">{a.name}</span>
              {project.account === a.dir && <Check className="size-3.5 text-slate-300" />}
            </button>
          ))}
          <button type="button" className={item} onClick={() => (onClose(), void setProject(project.path, "account", null))}>
            <span className="size-2 rounded-full border border-slate-500" />
            <span className="flex-1 text-slate-400">{t("Not set")}</span>
            {!project.account && <Check className="size-3.5 text-slate-300" />}
          </button>
        </>
      )}
      {project.listed && (
        <>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" className={item} onClick={() => (onClose(), pickListener?.(project))}>
            <ProjectMark project={project} size={14} />
            {t("Change mark…")}
          </button>
          <button type="button" className={item} onClick={() => (onClose(), void removeProject(project.path))}>
            {t("Take off my list (nothing on disk changes)")}
          </button>
        </>
      )}
    </div>
  );
}

/** Says for a moment why a way into a session did not work. */
let tellListener: ((text: string | null) => void) | null = null;
const tell = (text: string) => tellListener?.(text);

function ProjectRow({ project }: { project: OverviewProject }) {
  const now = useNow();
  const sessions = (project.state?.sessions ?? []).filter((s) => relevant(s, now));
  const label = project.label;
  const accounts = useAccounts();
  const look = (dir: string) => accountLook(accounts, dir);
  const asks = sessions.some((s) => needsYou(s) === "asks");
  const done = sessions.some((s) => needsYou(s) === "done" && now - (s.turnDone ?? s.last) < DONE_SHOWN_MS);
  const summary = project.summary ?? {};
  const dot = asks ? "bg-changed" : done ? "bg-added" : null;
  // Loaded windows: a click on the row brings it to the front. Not loaded: a double click loads it
  const front = () => label && void focusProject(label);
  const load = () => !label && void showProject(project.path);
  // A click on the mark hides or shows the loaded window; closing is the window's own business
  const toggle = () => label && void toggleProjectWindow(label);
  const hidden = !!label && !project.visible;
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  // A session that runs with another configuration than the project's
  const wrongAccount = (s: Session) => !!project.account && !!s.account && s.account !== project.account;
  const pending = usePending(project.path, 5000);
  const go = (s: Session, door: "desktop" | "terminal") => openSession(project.path, s.id, door).catch((e) => tell(String(e)));
  // Double click: Desktop where the session is reachable there, else its terminal
  const defaultDoor = (s: Session) => (s.place?.remote ? "desktop" : "terminal");
  return (
    <li className="relative border-t border-line/40 py-1 first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        onClick={front}
        onDoubleClick={load}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
        onKeyDown={(e) => e.key === "Enter" && (label ? front() : load())}
        title={label ? t("Bring its window to the front") : t("Double-click: load its window")}
        className={`group/row flex h-9 cursor-pointer items-center gap-2 border-l-2 pr-2 pl-3 hover-project ${project.front && project.visible ? "border-ai bg-raised" : "border-transparent"}`}
      >
        {/* The mark: a click hides or shows the loaded window, a double click loads it. A ring runs
            round it on hover, so it reads as a switch */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            load();
          }}
          title={(project.daily ? t("On today's list") + " · " : "") + (label ? (hidden ? t("Show its window") : t("Hide its window (close it in the window itself)")) : t("Double-click: load its window"))}
          aria-label={label ? (hidden ? t("Show its window") : t("Hide its window")) : t("Load its window")}
          style={{ ["--ring" as string]: (project.mark as { color?: string } | null)?.color ?? project.color }}
          className={`mark-switch ${project.daily ? "mark-daily" : ""} flex shrink-0 rounded-full ${!label ? "opacity-50 hover:opacity-100" : hidden ? "opacity-75" : ""}`}
        >
          <ProjectMark project={project} />
        </button>
        <span className={`min-w-0 truncate text-[14px] ${label ? "font-semibold text-slate-100" : "text-slate-400"}`}>{project.name}</span>
        {project.account && (
          <span title={`${t("AI configuration")}: ${look(project.account).name}`} className="flex shrink-0">
            <AccountMark account={look(project.account)} size={16} />
          </span>
        )}
        {/* Right after the name, so the status icons on the right never move */}
        <span className={`${menu ? "flex" : "invisible group-hover/row:visible"} flex`}>
          <RowIcon
            title={t("Start session (continues the last one)")}
            onClick={() =>
              void startSession(project.path, false)
                .then((name) => tell(name ? t("Started in tmux {name}", { name }) : t("A session runs there already")))
                .catch((e) => tell(String(e)))
            }
          >
            <Play className="size-4" />
          </RowIcon>
          <RowIcon
            title={t("New session")}
            onClick={() =>
              void startSession(project.path, true)
                .then((name) => name && tell(t("Started in tmux {name}", { name })))
                .catch((e) => tell(String(e)))
            }
          >
            <Plus className="size-4" />
          </RowIcon>
          <RowIcon title={t("More (also right click)")} onClick={() => setMenu((m) => !m)}>
            <Ellipsis className="size-4" />
          </RowIcon>
        </span>
        <span className="flex-1" />
        {/* What changed there: always in sight, the details in the tooltip */}
        {label && (summary.gitFailed || !!summary.uncommitted) && (
          <RowIcon title={`${t("Git")}: ${summary.git ?? "…"}`} tone={summary.gitFailed ? "text-problem" : "text-changed"} onClick={() => void focusProject(label, "changes")}>
            <GitBranch className="size-4" />
          </RowIcon>
        )}
        {label && !!summary.next && (
          <RowIcon title={t("Next prompt: {n} attached", { n: summary.next })} tone="text-ai" onClick={() => void focusProject(label, "next")}>
            <Paperclip className="size-4" />
          </RowIcon>
        )}
        {label && !!summary.news && (
          <RowIcon title={t("Workbench: {n} new", { n: summary.news })} tone="text-ai" onClick={() => void focusProject(label, "workbench")}>
            <Inbox className="size-4" />
          </RowIcon>
        )}
        {dot && <span className={`size-2 shrink-0 rounded-full ${dot}`} />}
      </div>
      {menu && <RowMenu project={project} onClose={closeMenu} />}
      {(sessions.length > 0 || pending.length > 0) && (
        <ul>
          {/* Started in tmux, nothing reported yet: maybe it asks a question; open it to answer */}
          {pending.map((p) => (
            <li
              key={p.name}
              onDoubleClick={() => void pendingSession(project.path, p.name, false).catch((e) => tell(String(e)))}
              title={t("Nothing reported yet: it may ask a question, e.g. whether to trust the folder.")}
              className="group/s flex h-7 cursor-default items-center gap-2 pr-2 pl-9 text-[12px] hover-session"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded border border-dashed border-slate-500/60 text-slate-400">
                <Loader className="size-3 animate-spin [animation-duration:2.5s]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{t("Starting…")}</span>
              <span className="hidden items-center group-hover/s:flex">
                <RowIcon title={t("Open it in a terminal, answer, and leave with Ctrl+B, D")} onClick={() => void pendingSession(project.path, p.name, false).catch((e) => tell(String(e)))}>
                  <SquareTerminal className="size-3.5" />
                </RowIcon>
                <RowIcon title={t("End this session (nothing is lost; it never began)")} onClick={() => void pendingSession(project.path, p.name, true).catch((e) => tell(String(e)))}>
                  <Square className="size-3.5" />
                </RowIcon>
              </span>
              <span className="shrink-0 text-[11px] text-changed">{t("waits in tmux")}</span>
            </li>
          ))}
          {sessions.map((s) => {
            const status = statusOf(s);
            return (
              <li
                key={s.id}
                onClick={front}
                onDoubleClick={() => void go(s, defaultDoor(s))}
                onAuxClick={(e) => e.button === 1 && void go(s, "terminal")}
                title={[s.model, !s.place?.launched && t("by hand"), t("Double-click: go to it ({door}) · middle click: terminal", { door: defaultDoor(s) === "desktop" ? t("Desktop") : t("Terminal") })].filter(Boolean).join(" · ")}
                className="group/s flex h-7 cursor-default items-center gap-2 pr-2 pl-9 text-[12px] hover-session"
              >
                <SessionBadge mark={markOf(s)} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{titleOf(s)}</span>
                {wrongAccount(s) && (
                  <span title={t("Runs with {account}; the project is set to {project}", { account: look(s.account!).name, project: look(project.account!).name })}>
                    <TriangleAlert className="size-3.5 shrink-0 text-changed" />
                  </span>
                )}
                <span className="hidden items-center group-hover/s:flex">
                  {/* Sessions in tmux can be stopped and restarted from here; not while they work */}
                  {s.place?.tmux?.session && s.status !== "working" && (
                    <>
                      <RowIcon title={t("Restart: same conversation, fresh process")} onClick={() => void stopSession(project.path, s.id, true).catch((e) => tell(String(e)))}>
                        <RotateCcw className="size-3.5" />
                      </RowIcon>
                      <RowIcon title={t("Stop (the conversation is kept and can be continued)")} onClick={() => void stopSession(project.path, s.id, false).catch((e) => tell(String(e)))}>
                        <Square className="size-3.5" />
                      </RowIcon>
                    </>
                  )}
                  {s.place?.remote && (
                    <RowIcon title={t("Open in the desktop app")} onClick={() => void go(s, "desktop")}>
                      <Monitor className="size-3.5" />
                    </RowIcon>
                  )}
                  <RowIcon title={t("Open in a terminal")} onClick={() => void go(s, "terminal")}>
                    <SquareTerminal className="size-3.5" />
                  </RowIcon>
                </span>
                <span className={`shrink-0 text-[11px] ${status.className}`}>{status.word}</span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** The message of a way in that did not work, for a few seconds at the bottom. */
function Told() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    tellListener = (next) => {
      setText(next);
      clearTimeout(timer);
      timer = setTimeout(() => setText(null), 6000);
    };
    return () => {
      tellListener = null;
      clearTimeout(timer);
    };
  }, []);
  if (!text) return null;
  return <p className="surface-overlay mx-2 mb-2 rounded-md px-2.5 py-1.5 text-[12px] text-changed">{text}</p>;
}

/** "Needs you" over every project: questions first, then finished turns of the last half hour. */
function Waiting({ projects }: { projects: OverviewProject[] }) {
  const now = useNow();
  const waiting = projects.flatMap((p) =>
    (p.state?.sessions ?? [])
      .filter((s) => relevant(s, now) && (needsYou(s) === "asks" || (needsYou(s) === "done" && now - (s.turnDone ?? s.last) < DONE_SHOWN_MS)))
      .map((s) => ({ project: p, session: s })),
  );
  waiting.sort((a, b) => Number(needsYou(b.session) === "asks") - Number(needsYou(a.session) === "asks"));
  if (!waiting.length) return null;
  return (
    <section aria-label={t("Needs you")}>
      <h2 className="px-3 pt-3 pb-1 text-[12px] font-semibold tracking-wider text-slate-400 uppercase">{t("Needs you")}</h2>
      <ul className="flex flex-col gap-1.5 px-2">
        {waiting.map(({ project, session: s }) => {
          const asks = needsYou(s) === "asks";
          return (
            <li
              key={`${project.label}:${s.id}`}
              data-event={asks ? "waiting" : "done"}
              onClick={() => void (project.label ? focusProject(project.label) : showProject(project.path))}
              title={t("Click: its project's window")}
              className={`event-row wait-card flex cursor-pointer items-center gap-2 rounded-md bg-raised py-1.5 pr-2 pl-2 ${asks ? "wait-card-asks" : ""}`}
            >
              <ProjectMark project={project} size={20} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-100">{titleOf(s)}</span>
                <span className={`block truncate text-[12px] ${asks ? "text-changed" : "text-slate-400"}`}>
                  {asks ? (s.message ?? t("Waits for your answer")) : t("Waits for your next prompt")}
                </span>
              </span>
              <SessionBadge mark={markOf(s)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const toolButton = "rounded-md p-1.5 text-slate-400 hover:bg-overlay-hover hover:text-slate-100 disabled:opacity-40";

/** The `⋯` menu: what is needed now and then. */
function MoreMenu({ host }: { host: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-slate-200 hover:bg-overlay-hover disabled:opacity-40";
  // Dialogs open in the project window used last: they need more room than the overview has
  const inWindow = (view: string) => host && void focusProject(host, view);
  return (
    <span className="relative">
      <button
        type="button"
        title={t("More")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`${toolButton} ${open ? "bg-overlay-hover text-slate-100" : ""}`}
      >
        <Ellipsis className="size-4" />
      </button>
      {open && (
        <div className="surface-overlay absolute top-9 right-0 z-20 flex w-56 flex-col rounded-lg p-1">
          <button type="button" disabled={!host} title={host ? undefined : t("Settings: open a project first")} className={item} onClick={() => inWindow("settings")}>
            {t("Settings")}
          </button>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" disabled={!host} className={item} onClick={() => inWindow("shortcuts")}>
            {t("Keyboard shortcuts")}
          </button>
          <button type="button" disabled={!host} className={item} onClick={() => inWindow("about")}>
            {t("About CodeDeck")}
          </button>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" className={item} onClick={() => void quit()}>
            {t("Quit CodeDeck")}
            <span className="ml-auto text-slate-500">{t("all windows")}</span>
          </button>
        </div>
      )}
    </span>
  );
}

export default function OverviewApp() {
  const projects = useOverview();
  const [picking, setPicking] = useState<OverviewProject | null>(null);
  useEffect(() => {
    pickListener = setPicking;
    return () => void (pickListener = null);
  }, []);
  useEffect(() => void (document.title = "CodeDeck"), []);
  // ＋ takes a project into my list; its window stays closed until it is needed
  const open = async () => {
    const path = await pickFolder();
    if (path) await addProject(path);
  };
  // Ctrl+O opens a project from here too
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const host = (projects.find((p) => p.front) ?? projects.find((p) => p.label))?.label ?? null;
  // Today's list: projects with the star and no live session
  const now = useNow();
  const toStart = projects.filter((p) => p.daily && !(p.state?.sessions ?? []).some((s) => relevant(s, now) && s.alive !== false && (s.alive === true || s.status === "working" || s.status === "waiting"))).length;
  const startAll = () =>
    void startToday()
      .then(([started, skipped]) =>
        tell(
          [started.length ? t("Started: {names}", { names: started.join(", ") }) : t("Nothing to start"), skipped.length ? t("running already: {names}", { names: skipped.join(", ") }) : ""]
            .filter(Boolean)
            .join(" · "),
        ),
      )
      .catch((e) => tell(String(e)));
  return (
    <div className="flex h-screen flex-col bg-panel text-[13px]">
      <header className="zone-tabs area-ai flex h-10 shrink-0 items-center gap-1 border-b border-line pr-2 pl-3">
        <img src="/codedeck.svg" alt="" className="size-[18px]" />
        <span className="flex-1" />
        <button
          type="button"
          title={toStart ? t("Start today's list: {n} without a running session", { n: toStart }) : t("Start today's list (set in a project's menu)")}
          onClick={startAll}
          className={`${toolButton} relative`}
        >
          <Play className="size-4" />
          {toStart > 0 && <span className="absolute top-0.5 right-0.5 min-w-3.5 rounded-full bg-ai px-0.5 text-center text-[9px] leading-[14px] font-semibold text-white">{toStart}</span>}
        </button>
        <button type="button" title={t("Add a project to my list (Ctrl+O)")} onClick={() => void open()} className={toolButton}>
          <Plus className="size-4" />
        </button>
        <MoreMenu host={host} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto pb-3">
        <Waiting projects={projects} />
        <h2 className="px-3 pt-5 pb-2 text-[12px] font-semibold tracking-wider text-slate-400 uppercase">{t("Projects")}</h2>
        {projects.length ? (
          <ul>
            {projects.map((p) => (
              <ProjectRow key={p.path} project={p} />
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-[12px] text-slate-500">{t("No projects yet. + adds one; its window opens when you click it.")}</p>
        )}
      </main>
      <Told />
      {picking && (
        <MarkPicker
          name={picking.name}
          color={picking.color}
          mark={picking.mark}
          onCancel={() => setPicking(null)}
          onDone={(mark) => {
            void setProject(picking.path, "mark", mark);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
