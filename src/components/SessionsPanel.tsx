import { AccountMark } from "./ProjectMark";
import { accountLook, useAccounts } from "../accounts";
import { useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  GitCompareArrows,
  MessageSquare,
  Paperclip,
  Pencil,
  Radio,
  X,
  User,
  type LucideIcon,
} from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import { HookPanel } from "./AssistantStatus";
import { Tooltip } from "./Tooltip";
import { forgetSession, openSession, openUrl, renameSession, type AssistantState, type Entry, type ProjectInfo, type Session } from "../backend";
import { useProjectAccount, useProjectLook } from "../projectLook";
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
import { AttachTarget, TargetLost } from "./AttachTarget";
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
 * The right column, in three areas: what waits for you (coloured only while something does),
 * the sessions working in the project, and what goes out with your next prompt. Below the header a
 * short summary of what file list, trail and views show; it also feeds the project's row in the
 * overview of all projects (docs/UEBERSICHT.md).
 */
export function SessionsPanel(props: Props) {
  return (
    <aside
      className="zone-side grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_minmax(0,3fr)_minmax(0,2fr)] border-l border-line bg-panel"
    >
      <HeaderBar project={props.project} onOpenProject={props.onOpenProject} assistant={props.assistant} onToggleLog={props.onToggleLog} />
      <SidebarSummary git={props.git} assistant={props.assistant} />
      <NeedsYou state={props.assistant} />
      <Sessions state={props.assistant} onShowFile={props.onShowFile} />
      <NextPrompt {...props} />
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

/**
 * The sessions that ask something or finished their turn (see `attention.ts`). A finished turn can be
 * put aside and leaves by itself after a while; it comes back with the session's next turn. What
 * came while the window was open lights up for a moment.
 */
function NeedsYou({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  const waiting = useWaiting(state);

  return (
    // No tinted area (amber on grey turns brown): the cards below carry the colour (user, 2026-11-17)
    <section className="flex max-h-[40vh] min-h-0 flex-col border-b border-line">
      <AreaHeader
        title={t("Needs you")}
        count={waiting.length}
        asks={waiting.some((s) => needsYou(s) === "asks")}
        hint={t("{asking} asking, {done} finished within the last 30 minutes", {
          asking: waiting.filter((s) => needsYou(s) === "asks").length,
          done: waiting.filter((s) => needsYou(s) === "done").length,
        })}
      />
      {waiting.length === 0 ? (
        <p className="px-3 pb-2.5 text-[12px] text-slate-500">{t("Nothing. No session waits for you.")}</p>
      ) : (
        // Rows like the sessions below, not cards: calmer, and the same reading. What stands out is
        // what counts: the area's tint and count, a question's edge and words in amber, and a new
        // entry pulsing a few times
        // Room around the cards, most below: they end where "Sessions" begins
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2.5 pt-1 pb-3.5">
          {waiting.map((s) => {
            const asks = needsYou(s) === "asks";
            return (
              <li
                // A new reason is a new item: it lights up once when it comes
                key={waitKey(s)}
                onMouseEnter={() => marks.hover(s.id)}
                onMouseLeave={() => marks.hover(null)}
                // `data-event`: a theme can make the reason stand out in its colour (docs/STYLING.md, `events`)
                data-event={asks ? "waiting" : "done"}
                className={`event-row wait-card group/wait relative rounded-md bg-raised py-1.5 pr-1.5 pl-2.5 ${asks ? "wait-card-asks" : ""} ${waitsSince(s) > OPENED_AT ? "attention-new" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <SessionBadge mark={markOf(s, marks.of(s.id))} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{titleOf(s)}</span>
                  <span data-event={asks ? "waiting" : "done"} className={`event-chip flex shrink-0 items-center gap-1.5 text-[11px] ${asks ? "text-changed" : "text-slate-500"}`}>
                    <span className={`size-2 shrink-0 translate-y-px rounded-full ${asks ? "bg-changed" : "bg-slate-500"}`} />
                    {asks ? t("asks") : `${t("turn done")} · ${time(s.turnDone ?? s.last)}`}
                  </span>
                  {!asks && (
                    <button
                      type="button"
                      title={t("Put aside until its next turn")}
                      aria-label={t("Put {name} aside", { name: titleOf(s) })}
                      onClick={() => putAside(s)}
                      className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 group-hover/wait:opacity-100 hover:bg-overlay-hover hover:text-slate-100 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className={`mt-0.5 line-clamp-2 pl-[26px] text-[12px] ${asks ? "text-changed" : "text-slate-400"}`}>
                  {asks ? (s.message ?? t("Waits for your answer")) : t("Waits for your next prompt")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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
  if (s.status === "waiting") return { words: t("waiting for you"), at: null, tone: "wait" };
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
  return (
    // No tint of its own (user, 2026-11-17): it stood out more than "Needs you"; a theme with zones colours the column
    <section className="flex min-h-0 flex-col border-b border-line">
      <AreaHeader title={t("Sessions")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.sessions.length > 0 ? (
          // Left as a whole: between two sessions the highlight stays, so nothing flickers on the way
          <div onMouseLeave={() => marks.hover(null)}>
            {current.length > 0 ? (
              <ul className="divide-y divide-line/70 border-y border-line/70">
                {current.map((s) => (
                  <SessionItem key={s.id} session={s} blockedUntil={blockedUntil(state.usage, s.account, now)} onShowFile={onShowFile} toolName={(state.harnesses.find((h) => h.id === s.harness) ?? harness).name} toolShort={(state.harnesses.find((h) => h.id === s.harness) ?? harness).shortName} projectPath={look?.path} projectTool={mine.harness.id} />
                ))}
              </ul>
            ) : (
              <p className="px-3 pb-2 text-[12px] text-slate-500">{t("No session is at work here right now.")}</p>
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
                    {earlier.map((s) => (
                      <SessionItem key={s.id} session={s} blockedUntil={blockedUntil(state.usage, s.account, now)} onShowFile={onShowFile} toolName={(state.harnesses.find((h) => h.id === s.harness) ?? harness).name} toolShort={(state.harnesses.find((h) => h.id === s.harness) ?? harness).shortName} projectPath={look?.path} projectTool={mine.harness.id} />
                    ))}
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

/** Two lines per session: who and in which state, then the one thing that counts. The rest folds out. */
function SessionItem({ session: s, blockedUntil: reset, onShowFile, toolName, toolShort, projectPath, projectTool }: { session: Session; blockedUntil: number | null; onShowFile: (path: string) => void; toolName: string; toolShort: string; projectPath: string | undefined; projectTool: string }) {
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
  const go = (to: "desktop" | "terminal") => {
    if (!projectPath || s.status === "ended") return;
    setFailed(null);
    openSession(projectPath, s.id, to).catch((e) => {
      setFailed(String(e));
      setTimeout(() => setFailed(null), 6000);
    });
  };
  const head = headline(s);
  return (
    <li
      // On the list: what belongs to this session stands out on the trail and in the file list
      onMouseEnter={() => marks.hover(s.id)}
      onDoubleClick={() => go(door)}
      onAuxClick={(e) => e.button === 1 && go("terminal")}
      title={s.status === "ended" ? undefined : t("Double-click: go to it ({door}) · middle click: terminal", { door: door === "desktop" ? t("Desktop") : t("Terminal") })}
      className={`group/session ${open ? "bg-raised/60" : "hover:bg-raised/40"} ${s.status === "ended" ? "opacity-55" : ""}`}
    >
      <div className="flex items-start">
        {/* The badge stands alone, large, across both lines; status and model are what one reads */}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-1 pl-3 text-left">
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
              {s.model && <span className="flex h-[18px] shrink-0 items-center rounded border border-line px-1 text-[11px] leading-none font-medium text-slate-200">{s.model}</span>}
              {byHand && (
                <span
                  title={`${t("by hand")} · ${toolName}: ${t("Started outside CodeDeck: it ends where it runs")}`}
                  className="flex h-[18px] shrink-0 items-center gap-1 rounded border border-dashed border-slate-500/60 px-1 text-[11px] leading-none text-slate-300"
                >
                  <User className="size-3 shrink-0" />
                  {/* The tool only when it is not the project's own */}
                  {s.harness !== projectTool && toolShort}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{head.text}</span>
              <Chevron className="size-3.5 shrink-0 text-slate-500" />
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={t("Rename session {short}", { short: mark.short })}
          title={t("Rename")}
          onClick={() => {
            setOpen(true);
            setRenaming(!renaming);
          }}
          className={`mt-1.5 mr-1.5 shrink-0 rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100 focus-visible:opacity-100 ${
            renaming ? "opacity-100" : "opacity-0 group-hover/session:opacity-100"
          }`}
        >
          <Pencil className="size-3" />
        </button>
      </div>
      {failed && <p className="selectable px-3 pb-1.5 pl-[54px] text-[11px] text-problem">{failed}</p>}
      {open && renaming && <RenameForm session={s} onClose={() => setRenaming(false)} />}
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
          {/* The session's own little status bar: the model first, then where it runs. Set apart
              by a faint dotted line, quieter than the hairlines between the sessions */}
          <div className="mt-2 flex items-start gap-2 border-t border-dotted border-line/60 pt-1.5 text-[11px] text-slate-500">
            <span className="min-w-0 flex-1 pt-0.5">
              {s.model && <span className="font-medium text-slate-300">{s.model}</span>}
              {s.model && " · "}
              {s.cwd === "" ? t("project root") : s.cwd}
              {` · ${t("last step {time}", { time: time(s.last) })}`}
              {s.step && head.from !== "step" && ` · ${s.step}`}
              <PlaceNote session={s} />
              <AccountNote session={s} />
            </span>
            <button
              type="button"
              title={t("Takes it off this list. It comes back by itself when the session takes its next step")}
              onClick={() => forgetSession(s.id)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-slate-300 hover:border-overlay-line hover:bg-overlay-hover hover:text-slate-100"
            >
              <X className="size-3" /> {t("Remove from list")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Where the session runs, as far as it said: its tmux session, and whether it can be reached from
 *  elsewhere right now. Only shown, nothing to do yet (groundwork, `docs/SITZUNGEN.md`). */
function PlaceNote({ session: s }: { session: Session }) {
  const place = s.place;
  if (!place || s.status === "ended") return null;
  const tmux = place.tmux;
  return (
    <>
      {tmux && (
        <span title={t("Runs in tmux. Attach with: tmux attach -t {name}", { name: tmux.session ?? tmux.pane })}>
          {" · "}tmux
        </span>
      )}
      {place.remote && (
        <>
          {" · "}
          <button
            type="button"
            title={t("Reachable from another device or the browser right now. Opens {link}", { link: place.remote })}
            onClick={() => openUrl(place.remote!)}
            className="inline-flex items-center gap-0.5 text-ai hover:text-slate-100"
          >
            <Radio className="size-3" /> {t("reachable from anywhere")}
          </button>
        </>
      )}
    </>
  );
}

/** The account a session runs in, by the name and colour set under Settings → Accounts (3.2). */
function AccountNote({ session: s }: { session: Session }) {
  const accounts = useAccounts();
  if (!s.account) return null;
  const look = accountLook(accounts, s.account);
  return (
    <span title={t("Account: {dir}", { dir: s.account })}>
      {" · "}
      <span className="mr-1 inline-flex translate-y-[2px]">
        <AccountMark account={look} size={12} />
      </span>
      {look.name}
    </span>
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
  // Each number carries the icon of the place where such things are attached, so it says where
  // they come from; the tooltip says it in words
  const tiles: [number, string, LucideIcon, string][] = [
    [kinds.files, t("Files"), Paperclip, t("Files, folders and passages: the paperclip in the file list")],
    [kinds.changes, t("Changes"), GitCompareArrows, t("Changes of a turn, commit or file: the paperclip in Changes")],
    [kinds.comments, t("Lines"), MessageSquare, t("Comments on diff lines: the speech bubble at a line in Changes")],
    [kinds.hints, t("Hints"), AtSign, t("@ai hints from your files: the paperclip in the Workbench")],
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
        <button
          type="button"
          onClick={() => openView("next")}
          className="flex items-center gap-0.5 rounded px-1 text-[11px] text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          {t("Open")} <ArrowUpRight className="size-3.5" />
        </button>
      </AreaHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {/* Who it is for comes first: the numbers below read as what goes to them */}
        {count > 0 && attaches && (
          <div className="flex flex-col gap-1 rounded-md bg-base/60 px-2 py-1.5 text-[12px] text-slate-400">
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

        <div className="grid grid-cols-4 gap-1">
          {tiles.map(([n, label, Icon, hint]) => (
            <Tooltip key={label} className="flex min-w-0" content={<span>{hint}</span>}>
              <button
                type="button"
                onClick={() => openView("next")}
                className={`flex w-full min-w-0 flex-col items-center rounded-md py-1.5 hover:bg-raised/70 ${n ? "" : "opacity-40"}`}
              >
                <span className="flex items-center gap-1 text-[22px] leading-none font-semibold text-slate-100 tabular-nums">
                  <Icon className="size-3.5 text-slate-500" />
                  {n}
                </span>
                <span className="mt-1 max-w-full truncate px-0.5 text-[10px] tracking-wider text-slate-400 uppercase">{label}</span>
              </button>
            </Tooltip>
          ))}
        </div>

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

        {count === 0 && delivered && (
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
        {count === 0 && (
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
