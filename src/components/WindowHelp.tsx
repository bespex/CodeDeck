import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Anchor, ArrowLeft, ArrowRight, ArrowUpRight, AtSign, Bell, ChevronDown, CircleCheck, Ellipsis, Globe, Keyboard, MessageSquarePlus, MousePointerClick, Paperclip, Play, Plus, Reply, SlidersHorizontal, Users } from "lucide-react";
import { machineSettings, setMachineSetting, windowHelp, type AssistantState } from "../backend";
import { closeDialog, openDialog } from "../dialogs";
import { t } from "../i18n";
import { mainHarness } from "../assistant";
import { currentView, openView, type ViewId } from "../view";

/** A guided tour through the real project window (docs/KONZEPT.md 4.8 "Tutorial"): one part after
 *  the other is lit, the rest dimmed, and a card beside it says what the part is for. Parts are found
 *  by their `data-tour` mark; a part that is not there (no git: no trail) is left out. */

interface Step {
  /** Where the light falls; `null`: no part, the card in the middle (start and end) */
  area: (() => DOMRect | null) | null;
  title: () => string;
  question?: () => string;
  says: () => ReactNode;
  points?: () => [ReactNode, ReactNode][];
  extra?: (assistant: AssistantState) => ReactNode;
  /** The tab of the deck shown while the step is lit */
  view?: ViewId;
}

const rectOf = (mark: string) => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${mark}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
};

/** The smallest rectangle around all the parts found. */
function around(...marks: string[]): DOMRect | null {
  const all = marks.map(rectOf).filter((r): r is DOMRect => !!r);
  if (!all.length) return null;
  const left = Math.min(...all.map((r) => r.left));
  const top = Math.min(...all.map((r) => r.top));
  return new DOMRect(left, top, Math.max(...all.map((r) => r.right)) - left, Math.max(...all.map((r) => r.bottom)) - top);
}

const icon = (Icon: typeof Play) => <Icon className="size-3.5" />;
const key = (k: string) => <kbd className="rounded border border-line bg-base px-1 font-mono text-[10px] text-slate-300">{k}</kbd>;

const logo = <img src="/codedeck.svg" alt="" className="size-3.5" />;

/** The steps follow one round of work, from the project to the commit; where a step is about a tab
 *  of the deck, the deck shows that tab while the step is lit. */
