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
import { pendingSession, forgetSession, openSession, openUrl, stopSession, renameSession, type AssistantState, type Entry, type ProjectInfo, type Session } from "../backend";
import { useProjectAccount, useProjectLook } from "../projectLook";
import { usePending, type Pending } from "../pending";
import { StartCommand, useSessionCommands } from "./SessionCommands";
import { HoverTools, Tool, ToolGap } from "./RowTools";
import { useContextMenu } from "./ContextMenu";
import { AssistantStatusBar } from "./StatusBar";
import { mainHarness, shortId, useConnections, useSessionMarks, type SessionMark } from "../assistant";
import { SessionBadge } from "./SessionBadge";
import { HeaderBar } from "./HeaderBar";
import { SidebarSummary } from "./SidebarSummary";
import type { GitView } from "../git";
import type { OpenProject } from "./ProjectHeader";
import { needsYou, OPENED_AT, putAside, useNow, useWaiting, waitKey, waitsSince } from "../attention";
import { files, filesText, type Pin } from "../files";
import { formatTokens, useAttachedKinds } from "./AttachmentList";
import { openView } from "../view";
import { AttachTarget, ChooseTarget, TargetLost } from "./AttachTarget";
import { plural } from "../git";
import { LOCALE } from "./Trail";
import { blockedUntil, resetAt } from "../usage";
import { known, T, t } from "../i18n";

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
  return (
    <aside
      className="zone-side grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_fit-content(40%)_auto] border-l border-line bg-panel"
    >
      <HeaderBar project={props.project} onOpenProject={props.onOpenProject} assistant={props.assistant} onToggleLog={props.onToggleLog} />
      <SidebarSummary git={props.git} assistant={props.assistant} />
      <Sessions state={props.assistant} onShowFile={props.onShowFile} />
      <NextPrompt {...props} />
      <AssistantStatusBar assistant={props.assistant} />
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
 * The state in a word or two. At rest it carries the one time that matters: when the session
 * was last active (the end of its turn, its end, the last entry of its log). While it works or
 * asks there is none here; the fold-out says when its last step was.
 */
function statusWords(s: Session): { words: string; at: number | null; tone: Tone } {
  if (s.status === "working") return { words: t("working"), at: null, tone: "ai" };
  if (s.status === "waiting") return { words: t("asks"), at: null, tone: "wait" };
  if (s.status === "ended") return { words: t("ended"), at: s.last, tone: "quiet" };
  // Nothing was heard from it: whether it works right now is not known
  if (!s.capabilities.liveStatus) return { words: t("from its log"), at: s.last, tone: "quiet" };
  return s.turnDone != null ? { words: t("turn done"), at: s.turnDone, tone: "done" } : { words: t("idle"), at: s.last, tone: "quiet" };
}

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
  const current = state.sessions.filter((s) => !isEarlier(s));
  const earlier = state.sessions.filter(isEarlier);
  const [showEarlier, setShowEarlier] = useState(false);
  const Fold = showEarlier ? ChevronDown : ChevronRight;
  const pending = usePending(look?.path, state.sessions.map((s) => s.id));
  // Those that ask or finished their turn (see `attention.ts`) head the list, each once: a list of
  // their own above repeated every one of them below
  const waiting = useWaiting(state);
  const waits = new Set(waiting.map((s) => s.id));
  const item = (s: Session, wait?: "asks" | "done") => (
    <SessionItem key={wait ? waitKey(s) : s.id} session={s} wait={wait} blockedUntil={blockedUntil(state.usage, s.account, now)} onShowFile={onShowFile} toolName={(state.harnesses.find((h) => h.id === s.harness) ?? harness).name} toolShort={(state.harnesses.find((h) => h.id === s.harness) ?? harness).shortName} projectPath={look?.path} projectTool={mine.harness.id} projectAccount={mine.account?.dir} aimed={state.attachments.length > 0 && state.target === s.id} />
  );
  const rest = current.filter((s) => !waits.has(s.id));
  return (
    // No tint of its own (user, 2026-11-17); a theme with zones colours the column. One scrolling
    // list for both groups: the sessions get the room, not two boxes of fixed share
    <section className="flex min-h-0 flex-col border-b border-line">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {waiting.length > 0 && (
          <>
            <AreaHeader
              title={t("Needs you")}
              count={waiting.length}
              asks={waiting.some((s) => needsYou(s) === "asks")}
              hint={t("{asking} asking, {done} finished within the last 30 minutes", {
                asking: waiting.filter((s) => needsYou(s) === "asks").length,
                done: waiting.filter((s) => needsYou(s) === "done").length,
              })}
            />
            {/* Cards, raised, amber edged while a session asks; what came while the window was open lights up once */}
            <ul className="flex flex-col gap-2 px-2 pb-2" onMouseLeave={() => marks.hover(null)}>
              {waiting.map((s) => item(s, needsYou(s) ?? undefined))}
            </ul>
          </>
        )}
        <AreaHeader title={t("Sessions")} />
        {pending.length > 0 && (
          <ul className="divide-y divide-line/70 border-y border-line/70">
            {pending.map((p) => (
              <PendingItem key={p.name} pending={p} projectPath={look?.path} />
            ))}
          </ul>
        )}
        {state.sessions.length > 0 ? (
          // Left as a whole: between two sessions the highlight stays, so nothing flickers on the way
          <div onMouseLeave={() => marks.hover(null)}>
            {rest.length > 0 ? (
              <ul className="divide-y divide-line/70 border-y border-line/70">{rest.map((s) => item(s))}</ul>
            ) : waiting.length === 0 ? (
              <p className="px-3 pb-2 text-[12px] text-slate-500">{t("No session is at work here right now.")}</p>
            ) : (
              <p className="px-3 pb-2 text-[12px] text-slate-500">{t("No other session is at work here right now.")}</p>
            )}
            {earlier.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={showEarlier}
                  onClick={() => setShowEarlier(!showEarlier)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase hover:text-slate-300"
                >
                  <Fold className="size-3.5" />
                  {t("Earlier")}
                  <span className="font-normal tracking-normal normal-case">{earlier.length}</span>
                </button>
                {showEarlier && (
                  <ul className="divide-y divide-line/70 border-y border-line/70">
                    {earlier.filter((s) => !waits.has(s.id)).map((s) => item(s))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : hooks.setups && !hooks.connected ? (
          <div className="px-3 text-[12px] text-slate-300">
            <HookPanel hooks={hooks} harness={harness} heard={state.heard} />
          </div>
        ) : (
          <p className="grid h-full place-items-center px-6 text-center text-slate-500">
            {t("No {tool} session has worked in this project since CodeDeck opened it. Start one in the project's folder: it shows up here with its first step.", { tool: harness.name })}
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
  return (
    <li onDoubleClick={() => void act(false)} title={t("Double-click: open it in a terminal")} className="group/pending flex items-center gap-2.5 py-2 pr-3 pl-3 hover:bg-raised/40">
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
            <Tool icon={SquareTerminal} label={t("Open it in a terminal, answer, and leave with Ctrl+B, D")} hint={t("Also: double-click")} onClick={() => void act(false)} />
            {commands?.start && <Tool icon={Copy} label={t("Copy how it was started")} says={commands.tool ?? commands.start} onClick={() => void navigator.clipboard.writeText(commands.start!)} />}
            <ToolGap />
            <Tool icon={Power} danger label={t("End this session (nothing is lost; it never began)")} says={commands?.stop} onClick={() => void act(true)} />
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
 * One session. `wait`: it waits for you (asks, or finished its turn) and stands under "Needs you"
 * as a raised card; a finished turn can be put aside there until its next turn.
 */
function SessionItem({ session: s, wait, blockedUntil: reset, onShowFile, toolName, toolShort, projectPath, projectTool, projectAccount, aimed }: { session: Session; wait?: "asks" | "done"; blockedUntil: number | null; onShowFile: (path: string) => void; toolName: string; toolShort: string; projectPath: string | undefined; projectTool: string; projectAccount: string | undefined; aimed: boolean }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const marks = useSessionMarks();
  const mark = markOf(s, marks.of(s.id));
  const Chevron = open ? ChevronDown : ChevronRight;
  // Its account's limit is used up: it cannot go on before the reset, whatever else it says
  const blocked = reset !== null && s.status !== "ended";
  const status = blocked ? { words: `${t("waits for reset")} · ${resetAt(reset, Date.now(), LOCALE)}`, at: null, tone: "problem" as Tone } : statusWords(s);
  const timed = status.at !== null;
  // Not started by CodeDeck: it cannot be stopped or restarted from here, so it says where it comes from
  const byHand = s.status !== "ended" && !s.place?.launched;
  // As in the overview: a double click goes to it (Desktop where reachable there, else its
  // terminal), a middle click always to its terminal
  const [failed, setFailed] = useState<string | null>(null);
  const door = s.place?.remote ? "desktop" : "terminal";
  const go = (to: "desktop" | "terminal" | "auto") => {
    if (!projectPath || s.status === "ended") return;
    setFailed(null);
    openSession(projectPath, s.id, to).catch((e) => {
      setFailed(String(e));
      setTimeout(() => setFailed(null), 6000);
    });
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
    // Keyboard (detail 0) and ended sessions, which a double click does not open, fold at once
    if (e.detail === 0 || s.status === "ended") return setOpen(!open);
    if (e.detail > 1) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      setOpen((o) => !o);
    }, 250);
  };
  const head = headline(s);
  const tmuxName = s.status !== "ended" ? (s.place?.tmux?.session ?? undefined) : undefined;
  const commands = useSessionCommands(projectPath, tmuxName);
  const controllable = !!tmuxName && s.status !== "working" && !!projectPath;
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
        go("auto");
      }}
      onAuxClick={(e) => e.button === 1 && go("terminal")}
      title={s.status === "ended" ? undefined : t("Double-click: go to it ({door}) · middle click: terminal", { door: door === "desktop" ? t("Desktop") : t("Terminal") })}
      // `data-event`: a theme can make the reason stand out in its colour (docs/STYLING.md, `events`)
      data-event={wait === "asks" ? "waiting" : wait}
      className={`group/session ${
        wait
          ? `event-row wait-card overflow-hidden rounded-md bg-raised ${wait === "asks" ? "wait-card-asks" : ""} ${waitsSince(s) > OPENED_AT ? "attention-new" : ""}`
          : open
            ? "bg-raised/60"
            : "hover:bg-raised/40"
      } ${s.status === "ended" ? "opacity-55" : ""}`}
    >
      <div className="flex items-start">
        {/* The badge stands alone, large, across both lines; status and model are what one reads */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={fold}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen(!open))}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pr-3 pl-3 text-left"
        >
          <SessionBadge mark={mark} large />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="min-w-0 truncate font-medium text-slate-100">{titleOf(s)}</span>
              <span
                title={timed ? t("since {time}", { time: time(status.at!) }) : undefined}
                data-event={blocked ? "blocked" : s.status === "idle" && s.turnDone != null && s.capabilities.liveStatus ? "done" : s.status}
                className={`event-chip ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-medium ${PILL[status.tone]}`}
              >
                <StatusDot status={s.status} />
                {status.words}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
              <span className="min-w-0 flex-1 truncate">{head.text}</span>
              <Chevron className="size-3.5 shrink-0 text-slate-500" />
            </span>
            {/* What kind of session it is: the model, where it runs; the tools on the right while the mouse is on
                it. A line of its own, one height with or without the tools, so nothing moves and the title keeps its room */}
            <span className="flex h-[22px] items-center gap-1.5 text-[11px] text-slate-500">
              {s.model && <span className="flex h-[18px] shrink-0 items-center rounded border border-line px-1 leading-none font-medium text-slate-200">{s.model}</span>}
              {byHand && (
                <span
                  title={`${t("by hand")} · ${toolName}: ${t("Started outside CodeDeck: it ends where it runs")}`}
                  className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-dashed border-slate-500/60 px-1 leading-none text-slate-300"
                >
                  <User className="size-3 shrink-0" />
                  {/* The tool only when it is not the project's own */}
                  {s.harness !== projectTool && toolShort}
                </span>
              )}
              <Place session={s} />
              <Receipt session={s} aimed={aimed} />
              <span className="flex-1" />
              <HoverTools show="group-hover/session:flex group-has-[:focus-visible]/session:flex" open={!!menu.element}>
                {s.status !== "ended" && (
                  <>
                    {s.place?.remote && <Tool icon={Monitor} label={t("Open in the desktop app")} hint={door === "desktop" ? t("Also: double-click the session") : undefined} onClick={() => go("desktop")} />}
                    <Tool icon={SquareTerminal} label={t("Open in a terminal")} hint={t("Also: middle-click the session")} onClick={() => go("terminal")} />
                  </>
                )}
                {/* What changes its process, apart; only in tmux, and not while it works */}
                {controllable && (
                  <>
                    <ToolGap />
                    <Tool icon={RotateCcw} label={t("Restart: same conversation, fresh process")} says={commands?.stop && commands.start ? `${commands.stop}\n${commands.start}` : undefined} onClick={() => void stopSession(projectPath!, s.id, true).catch((e) => setFailed(String(e)))} />
                    <Tool icon={Power} danger label={t("Stop (the conversation is kept and can be continued)")} says={commands?.stop} onClick={() => void stopSession(projectPath!, s.id, false).catch((e) => setFailed(String(e)))} />
                  </>
                )}
                {wait === "done" && (
                  <>
                    <ToolGap />
                    <Tool icon={X} label={t("Put aside until its next turn")} onClick={() => putAside(s)} />
                  </>
                )}
                {s.status !== "ended" && <ToolGap />}
                <Tool icon={Ellipsis} label={t("More (also right click)")} onClick={(e) => openMenu(e)} />
              </HoverTools>
            </span>
          </span>
        </div>
      </div>
      {failed && <p className="selectable px-3 pb-1.5 pl-[54px] text-[11px] text-problem">{failed}</p>}
      {open && renaming && <RenameForm session={s} onClose={() => setRenaming(false)} />}
      {menu.element}
      {open && (
        <div className="pr-3 pb-1.5 pl-[38px] text-[12px]">
          {/* Only what the two lines above do not say already */}
          {s.message && head.from !== "message" && <p className="text-changed">{s.message}</p>}
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
            <Fact label={t("Folder")}>{s.cwd === "" ? t("project root") : s.cwd}</Fact>
            <Fact label={t("Last step")}>
              {time(s.last)}
              {s.step && head.from !== "step" && ` · ${s.step}`}
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

/** Where the session runs, as far as it said: in tmux (CodeDeck can stop and restart it there; the
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
            title={t("Back to the title the tool gave the session")}
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
function NextPrompt({ assistant, onPin }: Props) {
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
            title={t("Take everything off: files, changes, line comments and hints")}
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-0.5 pb-2.5">
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
    </section>
  );
}
