import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { History, AppWindow, ChevronRight, ChevronsDownUp, ChevronsUpDown, Shapes, Eye, EyeOff, ListX, Loader, Check, Copy, Ellipsis, GitBranch, Inbox, Monitor, Paperclip, Play, Plus, Power, RotateCcw, SquareTerminal, TriangleAlert } from "lucide-react";
import { forgetRecent, toggleOverview, onTodayStarted, sessionCommands, pendingSession, addProject, addProjectsIn, focusProject, onOverviewChanged, openSession, overviewState, pickFolder, quit, removeProject, reorderProjects, setProject, showProject, sortProjects, startSession, startToday, stopSession, toggleProjectWindow, type OverviewProject, type ProjectSort, type Session } from "../backend";
import { accountLook, useAccounts } from "../accounts";
import { usePending } from "../pending";
import { AccountMark, MarkPicker, ProjectMark as SharedMark } from "./ProjectMark";
import { needsYou, useNow, waitsForYou } from "../attention";
import { SessionBadge } from "./SessionBadge";
import { HoverTools, Tool, ToolGap } from "./RowTools";
import { plural, t } from "../i18n";
import { loadCollapsed, nameIn, saveCollapsed, sectionsOf } from "../groups";

// The overview of all projects (docs/UEBERSICHT.md): one window for every project, always there.
// Calm by default: what waits, the projects with their sessions and status, which windows are
// open. Everything occasional appears on hover or sits behind an icon of the toolbar.

/**
 * The list in a project window (docs/PLAN.md "Projektliste im Fenster statt Übersicht"): a click shows
 * the project in this window, Ctrl+click in a new one. No sessions in the list: those of the project
 * shown are in the session column beside it.
 */
export interface InWindow {
  /** The project this window shows */
  current: string | null;
  /** Shows a project here or in a new window; `view` opens a view of the deck as well */
  onOpen: (path: string, newWindow: boolean, view?: string) => void;
  /** The list is the whole window: the start page, shown while no project window is open */
  full?: boolean;
}

/** The start page (docs/PLAN.md "Projektliste im Fenster statt Übersicht", step c): the window without a
 *  project. A click brings the project's window to the front or opens it, and the start page steps back. */
export const START_PAGE: InWindow = {
  current: null,
  full: true,
  onOpen: (path, _newWindow, view) =>
    void overviewState()
      .then((all) => {
        const label = all.find((p) => p.path === path)?.label;
        return label ? focusProject(label, view) : showProject(path);
      })
      .then(() => toggleOverview())
      .catch((e) => tell(String(e))),
};
const InWindowContext = createContext<InWindow | null>(null);

/** How many projects "Recently" shows, the one shown here among them: enough for the two or three one
 *  moves between (user, 2026-11-19) */
const RECENT_SHOWN = 3;

/** The projects shown lately, newest first; with `current`, without that one (Ctrl+Tab: the one before). */
export function recentOf(projects: OverviewProject[], current: string | null): OverviewProject[] {
  return projects
    .filter((p) => p.recent !== null && p.path !== current)
    .sort((a, b) => (a.recent ?? 0) - (b.recent ?? 0));
}

/** The places of "Recently" in this window, kept while one switches between its projects. */
let recentSlots: string[] = [];

/**
 * "Recently" in a fixed order (user, 2026-11-19: it must not change while one moves between them): each
 * project keeps its place; one that comes in takes the place of one that dropped out, else the end.
 * The project shown here stays among them, marked, so that switching moves nothing.
 */
export function recentInPlace(projects: OverviewProject[]): OverviewProject[] {
  const wanted = recentOf(projects, null).slice(0, RECENT_SHOWN).map((p) => p.path);
  const kept = recentSlots.map((path) => (wanted.includes(path) ? path : null));
  const newcomers = wanted.filter((path) => !kept.includes(path));
  const slots = kept.map((path) => path ?? newcomers.shift() ?? null).filter((path): path is string => path !== null);
  recentSlots = [...slots, ...newcomers];
  const byPath = new Map(projects.map((p) => [p.path, p]));
  return recentSlots.flatMap((path) => byPath.get(path) ?? []);
}

/** Keeps the state of every open project, asked again whenever the backend says it changed. */
export function useOverview(): [OverviewProject[], (p: OverviewProject[]) => void] {
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
  return [projects, setProjects];
}

/** Where a dragged project would land: before or after this row. */
type DropLine = "before" | "after" | null;

/** How far the pointer moves before a press on a project becomes dragging it, in pixels. */
const DRAG_FROM = 5;

/** My projects with `from` moved to just before or after `to`; `null` when nothing would change. */
function moved(paths: string[], from: string, to: string, line: "before" | "after"): string[] | null {
  if (from === to) return null;
  const rest = paths.filter((p) => p !== from);
  const at = rest.indexOf(to) + (line === "after" ? 1 : 0);
  const next = [...rest.slice(0, at), from, ...rest.slice(at)];
  return next.join("\n") === paths.join("\n") ? null : next;
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
let pickListener: ((pick: Picking) => void) | null = null;

/** Whose mark is chosen: one project, or every project of a group at once. */
interface Picking {
  name: string;
  color: string;
  mark: OverviewProject["mark"];
  paths: string[];
}

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
/** A click anywhere closes the menu; not the click that opened it. */
function useCloseOnClick(onClose: () => void) {
  useEffect(() => {
    const close = () => onClose();
    // Next tick: the click that opened the menu must not close it
    const timer = setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", close);
    };
  }, [onClose]);
}

/** A row's or group's menu: below it where there is room, else above it, so that at the end of a long
 *  list it does not leave the window. */
