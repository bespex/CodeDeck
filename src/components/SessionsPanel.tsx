import { AccountMark } from "./ProjectMark";
import { accountLook, useAccounts } from "../accounts";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Ellipsis,
  Monitor,
  GitCompareArrows,
  MessageSquare,
  Paperclip,
  Pencil,
  Play,
  Layers,
  Eraser,
  Loader,
  Radio,
  RotateCcw,
  Power,
  SquareTerminal,
  X,
  User,
  type LucideIcon,
} from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import { HookPanel } from "./AssistantStatus";
import { Tooltip } from "./Tooltip";
import { changes } from "../changes";
import { notes } from "../notes";
import { markers } from "../markers";
import { isTerminalDoor, pendingSession, forgetSession, openSession, openUrl, resumeSession, stopSession, renameSession, type AssistantState, type Entry, type ProjectInfo, type Session } from "../backend";
import { useProjectAccount, useProjectLook } from "../projectLook";
import { usePending, type Pending } from "../pending";
import { StartCommand, useSessionCommands } from "./SessionCommands";
import { HoverTools, Tool, ToolGap } from "./RowTools";
import { useContextMenu } from "./ContextMenu";
import { mainHarness, shortId, useConnections, useSessionMarks, type SessionMark } from "../assistant";
import { SessionBadge, otherLine } from "./SessionBadge";
import { HeaderBar } from "./HeaderBar";
import { SidebarSummary } from "./SidebarSummary";
import type { GitView } from "../git";
import type { OpenProject } from "./ProjectHeader";
import { needsYou, OPENED_AT, putAside, useNow, useWaiting, waitKey, waitsSince } from "../attention";
import { files, filesText, type Pin } from "../files";
import { formatTokens, useAttachedKinds } from "./AttachmentList";
import { openView } from "../view";
import { showTurnOf } from "../turns";
import { AttachTarget, ChooseTarget, TargetLost } from "./AttachTarget";
import { plural } from "../git";
import { LOCALE } from "./Trail";
import { blockedUntil, resetAt } from "../usage";
import { known, T, t } from "../i18n";
import { PreparedPrompts } from "./PreparedPrompts";
import { usePerProject } from "../projectMemory";

interface Props {
  assistant: AssistantState;
  pins: Pin[];
  onPin: (entry: Entry) => void;
  onUnpin: (id: string) => void;
  onClear: () => void;
  /** Shows a file the assistant wrote: selects it in the file list and the deck */
  onShowFile: (path: string) => void;
  project: ProjectInfo | null;
  onOpenProject: OpenProject;
  onToggleLog: () => void;
  git: GitView;
}

/**
 * The right column, in two areas: the sessions working in the project (those that wait for you
 * first, as their own group, coloured only while something does) and what goes out with your
 * next prompt. Below the header a
 * short summary of what file list, trail and views show; it also feeds the project's row in the
 * overview of all projects (docs/UEBERSICHT.md).
 */