const STEPS: Step[] = [
  {
    area: null,
    title: () => t("A round with CodeDeck"),
    says: () => t("CodeDeck runs beside your coding agent and keeps an eye on your *AI sessions*. You go on writing your prompts in the *chat* of each session.\n\nCodeDeck shows you what the sessions do, what they changed and how safe your work is. It also gathers what you want to give them next.\n\nCome along on one *round of work*, from the first prompt to the commit."),
  },
  {
    area: () => rectOf("projects"),
    title: () => t("Your projects"),
    question: () => t("Where am I, and is something going on elsewhere?"),
    says: () => t("At the top is the *name of the project* of this window.\n\nBelow it you see the *list of all your projects*. It also shows what is happening in the other projects: whether an AI session there asks you something, is working or has finished.\n\nA click on a project shows it in this window; *Ctrl+Tab* takes you back to the previous one."),
    points: () => [
      [logo, t("The CodeDeck logo opens the CodeDeck menu: welcome, this tour, keyboard shortcuts, manual, close project")],
      [icon(SlidersHorizontal), t("Quick settings: do not disturb, notifications, all settings")],
      [icon(Ellipsis), t("With ⋯ beside “Projects” you add projects and sort them")],
      [icon(Keyboard), <>{key(t("Ctrl+Shift+L"))} {t("folds the column and opens it again")}</>],
    ],
  },
  {
    // The column above "Next prompt": header, usage and the sessions
    area: () => {
      const column = rectOf("sessions");
      const next = rectOf("next");
      return column && next ? new DOMRect(column.left, column.top, column.width, next.top - column.top) : column;
    },
    title: () => t("Start an AI session"),
    question: () => t("How do I get the AI working, and what is it doing?"),
    says: () => t("Here you see all *AI sessions* of this project with their status, in the order they were started.\n\nYou start a session with the *buttons at the top*, or as usual in your terminal. Either way it shows up here with its first step.\n\nEach session shows whether it is working, asks you something or has finished its turn, together with its question or what it said last. Sessions that have ended are under *“Earlier”*."),
    points: () => [
      [icon(Plus), t("starts an AI session with a new conversation")],
      [icon(Play), t("continues the last conversation in a new AI session. While a session is still running, it starts nothing.")],
      [icon(ChevronDown), t("Beside the coding agent's name you choose the coding agent and the account the AI sessions run with.")],
      [icon(Reply), t("When an AI session asks, “Answer” takes you to where it runs, the terminal or the desktop app. When a turn is done, “See the turn” shows what it changed. “Continue” takes up an ended conversation again.")],
    ],
    extra: (assistant) => (assistant.sessions.length === 0 ? <SampleSession /> : null),
  },
  {
    area: () => around("deck-tabs", "deck-view"),
    view: "activity",
    title: () => t("While it works: Activity"),
    question: () => t("What have the sessions done?"),
    says: () => t("The deck in the middle has *four tabs*, one for each question of a round.\n\nThe tab *Activity* gives you an overview of the last hours. You see every AI session on a *timeline*: when it worked and when it waited for you.\n\nBelow it you see *how safe your work is* right now and, if your coding agent states it, its *usage*: how much of your account's allowance is used and when it starts over."),
    points: () => [[icon(Bell), t("The bell beside the tabs shows the latest events, tips for the open tab and what CodeDeck found on this computer.")]],
  },
  {
    area: () => around("deck-tabs", "deck-view"),
    view: "changes",
    title: () => t("When a turn is done: Changes"),
    question: () => t("What did the AI change?"),
    says: () => t("A *turn* is everything an AI session does on one of your prompts, until it has finished and waits for you again.\n\nHere you see as a *diff* what the AI sessions changed. At first these are all changes that are not committed yet. When you pick a point on the *trail*, you see exactly what that turn, commit or snapshot changed.\n\nEvery file carries the *colour* of the session that wrote it."),
    points: () => [
      [icon(MessageSquarePlus), t("With the speech bubble at a line you write a comment for the AI. It goes along with your next prompt.")],
      [icon(CircleCheck), t("With “Viewed” you mark a file you have looked at. If it changes again afterwards, CodeDeck tells you.")],
      [icon(Paperclip), t("The paperclip at a turn, a commit or a file attaches it to your next prompt.")],
    ],
  },
  {
    area: () => around("deck-tabs", "deck-view"),
    view: "workbench",
    title: () => t("What else came up: Workbench"),
    question: () => t("What did the AI leave beside the project?"),
    says: () => t("CodeDeck tells the AI to put drafts, test data and throwaway scripts into a folder of their own: the *scratch folder .scratch/* of the project.\n\nHere you see these files. They are not part of the changes in the project, but often worth a look. What you want to keep you drag into the project's *file tree*."),
    points: () => [
      [icon(Globe), t("You also see pages the AI sessions published and files they put elsewhere, such as in /tmp.")],
      [icon(AtSign), t("When you write @ai into a file, that is an instruction for the AI. Such hints are listed here, and the paperclip attaches them.")],
    ],
  },
  {
    // First all four tabs of the deck, then the summary beside the sessions (user, 2026-11-21)
    area: () => around("deck-tabs", "deck-view"),
    view: "next",
    title: () => t("Hand over: Next prompt"),
    question: () => t("What does the AI get with my next prompt?"),
    says: () => t("*Attaching* means: you gather here what the AI should know for its next turn, and CodeDeck hands it over with your next prompt. You do not copy anything into the chat.\n\nYou can attach *files*, *changes* (a turn, a commit or single files of them), *comments on lines* of a diff and *@ai hints* from your files.\n\nWhen you send your next prompt in the *session's chat*, your coding agent tells CodeDeck, and CodeDeck adds the attachments to that prompt as text: files as their path, which the agent reads itself when it needs them, changes as the git command that shows them, comments with file and line. Then the list is empty again, and a receipt says which session got it.\n\nThis tab shows the *exact text* that goes along; what should not go along you *remove* here. At the bottom are the *start rules* every new session gets once."),
    points: () => [
      [icon(Paperclip), t("You attach with the paperclip: files in the file list, turns and files in Changes, @ai hints in the Workbench. Comments you write with the speech bubble at a line.")],
      [icon(Users), t("When several AI sessions are running, you choose which one the attachments are for.")],
    ],
    // Only for a coding agent that cannot take text with a prompt: what happens there instead
    extra: (assistant) => <AttachNote assistant={assistant} />,
  },
  {
    area: () => rectOf("next"),
    title: () => t("Next prompt at a glance"),
    question: () => t("What goes along right now?"),
    says: () => t("Below the sessions you see a *summary* of the tab Next prompt: what is attached and which AI session it is for.\n\nSo you always see what is attached for the next AI session, without leaving the session list. After processing it shows when and to which session the attachments went."),
    points: () => [[icon(ArrowUpRight), t("“Open” on the right opens the tab Next prompt with everything in full.")]],
  },
  {
    area: () => rectOf("trail"),
    title: () => t("Keeping it safe: Trail"),
    question: () => t("How safe is my work?"),
    says: () => t("The trail shows the *git history* of the repository in the project's folder as one line, the newest on top. If there are more repositories in folders of the project, it shows them too.\n\nThe *colour of the line* tells you how safe your work is:"),
    extra: () => <TrailColours />,
    points: () => [
      [icon(MousePointerClick), t("Hover over it and it opens as a timeline. A click on a point shows what that commit changed.")],
      [icon(Anchor), t("An anchor is a snapshot. CodeDeck takes it when an AI session makes changes in the project, and you can go back to it.")],
      [icon(Keyboard), t("With Ctrl+click on a second point you compare the two.")],
    ],
  },
  {
    area: () => rectOf("files"),
    title: () => t("Files and commit"),
    question: () => t("Where is what, and how does the work get into git?"),
    says: () => t("Here you see the project's *file tree*. Files an AI session changed carry its colour.\n\nAt the top beside “Files” is the *branch* of the project with the number of uncommitted changes and of commits not pushed yet. A click on it opens the *git actions*: fetch, pull, commit and push. Repositories in folders of the project have their branch at their folder.\n\nWith the commit the round of work ends."),
    points: () => [
      [icon(Keyboard), <>{key(`${t("Ctrl")}+G`)} {t("opens the git actions of the project's repository")}</>],
      [icon(Keyboard), <>{key(t("Ctrl+B"))} {t("folds the file list and opens it again")}</>],
      [icon(MousePointerClick), t("When the file list is folded, a narrow rail remains. A click on it opens the list again.")],
    ],
  },
  {
    area: null,
    title: () => t("That's the round"),
    says: () => t("You start an AI session, follow it, look at what it changed, hand over the next prompt and commit: that is a *round with CodeDeck*.\n\nEvery symbol explains itself in its *tooltip* when you point at it.\n\nThe keyboard shortcuts, this tour and the welcome are always in the *CodeDeck menu* behind the logo at the top left."),
  },
];

