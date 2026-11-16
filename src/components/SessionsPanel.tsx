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
  X,
  type LucideIcon,
} from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import { HookPanel } from "./AssistantStatus";
import { Tooltip } from "./Tooltip";
import { forgetSession, renameSession, type AssistantState, type Entry, type ProjectInfo, type Session } from "../backend";
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
  /** Shown as the sidebar, the right column alone (docs/SEITENLEISTE.md) */
  compact: boolean;
}

/**
 * The right column, in three areas: what waits for you (coloured only while something does),
 * the sessions working in the project, and what goes out with your next prompt. Below the header a
 * short overview of what file list, trail and views show; the same in the full window and as the
 * sidebar.
 */
export function SessionsPanel(props: Props) {
  return (
    <aside
      className={`grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_minmax(0,3fr)_minmax(0,2fr)] bg-panel ${
        props.compact ? "" : "border-l border-line"
      }`}
    >
      <HeaderBar project={props.project} onOpenProject={props.onOpenProject} assistant={props.assistant} onToggleLog={props.onToggleLog} compact={props.compact} />
      {/* In both forms (user, 2026-11-16): the column is the same as full window and as sidebar */}
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
function AreaHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 px-3">
      <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      {!!count && <span className="rounded-full bg-changed/25 px-1.5 text-[11px] font-semibold text-changed">{count}</span>}
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
    <section className={`flex max-h-[40vh] min-h-0 flex-col border-b border-line ${waiting.length > 0 ? "bg-[var(--color-area-wait)]" : ""}`}>
      <AreaHeader title={t("Needs you")} count={waiting.length} />
      {waiting.length === 0 ? (
        <p className="px-3 pb-2.5 text-[12px] text-slate-500">{t("Nothing. No session waits for you.")}</p>
      ) : (
        // Rows like the sessions below, not cards: calmer, and the same reading. What stands out is
        // what counts: the area's tint and count, a question's edge and words in amber, and a new
        // entry pulsing a few times
        <ul className="min-h-0 divide-y divide-line/70 overflow-y-auto border-y border-line/70">
          {waiting.map((s) => {
            const asks = needsYou(s) === "asks";
            return (
              <li
                // A new reason is a new item: it lights up once when it comes
                key={waitKey(s)}
                onMouseEnter={() => marks.hover(s.id)}
                onMouseLeave={() => marks.hover(null)}
                className={`group/wait relative py-1.5 pr-1.5 pl-3 ${waitsSince(s) > OPENED_AT ? "attention-new" : ""}`}
              >
                {asks && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-changed" />}
                <div className="flex items-center gap-2">
                  <SessionBadge mark={markOf(s, marks.of(s.id))} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{titleOf(s)}</span>
                  <span className={`flex shrink-0 items-center gap-1.5 text-[11px] ${asks ? "text-changed" : "text-slate-500"}`}>
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
function statusWords(s: Session): { words: string; timed: boolean } {
  if (s.status === "working") return { words: t("working"), timed: false };
  if (s.status === "waiting") return { words: t("waiting for you"), timed: false };
  if (s.status === "ended") return { words: `${t("ended")} · ${time(s.last)}`, timed: true };
  // Nothing was heard from it: whether it works right now is not known
  if (!s.capabilities.liveStatus) return { words: `${t("from its log")} · ${time(s.last)}`, timed: true };
  return { words: `${s.turnDone != null ? t("turn done") : t("idle")} · ${time(s.turnDone ?? s.last)}`, timed: true };
}

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
    <section className="flex min-h-0 flex-col border-b border-line bg-[var(--color-area-ai)]">
      <AreaHeader title={t("Sessions")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.sessions.length > 0 ? (
          // Left as a whole: between two sessions the highlight stays, so nothing flickers on the way
          <div onMouseLeave={() => marks.hover(null)}>
            {current.length > 0 ? (
              <ul className="divide-y divide-line/70 border-y border-line/70">
                {current.map((s) => (
                  <SessionItem key={s.id} session={s} onShowFile={onShowFile} />
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
                      <SessionItem key={s.id} session={s} onShowFile={onShowFile} />
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
function SessionItem({ session: s, onShowFile }: { session: Session; onShowFile: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const marks = useSessionMarks();
  const mark = markOf(s, marks.of(s.id));
  const Chevron = open ? ChevronDown : ChevronRight;
  const status = statusWords(s);
  const head = headline(s);
  return (
    <li
      // On the list: what belongs to this session stands out on the trail and in the file list
      onMouseEnter={() => marks.hover(s.id)}
      className={`group/session ${open ? "bg-raised/60" : "hover:bg-raised/40"} ${s.status === "ended" ? "opacity-55" : ""}`}
    >
      <div className="flex items-start">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-w-0 flex-1 py-1.5 pr-1 pl-3 text-left">
          <span className="flex items-center gap-2">
            <SessionBadge mark={mark} />
            <span className="min-w-0 truncate font-medium text-slate-100">{titleOf(s)}</span>
            <span className={`ml-auto flex shrink-0 items-center gap-1.5 text-[11px] ${s.status === "waiting" ? "text-changed" : "text-slate-500"}`}>
              <StatusDot status={s.status} />
              {status.words}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-1 pl-[26px] text-[12px] text-slate-400">
            <span className="min-w-0 flex-1 truncate">{head.text}</span>
            <Chevron className="size-3.5 shrink-0 text-slate-500" />
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
              {!status.timed && ` · ${t("last step {time}", { time: time(s.last) })}`}
              {s.step && head.from !== "step" && ` · ${s.step}`}
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

/** The user's title and short name for a session; they stay with it in this project. */
function RenameForm({ session: s, onClose }: { session: Session; onClose: () => void }) {
  const [title, setTitle] = useState(s.title ?? "");
  const [short, setShort] = useState(s.short);
  const field = "min-w-0 rounded border border-line bg-base px-1.5 py-0.5 text-slate-100 outline-none focus:border-indigo-500";
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
        <button type="submit" className={`${button} bg-brand-fill text-white hover:bg-brand-fill-hover`}>
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
      className={`flex min-h-0 flex-col bg-[var(--color-area-you)] transition-shadow ${over ? "shadow-[inset_0_0_0_1px_var(--color-ai)]" : ""}`}
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