function FloatingMenu({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    const menu = box.current?.getBoundingClientRect();
    const row = box.current?.parentElement?.getBoundingClientRect();
    if (menu && row) setAbove(menu.bottom > window.innerHeight && row.top - menu.height > 0);
  }, []);
  return (
    <div ref={box} onClick={(e) => e.stopPropagation()} className={`surface-overlay absolute ${above ? "bottom-[calc(100%-0.75rem)]" : "top-8"} right-2 z-30 flex w-64 flex-col rounded-lg p-1`}>
      {children}
    </div>
  );
}

const menuPlain = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-overlay-hover";
const menuItem = `${menuPlain} text-slate-200`;
const menuLine = <div className="my-1 h-px bg-overlay-line" />;

function RowMenu({ project, onClose }: { project: OverviewProject; onClose: () => void }) {
  const inWindow = useContext(InWindowContext);
  // Accounts in use or new; a backup copy is no configuration to run with
  const accounts = useAccounts().filter((a) => a.kind !== "backup");
  useCloseOnClick(onClose);
  const [plain, item, line] = [menuPlain, menuItem, menuLine];
  const label = project.label;
  return (
    <FloatingMenu>
      {inWindow ? (
        <button type="button" className={item} onClick={() => (onClose(), inWindow.onOpen(project.path, true))}>
          <MenuIcon>
            <AppWindow className="size-3.5" />
          </MenuIcon>
          <span className="flex-1">{t("Open in a new window")}</span>
        </button>
      ) : (
      <button type="button" className={item} onClick={() => (onClose(), label ? void toggleProjectWindow(label) : void showProject(project.path))}>
        <MenuIcon>{!label ? <AppWindow className="size-3.5" /> : project.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</MenuIcon>
        <span className="flex-1">{label ? (project.visible ? t("Hide its window") : t("Show its window")) : t("Open")}</span>
      </button>
      )}
      {project.listed && (
        <>
          {line}
          <button type="button" className={item} onClick={() => (onClose(), void setProject(project.path, "daily", !project.daily))}>
            <MenuIcon>
              <span className="size-3 rounded-full border-2" style={{ borderColor: project.daily ? ((project.mark as { color?: string } | null)?.color ?? project.color) : "var(--color-slate-500)" }} />
            </MenuIcon>
            <span className="flex-1">{t("On today's list")}</span>
            {project.daily && <Check className="size-3.5 text-slate-300" />}
          </button>
          <button type="button" className={item} onClick={() => (onClose(), pickListener?.({ name: project.name, color: project.color, mark: project.mark, paths: [project.path] }))}>
            <MenuIcon>
              <ProjectMark project={project} size={14} />
            </MenuIcon>
            <span className="flex-1">{t("Change mark…")}</span>
          </button>
        </>
      )}
      {project.listed && accounts.length > 0 && (
        <>
          {line}
          <p className="px-2 pt-0.5 pb-1 text-[11px] text-slate-500">{t("AI configuration its sessions run with")}</p>
          {accounts.map((a) => (
            <button key={a.dir} type="button" title={a.dir} className={item} onClick={() => (onClose(), void setProject(project.path, "account", a.dir))}>
              <MenuIcon>
                <AccountMark account={a} size={14} />
              </MenuIcon>
              <span className="flex-1 truncate">{a.name}</span>
              {project.account === a.dir && <Check className="size-3.5 text-slate-300" />}
            </button>
          ))}
          <button type="button" className={item} onClick={() => (onClose(), void setProject(project.path, "account", null))}>
            <MenuIcon>
              <span className="size-2 rounded-full border border-slate-500" />
            </MenuIcon>
            <span className="flex-1 text-slate-400">{t("Not set")}</span>
            {!project.account && <Check className="size-3.5 text-slate-300" />}
          </button>
        </>
      )}
      {/* Apart from the rest, with room above it: it was hit by mistake right under "Change mark" */}
      {project.listed && (
        <>
          <div className="mt-2 mb-1 h-px bg-overlay-line" />
          <button type="button" className={`${plain} text-problem`} onClick={() => (onClose(), void removeProject(project.path))}>
            <MenuIcon>
              <ListX className="size-3.5" />
            </MenuIcon>
            <span className="flex-1">{t("Take off my list (nothing on disk changes)")}</span>
          </button>
        </>
      )}
    </FloatingMenu>
  );
}

/** The menu of a project in "Recently": open it in a new window, or take it out of "Recently". */
function RecentMenu({ project, onClose }: { project: OverviewProject; onClose: () => void }) {
  const inWindow = useContext(InWindowContext);
  useCloseOnClick(onClose);
  return (
    <FloatingMenu>
      <button type="button" className={menuItem} onClick={() => (onClose(), inWindow ? inWindow.onOpen(project.path, true) : void showProject(project.path))}>
        <MenuIcon>
          <AppWindow className="size-3.5" />
        </MenuIcon>
        <span className="flex-1">{t("Open in a new window")}</span>
      </button>
      <button type="button" className={menuItem} onClick={() => (onClose(), void forgetRecent(recentSlots.filter((path) => path !== project.path)).catch((e) => tell(String(e))))}>
        <MenuIcon>
          <ListX className="size-3.5" />
        </MenuIcon>
        <span className="flex-1">{t("Remove from Recently")}</span>
      </button>
    </FloatingMenu>
  );
}

/**
 * The menu of a group: what the menu of a row sets, for every project in the group at once. A group
 * has no settings of its own; it is its folder.
 */
function GroupMenu({ group, projects, onClose }: { group: string; projects: OverviewProject[]; onClose: () => void }) {
  const accounts = useAccounts().filter((a) => a.kind !== "backup");
  useCloseOnClick(onClose);
  const all = (field: "daily" | "account", value: unknown) => {
    onClose();
    void Promise.all(projects.map((p) => setProject(p.path, field, value))).catch((e) => tell(String(e)));
  };
  // A check where every project agrees
  const allDaily = projects.every((p) => p.daily);
  const noneDaily = projects.every((p) => !p.daily);
  const allOn = (dir: string | null) => projects.every((p) => (p.account ?? null) === dir);
  const ring = (on: boolean) => <span className="size-3 rounded-full border-2" style={{ borderColor: on ? "var(--color-slate-300)" : "var(--color-slate-500)" }} />;
  return (
    <FloatingMenu>
      <p className="px-2 pt-0.5 pb-1 text-[11px] text-slate-500">{t("For all {n} projects in {group}", { n: projects.length, group })}</p>
      <button type="button" className={menuItem} onClick={() => all("daily", true)}>
        <MenuIcon>{ring(true)}</MenuIcon>
        <span className="flex-1">{t("Put all on today's list")}</span>
        {allDaily && <Check className="size-3.5 text-slate-300" />}
      </button>
      <button type="button" className={menuItem} onClick={() => all("daily", false)}>
        <MenuIcon>{ring(false)}</MenuIcon>
        <span className="flex-1">{t("Take all off today's list")}</span>
        {noneDaily && <Check className="size-3.5 text-slate-300" />}
      </button>
      <button type="button" className={menuItem} onClick={() => (onClose(), pickListener?.({ name: group, color: projects[0].color, mark: null, paths: projects.map((p) => p.path) }))}>
        <MenuIcon>
          <Shapes className="size-3.5" />
        </MenuIcon>
        <span className="flex-1">{t("Change the mark of all projects…")}</span>
      </button>
      {accounts.length > 0 && (
        <>
          {menuLine}
          <p className="px-2 pt-0.5 pb-1 text-[11px] text-slate-500">{t("AI configuration their sessions run with")}</p>
          {accounts.map((a) => (
            <button key={a.dir} type="button" title={a.dir} className={menuItem} onClick={() => all("account", a.dir)}>
              <MenuIcon>
                <AccountMark account={a} size={14} />
              </MenuIcon>
              <span className="flex-1 truncate">{a.name}</span>
              {allOn(a.dir) && <Check className="size-3.5 text-slate-300" />}
            </button>
          ))}
          <button type="button" className={menuItem} onClick={() => all("account", null)}>
            <MenuIcon>
              <span className="size-2 rounded-full border border-slate-500" />
            </MenuIcon>
            <span className="flex-1 text-slate-400">{t("Not set")}</span>
            {allOn(null) && <Check className="size-3.5 text-slate-300" />}
          </button>
        </>
      )}
    </FloatingMenu>
  );
}

/** The icon column of a menu item: one width for all, so every label starts at the same place. */
function MenuIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

/** Copies a start command and says so: nothing CodeDeck runs is out of sight. */
function copyCommand(command: string) {
  void navigator.clipboard.writeText(command).then(() => tell(t("Copied: {command}", { command })));
}

async function copyStartOf(project: string, name: string) {
  const commands = await sessionCommands(project, name).catch(() => null);
  if (commands?.start) copyCommand(commands.start);
  else tell(commands ? t("Started before CodeDeck kept the command") : t("CodeDeck did not start it: it ends where it was started."));
}

/** Says for a moment why a way into a session did not work. */
let tellListener: ((text: string | null) => void) | null = null;
const tell = (text: string) => tellListener?.(text);

/**
 * A group of projects: its folder's name, how many, and, folded away, what waits in it, marked as on
 * the icons (a pill with the number that ask, a dot for a finished turn). "Waits for you" above the
 * list shows every question anyway, folded or not.
 */
function GroupSection({ group, projects, first, folded, onFold, children }: { group: string; projects: OverviewProject[]; first: boolean; folded: boolean; onFold: () => void; children: ReactNode }) {
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const sessions = projects.flatMap((p) => (p.state?.sessions ?? []).filter((s) => relevant(s, now)));
  const asks = sessions.filter((s) => needsYou(s) === "asks").length;
  const done = sessions.some((s) => needsYou(s) === "done" && waitsForYou(s, now));
  return (
    <>
      <li
        className={`group/g relative ${first ? "" : "mt-2"} border-t border-line/40 first:border-t-0`}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
      >
        {/* A heading between the projects: in the theme's accent, on a band of its own */}
        <div className="flex h-8 items-center bg-raised/50 pr-3 hover:bg-raised">
          <button
            type="button"
            onClick={onFold}
            aria-expanded={!folded}
            title={folded ? t("Show the projects of {group}", { group }) : t("Fold {group} away", { group })}
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-2 text-left text-[12px] font-semibold tracking-wider text-ai uppercase"
          >
            <ChevronRight className={`size-3.5 shrink-0 transition-transform ${folded ? "" : "rotate-90"}`} />
            <span className="min-w-0 truncate">{group}</span>
            <span className="font-normal text-slate-400">{projects.length}</span>
          </button>
          {/* On hover, left of the marks, which never move */}
          <HoverTools show="group-hover/g:flex" open={menu}>
            <Tool icon={Ellipsis} label={t("For all projects in {group}", { group })} hint={t("Also: right click")} onClick={() => setMenu(true)} />
          </HoverTools>
          {folded && (asks > 0 || done) && (
            <span className="ml-1.5 flex items-center gap-1.5">
              {asks > 0 && (
                <span title={t("{n} asking", { n: asks })} className="flex h-4 min-w-4 items-center justify-center rounded-full bg-changed px-1 text-[10px] leading-none font-bold text-[#14161a]">
                  {Math.min(asks, 99)}
                </span>
              )}
              {done && <span title={t("A turn is done")} className="size-3 rounded-full border-2 border-white bg-added" />}
            </span>
          )}
        </div>
        {menu && <GroupMenu group={group} projects={projects} onClose={closeMenu} />}
      </li>
      {!folded && children}
    </>
  );
}

/** The dragged project's head, hanging at the pointer. */
function DragGhost({ project, name, at }: { project: OverviewProject | undefined; name: string; at: { left: number; top: number; width: number } }) {
  if (!project) return null;
  return (
    <div style={{ left: at.left, top: at.top, width: at.width }} className="surface-overlay pointer-events-none fixed z-50 flex h-9 items-center gap-2 rounded-md pr-2 pl-3 shadow-lg select-none">
      <ProjectMark project={project} />
      <span className="min-w-0 truncate text-[14px] font-semibold text-slate-100">{name}</span>
    </div>
  );
}

/** How a row of my projects takes part in dragging: its head is what is grabbed, the line shows
 *  where it would land. Pointer events, not HTML drag and drop: under WebKitGTK `draggable` left the
 *  row's menu unable to open the mark picker a second time. */
interface RowDrag {
  onPointerDown: (e: React.PointerEvent) => void;
  line: DropLine;
  /** This row is the one being dragged: its place stays, faint, while its ghost follows the pointer */
  dragged: boolean;
  /** Its group: a project moves within its group only, the group is its folder */
  group: string;
}

function ProjectRow({ project, name, drag, inRecent = false }: { project: OverviewProject; name: string; drag?: RowDrag; inRecent?: boolean }) {
  const inWindow = useContext(InWindowContext);
  const now = useNow();
  const sessions = (project.state?.sessions ?? []).filter((s) => relevant(s, now));
  const label = project.label;
  const accounts = useAccounts();
  const look = (dir: string) => accountLook(accounts, dir);
  const asks = sessions.some((s) => needsYou(s) === "asks");
  const done = sessions.some((s) => needsYou(s) === "done" && waitsForYou(s, now));
  const summary = project.summary ?? {};
  const dot = asks ? "bg-changed" : done ? "bg-added" : null;
  // Loaded windows: a click on the row brings it to the front. Not loaded: a double click loads it
  const front = () => label && void focusProject(label);
  const load = () => !label && void showProject(project.path);
  // In a project window: shown here, or with Ctrl in a new window; what changed opens its view
  const here = (newWindow: boolean, view?: string) => inWindow?.onOpen(project.path, newWindow, view);
  const shownHere = !!inWindow && inWindow.current === project.path;
  const look2 = (view: string) => (inWindow ? here(false, view) : label && void focusProject(label, view));
  // A click on the mark hides or shows the loaded window; closing is the window's own business
  const toggle = () => label && void toggleProjectWindow(label);
  const hidden = !!label && !project.visible;
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  // A session that runs with another configuration than the project's
  const wrongAccount = (s: Session) => !!project.account && !!s.account && s.account !== project.account;
  const pending = usePending(project.path, (project.state?.sessions ?? []).map((s) => s.id), 5000);
  const go = (s: Session, door: "desktop" | "terminal" | "auto") => openSession(project.path, s.id, door).catch((e) => tell(String(e)));
  // Double click: Desktop where the session is reachable there, else its terminal
  const defaultDoor = (s: Session) => (s.place?.remote ? "desktop" : "terminal");
  return (
    <li data-project={drag ? project.path : undefined} data-group={drag?.group} className={`relative border-t border-line/40 py-1 first:border-t-0 ${drag?.dragged ? "opacity-35" : ""}`}>
      {/* Where the dragged project would land */}
      {drag?.line && <span className={`pointer-events-none absolute right-2 left-2 z-10 h-0.5 rounded-full bg-ai ${drag.line === "before" ? "-top-px" : "-bottom-px"}`} />}
      <div
        onPointerDown={drag?.onPointerDown}
        role="button"
        tabIndex={0}
        onClick={(e) => (inWindow ? here(e.ctrlKey || e.metaKey) : front())}
        onAuxClick={(e) => inWindow && e.button === 1 && here(true)}
        onDoubleClick={inWindow ? undefined : load}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
        onKeyDown={(e) => e.key === "Enter" && (inWindow ? here(e.ctrlKey) : label ? front() : load())}
        title={inWindow ? t("Show it here · Ctrl+click or middle click: in a new window") : label ? t("Bring its window to the front") : t("Double-click: load its window")}
        className={`group/row flex h-9 cursor-pointer items-center gap-2 border-l-2 pr-2 pl-3 select-none hover-project ${(inWindow ? shownHere : project.front && project.visible) ? "border-ai bg-raised" : "border-transparent"}`}
      >
        {/* The mark: a click hides or shows the loaded window, a double click loads it. A ring runs
            round it on hover, so it reads as a switch. In a project window it is part of the row */}
        {inWindow ? (
          <span title={project.daily ? t("On today's list") : undefined} className={`${project.daily ? "mark-daily" : ""} flex shrink-0 rounded-full`} style={{ ["--ring" as string]: (project.mark as { color?: string } | null)?.color ?? project.color }}>
            <ProjectMark project={project} size={28} />
          </span>
        ) : (
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
          <ProjectMark project={project} size={28} />
        </button>
        )}
        <span title={name === project.name ? undefined : project.name} className={`min-w-0 truncate text-[14px] ${label || inWindow ? "font-semibold text-slate-100" : "text-slate-400"}`}>
          {name}
        </span>
        {project.account && (
          <span title={`${t("AI configuration")}: ${look(project.account).name}`} className="flex shrink-0">
            <AccountMark account={look(project.account)} size={16} />
          </span>
        )}
        {/* What changed there: always in sight, the details in the tooltip */}
        {label && (summary.gitFailed || !!summary.uncommitted) && (
          <RowIcon title={`${t("Git")}: ${summary.git ?? "…"}`} tone={summary.gitFailed ? "text-problem" : "text-changed"} onClick={() => look2("changes")}>
            <GitBranch className="size-4" />
          </RowIcon>
        )}
        {label && !!summary.next && (
          <RowIcon title={t("Next prompt: {n} attached", { n: summary.next })} tone="text-ai" onClick={() => look2("next")}>
            <Paperclip className="size-4" />
          </RowIcon>
        )}
        {label && !!summary.news && (
          <RowIcon title={t("Workbench: {n} new", { n: summary.news })} tone="text-ai" onClick={() => look2("workbench")}>
            <Inbox className="size-4" />
          </RowIcon>
        )}
        {dot && <span className={`size-2 shrink-0 rounded-full ${dot}`} />}
        <span className="flex-1" />
        {/* At the right edge, always there (user, 2026-11-19): AI and status icons stay right after the name */}
        <HoverTools show="group-hover/row:flex" open={menu}>
          {/* In a project window and on the start page (user, 2026-11-19): no sessions are started from
              the list, that is the session column's ▶ and + for the project shown */}
          {inWindow ? (
            <>
              <Tool icon={AppWindow} label={t("Open in a new window")} hint={t("Also: Ctrl+click or middle click")} onClick={() => here(true)} />
              <ToolGap />
              <Tool icon={Ellipsis} label={t("More (also right click)")} onClick={() => setMenu((m) => !m)} />
            </>
          ) : (
          <>
          <Tool
            icon={Play}
            label={t("Start session (continues the last one)")}
            onClick={() =>
              void startSession(project.path, false)
                .then((name) => tell(name ? t("Started in tmux {name}", { name }) : t("A session runs there already")))
                .catch((e) => tell(String(e)))
            }
          />
          <Tool
            icon={Plus}
            label={t("New session")}
            onClick={() =>
              void startSession(project.path, true)
                .then((name) => name && tell(t("Started in tmux {name}", { name })))
                .catch((e) => tell(String(e)))
            }
          />
          <ToolGap />
          <Tool icon={Ellipsis} label={t("More (also right click)")} onClick={() => setMenu((m) => !m)} />
          </>
          )}
        </HoverTools>
      </div>
      {/* In "Recently" only what belongs there (user, 2026-11-19); the rest is in the project's row below */}
      {menu && (inRecent ? <RecentMenu project={project} onClose={closeMenu} /> : <RowMenu project={project} onClose={closeMenu} />)}
      {/* In a project window the list has no sessions (user, 2026-11-19): they are in the column beside it */}
      {!inWindow && (sessions.length > 0 || pending.length > 0) && (
        <ul>
          {/* Started in tmux, nothing reported yet: maybe it asks a question; open it to answer */}
          {pending.map((p) => (
            <li
              key={p.name}
              onDoubleClick={() => void pendingSession(project.path, p.name, false).catch((e) => tell(String(e)))}
              title={p.waits ? t("Nothing reported yet: it may ask a question, e.g. whether to trust the folder.") : t("In tmux {name}", { name: p.name })}
              className="group/s flex h-7 cursor-default items-center gap-2 pr-2 pl-9 text-[12px] hover-session"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded border border-dashed border-slate-500/60 text-slate-400">
                <Loader className="size-3 animate-spin [animation-duration:2.5s]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-400">{t("Starting…")}</span>
              <HoverTools show="group-hover/s:flex">
                <Tool icon={SquareTerminal} label={t("Open it in a terminal, answer, and leave with Ctrl+B, D")} onClick={() => void pendingSession(project.path, p.name, false).catch((e) => tell(String(e)))} />
                {p.command && <Tool icon={Copy} label={t("Copy how it was started")} says={p.command} onClick={() => copyCommand(p.command!)} />}
                <ToolGap />
                <Tool icon={Power} label={t("End this session (nothing is lost; it never began)")} onClick={() => void pendingSession(project.path, p.name, true).catch((e) => tell(String(e)))} />
              </HoverTools>
              <span className={`shrink-0 text-[11px] ${p.waits ? "text-changed" : "text-slate-400"}`}>{p.waits ? t("may be asking") : t("starting")}</span>
            </li>
          ))}
          {sessions.map((s) => {
            const status = statusOf(s);
            return (
              <li
                key={s.id}
                onClick={front}
                onDoubleClick={() => void go(s, "auto")}
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
                <HoverTools show="group-hover/s:flex">
                  {/* Ways into it first, then what changes its process, apart */}
                  {s.place?.remote && <Tool icon={Monitor} label={t("Open in the desktop app")} hint={defaultDoor(s) === "desktop" ? t("Also: double-click the session") : undefined} onClick={() => void go(s, "desktop")} />}
                  <Tool icon={SquareTerminal} label={t("Open in a terminal")} hint={t("Also: middle-click the session")} onClick={() => void go(s, "terminal")} />
                  {s.place?.tmux?.session && <Tool icon={Copy} label={t("Copy how it was started")} onClick={() => void copyStartOf(project.path, s.place!.tmux!.session!)} />}
                  {/* Sessions in tmux can be stopped and restarted from here; not while they work */}
                  {s.place?.tmux?.session && s.status !== "working" && (
                    <>
                      <ToolGap />
                      <Tool icon={RotateCcw} label={t("Restart: same conversation, fresh process")} onClick={() => void stopSession(project.path, s.id, true).catch((e) => tell(String(e)))} />
                      <Tool icon={Power} label={t("Stop (the conversation is kept and can be continued)")} onClick={() => void stopSession(project.path, s.id, false).catch((e) => tell(String(e)))} />
                    </>
                  )}
                </HoverTools>
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

/** "Needs you" over every project: questions first, then finished turns not seen yet. */
function Waiting({ projects }: { projects: OverviewProject[] }) {
  const inWindow = useContext(InWindowContext);
  const now = useNow();
  // In a project window what waits in the project shown is in the session column beside: only the others
  const waiting = projects.filter((p) => !inWindow || p.path !== inWindow.current).flatMap((p) =>
    (p.state?.sessions ?? [])
      .filter((s) => relevant(s, now) && waitsForYou(s, now))
      .map((s) => ({ project: p, session: s })),
  );
  waiting.sort((a, b) => Number(needsYou(b.session) === "asks") - Number(needsYou(a.session) === "asks"));
  if (!waiting.length) return null;
  return (
    <section aria-label={t("Needs you")}>
      <h2 className="px-3 pt-3 pb-1 text-[12px] font-semibold tracking-wider text-slate-400 uppercase">{inWindow && !inWindow.full ? t("Waiting in other projects") : t("Needs you")}</h2>
      <ul className="flex flex-col gap-1.5 px-2">
        {waiting.map(({ project, session: s }) => {
          const asks = needsYou(s) === "asks";
          return (
            <li
              key={`${project.label}:${s.id}`}
              data-event={asks ? "waiting" : "done"}
              onClick={() => (inWindow ? inWindow.onOpen(project.path, false) : void (project.label ? focusProject(project.label) : showProject(project.path)))}
              title={inWindow ? t("Click: show its project here") : t("Click: its project's window")}
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

/** The ways to sort my projects once, as offered under "Sort projects". */
const SORTS: [ProjectSort, string][] = [
  ["name", "By project name"],
  ["account", "By AI configuration, then project name"],
  ["daily", "Today's list to the top (nothing else moves)"],
];

/** Puts every folder inside a chosen one on my list, and says how many. */
async function addAllIn() {
  const path = await pickFolder();
  if (!path) return;
  try {
    const [added, known] = await addProjectsIn(path);
    const parts = [t("Added: {projects}", { projects: plural(added, "project") }), known ? t("on the list already: {n}", { n: known }) : ""];
    tell(parts.filter(Boolean).join(" · "));
  } catch (e) {
    tell(String(e));
  }
}

/** Takes a project into my list; its window stays closed until it is needed. */
async function addOne() {
  const path = await pickFolder();
  if (path) await addProject(path).catch((e) => tell(String(e)));
}

/** The `⋯` menu: what is needed now and then. */
function MoreMenu({ host, inWindow = false }: { host: string | null; inWindow?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sorting, setSorting] = useState(false);
  useEffect(() => void (open || setSorting(false)), [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-slate-200 hover:bg-overlay-hover disabled:opacity-40";
  // Dialogs open in the project window used last: they need more room than the overview has
  const inWindowView = (view: string) => host && void focusProject(host, view);
  return (
    <span className="relative">
      <button
        type="button"
        title={inWindow ? t("Add or sort projects") : t("More")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`${toolButton} ${open ? "bg-overlay-hover text-slate-100" : ""}`}
      >
        <Ellipsis className="size-4" />
      </button>
      {open && (
        <div className="surface-overlay absolute top-9 right-0 z-20 flex w-64 flex-col rounded-lg p-1">
          <button type="button" className={item} onClick={() => void addOne()}>
            {t("Add a project…")}
            <span className="ml-auto text-slate-500">{t("Ctrl+O")}</span>
          </button>
          <button type="button" className={item} title={t("Choose a folder: every folder in it goes on the list")} onClick={() => void addAllIn()}>
            {t("All projects in a folder…")}
          </button>
          <div className="my-1 h-px bg-overlay-line" />
          {/* Folds out in place: the overview is too narrow for a submenu beside the menu */}
          <button
            type="button"
            className={item}
            aria-expanded={sorting}
            onClick={(e) => {
              e.stopPropagation();
              setSorting((o) => !o);
            }}
          >
            {t("Sort projects")}
            <ChevronRight className={`ml-auto size-3.5 text-slate-500 transition-transform ${sorting ? "rotate-90" : ""}`} />
          </button>
          {sorting &&
            SORTS.map(([by, label]) => (
              <button key={by} type="button" className={`${item} pl-5`} title={t("Once; drag a project to move it from there")} onClick={() => void sortProjects(by).catch((e) => tell(String(e)))}>
                {t(label)}
              </button>
            ))}
          {/* In a project window the rest is in the app menu of the project bar above the list */}
          {!inWindow && (
          <>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" disabled={!host} title={host ? undefined : t("Settings: open a project first")} className={item} onClick={() => inWindowView("settings")}>
            {t("Settings")}
          </button>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" disabled={!host} className={item} onClick={() => inWindowView("shortcuts")}>
            {t("Keyboard shortcuts")}
          </button>
          <button type="button" disabled={!host} className={item} onClick={() => inWindowView("about")}>
            {t("About CodeDeck")}
          </button>
          <div className="my-1 h-px bg-overlay-line" />
          <button type="button" className={item} onClick={() => void quit()}>
            {t("Quit CodeDeck")}
            <span className="ml-auto text-slate-500">{t("all windows")}</span>
          </button>
          </>
          )}
        </div>
      )}
    </span>
  );
}

export default function OverviewApp({ inWindow }: { inWindow?: InWindow } = {}) {
  const [projects, setProjects] = useOverview();
  // In a project window, beside the project; not the start page, which is a window of its own
  const inProject = !!inWindow && !inWindow.full;
  // Dragging a project: which one, and where it would land
  // Groups folded away, kept on this machine
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const fold = (group: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (!next.delete(group)) next.add(group);
      saveCollapsed(next);
      return next;
    });
  // Fold every group away or show them all (the toolbar)
  const groups = sectionsOf(projects).flatMap((s) => (s.group ? [s.group] : []));
  const setAll = (folded: boolean) => {
    const next = folded ? new Set([...collapsed, ...groups]) : new Set([...collapsed].filter((g) => !groups.includes(g)));
    saveCollapsed(next);
    setCollapsed(next);
  };
  // The name a project shows in its group, for the dragged row's ghost
  const dragName = (path: string) => {
    const section = sectionsOf(projects).find((s) => s.items.some((p) => p.path === path));
    const p = projects.find((q) => q.path === path);
    return p ? nameIn(p.name, section?.group ?? null) : "";
  };
  // The ghost: the dragged row's head hangs at the pointer, at the height it was grabbed
  const [drag, setDrag] = useState<{ from: string; over: { path: string; line: "before" | "after" } | null; ghost: { left: number; top: number; width: number } } | null>(null);
  const mine = projects.filter((p) => p.listed).map((p) => p.path);
  const dragOf = (p: OverviewProject, group: string | null): RowDrag | undefined => {
    // Only my projects have a place in the list; the others stand below it as they come
    if (!p.listed) return undefined;
    const within = group ?? "";
    const shown = drag?.over?.path === p.path && moved(mine, drag.from, p.path, drag.over.line);
    return {
      line: shown ? drag!.over!.line : null,
      dragged: drag?.from === p.path,
      group: within,
      onPointerDown: (e) => e.button === 0 && follow(p.path, within, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()),
    };
  };
  // A press becomes a drag once the pointer has moved a little; until then it is a click
  const follow = (from: string, group: string, x0: number, y0: number, head: DOMRect) => {
    const order = mine;
    let active = false;
    let over: { path: string; line: "before" | "after" } | null = null;
    const move = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - x0, e.clientY - y0) < DRAG_FROM) return;
        active = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        // A selection begun with the press would otherwise grow over every row the pointer passes
        window.getSelection()?.removeAllRanges();
      }
      // The row of its group under the pointer; above the first or below the last, that one
      const rows = [...document.querySelectorAll<HTMLElement>(`li[data-project][data-group="${CSS.escape(group)}"]`)];
      const boxes = rows.map((r) => r.getBoundingClientRect());
      const at = boxes.findIndex((b) => e.clientY >= b.top && e.clientY < b.bottom);
      const i = at >= 0 ? at : boxes.length && e.clientY < boxes[0].top ? 0 : rows.length - 1;
      if (i >= 0) over = { path: rows[i].dataset.project!, line: e.clientY < boxes[i].top + boxes[i].height / 2 ? "before" : "after" };
      setDrag({ from, over, ghost: { left: head.left, top: e.clientY - (y0 - head.top), width: head.width } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDrag(null);
      if (!active) return;
      // The click that follows letting go must not bring a window to the front; only that one
      const swallow = (c: MouseEvent) => (c.stopPropagation(), c.preventDefault());
      window.addEventListener("click", swallow, { capture: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const next = over && moved(order, from, over.path, over.line);
      if (!next) return;
      // Shown at once; the backend's answer follows with the next state
      const byPath = new Map(projects.map((q) => [q.path, q]));
      setProjects([...next.flatMap((q) => byPath.get(q) ?? []), ...projects.filter((q) => !q.listed)]);
      void reorderProjects(next).catch((err) => tell(String(err)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const [picking, setPicking] = useState<Picking | null>(null);
  useEffect(() => {
    pickListener = setPicking;
    return () => void (pickListener = null);
  }, []);
  // As the backend names the window (tray.rs), in case the web view's title shows through
  useEffect(() => void (inProject || (document.title = t("CodeDeck – Overview"))), [inProject]);
  const open = addOne;
  // Ctrl+O adds a project, here and in the project list of a project window
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
  const told = ([started, skipped]: [string[], string[]]) =>
    tell(
      [started.length ? t("Started: {names}", { names: started.join(", ") }) : t("Nothing to start"), skipped.length ? t("running already: {names}", { names: skipped.join(", ") }) : ""]
        .filter(Boolean)
        .join(" · "),
    );
  const startAll = () =>
    void startToday()
      .then(told)
      .catch((e) => tell(String(e)));
  // Started by itself as CodeDeck started ("at start")
  useEffect(
    () =>
      onTodayStarted((outcome) => {
        if (outcome.Ok) told(outcome.Ok);
        else if (outcome.Err) tell(outcome.Err);
      }),
    [],
  );
  return (
    <InWindowContext.Provider value={inWindow ?? null}>
    <div className={`flex flex-col bg-panel text-[13px] ${inWindow ? "min-h-0 flex-1" : "h-screen"}`}>
      {/* In a project window the project bar is above; here only the list's own tools, in one row */}
      <header className={`flex shrink-0 items-center gap-1 border-b border-line pr-2 pl-3 ${inProject ? "h-9" : "zone-tabs area-ai h-10"}`}>
        {inProject ? <span className="text-[12px] font-semibold tracking-wider text-slate-400 uppercase">{t("Projects")}</span> : <img src="/codedeck.svg" alt="" className="size-[18px]" />}
        <span className="flex-1" />
        {groups.length > 0 && (
          <>
            <button type="button" title={t("Fold all groups away")} onClick={() => setAll(true)} disabled={groups.every((g) => collapsed.has(g))} className={toolButton}>
              <ChevronsDownUp className="size-4" />
            </button>
            <button type="button" title={t("Show all groups")} onClick={() => setAll(false)} disabled={groups.every((g) => !collapsed.has(g))} className={toolButton}>
              <ChevronsUpDown className="size-4" />
            </button>
            <span className="mx-1 h-4 w-px bg-line" />
          </>
        )}
        <button
          type="button"
          title={toStart ? t("Start today's list: {n} without a running session", { n: toStart }) : t("Start today's list (set in a project's menu)")}
          onClick={startAll}
          className={`${toolButton} relative`}
        >
          <Play className="size-4" />
          {toStart > 0 && <span className="absolute top-0.5 right-0.5 min-w-3.5 rounded-full bg-ai px-0.5 text-center text-[9px] leading-[14px] font-semibold text-white">{toStart}</span>}
        </button>
        {/* Adding a project is in the menu (user, 2026-11-19), with Ctrl+O */}
        <MoreMenu host={host} inWindow={inProject} />
      </header>
      {/* Only the project list scrolls (user, 2026-11-20: scrolled down, "Recently" was out of sight);
          what waits and "Recently" stay on top. No overflow on the top part: it would cut off a row's menu */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0">
        <Waiting projects={projects} />
        {/* The projects one moves between, at the top (user, 2026-11-19: with more than 20 they were hard
            to find again); they stay in their groups below too, so nothing there moves when one switches */}
        {inWindow && recentInPlace(projects).length > 0 && (
          // A box of its own, apart from the list below (user, 2026-11-19: it did not stand out enough)
          // No `overflow-hidden` for the round corners: it cut off a row's menu; the last row rounds itself
          <section aria-label={t("Recently")} className="mx-2 mt-3 rounded-lg border border-line bg-raised/40">
            <h2 className="flex h-7 items-center gap-1.5 border-b border-line/60 px-3 text-[12px] font-semibold tracking-wider text-ai uppercase">
              <History className="size-3.5" />
              {t("Recently")}
            </h2>
            <ul className="select-none [&>li:last-child_[role=button]]:rounded-b-[7px]">
              {recentInPlace(projects).map((p) => (
                <ProjectRow key={`recent:${p.path}`} project={p} name={p.name} inRecent />
              ))}
            </ul>
          </section>
        )}
        </div>
        {/* No heading: the projects are what the overview is; only the room below "Waits for you" stays */}
        <div className="min-h-0 flex-1 overflow-y-auto pt-4 pb-3">
        {projects.length ? (
          // Nothing here to select; a press that becomes a drag must not mark text on its way
          <ul className="select-none">
            {sectionsOf(projects).map((section, i) =>
              section.group === null ? (
                section.items.map((p) => <ProjectRow key={p.path} project={p} name={p.name} drag={dragOf(p, null)} />)
              ) : (
                <GroupSection key={`g:${section.group}`} group={section.group} projects={section.items} first={i === 0} folded={collapsed.has(section.group)} onFold={() => fold(section.group!)}>
                  {section.items.map((p) => (
                    <ProjectRow key={p.path} project={p} name={nameIn(p.name, section.group)} drag={dragOf(p, section.group)} />
                  ))}
                </GroupSection>
              ),
            )}
          </ul>
        ) : (
          <p className="px-3 py-2 text-[12px] text-slate-500">{t("No projects yet. + adds one; its window opens when you click it.")}</p>
        )}
        </div>
      </main>
      <Told />
      {drag && <DragGhost project={projects.find((p) => p.path === drag.from)} name={dragName(drag.from)} at={drag.ghost} />}
      {picking && (
        <MarkPicker
          name={picking.name}
          color={picking.color}
          mark={picking.mark}
          onCancel={() => setPicking(null)}
          onDone={(mark) => {
            void Promise.all(picking.paths.map((path) => setProject(path, "mark", mark))).catch((e) => tell(String(e)));
            setPicking(null);
          }}
        />
      )}
    </div>
    </InWindowContext.Provider>
  );
}

/**
 * The folded project list (docs/PLAN.md "Projektliste im Fenster statt Übersicht"): one mark per
 * project in the order of the list, marked as on the icons (a pill with the number that ask, a dot
 * for a finished turn), the one shown here on a band. A click shows it here, Ctrl+click in a new
 * window. Groups have no heading here; their projects follow each other.
 */
export function ProjectsRail({ inWindow }: { inWindow: InWindow }) {
  const [projects] = useOverview();
  const now = useNow();
  // Recently shown first, apart and in their fixed places; then every project in the order of the list
  const recent = recentInPlace(projects);
  const rest = sectionsOf(projects).flatMap((s) => s.items);
  return (
    <ul className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1.5 [scrollbar-width:none]">
      {[...recent.map((p) => ({ p, key: `recent:${p.path}`, last: p === recent.at(-1) })), ...rest.map((p) => ({ p, key: p.path, last: false }))].map(({ p, key, last }) => {
          const sessions = (p.state?.sessions ?? []).filter((s) => relevant(s, now));
          const asks = sessions.filter((s) => needsYou(s) === "asks").length;
          const done = sessions.some((s) => needsYou(s) === "done" && waitsForYou(s, now));
          const shown = inWindow.current === p.path;
          return (
            <li key={key} className={last ? "mb-1 border-b border-line/60 pb-2" : ""}>
              <button
                type="button"
                title={`${p.name}${asks ? ` · ${t("{n} asking", { n: asks })}` : done ? ` · ${t("A turn is done")}` : ""}\n${t("Show it here · Ctrl+click or middle click: in a new window")}`}
                onClick={(e) => inWindow.onOpen(p.path, e.ctrlKey || e.metaKey)}
                onAuxClick={(e) => e.button === 1 && inWindow.onOpen(p.path, true)}
                className={`relative flex size-8 items-center justify-center rounded-md ${shown ? "bg-raised ring-1 ring-ai" : "hover:bg-raised"}`}
              >
                <ProjectMark project={p} size={22} />
                {asks > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-changed px-0.5 text-[9px] leading-none font-bold text-[#14161a]">
                    {Math.min(asks, 99)}
                  </span>
                )}
                {!asks && done && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-added" />}
              </button>
            </li>
          );
      })}
    </ul>
  );
}
