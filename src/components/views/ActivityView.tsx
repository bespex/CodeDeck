import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Eye, FileText, RotateCcw, SquarePen, ZoomIn, ZoomOut } from "lucide-react";
import { openFile, type AssistantState, type JournalLine, type Snapshot } from "../../backend";
import { shortId, touchedFiles, useSessionMarks } from "../../assistant";
import type { GitView } from "../../git";
import { Row, Rows, Section, useFold } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { LOCALE } from "../Trail";
import { UsageCards } from "../UsagePanel";
import { Tooltip, ToolTipBody } from "../Tooltip";
import { plural, snapshotLabel, t } from "../../i18n";
import { dayOf, lanesOf, spanOf, ticksIn, useJournal, zoomed, type Day } from "../../timeline";

const clock = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

/** How many days back the timeline can go: the journal keeps a week. */
const MAX_BACK = 6;

/** The heading of the day: weekday and date, with „Today“ or „Yesterday“ in front for those two. */
function dayTitle(day: Day): string {
  const name = day.offset === 0 ? `${t("Today")}, ` : day.offset === 1 ? `${t("Yesterday")}, ` : "";
  // Midday, so that a daylight-saving change does not move the date
  const date = new Date(day.from + 12 * 3600_000).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  return name + date;
}

/** A time of day, with the date when it is not today. */
const whenOf = (ms: number, now: number) =>
  new Date(ms).toDateString() === new Date(now).toDateString() ? clock(ms) : `${new Date(ms).toLocaleDateString(LOCALE, { day: "numeric", month: "short" })} ${clock(ms)}`;

