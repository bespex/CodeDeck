import { useEffect, useState, type ReactNode } from "react";
import { AppWindow, GitBranch, Inbox, Paperclip, Plus } from "lucide-react";
import { focusProject, onOverviewChanged, openWindow, overviewState, pickFolder, type OverviewProject, type Session } from "../backend";
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

/** The project's mark: its first letter on its colour, until marks can be chosen. */
function ProjectMark({ project, size = 20 }: { project: OverviewProject; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: project.color, fontSize: Math.round(size * 0.52) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#0b0d10]"
    >
      {project.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** A small icon button that appears on hover of its row. */
function HoverIcon({ title, onClick, warn, children }: { title: string; onClick: () => void; warn?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded p-1 hover:bg-overlay-hover hover:text-slate-100 ${warn ? "text-problem" : "text-slate-400"}`}
    >
      {children}
    </button>
  );
}

function ProjectRow({ project }: { project: OverviewProject }) {
  const sessions = project.state.sessions.filter((s) => s.status !== "ended");
  const now = useNow();
  const asks = sessions.some((s) => needsYou(s) === "asks");
  const done = sessions.some((s) => needsYou(s) === "done" && now - (s.turnDone ?? s.last) < DONE_SHOWN_MS);
  const summary = project.summary ?? {};
  const dot = asks ? "bg-changed" : done ? "bg-added" : summary.gitFailed ? "bg-problem" : null;
  const front = () => void focusProject(project.label);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={front}
        onKeyDown={(e) => e.key === "Enter" && front()}
        title={t("Bring its window to the front")}
        className={`group/row flex cursor-pointer items-center gap-2 border-l-2 py-1.5 pr-2 pl-3 hover:bg-overlay-hover ${project.front ? "border-ai bg-raised" : "border-transparent"}`}
      >
        <ProjectMark project={project} />
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{project.name}</span>
        <AppWindow className="size-3.5 shrink-0 text-slate-500" aria-label={t("Its window is open")} />
        <span className="hidden items-center group-hover/row:flex">
          <HoverIcon title={`${t("Git")}: ${summary.git ?? "…"}`} warn={summary.gitFailed} onClick={() => void focusProject(project.label, "changes")}>
            <GitBranch className="size-3.5" />
          </HoverIcon>
          {!!summary.next && (
            <HoverIcon title={t("Next prompt: {n} attached", { n: summary.next })} onClick={() => void focusProject(project.label, "next")}>
              <Paperclip className="size-3.5" />
            </HoverIcon>
          )}
          {!!summary.news && (
            <HoverIcon title={t("Workbench: {n} new", { n: summary.news })} onClick={() => void focusProject(project.label, "workbench")}>
              <Inbox className="size-3.5" />
            </HoverIcon>
          )}
        </span>
        {dot && <span className={`size-2 shrink-0 rounded-full group-hover/row:hidden ${dot}`} />}
      </div>
      {sessions.length > 0 && (
        <ul>
          {sessions.map((s) => {
            const status = statusOf(s);
            return (
              <li
                key={s.id}
                onClick={front}
                title={t("Click: its project's window")}
                className="flex cursor-default items-center gap-2 py-1 pr-2 pl-9 text-[12px] hover:bg-overlay-hover"
              >
                <SessionBadge mark={markOf(s)} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{titleOf(s)}</span>
                <span className={`shrink-0 text-[11px] ${status.className}`}>{status.word}</span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** "Needs you" over every project: questions first, then finished turns of the last half hour. */
function Waiting({ projects }: { projects: OverviewProject[] }) {
  const now = useNow();
  const waiting = projects.flatMap((p) =>
    p.state.sessions
      .filter((s) => needsYou(s) === "asks" || (needsYou(s) === "done" && now - (s.turnDone ?? s.last) < DONE_SHOWN_MS))
      .map((s) => ({ project: p, session: s })),
  );
  waiting.sort((a, b) => Number(needsYou(b.session) === "asks") - Number(needsYou(a.session) === "asks"));
  if (!waiting.length) return null;
  return (
    <section aria-label={t("Needs you")}>
      <h2 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{t("Needs you")}</h2>
      <ul className="flex flex-col gap-1.5 px-2">
        {waiting.map(({ project, session: s }) => {
          const asks = needsYou(s) === "asks";
          return (
            <li
              key={`${project.label}:${s.id}`}
              data-event={asks ? "waiting" : "done"}
              onClick={() => void focusProject(project.label)}
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

export default function OverviewApp() {
  const projects = useOverview();
  useEffect(() => void (document.title = "CodeDeck"), []);
  const open = async () => {
    const path = await pickFolder();
    if (path) await openWindow(path);
  };
  return (
    <div className="flex h-screen flex-col bg-panel text-[13px]">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-2 pl-3">
        <img src="/codedeck.svg" alt="" className="size-[18px]" />
        <span className="flex-1" />
        <button type="button" title={t("Open a project (Ctrl+O)")} onClick={() => void open()} className="rounded-md p-1.5 text-slate-400 hover:bg-overlay-hover hover:text-slate-100">
          <Plus className="size-4" />
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto pb-3">
        <Waiting projects={projects} />
        <h2 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{t("Projects")}</h2>
        {projects.length ? (
          <ul>
            {projects.map((p) => (
              <ProjectRow key={p.label} project={p} />
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-[12px] text-slate-500">{t("No project open. + opens one; the overview stays as your radar.")}</p>
        )}
      </main>
    </div>
  );
}