export function SessionsPanel(props: Props) {
  // The prepared prompt open in its editor, kept per project; while one is, the Next prompt area takes more room
  const [openPrompt, setOpenPrompt] = usePerProject<string | null>("openPrompt", () => null);
  // Closed, the Next prompt area is as high as what it holds and the session list above gives way:
  // capped at 40% as a whole, it cut its own text short, since the prepared prompts below it never
  // shrink (user, 2026-11-23). What is attached has its own cap and scrolls
  const rows = openPrompt ? "grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1.5fr)]" : "grid-rows-[auto_auto_minmax(0,1fr)_auto]";
  return (
    <aside data-tour="sessions" className={`zone-side grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] ${rows} border-r border-line bg-panel`}>
      <HeaderBar project={props.project} />
      <SidebarSummary git={props.git} assistant={props.assistant} project={props.project} />
      <Sessions state={props.assistant} onShowFile={props.onShowFile} />
      <NextPrompt {...props} openPrompt={openPrompt} onOpenPrompt={setOpenPrompt} />
    </aside>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
const titleOf = (s: Session) => s.title ?? t("Session {id}", { id: shortId(s.id) });
const markOf = (s: Session, known: SessionMark | null): SessionMark =>
  known ?? { color: `var(--color-session-${s.color})`, short: s.short, title: s.title };

/** The heading of an area: small capitals, as quiet as the area itself. */
function AreaHeader({ title, count, hint, asks, children }: { title: string; count?: number; hint?: string; asks?: boolean; children?: ReactNode }) {
  // The count is amber only while a session asks; finished turns alone are no call for attention
  const badge = `rounded-full px-1.5 text-[11px] font-semibold ${asks ? "bg-changed text-[var(--t-on-wait,var(--color-base))]" : "bg-raised text-slate-200"}`;
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 px-3">
      <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      {!!count &&
        (hint ? (
          <Tooltip content={<span>{hint}</span>}>
            <span className={badge}>{count}</span>
          </Tooltip>
        ) : (
          <span className={badge}>{count}</span>
        ))}
      {children && <div className="ml-auto flex min-w-0 items-center gap-1">{children}</div>}
    </header>
  );
}

/* ── Needs you ─────────────────────────────────────────────────────────────── */

/** A session that reports but has been idle this long is no longer one you are busy with. To become a setting. */
const EARLIER_AFTER_MS = 6 * 3600_000;

/* ── Sessions ──────────────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<Session["status"], string> = {
  working: "bg-ai",
  waiting: "bg-changed",
  idle: "bg-slate-500",
  ended: "bg-slate-700",
};

/**
 * The point before the state. While the session works a ring spreads from it, plain to see
 * from the corner of the eye. Set a touch lower than the middle of the line: small letters sit
 * below it, and the point should sit with them.
 *
 * The ring also runs where the system asks for reduced motion: GTK reports that on some
 * desktops without the user having chosen it, the ring is small, and a working session must
 * never look the same as an idle one.
 */
function StatusDot({ status }: { status: Session["status"] }) {
  return (
    <span className="relative flex size-2 shrink-0 translate-y-px">
      {status === "working" && <span className="absolute inset-0 animate-ping rounded-full bg-ai opacity-80" />}
      <span className={`relative size-2 rounded-full ${STATUS_COLOR[status]}`} />
    </span>
  );
}

/**
 * The state in a word or two, with the time that matters: how long it has been asking, when its
 * turn ended (today the time, else the day), when it was last active. While it works there is none.
 * A finished turn you saw is quiet: it no longer waits for you.
 */
function statusWords(s: Session, now: number): { words: string; at: number | null; tone: Tone } {
  if (s.status === "working") return { words: t("working"), at: null, tone: "ai" };
  if (s.status === "waiting") {
    const minutes = Math.floor((now - s.last) / 60_000);
    return { words: minutes < 1 ? t("asks") : `${t("asks")} · ${t("{n} min", { n: minutes })}`, at: s.last, tone: "wait" };
  }
  if (s.status === "ended") return { words: `${t("ended")} · ${since(s.last, now)}`, at: s.last, tone: "quiet" };
  // Nothing was heard from it: whether it works right now is not known
  if (!s.capabilities.liveStatus) return { words: since(s.last, now), at: s.last, tone: "quiet" };
  if (s.turnDone != null) return { words: `${t("turn done")} · ${since(s.turnDone, now)}`, at: s.turnDone, tone: s.seen ? "quiet" : "done" };
  return { words: `${t("idle")} · ${since(s.last, now)}`, at: s.last, tone: "quiet" };
}

const DAY = 24 * 3600_000;

/** When, as short as it reads: minutes ago within the hour, today the time, then yesterday or the day. */
function since(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{n} min ago", { n: minutes });
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  if (at >= midnight) return time(at);
  if (at >= midnight - DAY) return t("yesterday {time}", { time: time(at) });
  return new Date(at).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

/**
 * What a permission asks about, if the session said it with its last step: the command or the
 * file. Only when the question names that step's tool; another question (e.g. a choice) has
 * nothing to do with the step before it.
 */
function askedAbout(s: Session): string | null {
  const tool = s.step?.split(" ")[0];
  return s.status === "waiting" && tool && s.step !== tool && s.message?.includes(tool) ? s.step : null;
}

/** It can be continued from here: its process is gone, or never was known to run. */

/** How a state's pill is coloured: the status is what one looks for first (user, 2026-11-17). */
type Tone = "ai" | "wait" | "done" | "quiet" | "problem";
const PILL: Record<Tone, string> = {
  ai: "bg-ai/15 text-ai",
  wait: "bg-changed/20 text-changed",
  done: "bg-added/15 text-added",
  quiet: "bg-slate-500/15 text-slate-400",
  problem: "bg-problem/20 text-problem",
};

/**
 * The one thing that counts right now: the step while working, the question while waiting, then
 * the result. `from` says what it is made of, so that the fold-out does not say it again.
 */
function headline(s: Session): { text: string; from: "step" | "prompt" | "message" | "result" } {
  const prompt = { text: s.prompt ?? "", from: "prompt" as const };
  if (s.status === "working") return s.step ? { text: s.step, from: "step" } : s.prompt ? prompt : { text: t("Working"), from: "result" };
  if (s.status === "waiting") return { text: s.message ?? t("Waits for your answer"), from: "message" };
  if (s.touched.length > 0) return { text: t("Wrote {files}", { files: plural(s.touched.length, "file") }), from: "result" };
  return s.prompt ? prompt : { text: t("Nothing written"), from: "result" };
}

function Sessions({ state, onShowFile }: { state: AssistantState; onShowFile: (path: string) => void }) {
  const look = useProjectLook(undefined);
  const mine = useProjectAccount(state, look);
  const hooks = useConnections();
  const harness = mainHarness(state);
  const marks = useSessionMarks();
  const now = useNow();
  // Not the ones you are busy with: ended, never reported (known from the log only), or idle for hours
  const isEarlier = (s: Session) =>
    s.status === "ended" || !s.capabilities.liveStatus || (s.status === "idle" && now - s.last > EARLIER_AFTER_MS);
  // One list in the order the sessions started: with one to three of them a card that changes its
  // place each time it asks or finishes costs more than it shows (user, 2026-11-20; replaces the
  // group "Needs you" of D27). What waits for you says so on its own card
  const current = state.sessions.filter((s) => !isEarlier(s));
  const earlier = state.sessions.filter(isEarlier);
  // Folded unless nothing runs: then continuing one of them is what one is here for
  const [showEarlier, setShowEarlier] = useState<boolean | null>(null);
  const earlierOpen = showEarlier ?? current.length === 0;
  const Fold = earlierOpen ? ChevronDown : ChevronRight;
  const pending = usePending(look?.path, state.sessions);
  const waiting = useWaiting(state);
  const waits = new Map(waiting.map((s) => [s.id, needsYou(s) ?? undefined]));
  const asking = waiting.filter((s) => needsYou(s) === "asks").length;
  const item = (s: Session) => {
    const tool = state.harnesses.find((h) => h.id === s.harness) ?? harness;
    const wait = waits.get(s.id);
    return (
      <SessionItem
        key={wait ? waitKey(s) : s.id}
        session={s}
        wait={wait}
        now={now}
        blockedUntil={blockedUntil(state.usage, s.account, now)}
        onShowFile={onShowFile}
        toolName={tool.name}
        toolShort={tool.shortName}
        projectPath={look?.path}
        projectTool={mine.harness.id}
        projectAccount={mine.account?.dir}
        aimed={state.attachments.length > 0 && state.target === s.id}
        starting={pending.some((p) => p.id === s.id)}
      />
    );
  };
  return (
    // No tint of its own (user, 2026-11-17); a theme with zones colours the column
    <section className="flex min-h-0 flex-col border-b border-line">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AreaHeader
          title={t("Sessions")}
          count={waiting.length}
          asks={asking > 0}
          hint={t("Waiting for you: {asking} asking, {done} finished and not seen yet", { asking, done: waiting.length - asking })}
        />
        {state.sessions.length > 0 || pending.length > 0 ? (
          // Left as a whole: between two sessions the highlight stays, so nothing flickers on the way
          <div onMouseLeave={() => marks.hover(null)}>
            {current.length > 0 || pending.length > 0 ? (
              <ul className="flex flex-col gap-1.5 px-2 pb-2">
                {current.map(item)}
                {/* Started last, so at the end, where the session will stand once it reports */}
                {pending.map((p) => (
                  <PendingItem key={p.name} pending={p} projectPath={look?.path} />
                ))}
              </ul>
            ) : (
              <p className="px-3 pb-2 text-[12px] text-slate-500">{t("No AI session is at work here right now.")}</p>
            )}
            {earlier.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={earlierOpen}
                  onClick={() => setShowEarlier(!earlierOpen)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase hover:text-slate-300"
                >
                  <Fold className="size-3.5" />
                  {t("Earlier")}
                  <span className="font-normal tracking-normal normal-case">{earlier.length}</span>
                </button>
                {/* The latest first: the one to continue is most often the one that ran last */}
                {earlierOpen && <ul className="flex flex-col gap-1.5 px-2 pb-2">{[...earlier].sort((a, b) => b.last - a.last).map(item)}</ul>}
              </>
            )}
          </div>
        ) : hooks.setups && !hooks.connected ? (
          <div className="px-3 text-[12px] text-slate-300">
            <HookPanel hooks={hooks} harness={harness} heard={state.heard} />
          </div>
        ) : (
          <p className="grid h-full place-items-center px-6 text-center text-slate-500">
            {t("No AI session of {tool} has worked in this project since CodeDeck opened it. Start one in the project's folder: it shows up here with its first step.", { tool: harness.name })}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * A session CodeDeck started in tmux that has not reported yet. Often the tool asks something first
 * (whether to trust the folder) and says nothing until answered; this row makes it visible and
 * reachable: open its terminal, answer, and it turns into a normal session by itself.
 */
function PendingItem({ pending, projectPath }: { pending: Pending; projectPath: string | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  const commands = useSessionCommands(projectPath, pending.name);
  const act = (end: boolean) => projectPath && pendingSession(projectPath, pending.name, end).catch((e) => setFailed(String(e)));
  // Without a terminal program the tmux command in the tooltip is the way in
  const terminal = pending.door;
  return (
    <li onDoubleClick={() => terminal && void act(false)} title={terminal ? t("Double-click: open it in a terminal") : undefined} className="group/pending flex items-center gap-2.5 rounded-md py-2 pr-2.5 pl-2.5 hover:bg-raised/40">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-500/60 text-slate-400">
        <Loader className="size-4 animate-spin [animation-duration:2.5s]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium text-slate-100">{t("Starting…")}</span>
          {/* At first it starts; a tool silent for long most likely asks something */}
          <span className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ${pending.waits ? PILL.wait : PILL.quiet}`}>
            {pending.waits ? t("may be asking") : t("starting")}
          </span>
        </span>
        <span className="truncate text-[12px] text-slate-400">
          {pending.waits ? t("Nothing reported yet: it may ask a question, e.g. whether to trust the folder.") : t("It reports in a moment")}
        </span>
        {/* As every session: where it runs, the tools on the right while the mouse is on it */}
        <span className="flex h-[22px] items-center gap-1.5 text-[11px] text-slate-500">
          <span title={t("Runs in tmux ({name}). Attach with: tmux attach -t {name}", { name: pending.name })} className="flex h-[18px] shrink-0 items-center rounded border border-line px-1 leading-none text-slate-300">
            tmux
          </span>
          <span className="flex-1" />
          <HoverTools show="group-hover/pending:flex">
            {terminal && <Tool icon={SquareTerminal} label={t("Open it in a terminal, answer, and leave with Ctrl+B, D")} hint={t("Also: double-click")} onClick={() => void act(false)} />}
            {commands?.start && <Tool icon={Copy} label={t("Copy how it was started")} says={commands.tool ?? commands.start} onClick={() => void navigator.clipboard.writeText(commands.start!)} />}
            <ToolGap />
            <Tool icon={Power} danger label={t("End this AI session (nothing is lost; it never began)")} says={commands?.stop} onClick={() => void act(true)} />
          </HoverTools>
        </span>
        {failed && <span className="selectable text-[11px] text-problem">{failed}</span>}
      </span>
    </li>
  );
}

/** Two lines per session: who and in which state, then the one thing that counts. The rest folds out. */
/**
 * In the closed card: the attachments are meant for this session, or when it last got some. So
 * whether they arrived where they should needs no unfolding.
 */
function Receipt({ session: s, aimed }: { session: Session; aimed: boolean }) {
  if (aimed) {
    return (
      <span title={t("Your attachments go with its next prompt")} className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-brand/50 px-1 leading-none text-brand-soft">
        <Paperclip className="size-3 shrink-0" />
        {t("next prompt")}
      </span>
    );
  }
  // The start rules are not attachments: what counts is what the user attached
  const last = s.received.find((r) => r.labels.some((l) => l !== "Start rules"));
  if (!last) return null;
  return (
    <span
      title={t("Got your attachments at {time}: {what}", { time: time(last.at), what: last.labels.filter(Boolean).map(known).join(", ") })}
      className="flex shrink-0 items-center gap-0.5 text-slate-400 tabular-nums"
    >
      <Paperclip className="size-3 shrink-0" />
      <Check className="-ml-0.5 size-3 shrink-0 text-added" />
      {time(last.at)}
    </span>
  );
}

/**
 * One session, as a card: who and in which state; what counts now (the question and what it is
 * about, the turn's last words, the step it works on); then the way into it. `wait`: it waits for
 * you (asks, or finished a turn you have not seen) and stands out, raised; it keeps its place.
 */
function SessionItem({ session: s, wait, now, blockedUntil: reset, onShowFile, toolName, toolShort, projectPath, projectTool, projectAccount, aimed, starting }: { session: Session; wait?: "asks" | "done"; now: number; blockedUntil: number | null; onShowFile: (path: string) => void; toolName: string; toolShort: string; projectPath: string | undefined; projectTool: string; projectAccount: string | undefined; aimed: boolean; starting: boolean }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const marks = useSessionMarks();
  const mark = markOf(s, marks.of(s.id));
  const Chevron = open ? ChevronDown : ChevronRight;
  // Its account's limit is used up: it cannot go on before the reset, whatever else it says
  const blocked = reset !== null && s.status !== "ended";
  const status = blocked ? { words: `${t("waits for reset")} · ${resetAt(reset, Date.now(), LOCALE)}`, at: null, tone: "problem" as Tone } : statusWords(s, now);
  // Not started by CodeDeck: it cannot be stopped or restarted from here, so it says where it comes from
  const byHand = s.status !== "ended" && !s.place?.launched;
  // Sent to the background, it goes on there: continuing it here would split it a second time
  // What is offered comes from the backend (`doors`, `actions`: tool × computer × place × who
  // started it, docs/SITZUNGEN-PRUEFUNG.md K2); nothing here decides it again
  const canResume = s.actions.includes("continue") && !!projectPath;
  const terminalDoor = s.doors.some(isTerminalDoor);
  const background = !!s.place?.background && s.status !== "ended";
  // As in the project list: a double click goes to it (Desktop where reachable there, else its
  // terminal), a middle click always to its terminal
  const [failed, setFailed] = useState<string | null>(null);
  const fail = (e: unknown) => {
    setFailed(String(e));
    setTimeout(() => setFailed(null), 6000);
  };
  const door = s.doors[0] === undefined ? null : s.doors[0] === "desktop" ? "desktop" : "terminal";
  const go = (to: "desktop" | "terminal" | "auto") => {
    if (!projectPath || canResume || (to === "terminal" && !terminalDoor) || (to === "auto" && !door)) return;
    setFailed(null);
    openSession(projectPath, s.id, to).catch(fail);
  };
  const [resuming, setResuming] = useState(false);
  const resume = () => {
    if (!projectPath || resuming || !canResume) return;
    setFailed(null);
    setResuming(true);
    // Its "Starting…" row shows at once; the card turns live when the session reports
    resumeSession(projectPath, s.id)
      .catch(fail)
      .finally(() => setTimeout(() => setResuming(false), 4000));
  };
  // A click folds out, a double click goes to the session: the fold waits until a second click
  // can no longer come, so a double click leaves the row as it was
  const pending = useRef<number | null>(null);
  const cancelFold = () => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  };
  const fold = (e: React.MouseEvent) => {
    cancelFold();
    // Keyboard (detail 0) and sessions a double click does not open fold at once
    if (e.detail === 0 || canResume) return setOpen(!open);
    if (e.detail > 1) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      setOpen((o) => !o);
    }, 250);
  };
  const head = headline(s);
  const about = askedAbout(s);
  // What it said at the end counts more than how many files it wrote; not while it works on the next
  const report = s.status !== "working" && s.status !== "waiting" ? s.report : null;
  const finished = s.status === "idle" && s.turnDone != null && s.touched.length > 0;
  const tmuxName = s.status !== "ended" ? (s.place?.tmux?.session ?? undefined) : undefined;
  const commands = useSessionCommands(projectPath, tmuxName);
  // Only what CodeDeck started: a tmux session the user made would end with all that runs in it
  const canRestart = s.actions.includes("restart") && !!projectPath;
  const canStop = s.actions.includes("stop") && !!projectPath;
  // Not while its process is known to run: it must stay in sight, or one could never find it again
  // to write its next prompt (user, 2026-11-17). Where the process is not known (a session seen in
  // its log only) CodeDeck cannot promise anything, so it may go
  const removable = s.status === "ended" || s.alive !== true;
  // What is needed now and then: in the ⋯ of the toolbar and on the right mouse button
  const menu = useContextMenu();
  const openMenu = (e: React.MouseEvent) =>
    menu.open(e, titleOf(s), [
      {
        icon: Pencil,
        label: t("Rename"),
        run: () => {
          setOpen(true);
          setRenaming(true);
        },
      },
      ...(commands?.start ? [{ icon: Copy, label: t("Copy how it was started"), run: () => void navigator.clipboard.writeText(commands.start!) }] : []),
      {
        icon: X,
        label: t("Remove from list"),
        disabled: !removable,
        why: t("Not while it runs: it comes back by itself with its next step anyway"),
        run: () => forgetSession(s.id),
      },
    ]);
  return (
    <li
      // On the list: what belongs to this session stands out on the trail and in the file list
      onMouseEnter={() => marks.hover(s.id)}
      onContextMenu={openMenu}
      onDoubleClick={() => {
        cancelFold();
        if (canResume) resume();
        else go("auto");
      }}
      onAuxClick={(e) => e.button === 1 && go("terminal")}
      title={
        canResume
          ? t("Double-click: continue this conversation")
          : door
            ? terminalDoor
              ? t("Double-click: go to it ({door}) · middle click: terminal", { door: door === "desktop" ? t("Desktop") : t("Terminal") })
              : t("Double-click: open in the desktop app")
            : undefined
      }
      // `data-event`: a theme can make the reason stand out in its colour (docs/STYLING.md, `events`)
      data-event={wait === "asks" ? "waiting" : wait}
      className={`group/session @container/card rounded-md ${
        wait
          ? `event-row wait-card bg-raised ${wait === "asks" ? "wait-card-asks" : ""} ${waitsSince(s) > OPENED_AT ? "attention-new" : ""}`
          : open
            ? "bg-raised/60"
            : "hover:bg-raised/40"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={fold}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen(!open))}
        className="flex min-w-0 cursor-pointer items-start gap-2.5 py-2 pr-2.5 pl-2.5 text-left"
      >
        {/* The badge stands alone, large; what one reads is beside it */}
        <span className={`mt-0.5 ${s.status === "ended" ? "opacity-60" : ""}`}>
          <SessionBadge mark={mark} large />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 truncate font-medium ${s.status === "ended" ? "text-slate-300" : "text-slate-100"}`}>{titleOf(s)}</span>
            <span
              title={status.at !== null ? t("since {time}", { time: time(status.at) }) : undefined}
              // A finished turn you saw is no event any more: quiet, as the pill
              data-event={blocked ? "blocked" : s.status === "idle" && s.turnDone != null && s.capabilities.liveStatus ? (s.seen ? "idle" : "done") : s.status}
              className={`event-chip ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium whitespace-nowrap ${PILL[status.tone]}`}
            >
              <StatusDot status={s.status} />
              {status.words}
            </span>
          </span>
          {/* A session of another project (umbrella above or below): the badge's corner, in words */}
          {mark.elsewhere && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <span
                aria-hidden
                style={mark.elsewhere.where === "below" ? { background: mark.elsewhere.color } : { borderColor: mark.elsewhere.color }}
                className={`size-2 shrink-0 rounded-full ${mark.elsewhere.where === "above" ? "border-[1.5px]" : ""}`}
              />
              {otherLine(mark.elsewhere.where, mark.elsewhere.name)}
            </span>
          )}
          {/* What counts now, in full width: the question and what it is about; the turn's last words; the step */}
          {s.status === "waiting" ? (
            <span className="flex flex-col gap-1 text-[12px]">
              <span className="line-clamp-2 text-changed">{s.message ?? t("Waits for your answer")}</span>
              {about && <code className="selectable line-clamp-2 rounded bg-base/70 px-1.5 py-0.5 font-mono text-[11px] break-all text-slate-200">{about}</code>}
            </span>
          ) : report ? (
            <span title={report} className={`line-clamp-3 text-[12px] ${wait ? "text-slate-200" : "text-slate-400"}`}>
              {report}
            </span>
          ) : (
            <span className="truncate text-[12px] text-slate-400">{head.text}</span>
          )}
          {/* Sent to the background, the conversation goes on under another session: both say so */}
          {s.movedTo && <Related id={s.movedTo} words={t("Goes on in the background as")} />}
          {s.continues && <Related id={s.continues} words={t("Continues")} />}
          {/* The way into it, always in sight; the rarer tools while the mouse is on it. One height with or
              without them, so nothing moves */}
          <span className="flex h-[22px] min-w-0 items-center gap-1.5 overflow-hidden text-[11px] text-slate-500">
            <Chevron className="size-3.5 shrink-0 text-slate-500" />
            {background && (
              // Why there is no terminal to go back to: its tool keeps it, a terminal opens it there
              <span
                title={t("Runs in the background, without a terminal. “Terminal” opens it there; it keeps running when you leave.")}
                className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-ai/40 px-1 leading-none text-ai"
              >
                <Layers className="size-3 shrink-0" />
                {t("in the background")}
              </span>
            )}
            {finished && (
              <button
                type="button"
                onClick={(e) => (e.stopPropagation(), cancelFold(), showTurnOf(s.id))}
                onDoubleClick={(e) => e.stopPropagation()}
                title={t("Show what this turn changed, under Changes")}
                className="flex h-[20px] shrink-0 items-center gap-1 rounded px-1 text-slate-300 hover:bg-overlay-hover hover:text-slate-50"
              >
                <GitCompareArrows className="size-3.5 shrink-0" />
                {/* Narrow column: the icon alone (its title says the rest) */}
                <span className="hidden @[17rem]/card:inline">{t("See the turn")}</span>
              </button>
            )}
            <Receipt session={s} aimed={aimed} />
            <span className="flex-1" />
            <HoverTools show="group-hover/session:flex group-has-[:focus-visible]/session:flex" open={!!menu.element}>
              {s.doors.length > 0 && (
                <>
                  {s.doors.includes("desktop") && <Tool icon={Monitor} label={t("Open in the desktop app")} hint={door === "desktop" ? t("Also: double-click the session") : undefined} onClick={() => go("desktop")} />}
                  {terminalDoor && <Tool icon={SquareTerminal} label={t("Open in a terminal")} hint={t("Also: middle-click the session")} onClick={() => go("terminal")} />}
                </>
              )}
              {/* What changes its process, apart; only in tmux, and not while it works */}
              {(canRestart || canStop) && (
                <>
                  <ToolGap />
                  {canRestart && <Tool icon={RotateCcw} label={t("Restart: same conversation, fresh process")} says={commands?.stop && commands.start ? `${commands.stop}\n${commands.start}` : undefined} onClick={() => void stopSession(projectPath!, s.id, true).catch(fail)} />}
                  {canStop && <Tool icon={Power} danger label={t("Stop (the conversation is kept and can be continued)")} says={commands?.stop} onClick={() => void stopSession(projectPath!, s.id, false).catch(fail)} />}
                </>
              )}
              {wait === "done" && (
                <>
                  <ToolGap />
                  <Tool icon={Check} label={t("Seen: put aside until its next turn")} onClick={() => putAside(s)} />
                </>
              )}
              <ToolGap />
              <Tool icon={Ellipsis} label={t("More (also right click)")} onClick={(e) => openMenu(e)} />
            </HoverTools>
            {canResume ? (
              <button
                type="button"
                disabled={resuming}
                onClick={(e) => (e.stopPropagation(), cancelFold(), resume())}
                onDoubleClick={(e) => e.stopPropagation()}
                // Once started, a click shows its terminal (the backend starts no second process): the
                // tool may wait for an answer there before it reports
                title={starting ? t("Already being continued in tmux: opens its terminal") : t("Continue this conversation in a new process, in tmux")}
                className="flex h-[20px] shrink-0 items-center gap-1 rounded border border-line px-1.5 leading-none font-medium text-slate-300 hover:bg-overlay-hover hover:text-slate-50 disabled:opacity-60"
              >
                {resuming || starting ? <Loader className="size-3 shrink-0 animate-spin" /> : <Play className="size-3 shrink-0" />}
                {starting ? t("Starting…") : t("Continue")}
              </button>
            ) : s.noContinue ? (
              // Said, not a button that is missing without a word
              <span
                title={
                  s.noContinue === "noTmux"
                    ? t("This conversation could be continued in tmux, but tmux was not found on this computer (see About CodeDeck)")
                    : s.noContinue === "noTerminal"
                      ? t("No terminal program was found on this computer (see About CodeDeck)")
                      : t("Its AI tool cannot continue a conversation from here")
                }
                className="shrink-0 text-[11px] text-slate-500"
              >
                {s.noContinue === "noTmux" ? t("needs tmux to continue") : s.noContinue === "noTerminal" ? t("no terminal found") : t("cannot continue here")}
              </span>
            ) : !door && !s.noDoor ? null : !door ? (
              // No way in from here on this computer (e.g. its own terminal under Wayland): said, not offered
              s.noDoor === "noTerminal" ? (
                <span title={t("No terminal program was found on this computer (see About CodeDeck)")} className="shrink-0 text-[11px] text-slate-500">
                  {t("no terminal found")}
                </span>
              ) : (
                <span title={t("CodeDeck cannot bring this AI session's window to the front on this computer: switch to it where it runs")} className="shrink-0 text-[11px] text-slate-500">
                  {t("in its own terminal")}
                </span>
              )
            ) : (
              // Going in is a double click; the tools on hover hold the same ways as buttons. So at rest only
              // a marker says what the double click does (user, 2026-11-24: the button was unusable under
              // the hover tools). While it asks, "Answer" stays a button: it is what the card waits for
              s.status === "waiting" ? (
                <button
                  type="button"
                  onClick={(e) => (e.stopPropagation(), cancelFold(), go("auto"))}
                  onDoubleClick={(e) => e.stopPropagation()}
                  title={door === "desktop" ? t("Open in the desktop app") : background ? t("Open it in a terminal; it keeps running in the background") : t("Open in a terminal")}
                  className="flex h-[20px] shrink-0 items-center gap-0.5 rounded bg-changed px-1.5 leading-none font-medium text-[var(--t-on-wait,var(--color-base))] group-hover/session:hidden group-has-[:focus-visible]/session:hidden hover:brightness-110"
                >
                  {t("Answer")}
                  <ArrowUpRight className="size-3 shrink-0" />
                </button>
              ) : (
                <span
                  title={door === "desktop" ? t("Double-click opens it in the desktop app") : t("Double-click opens it in a terminal")}
                  className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-line px-1 leading-none text-slate-400 group-hover/session:hidden group-has-[:focus-visible]/session:hidden"
                >
                  {door === "desktop" ? <Monitor className="size-3 shrink-0" /> : <SquareTerminal className="size-3 shrink-0" />}
                  <span className="hidden @[17rem]/card:inline">{door === "desktop" ? t("Desktop") : t("Terminal")}</span>
                </span>
              )
            )}
          </span>
        </span>
      </div>
      {failed && <p className="selectable px-3 pb-1.5 pl-[54px] text-[11px] text-problem">{failed}</p>}
      {open && renaming && <RenameForm session={s} onClose={() => setRenaming(false)} />}
      {menu.element}
      {open && (
        <div className="pr-3 pb-2 pl-[54px] text-[12px]">
          {/* Only what the card does not say already */}
          {s.prompt && head.from !== "prompt" && <p className="line-clamp-3 text-slate-400 italic">“{s.prompt}”</p>}
          {s.touched.length > 0 && (
            <ul className="mt-1.5 flex flex-col">
              {s.touched.map((touch) => (
                <li key={touch.path}>
                  <button
                    type="button"
                    onClick={() => onShowFile(touch.path)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[11px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: mark.color }} />
                    <span className="truncate">{touch.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {s.received.length > 0 && (
            <div className="mt-1.5">
              <div className="text-[11px] text-slate-500">{t("Got from CodeDeck")}</div>
              <ul className="flex flex-col">
                {s.received.map((r, i) => (
                  <li key={i} className="flex gap-2 px-1 py-0.5 text-[11px] text-slate-400">
                    <span className="shrink-0 text-slate-500 tabular-nums">{time(r.at)}</span>
                    <Paperclip className="mt-0.5 size-3 shrink-0 text-slate-500" />
                    <span className="min-w-0">{r.labels.filter(Boolean).map(known).join(", ") || t("attachments")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* What one looks up, one fact a line: nothing breaks word by word in a narrow column. Set apart by
              a faint dotted line, quieter than the hairlines between the sessions */}
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 border-t border-dotted border-line/60 pt-1.5 text-[11px]">
            {/* What kind of session it is: rarely what one looks for, so here rather than on the card */}
            {(s.model || byHand || s.place) && (
              <Fact label={t("Kind")}>
                <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
                  {s.model && <span className="flex h-[18px] shrink-0 items-center rounded border border-line px-1 leading-none font-medium text-slate-200">{s.model}</span>}
                  {byHand && (
                    <span
                      title={`${t("by hand")} · ${toolName}: ${t("Started outside CodeDeck: it ends where it runs")}`}
                      className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-dashed border-slate-500/60 px-1 leading-none text-slate-300"
                    >
                      <User className="size-3 shrink-0" />
                      {/* The tool only when it is not the project's own */}
                      {s.harness !== projectTool ? toolShort : t("by hand")}
                    </span>
                  )}
                  <Place session={s} />
                </span>
              </Fact>
            )}
            <Fact label={t("Folder")}>{s.cwd === "" ? t("project root") : s.cwd}</Fact>
            <Fact label={t("Last step")}>
              {time(s.last)}
              {s.step && ` · ${s.step}`}
            </Fact>
            <AccountFact session={s} projectAccount={projectAccount} />
            {commands && (
              <Fact label={t("Started with")}>
                <StartCommand commands={commands} />
              </Fact>
            )}
          </dl>
        </div>
      )}
    </li>
  );
}

/** Another session this one belongs to (sent to the background, or split off from), by its badge and
 *  title; the mouse on it shows what is that session's on the trail and in the file list. */
function Related({ id, words }: { id: string; words: string }) {
  const marks = useSessionMarks();
  const mark = marks.of(id);
  return (
    <span onMouseEnter={(e) => (e.stopPropagation(), marks.hover(id))} className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
      <Layers className="size-3 shrink-0 text-ai" />
      <span className="shrink-0">{words}</span>
      {mark ? (
        <>
          <SessionBadge mark={mark} />
          <span className="min-w-0 truncate text-slate-300">{mark.title ?? t("Session {id}", { id: shortId(id) })}</span>
        </>
      ) : (
        <span className="text-slate-300">{t("Session {id}", { id: shortId(id) })}</span>
      )}
    </span>
  );
}

/** Where the session runs, as far as it said: in tmux (CodeDeck can stop and restart it there if it started it; the
 *  name in the tooltip), and the blue mark when it is reachable from another device or the browser. */
function Place({ session: s }: { session: Session }) {
  const place = s.place;
  if (!place || s.status === "ended") return null;
  const tmux = place.tmux;
  return (
    <>
      {tmux && (
        // A word, not the terminal icon: that one is the tool that opens a terminal. That it runs in
        // tmux counts; its name is in the tooltip
        <span title={t("Runs in tmux ({name}). Attach with: tmux attach -t {name}", { name: tmux.session ?? tmux.pane })} className="flex h-[18px] shrink-0 items-center rounded border border-line px-1 leading-none text-slate-300">
          tmux
        </span>
      )}
      {place.remote && (
        <button
          type="button"
          title={t("Reachable from another device or the browser right now. Opens {link}", { link: place.remote })}
          aria-label={t("reachable from anywhere")}
          onClick={(e) => {
            e.stopPropagation();
            void openUrl(place.remote!);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex shrink-0 text-ai hover:text-slate-100"
        >
          <Radio className="size-3.5" />
        </button>
      )}
    </>
  );
}

/** One line of a session's details: a quiet label, then the value, which may wrap. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-400">{children}</dd>
    </>
  );
}

/** The account a session runs in, by the name and colour set under Settings → Accounts (3.2). */
function AccountFact({ session: s, projectAccount }: { session: Session; projectAccount: string | undefined }) {
  const accounts = useAccounts();
  // The project's own account is no news: only a session running with another one says so
  if (!s.account || s.account === projectAccount) return null;
  const look = accountLook(accounts, s.account);
  return (
    <Fact label={t("Account")}>
      <span title={s.account} className="inline-flex items-center gap-1 align-middle">
        <AccountMark account={look} size={12} />
        {look.name}
      </span>
    </Fact>
  );
}

/** The user's title and short name for a session; they stay with it in this project. */
function RenameForm({ session: s, onClose }: { session: Session; onClose: () => void }) {
  const [title, setTitle] = useState(s.title ?? "");
  const [short, setShort] = useState(s.short);
  const field = "min-w-0 rounded border border-line bg-base px-1.5 py-0.5 text-slate-100 outline-none focus:border-ai";
  const button = "rounded px-2 py-0.5 text-[11px]";
  return (
    <form
      className="mr-3 mb-2 ml-[38px] flex flex-col gap-1.5 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        renameSession(s.id, title, short).then(onClose);
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex gap-1.5">
        <input autoFocus aria-label={t("Title")} placeholder={t("Title")} value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} flex-1`} />
        <input aria-label={t("Short name")} placeholder="A" maxLength={4} value={short} onChange={(e) => setShort(e.target.value)} className={`${field} w-14 text-center`} />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="submit" className={`${button} bg-brand-fill text-on-accent hover:bg-brand-fill-hover`}>
          {t("Save")}
        </button>
        <button type="button" onClick={onClose} className={`${button} text-slate-400 hover:bg-overlay-hover hover:text-slate-100`}>
          {t("Cancel")}
        </button>
        {s.renamed && (
          <button
            type="button"
            title={t("Back to the title the coding agent gave the AI session")}
            onClick={() => renameSession(s.id, null, short).then(onClose)}
            className={`${button} ml-auto text-slate-400 hover:bg-overlay-hover hover:text-slate-100`}
          >
            {t("Use its own title")}
          </button>
        )}
      </div>
    </form>
  );
}

/* ── Next prompt: what is attached to it, only when asked ──────────────────── */

/** The context window the token meter measures against. */
const CONTEXT_TOKENS = 200_000;

/**
 * The summary of the next prompt, always in sight, like a small dashboard: how many files, changes,
 * comments and hints are attached, what reading the files costs, who it is for, and the receipt once
 * a session took it. The items themselves are in the Next prompt view, one click away. Files can be
 * dropped here.
 */
function NextPrompt({ assistant, onPin, openPrompt, onOpenPrompt }: Props & { openPrompt: string | null; onOpenPrompt: (name: string | null) => void }) {
  const now = useNow();
  const [over, setOver] = useState(false);
  const kinds = useAttachedKinds();
  const count = kinds.files + kinds.changes + kinds.comments + kinds.hints;
  const share = Math.min(1, kinds.tokens / CONTEXT_TOKENS);
  const barColor = share > 0.5 ? "bg-problem" : share > 0.25 ? "bg-changed" : "bg-ai";
  const { connected } = useConnections();
  const marks = useSessionMarks();
  // What is offered follows the tool's capabilities, never its name
  const { shortName, name, capabilities } = mainHarness(assistant);
  const attaches = capabilities.attach === "withNextPrompt";
  const pins = files.use();
  const { delivered } = assistant;
  // Each count carries the icon of the place where such things are attached, so it says where
  // they come from; the tooltip says it in words
  const tiles: [number, string, LucideIcon, string][] = [
    [kinds.files, "file", Paperclip, t("Files, folders and passages: the paperclip in the file list")],
    [kinds.changes, "change", GitCompareArrows, t("Changes of a turn, commit or file: the paperclip in Changes")],
    [kinds.comments, "line comment", MessageSquare, t("Comments on diff lines: the speech bubble at a line in Changes")],
    [kinds.hints, "hint", AtSign, t("@ai hints from your files: the paperclip in the Workbench")],
  ];

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData(DRAG_TYPE);
    if (data) onPin(JSON.parse(data) as Entry);
  };

  return (
    <section
      data-tour="next"
      className={`flex min-h-0 flex-col transition-shadow ${over ? "shadow-[inset_0_0_0_1px_var(--color-ai)]" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <AreaHeader title={t("Next prompt")}>
        {count > 0 && (
          <button
            type="button"
            title={t("Remove everything: files, changes, line comments and hints")}
            aria-label={t("Clear the next prompt")}
            onClick={() => [files, changes, notes, markers].forEach((part) => part.clear())}
            className="flex items-center gap-0.5 rounded px-1 text-[11px] text-slate-400 hover:bg-raised hover:text-slate-100"
          >
            <Eraser className="size-3.5" /> {t("Clear")}
          </button>
        )}
        <button
          type="button"
          onClick={() => openView("next")}
          className="flex items-center gap-0.5 rounded px-1 text-[11px] text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          {t("Open")} <ArrowUpRight className="size-3.5" />
        </button>
      </AreaHeader>

      <div className={`flex min-h-0 flex-col gap-2 overflow-y-auto px-3 pt-0.5 pb-2.5 ${openPrompt ? "max-h-[30%] flex-none" : "max-h-[35vh] flex-none"}`}>
        {/* Who it is for comes first: the numbers below read as what goes to them */}
        {count > 0 && attaches && assistant.held && <ChooseTarget state={assistant} />}
        {count > 0 && attaches && !assistant.held && (
          <div className="flex flex-col gap-1 text-[12px] text-slate-400">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0">{t("For")}</span>
              <AttachTarget state={assistant} className="min-w-0 flex-1" />
            </div>
            <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
              <span className="size-1.5 shrink-0 rounded-full bg-changed" />
              <span className="truncate">{t("Waiting for your next prompt")}</span>
            </span>
            <TargetLost state={assistant} />
            {!connected && <span className="text-changed">{t("Not connected: nothing reaches {tool} (status bar).", { tool: name })}</span>}
          </div>
        )}

        {/* What is attached, one narrow line: only the kinds there are. The sum stands at the tab already */}
        {count > 0 && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {tiles
              .filter(([n]) => n > 0)
              .map(([n, noun, Icon, hint]) => (
                <Tooltip key={noun} className="flex min-w-0" content={<span>{hint}</span>}>
                  <button
                    type="button"
                    onClick={() => openView("next")}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised/70 hover:text-slate-200"
                  >
                    <Icon className="size-3.5 text-slate-500" />
                    <span className="text-slate-200">{plural(n, noun)}</span>
                  </button>
                </Tooltip>
              ))}
          </div>
        )}

        {kinds.files > 0 && (
          <div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-base"
              role="meter"
              aria-label={t("Size of the attached files")}
              aria-valuemin={0}
              aria-valuemax={CONTEXT_TOKENS}
              aria-valuenow={kinds.tokens}
            >
              <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              <T text="about {tokens} tokens if {tool} reads all files" tokens={<span className="text-slate-300">{formatTokens(kinds.tokens)}</span>} tool={shortName} />
            </div>
          </div>
        )}

        {/* Nothing attached: one line, the receipt of what went out last, else how to attach */}
        {count === 0 && delivered && !over && (
          <p className="flex items-start gap-1.5 text-[12px] text-slate-300">
            <Check className="mt-0.5 size-3.5 shrink-0 text-added" />
            <span className="min-w-0">
              <T
                text="Sent at {time} to {who}"
                time={time(delivered.at)}
                who={
                  <>
                    {marks.of(delivered.session) && <SessionBadge mark={marks.of(delivered.session)!} className="mx-0.5 align-[-2px]" />}
                    {marks.of(delivered.session)?.title ?? t("session {id}", { id: shortId(delivered.session) })}
                  </>
                }
              />
            </span>
          </p>
        )}
        {count === 0 && (!delivered || over) && (
          <p className="text-[12px] text-slate-500">
            {over ? t("Drop to attach it") : t("Nothing attached. Drag files here; the other ways are in the Next prompt view.")}
          </p>
        )}
        {capabilities.attach === "clipboard" && pins.length > 0 && (
          <Tooltip content={<span>{t("Copy the files to paste into {tool}", { tool: shortName })}</span>}>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(filesText(pins))}
              className="flex items-center gap-1 self-start rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100"
            >
              <ClipboardCopy className="size-3.5" />
              {t("Copy")}
            </button>
          </Tooltip>
        )}
      </div>
      {/* Outside the scrolling part: with many attachments or a short window the list must not slip out of sight */}
      <div className={`flex flex-col px-3 pb-2.5 ${openPrompt ? "min-h-0 flex-1" : "shrink-0"}`}>
        <PreparedPrompts open={openPrompt} onOpen={onOpenPrompt} age={(ms) => since(ms, now)} />
      </div>
    </section>
  );
}