/** How long, in hours and minutes. */
function lengthOf(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return t("under a minute");
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** The current time, moved on every half minute so that "now" on the timeline keeps up. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * What are the sessions doing? When each worked and waited today, how safe the work is, and the
 * documents they wrote: the results of their work, to read first.
 */
export function ActivityView({ assistant, git, snapshots }: { assistant: AssistantState; git: GitView; snapshots: Snapshot[] }) {
  const marks = useSessionMarks();
  const lines = useJournal(assistant);
  const docs = recentDocs(assistant, lines, marks.writer);
  const button = "rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100";
  return (
    <div className="flex min-h-full flex-col">
      <Today assistant={assistant} snapshots={snapshots} />
      <Safety git={git} snapshots={snapshots.length} />
      <Section
        title={t("Claude usage")}
        help={t("How much of each account's allowance is used, as Claude Code states it to its status line: percent of the limit, and when it starts over. Nothing is estimated; only the warning (amber) is worked out: at the pace so far the limit would be used up before it starts over. The figures are the account's, not this project's, and come with a running session.")}
      >
        {/* Boxes, not text: as much room above them as below, where the next section begins (user, 2026-11-17) */}
        <div className="pt-4">
          <UsageCards assistant={assistant} onlySetUp />
        </div>
      </Section>
      <Section
        title={t("Documents written")}
        note={t("last 24 hours")}
        help={t("Documents (Markdown, HTML, text) that sessions wrote in this project, newest first: usually the result of a turn, so you can read it before you look at the changes. It does not matter whether they are committed. Only writes CodeDeck has seen count; work from before it was connected is not in the list.")}
      >
        {docs.length === 0 ? (
          <p>{t("None seen yet. Documents that a session writes while CodeDeck is connected show up here, so you can read the result of a turn first.")}</p>
        ) : (
          <Rows>
            {docs.map(({ path, at, session }) => {
              const mark = marks.of(session);
              return (
                <Row key={path}>
                  <FileText className="size-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{path}</span>
                  {mark && <SessionBadge mark={mark} />}
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Tooltip content={<span>{t("View")}</span>}>
                    <button type="button" aria-label={t("View {path}", { path })} onClick={() => openFile(path, "view")} className={button}>
                      <Eye className="size-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip content={<span>{t("Edit, e.g. to add comments for the assistant")}</span>}>
                    <button type="button" aria-label={t("Edit {path}", { path })} onClick={() => openFile(path, "edit")} className={button}>
                      <SquarePen className="size-3.5" />
                    </button>
                  </Tooltip>
                </Row>
              );
            })}
          </Rows>
        )}
      </Section>
    </div>
  );
}

const DOC_TYPES = /\.(md|markdown|html?|txt|adoc|rst)$/i;
/** How far back "recently" goes. */
const RECENT_DOCS_MS = 24 * 3600_000;

/** Documents written in the last day, newest first: what the sessions in the list touched, and what the journal remembers (also of sessions gone from the list). */
function recentDocs(state: AssistantState, lines: JournalLine[], writer: (path: string) => string | null) {
  const since = Date.now() - RECENT_DOCS_MS;
  const docs = new Map<string, { path: string; at: number; session: string | null }>();
  const add = (path: string, at: number, session: string | null) => {
    if (DOC_TYPES.test(path) && at > since && at > (docs.get(path)?.at ?? 0)) docs.set(path, { path, at, session });
  };
  for (const [path, at] of touchedFiles(state)) add(path, at, writer(path));
  for (const l of lines) if (l.kind === "after_write" && l.file && !l.file.startsWith("/")) add(l.file, l.at, l.session ?? null);
  return [...docs.values()].sort((a, b) => b.at - a.at);
}

/** The legend of the timeline: what a bar, a frame, a triangle and the line mean. */
function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5 bg-ai/80" />{t("working")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5 border border-changed bg-changed/15" />{t("asks")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-3.5" style={FADE_STYLE} />{t("in the background")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block border-x-[3px] border-b-[5px] border-x-transparent border-b-slate-500" />{t("snapshot before a turn")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-px bg-brand/70" />{t("now")}</span>
    </span>
  );
}

/** One row per session: when it worked, when it waited for you, where its snapshots were taken. */
function Today({ assistant, snapshots }: { assistant: AssistantState; snapshots: Snapshot[] }) {
  const marks = useSessionMarks();
  const now = useNow();
  // Which calendar day: today, or how many days back. The journal keeps a week, so six days back at most
  const [back, setBack] = useState(0);
  const day = dayOf(now, back);
  const lines = useJournal(assistant, day);
  const lanes = lanesOf(lines, assistant.sessions, now, day);
  const full = spanOf(lanes, now, day);
  // Zoom: a stretch of the day, or the whole of it (`null`). Ctrl + wheel zooms at the pointer, a drag moves it.
  const [zoom, setZoom] = useState<{ from: number; to: number } | null>(null);
  const span = zoom ? { ...zoom, ticks: ticksIn(zoom.from, zoom.to) } : full;
  const len = span.to - span.from;
  // Not clamped: a block that starts before the view is clipped by the row
  const at = (ms: number) => `${((ms - span.from) / len) * 100}%`;
  const width = (from: number, to: number) => `${(Math.max(to - from, 0) / len) * 100}%`;
  const inView = (ms: number) => ms >= span.from && ms <= span.to;
  const zoomAt = (factor: number, anchor: number) => setZoom(zoomed(full, anchor - ((anchor - span.from) / len) * len * factor, len * factor));
  const help = useFold("activity.help", false);
  const grid = useRef<HTMLDivElement>(null);
  const spanRef = useRef({ span, full });
  spanRef.current = { span, full };
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { span: cur, full: whole } = spanRef.current;
      // Over the rows: the time under the pointer stays where it is
      const box = el.getBoundingClientRect();
      const track = Math.max(box.width - 170, 1);
      const ratio = Math.min(Math.max((e.clientX - box.left - 170) / track, 0), 1);
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      const nextLen = (cur.to - cur.from) * factor;
      setZoom(zoomed(whole, cur.from + ratio * (cur.to - cur.from) * (1 - factor), nextLen));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [lanes.length > 0]);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const nameOf = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  // Going back or forward clears the zoom: its stretch of time belongs to the day it was made on
  const turn = (to: number) => {
    setBack(to);
    setZoom(null);
  };
  return (
    <Section
      // The buttons stay at the left edge: centred, they would move with every change of the date's length
      title={
        <span className="flex items-center gap-1 whitespace-nowrap">
          <ZoomButton label={t("Previous day")} onClick={() => turn(back + 1)} disabled={back >= MAX_BACK}><ChevronLeft className="size-3.5" /></ZoomButton>
          <ZoomButton label={t("Next day")} onClick={() => turn(back - 1)} disabled={back === 0}><ChevronRight className="size-3.5" /></ZoomButton>
          <ZoomButton label={t("Go to today")} onClick={() => turn(0)} disabled={back === 0}><CalendarDays className="size-3.5" /></ZoomButton>
          <span className="ml-1">{dayTitle(day)}</span>
        </span>
      }
      note={t("what each session did, and when")}
      aside={
        <>
          <Legend />
          {lanes.length > 0 && (
            <span className="flex items-center gap-0.5">
              <ZoomButton label={t("Zoom out")} onClick={() => zoomAt(1.5, span.from + len / 2)} disabled={!zoom}><ZoomOut className="size-3.5" /></ZoomButton>
              <ZoomButton label={t("Zoom in")} onClick={() => zoomAt(1 / 1.5, span.from + len / 2)}><ZoomIn className="size-3.5" /></ZoomButton>
              <ZoomButton label={t("Whole day")} onClick={() => setZoom(null)} disabled={!zoom}><RotateCcw className="size-3.5" /></ZoomButton>
            </span>
          )}
          <button
            type="button"
            aria-label={t("What do these terms mean?")}
            aria-expanded={help.open}
            title={t("What do these terms mean?")}
            onClick={help.toggle}
            className={`rounded p-1 hover:bg-raised hover:text-slate-100 ${help.open ? "bg-raised text-slate-100" : "text-slate-400"}`}
          >
            <CircleHelp className="size-3.5" />
          </button>
        </>
      }>
      {help.open && <TimelineHelp />}
      {lanes.length === 0 ? (
        <p>
          {back === 0
            ? t("No session has done anything today yet. Each one that works shows up here, with the time it worked and the time it waited for you.")
            : t("No session did anything on this day.")}
        </p>
      ) : (
        // No frame: the timeline is the content of the section like any other, so the spacing is the same all round
        <div
          ref={grid}
          className={`grid touch-pan-y grid-cols-[170px_minmax(0,1fr)] items-center gap-y-3 pt-1 pb-2 ${zoom ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={(e) => {
            if (zoom && e.button === 0) {
              drag.current = { x: e.clientX, from: zoom.from };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (!drag.current || !zoom) return;
            const track = Math.max(e.currentTarget.getBoundingClientRect().width - 170, 1);
            setZoom(zoomed(full, drag.current.from - ((e.clientX - drag.current.x) / track) * len, len));
          }}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={() => setZoom(null)}
        >
          <div />
          <div className="relative h-5 text-[11px] text-slate-500">
            {span.ticks.filter(inView).map((tick) => (
              <span key={tick} className="absolute top-0 -translate-x-1/2 tabular-nums" style={{ left: at(tick) }}>
                {clock(tick)}
              </span>
            ))}
          </div>
          {lanes.map((lane) => {
            const mark = marks.of(lane.session);
            const session = assistant.sessions.find((s) => s.id === lane.session);
            const status = session?.status;
            const startedAt = session?.started ?? null;
            const sum = (phase: "working" | "waiting") => lane.blocks.filter((b) => b.phase === phase).reduce((n, b) => n + (b.to - b.from), 0);
            const worked = sum("working");
            const waited = sum("waiting");
            return (
              <LaneRow
                key={lane.session}
                label={
                  // One tooltip for the whole label: the name as well as the line beneath it
                  <Tooltip
                    className="block min-w-0"
                    content={
                      <ToolTipBody
                        label={nameOf(lane.session)}
                        says={
                          <span className="flex flex-col">
                            {startedAt !== null && <span>{t("Started: {when}", { when: whenOf(startedAt, now) })}</span>}
                            <span>{t("Last activity: {when}", { when: whenOf(lane.last, now) })}</span>
                            {startedAt !== null && <span>{t("Duration: {time}", { time: lengthOf(lane.last - startedAt) })}</span>}
                            <span>{t("Worked: {time}", { time: lengthOf(worked) })}</span>
                            <span>{t("Waited for you: {time}", { time: lengthOf(waited) })}</span>
                          </span>
                        }
                        hint={t("Worked and waited count the time shown on this timeline; the turns are those since the journal began.")}
                      />
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      {mark && <SessionBadge mark={mark} />}
                      <span className="truncate text-slate-200">{nameOf(lane.session)}</span>
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {plural(lane.turns, "turn")} · {t("last {time}", { time: clock(lane.last) })}
                    </div>
                  </Tooltip>
                }
              >
                {/* A hairline for the time, a bar on it for each stretch of work or waiting, small triangles below for the snapshots */}
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {lane.blocks.filter((b) => b.to >= span.from && b.from <= span.to).map((b) => (
                  <div key={b.from} className="absolute top-[12px] h-2.5" style={{ left: at(b.from), width: `max(4px, ${width(b.from, b.to)})` }}>
                    <Tooltip
                      className="block size-full"
                      content={
                        <ToolTipBody
                          label={
                            b.phase === "working"
                              ? t("Working")
                              : b.phase === "waiting"
                                ? t("Waiting for you")
                                : b.end === "known"
                                  ? t("Running in the background")
                                  : t("Running in the background, end not known")
                          }
                          says={
                            b.phase === "background" && b.end === "unknown"
                              ? `${clock(b.from)}– · ${b.text ?? ""}`
                              : `${clock(b.from)}–${b.to >= now - 60_000 && status !== "idle" ? t("now") : clock(b.to)}${b.text ? ` · ${b.text}` : ""}`
                          }
                          hint={
                            b.phase !== "background"
                              ? undefined
                              : b.end === "known"
                                ? t("The turn was over, but a job it started was still running. When the job ended, the session began a new turn by itself.")
                                : t("The turn is over, but a job it started is still running. When it ends, the session begins a new turn by itself. CodeDeck is not told when, so the bar fades out.")
                          }
                        />
                      }
                    >
                      {/* Working is filled, waiting a frame: you are on, nothing happens */}
                      <span
                        className={`block size-full ${
                          b.phase === "working" ? "bg-ai/80" : b.phase === "waiting" ? "border border-changed bg-changed/15" : b.end === "known" ? "bg-ai/30" : ""
                        }`}
                        // An end nobody announced fades out instead of stopping: no edge that says more than is known
                        style={b.phase === "background" && b.end === "unknown" ? FADE_STYLE : undefined}
                      />
                    </Tooltip>
                  </div>
                ))}
                {snapshots
                  .filter((s) => s.session === lane.session && inView(s.at * 1000) && !s.back && !s.turnFrom)
                  .map((s) => (
                    <div key={s.hash} className="absolute bottom-0 flex h-2.5 -translate-x-1/2 items-end" style={{ left: at(s.at * 1000) }}>
                      <Tooltip className="flex items-end" content={<ToolTipBody label={t("Snapshot before a turn")} says={`${clock(s.at * 1000)} · ${snapshotLabel(s.label)}`} />}>
                        <span className="inline-block border-x-4 border-b-[6px] border-x-transparent border-b-slate-500" />
                      </Tooltip>
                    </div>
                  ))}
                {inView(now) && <span className="pointer-events-none absolute inset-y-0 w-px bg-brand/70" style={{ left: at(now) }} />}
              </LaneRow>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function ZoomButton(props: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip content={<span>{props.label}</span>}>
      <button
        type="button"
        aria-label={props.label}
        disabled={props.disabled}
        onClick={props.onClick}
        className="rounded p-1 text-slate-400 hover:bg-raised hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {props.children}
      </button>
    </Tooltip>
  );
}

function LaneRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="min-w-0 pr-2.5">{label}</div>
      <div className="relative h-[34px] overflow-hidden">{children}</div>
    </>
  );
}

/** What is at risk if the machine fails now: the same three lines as the trail's colours. */
function Safety({ git, snapshots }: { git: GitView; snapshots: number }) {
  const ahead = git.repos.reduce((n, r) => n + r.ahead, 0);
  const remote = git.repos.some((r) => r.remotes.length > 0);
  // A figure: the number large, its name small beneath, the trail's colour as a line above
  const metric = (line: string, label: string, value: string) => (
    <div className={`flex min-w-[120px] flex-col gap-0.5 border-t-2 pt-2 ${line}`}>
      <span className="text-[22px] leading-none font-semibold text-slate-100 tabular-nums">{value}</span>
      <span className="text-[12px] text-slate-400">{label}</span>
    </div>
  );
  if (git.repos.length === 0) {
    return (
      <Section title={t("How safe is your work")}>
        <p>{t("This project has no Git repository, so CodeDeck takes no snapshots and there is nothing to go back to. Run git init in the project folder to get them.")}</p>
      </Section>
    );
  }
  return (
    <Section title={t("How safe is your work")}>
      {/* The figures on the left; the explanation beside them when there is room, below them when not */}
      {/* 16px above, so that the room under the figures (to the next section's heading) is the same 24px as above them */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pt-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {metric("border-changed", t("Not committed"), plural(git.changed, "file"))}
          {metric("border-dashed border-changed", t("Committed, not pushed yet"), remote ? plural(ahead, "commit") : "–")}
          {metric("border-slate-500", t("Snapshots to go back to"), String(snapshots))}
        </div>
        <p className="min-w-[200px] flex-1 pt-1 text-[12px]">
          {git.changed > 0
            ? t("Uncommitted work exists only in your folder and in the snapshots.")
            : ahead > 0
              ? t("Committed work is not on the remote yet.")
              : !remote
                ? t("There is no remote to push to: everything stays on this machine.")
                : t("Nothing is at risk.")}
        </p>
      </div>
    </Section>
  );
}

/** A stretch of unknown end: full at its start, gone after a while. */
const FADE_STYLE = { background: "linear-gradient(to right, color-mix(in srgb, var(--color-ai) 70%, transparent), transparent)" };
const SWATCH_BACKGROUND = <span className="inline-block h-2 w-5" style={FADE_STYLE} />;
const SWATCH_WORKING = <span className="inline-block h-2 w-5 bg-ai/80" />;
const SWATCH_WAITING = <span className="inline-block h-2 w-5 border border-changed bg-changed/15" />;
const SWATCH_ANCHOR = <span className="inline-block border-x-4 border-b-[6px] border-x-transparent border-b-slate-500" />;
const SWATCH_NOW = <span className="inline-block h-3 w-px bg-brand/70" />;
const SWATCH_GAP = <span className="inline-block h-px w-5 bg-line" />;

/**
 * The terms of the timeline and how they hang together, with the signs it uses; opened by the "?"
 * in the heading. The same words and signs as the trail, where a turn's snapshots show as ⚓ and ⚑.
 */
function TimelineHelp() {
  const sign = (swatch: React.ReactNode, name: string, text: string) => (
    <div className="flex gap-2.5">
      <span className="flex w-6 shrink-0 items-center justify-center pt-1.5">{swatch}</span>
      <p>
        <span className="font-semibold text-slate-200">{name}.</span> {text}
      </p>
    </div>
  );
  const term = (name: string, text: string) => (
    <p>
      <span className="font-semibold text-slate-200">{name}.</span> {text}
    </p>
  );
  return (
    <div className="mb-3 flex flex-col gap-2 border-l-2 border-line pl-3 text-[12px] leading-relaxed text-slate-300">
      {term(t("Turn"), t("One prompt of yours, until the session reports that it is done."))}
      {term(
        t("Snapshot"),
        t("A saved copy of your project files. CodeDeck takes one just before a session first writes in a turn, and one at the end of the turn if files changed. What lies between the two is what the turn changed."),
      )}
      {term(
        t("Going back"),
        t("Puts the files back as they were in a snapshot; files created since then are deleted. The present is saved as a snapshot first, so you can undo it."),
      )}
      {term(
        t("In Git terms"),
        t("A snapshot is a commit of the working folder under its own ref, refs/codedeck/snapshots/, like the one git stash makes but on no branch and never pushed. It needs a Git repository."),
      )}
      <p className="pt-1 font-semibold text-slate-100">{t("The signs")}</p>
      {sign(SWATCH_WORKING, t("Working"), t("The session is busy with a turn."))}
      {sign(SWATCH_WAITING, t("Waiting for you"), t("It asked you something or needs your permission."))}
      {sign(SWATCH_BACKGROUND, t("Running in the background"), t("The turn is over, but something it started goes on (a build, a helper) and may wake the session. A hard end: it announced that it finished. A fading one: nothing says when."))}
      {sign(SWATCH_GAP, t("Gap"), t("Nothing runs: it waits for your next prompt."))}
      {sign(SWATCH_ANCHOR, t("Snapshot before a turn"), t("The point you can go back to. In the trail it is ⚓, the one at the end of a turn ⚑, the one before going back ↶."))}
      {sign(SWATCH_NOW, t("Now"), t("The current time."))}
      <p>
        <span className="font-semibold text-slate-200">{t("Zoom")}.</span> {t("Ctrl and the mouse wheel zoom at the pointer, dragging moves the view, a double click shows the whole day.")}
      </p>
    </div>
  );
}