/** A text in its paragraphs, parted by an empty line; anything else as one paragraph. A term in
 *  `*…*` stands out a little, so the eye finds the topic it looks for (user, 2026-11-21). */
function paragraphs(text: ReactNode) {
  if (typeof text !== "string") return <p>{text}</p>;
  return text.split("\n\n").map((part, i) => (
    <p key={i}>
      {part.split(/\*([^*]+)\*/).map((piece, j) => (j % 2 ? <span key={j} className="font-medium text-slate-50">{piece}</span> : piece))}
    </p>
  ));
}

/** In the first project window of a start: once, until turned off. A hidden window asks again when it gets the focus. */
export function useWindowHelp() {
  useEffect(() => {
    let done = false;
    const ask = () =>
      !done &&
      void windowHelp().then((due) => {
        if (!due) return;
        done = true;
        openDialog({ kind: "windowHelp" });
      });
    ask();
    window.addEventListener("focus", ask);
    return () => window.removeEventListener("focus", ask);
  }, []);
}

const CARD_WIDTH = 380;
const GAP = 16;

/** The tour over the window. */
export function WindowHelp({ assistant }: { assistant: AssistantState }) {
  // Whether a step's part is there is asked anew at each turn: the trail, for one, shows only once
  // git has answered that the project has a repository
  const present = (s: Step) => !s.area || !!s.area();
  const [at, setAt] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [off, setOff] = useState(false);
  // The card's height, measured: beside a part it moves up as far as it must to stay in the window
  const card = useRef<HTMLElement>(null);
  const [cardHeight, setCardHeight] = useState(460);
  useLayoutEffect(() => {
    const h = card.current?.offsetHeight;
    if (h && h !== cardHeight) setCardHeight(h);
  });
  const step = STEPS[at];
  const last = at === STEPS.length - 1;
  const parts = STEPS.filter((s) => s.area && present(s));

  // The deck follows the tour; at its end it shows again the tab it showed before
  const [before] = useState(currentView);
  useEffect(() => () => openView(before), [before]);
  useEffect(() => {
    if (step.view) openView(step.view);
  }, [step]);

  useEffect(() => void machineSettings().then((m) => setOff(m.windowHelp === false)), []);
  const turnOff = (v: boolean) => {
    setOff(v);
    void setMachineSetting("windowHelp", v ? false : null);
  };

  const measure = useCallback(() => setRect(step.area?.() ?? null), [step]);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /** The next step from `from` in direction `by` whose part is there. */
  const go = (from: number, by: 1 | -1) => {
    let i = from + by;
    while (i > 0 && i < STEPS.length - 1 && !present(STEPS[i])) i += by;
    return Math.min(Math.max(i, 0), STEPS.length - 1);
  };
  const next = () => (last ? closeDialog() : setAt((a) => go(a, 1)));
  const back = () => setAt((a) => go(a, -1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // The card beside the lit part, on the side with room; else in the middle
  const W = window.innerWidth;
  const H = window.innerHeight;
  let left = (W - CARD_WIDTH) / 2;
  let top: number | undefined;
  if (rect) {
    if (W - rect.right >= CARD_WIDTH + 2 * GAP) left = rect.right + GAP;
    else if (rect.left >= CARD_WIDTH + 2 * GAP) left = rect.left - GAP - CARD_WIDTH;
    top = Math.max(GAP, Math.min(rect.top + 24, H - cardHeight - GAP));
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={t("A round with CodeDeck")}>
      {/* The light: a frame around the part, the rest dimmed by its shadow; without a part all is dimmed */}
      <div
        className="pointer-events-none fixed rounded-lg ring-2 ring-brand transition-all duration-300 ease-out"
        style={
          rect
            ? { left: rect.left + 3, top: rect.top + 3, width: rect.width - 6, height: rect.height - 6, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)" }
            : { left: W / 2, top: H / 2, width: 0, height: 0, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)", borderWidth: 0, ["--tw-ring-shadow" as string]: "0 0 #0000" }
        }
      />
      <section
        ref={card}
        style={{ left, width: CARD_WIDTH, ...(top === undefined ? { top: "50%", transform: "translateY(-50%)" } : { top }) }}
        className="surface-overlay fixed flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-xl text-[13px] text-slate-300 shadow-2xl transition-[left,top] duration-300"
      >
        <div className="flex flex-col gap-2.5 overflow-y-auto px-5 pt-4 pb-3">
          {step.area && (
            <span className="text-[11px] font-semibold tracking-wider text-brand-soft uppercase">
              {t("Step {n} of {total}", { n: parts.indexOf(step) + 1, total: parts.length })}
            </span>
          )}
          <h2 className="text-[16px] font-semibold text-slate-50">{step.title()}</h2>
          {step.question && <p className="-mt-1.5 text-slate-400 italic">{step.question()}</p>}
          {/* A new aspect, a new paragraph: the texts part them with an empty line (user, 2026-11-21) */}
          {paragraphs(step.says())}
          {step.extra?.(assistant)}
          {last && (
            <label className="mt-1 flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
              <input type="checkbox" checked={off} onChange={(e) => turnOff(e.target.checked)} />
              {t("Don't show this at start")}
            </label>
          )}
          {step.points && (
            <ul className="flex flex-col gap-1.5 text-[12px] [&_b]:font-medium [&_b]:text-slate-100">
              {step.points().map(([mark, text], i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded bg-raised px-0.5 text-slate-200">{mark}</span>
                  <span className="pt-px">{text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t border-overlay-line px-4 py-2.5">
          {/* No dots for the steps: "Step n of total" says it, and ten of them pushed the buttons out of the card */}
          {!last && (
            <button type="button" onClick={closeDialog} className="rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100">
              {t("Skip")}
            </button>
          )}
          <span className="ml-auto flex gap-2">
            {at > 0 && (
              <button type="button" onClick={back} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-slate-200 hover:bg-overlay-hover">
                <ArrowLeft className="size-3.5" />
                {t("Back")}
              </button>
            )}
            <button type="button" onClick={next} autoFocus className="flex items-center gap-1 rounded-md bg-brand-fill px-3 py-1 font-medium text-on-accent hover:bg-brand-fill-hover">
              {at === 0 ? t("Start") : last ? t("Let's go") : t("Next")}
              {!last && <ArrowRight className="size-3.5" />}
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}

/** What a session looks like in the list, for a project without sessions yet: an example, not data. */
function SampleSession() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="pointer-events-none flex gap-2.5 rounded-lg border border-changed/50 bg-area-wait p-2.5" aria-hidden>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-raised text-[12px] font-semibold text-slate-200">A</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-100">{t("Fix the tests")}</span>
            <span className="ml-auto shrink-0 rounded-full bg-changed/20 px-1.5 text-[11px] text-changed">{t("asks · 3 min")}</span>
          </div>
          <span className="text-[12px] text-changed">{t("May I run the tests?")}</span>
          <span className="self-end rounded border border-changed/60 px-1.5 text-[11px] text-changed">{t("Answer")}</span>
        </div>
      </div>
      <span className="text-[11px] text-slate-500">{t("This is how an AI session looks in the list once it runs.")}</span>
    </div>
  );
}

/** For a coding agent that does not take attachments with the next prompt (asked of its
 *  capabilities, never its name): how they reach it instead, or that they do not. */
function AttachNote({ assistant }: { assistant: AssistantState }) {
  const { name, capabilities } = mainHarness(assistant);
  if (capabilities.attach === "withNextPrompt") return null;
  return (
    <p className="rounded-md border border-changed/40 bg-changed/10 px-2.5 py-1.5 text-[12px] text-slate-200">
      {capabilities.attach === "clipboard"
        ? t("{tool} cannot take text with a prompt. CodeDeck then offers to copy the attachments to the clipboard, and you paste them into the chat yourself.", { tool: name })
        : t("{tool} cannot take attachments. What you gather here is only for you to look at.", { tool: name })}
    </p>
  );
}

/** The trail's three states as short pieces of line. */
function TrailColours() {
  const piece = (line: string, dot: string, label: string) => (
    <span className="flex items-center gap-2.5 text-[12px]">
      <span className="relative flex h-6 w-[18px] shrink-0 justify-center">
        <span className={`h-full w-0.5 ${line}`} />
        <span className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
  return (
    <div className="flex flex-col">
      {piece("bg-brand", "bg-brand", t("not committed yet"))}
      {piece("bg-brand/40", "border-2 border-brand/70 bg-panel", t("committed, not pushed"))}
      {piece("bg-slate-500", "bg-slate-400", t("on the remote"))}
    </div>
  );
}
