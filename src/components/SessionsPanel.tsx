import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardCopy, File, Folder, Pencil, Send, TextSelect, Trash2, X } from "lucide-react";
import { DRAG_TYPE } from "./FilesPanel";
import { HookPanel } from "./AssistantStatus";
import { Tooltip } from "./Tooltip";
import { forgetSession, handOver, renameSession, type AssistantState, type Entry, type Handover, type Session } from "../backend";
import { mainHarness, shortId, useConnections, useSessionMarks, type SessionMark } from "../assistant";
import { SessionBadge } from "./SessionBadge";
import { FOCUS_KEY, focusText, type Pin } from "../focus";
import { plural } from "../git";
import { LOCALE } from "./Trail";

interface Props {
  assistant: AssistantState;
  pins: Pin[];
  onPin: (entry: Entry) => void;
  onUnpin: (id: string) => void;
  onClear: () => void;
  /** Shows a file the assistant wrote: selects it in the file list and the deck */
  onShowFile: (path: string) => void;
}

/**
 * The right column, in three areas: what waits for you (coloured only while something does),
 * the sessions working in the project, and what goes out with your next prompt.
 */
export function SessionsPanel(props: Props) {
  return (
    <aside className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,3fr)_minmax(0,2fr)] border-l border-line bg-panel">
      <NeedsYou state={props.assistant} />
      <Sessions state={props.assistant} onShowFile={props.onShowFile} />
      <NextPrompt {...props} />
    </aside>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
const titleOf = (s: Session) => s.title ?? `Session ${shortId(s.id)}`;
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

/**
 * A session needs you when it asks something, or when its turn is over and it waits for the next
 * prompt. The second kind can be put aside and leaves by itself after a while, so that not every
 * session ends up here; it comes back with the session's next turn. Only sessions that report
 * count: of one known from its log nothing is known but that it was there.
 */
function needsYou(s: Session): "asks" | "done" | null {
  if (!s.capabilities.liveStatus) return null;
  if (s.status === "waiting") return "asks";
  return s.status === "idle" && s.turnDone != null ? "done" : null;
}

/** How long a finished turn stays under "Needs you". To become a setting. */
const DONE_SHOWN_MS = 30 * 60_000;
/** A session that reports but has been idle this long is no longer one you are busy with. To become a setting. */
const EARLIER_AFTER_MS = 6 * 3600_000;

/** Renders again every half minute: what is shown depends on how long ago something was. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function NeedsYou({ state }: { state: AssistantState }) {
  const marks = useSessionMarks();
  // Put aside, per turn: `<session>:<end of turn>`
  const [aside, setAside] = useState<Set<string>>(new Set());
  const key = (s: Session) => `${s.id}:${s.turnDone}`;
  const now = useNow();
  const fresh = (s: Session) => now - (s.turnDone ?? s.last) < DONE_SHOWN_MS;
  const waiting = state.sessions.filter((s) => needsYou(s) === "asks" || (needsYou(s) === "done" && fresh(s) && !aside.has(key(s))));
  // Questions first: they block a session, a finished turn does not
  waiting.sort((a, b) => Number(needsYou(b) === "asks") - Number(needsYou(a) === "asks"));

  return (
    <section className={`flex max-h-[40vh] min-h-0 flex-col border-b border-line ${waiting.length > 0 ? "bg-[var(--color-area-wait)]" : ""}`}>
      <AreaHeader title="Needs you" count={waiting.length} />
      {waiting.length === 0 ? (
        <p className="px-3 pb-2.5 text-[12px] text-slate-500">Nothing. No session waits for you.</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          {waiting.map((s) => {
            const asks = needsYou(s) === "asks";
            return (
              <li
                key={s.id}
                onMouseEnter={() => marks.hover(s.id)}
                onMouseLeave={() => marks.hover(null)}
                className="rounded-lg border border-overlay-line bg-overlay px-2.5 py-2 shadow-lg shadow-black/25"
              >
                <div className="flex items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${asks ? "bg-changed" : "bg-slate-400"}`} />
                  <SessionBadge mark={markOf(s, marks.of(s.id))} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-100">
                    {titleOf(s)} <span className="font-normal text-slate-400">{asks ? "asks" : "finished its turn"}</span>
                  </span>
                  {!asks && (
                    <button
                      type="button"
                      title="Put aside until its next turn"
                      aria-label={`Put ${titleOf(s)} aside`}
                      onClick={() => setAside((current) => new Set(current).add(key(s)))}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className={`mt-1 line-clamp-3 text-[12px] ${asks ? "text-changed" : "text-slate-300"}`}>
                  {asks ? (s.message ?? "Waits for your answer") : `Waits for your next prompt since ${time(s.turnDone ?? s.last)}`}
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
  if (s.status === "working") return { words: "working", timed: false };
  if (s.status === "waiting") return { words: "waiting for you", timed: false };
  if (s.status === "ended") return { words: `ended · ${time(s.last)}`, timed: true };
  // Nothing was heard from it: whether it works right now is not known
  if (!s.capabilities.liveStatus) return { words: `from its log · ${time(s.last)}`, timed: true };
  return { words: `${s.turnDone != null ? "turn done" : "idle"} · ${time(s.turnDone ?? s.last)}`, timed: true };
}

/**
 * The one thing that counts right now: the step while working, the question while waiting, then
 * the result. `from` says what it is made of, so that the fold-out does not say it again.
 */
function headline(s: Session): { text: string; from: "step" | "prompt" | "message" | "result" } {
  const prompt = { text: s.prompt ?? "", from: "prompt" as const };
  if (s.status === "working") return s.step ? { text: s.step, from: "step" } : s.prompt ? prompt : { text: "Working", from: "result" };
  if (s.status === "waiting") return { text: s.message ?? "Waits for your answer", from: "message" };
  if (s.touched.length > 0) return { text: `Wrote ${plural(s.touched.length, "file")}`, from: "result" };
  return s.prompt ? prompt : { text: "Nothing written", from: "result" };
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
      <AreaHeader title="Sessions" />
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
              <p className="px-3 pb-2 text-[12px] text-slate-500">No session is at work here right now.</p>
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
                  Earlier
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
            No {harness.name} session has worked in this project since CodeDeck opened it. Start one in the
            project's folder: it shows up here with its first step.
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
          aria-label={`Rename session ${mark.short}`}
          title="Rename"
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
              {s.touched.map((t) => (
                <li key={t.path}>
                  <button
                    type="button"
                    onClick={() => onShowFile(t.path)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[11px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
                  >
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: mark.color }} />
                    <span className="truncate">{t.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* The session's own little status bar: the model first, then where it runs. Set apart
              by a faint dotted line, quieter than the hairlines between the sessions */}
          <div className="mt-2 flex items-start gap-2 border-t border-dotted border-line/60 pt-1.5 text-[11px] text-slate-500">
            <span className="min-w-0 flex-1 pt-0.5">
              {s.model && <span className="font-medium text-slate-300">{s.model}</span>}
              {s.model && " · "}
              {s.cwd === "" ? "project root" : s.cwd}
              {!status.timed && ` · last step ${time(s.last)}`}
              {s.step && head.from !== "step" && ` · ${s.step}`}
              {s.handed && <span className="text-ai"> · got the hand-over</span>}
            </span>
            <button
              type="button"
              title="Takes it off this list. It comes back by itself when the session takes its next step"
              onClick={() => forgetSession(s.id)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-slate-300 hover:border-overlay-line hover:bg-overlay-hover hover:text-slate-100"
            >
              <X className="size-3" /> Remove from list
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
        <input autoFocus aria-label="Title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} flex-1`} />
        <input aria-label="Short name" placeholder="A" maxLength={4} value={short} onChange={(e) => setShort(e.target.value)} className={`${field} w-14 text-center`} />
      </div>
      <div className="flex items-center gap-1.5">
        <button type="submit" className={`${button} bg-brand-fill text-white hover:bg-brand-fill-hover`}>
          Save
        </button>
        <button type="button" onClick={onClose} className={`${button} text-slate-400 hover:bg-overlay-hover hover:text-slate-100`}>
          Cancel
        </button>
        {s.renamed && (
          <button
            type="button"
            title="Back to the title the tool gave the session"
            onClick={() => renameSession(s.id, null, short).then(onClose)}
            className={`${button} ml-auto text-slate-400 hover:bg-overlay-hover hover:text-slate-100`}
          >
            Use its own title
          </button>
        )}
      </div>
    </form>
  );
}

/* ── Next prompt: what the assistant gets, only when asked ─────────────────── */

const kindIcon = { file: File, folder: Folder, snippet: TextSelect };

/** The context window the token meter measures against. */
const CONTEXT_TOKENS = 200_000;

/**
 * The short form of the Handover view, always in sight: what is queued for the next prompt (with
 * its exact text on demand), the receipt once a session took it, and the focus to queue from.
 */
function NextPrompt({ assistant, pins, onPin, onUnpin, onClear }: Props) {
  const [over, setOver] = useState(false);
  const used = pins.reduce((sum, p) => sum + p.tokens, 0);
  const share = Math.min(1, used / CONTEXT_TOKENS);
  const barColor = share > 0.5 ? "bg-problem" : share > 0.25 ? "bg-changed" : "bg-ai";
  const { connected } = useConnections();
  const marks = useSessionMarks();
  // What is offered follows the tool's capabilities, never its name
  const { shortName, name, capabilities } = mainHarness(assistant);
  const queued = assistant.handovers;
  const { delivered } = assistant;
  const focusQueued = queued.some((h) => h.key === FOCUS_KEY);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const data = e.dataTransfer.getData(DRAG_TYPE);
    if (data) onPin(JSON.parse(data) as Entry);
  };
  const small = "flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100 disabled:opacity-40";

  return (
    <section
      className="flex min-h-0 flex-col bg-[var(--color-area-you)]"
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
      <AreaHeader title="Next prompt">
        <span className="truncate text-[11px] text-slate-500">to the session you prompt next</span>
      </AreaHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {queued.length > 0 && (
          <ul className="divide-y divide-line/70 border-y border-line/70">
            {queued.map((h) => (
              <Queued key={h.key} part={h} />
            ))}
          </ul>
        )}
        {queued.length > 0 && (
          <p className="flex items-center gap-1.5 px-3 pt-1.5 text-[12px] text-slate-400">
            <span className="size-1.5 shrink-0 rounded-full bg-changed" /> Waiting for your next prompt in this project
          </p>
        )}
        {queued.length === 0 && delivered && (
          <p className="flex items-start gap-1.5 px-3 pb-1 text-[12px] text-slate-300">
            <Check className="mt-0.5 size-3.5 shrink-0 text-added" />
            <span className="min-w-0">
              Delivered at {time(delivered.at)} to{" "}
              {marks.of(delivered.session) && <SessionBadge mark={marks.of(delivered.session)!} className="mx-0.5 align-[-2px]" />}
              {marks.of(delivered.session)?.title ?? `session ${shortId(delivered.session)}`}
              <span className="text-slate-500">: {delivered.labels.filter(Boolean).join(", ") || "the hand-over"}</span>
            </span>
          </p>
        )}
        {queued.length === 0 && !delivered && pins.length === 0 && (
          <p className="px-3 text-[12px] text-slate-500">
            Nothing queued: {shortName} works without extra context and only ever gets what is listed here. Pin files or
            folders (drag them here or use the pin in the file list), or queue the hints in the Handover view.
          </p>
        )}

        {pins.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2 px-3">
              <span className="text-[12px] font-semibold text-slate-200">Focus</span>
              <span className="text-[12px] text-slate-500">{pins.length}</span>
              <div className="ml-auto flex items-center gap-1">
                {capabilities.handover === "clipboard" && (
                  <Tooltip content={<span>Copy the focus to paste into {shortName}</span>}>
                    <button type="button" onClick={() => navigator.clipboard.writeText(focusText(pins))} className={small}>
                      <ClipboardCopy className="size-3.5" />
                      Copy
                    </button>
                  </Tooltip>
                )}
                {capabilities.handover === "withNextPrompt" && (
                  <Tooltip
                    content={
                      <>
                        <span>Give the focus to {shortName} with the next prompt you send in this project</span>
                        {!connected && <span className="text-slate-400">Needs {name} connected (status bar)</span>}
                      </>
                    }
                  >
                    <button
                      type="button"
                      disabled={!connected}
                      onClick={() => handOver(FOCUS_KEY, focusText(pins), `Focus: ${plural(pins.length, "item")}`)}
                      className={small}
                    >
                      <Send className="size-3.5" />
                      {focusQueued ? "Queue again" : "Add to next prompt"}
                    </button>
                  </Tooltip>
                )}
                <button
                  type="button"
                  onClick={onClear}
                  title="Clear the focus"
                  aria-label="Clear the focus"
                  className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-200"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="px-3 pt-1.5">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-base"
                role="meter"
                aria-label="Size of the focus"
                aria-valuemin={0}
                aria-valuemax={CONTEXT_TOKENS}
                aria-valuenow={used}
              >
                <div className={`h-full rounded-full transition-[width] ${barColor}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                about <span className="text-slate-300">{formatTokens(used)}</span> tokens if {shortName} reads all of it
              </div>
            </div>
          </div>
        )}

        <div className={`m-2 rounded-lg border border-dashed p-1 transition-colors ${over ? "border-ai bg-ai/10" : "border-transparent"}`}>
          <ul className="divide-y divide-line/70">
            {pins.map((pin) => {
              const Icon = kindIcon[pin.kind];
              return (
                <li key={pin.id} className="group flex items-center gap-2 px-1 py-1">
                  <Icon className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-slate-100 ${pin.kind === "snippet" ? "font-mono text-[12px]" : ""}`}>{pin.label}</div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                      {pin.via && <span className="rounded bg-ai/15 px-1 text-ai">from {pin.via}</span>}
                      <span className="truncate">{pin.detail}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">{formatTokens(pin.tokens)}</span>
                  <button
                    type="button"
                    onClick={() => onUnpin(pin.id)}
                    aria-label={`Remove ${pin.label} from the focus`}
                    className="shrink-0 rounded p-0.5 text-slate-600 hover:bg-overlay-hover hover:text-slate-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
          {over && pins.length === 0 && <p className="p-3 text-center text-[12px] text-slate-400">Drop to pin it</p>}
        </div>
      </div>
    </section>
  );
}

/** One part waiting for the next prompt: what it is, its exact text on demand, and taking it back. */
function Queued({ part }: { part: Handover }) {
  const [preview, setPreview] = useState(false);
  return (
    <li className="px-3 py-1.5 text-[12px]">
      <div className="flex items-center gap-2">
        <Send className="size-3.5 shrink-0 text-ai" />
        <span className="min-w-0 flex-1 truncate text-slate-200">{part.label || part.key}</span>
        <button
          type="button"
          aria-expanded={preview}
          onClick={() => setPreview(!preview)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          {preview ? "Hide" : "Preview"}
        </button>
        <button
          type="button"
          aria-label={`Take back: ${part.label || part.key}`}
          title="Take back"
          onClick={() => handOver(part.key, null)}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-raised hover:text-slate-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {preview && (
        // The exact text: the one framed thing here
        <pre className="selectable mt-1.5 max-h-40 overflow-auto rounded-md border border-line bg-base p-2 font-mono text-[11px] whitespace-pre-wrap text-slate-300">
          {part.text}
        </pre>
      )}
    </li>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}
