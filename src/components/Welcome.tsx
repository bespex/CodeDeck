import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check as CheckMark, Copy, Ellipsis, FolderGit2, FolderPlus, Info, LayoutList, Radio, RefreshCw, TriangleAlert, X } from "lucide-react";
import { checkup, closeWindow, openUrl, setHarnessConnection, welcomeAtStart, welcomeDone, welcomeFit, type Check } from "../backend";
import { useConnections } from "../assistant";
import { useAccounts } from "../accounts";
import { usePlatform } from "../platform";
import { t } from "../i18n";
import { Tooltip } from "./Tooltip";
import { HOME_URL, Wordmark } from "./Dialogs";

/** What each urgency means: shown as the badge's tooltip and in the legend. */
const URGENCY: Record<Check["urgency"], { label: () => string; means: () => string; className: string }> = {
  essential: { label: () => t("essential"), means: () => t("CodeDeck needs it to do its job."), className: "bg-brand/15 text-brand-soft" },
  helpful: { label: () => t("helpful"), means: () => t("Without it, part of CodeDeck is missing."), className: "bg-overlay-hover text-slate-200" },
  niceToHave: { label: () => t("nice to have"), means: () => t("It makes working with CodeDeck nicer."), className: "bg-panel text-slate-400" },
};

/** The name shown: programs by their own name, the rest in the language of the interface. */
function nameOf(c: Check): string {
  if (c.kind === "terminal") return t("Terminal program");
  if (c.kind === "windows") return t("Window system");
  if (c.kind === "tray") return t("Tray");
  return c.name;
}

/** What it does for CodeDeck, in a sentence or two. */
function purposeOf(c: Check): string {
  switch (c.kind) {
    case "tool":
      return t("The coding agent: the program your AI sessions run in. CodeDeck shows you what the sessions do, what waits for you and what they changed. CodeDeck needs at least one coding agent.");
    case "git":
      return t("CodeDeck reads the changes, the trail and the snapshots from git. With git, CodeDeck can also take you back to an earlier state.");
    case "tmux":
      return t("CodeDeck starts, continues and stops AI sessions in tmux. Without it, CodeDeck only watches sessions you start yourself.");
    case "terminal":
      return t("With the button “Terminal”, CodeDeck opens an AI session in a terminal window with one click.");
    case "windows":
      return t("Under X11 CodeDeck places its windows, holds the global shortcut Ctrl+Alt+L and brings the window of an AI session started by hand to the front. Wayland does not allow that.");
    case "tray":
      return t("The CodeDeck icon in the panel: a click brings CodeDeck to the front, and at login CodeDeck waits there without a window. On GNOME it needs the AppIndicator extension.");
    case "viewer":
      return (
        {
          marq: t("Shows Markdown documents and an AI session's closing words as a formatted page (“Read in Marq”)."),
          dirq: t("Shows a commit, a snapshot or a comparison side by side (“Open in Dirq”)."),
          hyqe: t("Shows HTML pages an AI session wrote, rendered, without a browser."),
          jayq: t("CodeDeck shows JSON files in it, pretty-printed and foldable, with a jq filter."),
          xaq: t("CodeDeck shows XML files in it, pretty-printed and foldable."),
          cusq: t("CodeDeck shows CSV and TSV files in it as a table to sort and filter, e.g. test data in the scratch folder."),
          maiqe: t("Shows Mermaid diagrams an AI session drew, one card each, to zoom and export."),
          trisq: t("Runs a React component (TSX/JSX) an AI session wrote as a mock-up, without a project."),
        }[c.id] ?? ""
      );
  }
}

/** The welcome in its own window (`welcome.rs`): CodeDeck greets, says what it looked for on this
 *  computer, how much each matters and what it does for CodeDeck. */
export default function Welcome() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [off, setOff] = useState(false);
  // "Tell me more" turns to the second page: the project list explained
  const [page, setPage] = useState<"checks" | "projects">("checks");
  // The page on the project list is 800 px wide and as high as its text; back on the first page the
  // window has its first size again (user, 2026-11-21). The width first: the text's height follows it
  useEffect(() => {
    if (page === "checks") return void (window.innerWidth !== 660 && welcomeFit(660, 800));
    const measure = () => {
      const content = document.querySelector<HTMLElement>("[data-page=projects]");
      const footer = document.querySelector<HTMLElement>("[data-page-footer]");
      const last = content?.lastElementChild;
      if (!content || !footer || !last) return;
      // To the end of its last part, not scrollHeight: in a window higher than the text that is the window's height
      const text = last.getBoundingClientRect().bottom - content.getBoundingClientRect().top + content.scrollTop + parseFloat(getComputedStyle(content).paddingBottom);
      void welcomeFit(800, text + footer.offsetHeight);
    };
    if (window.innerWidth === 800) return measure();
    void welcomeFit(800, window.innerHeight);
    const timer = setTimeout(measure, 250);
    return () => clearTimeout(timer);
  }, [page]);
  const machine = usePlatform();
  useEffect(() => {
    document.title = t("Welcome to CodeDeck");
    void checkup(false).then(setChecks);
    void welcomeAtStart().then((on) => setOff(!on));
  }, []);
  const again = () => {
    setChecking(true);
    void checkup(true)
      .then(setChecks)
      .finally(() => setChecking(false));
  };
  // Stored at once: closing the window by its frame keeps the choice too
  const turnOff = (v: boolean) => {
    setOff(v);
    void welcomeDone(v);
  };
  const missing = checks?.filter((c) => c.urgency === "essential" && c.status !== "found") ?? [];
  return (
    <div className="flex h-screen flex-col bg-base text-[13px] text-slate-300">
      {page === "projects" ? (
        <ProjectsExplained />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 pt-7 pb-4">
        <header className="flex flex-col items-center gap-1.5 text-center">
          <img src="/codedeck.svg" alt="" className="mb-1 size-16" />
          <Wordmark className="text-[34px] leading-none" />
          <h1 className="mt-1 text-[15px] font-semibold text-slate-100">{t("Welcome to CodeDeck")}</h1>
          <p className="text-slate-400">{t("CodeDeck looked for what it works with on this computer.")}</p>
        </header>
        {checks && (
          <p className={missing.length ? "text-problem" : "text-added"}>
            {missing.length ? t("CodeDeck needs something that is missing: {names}.", { names: missing.map(nameOf).join(", ") }) : t("Everything CodeDeck needs is there.")}
          </p>
        )}
        <section className="rounded-md bg-panel">
          <div className="flex items-center border-b border-line px-3 py-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {t("Found on this computer")}
            <button
              type="button"
              disabled={checking}
              onClick={again}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-normal tracking-normal text-slate-400 normal-case hover:bg-overlay-hover hover:text-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${checking ? "animate-spin" : ""}`} />
              {t("Check again")}
            </button>
          </div>
          <div className="flex flex-col py-1">{checks ? checks.map((c) => <Row key={c.id} check={c} />) : <p className="px-3 py-2 text-slate-500">{t("Looking…")}</p>}</div>
        </section>
        <Legend />
        {machine.wayland && <WaylandWarning command={machine.toggleCommand} />}
      </div>
      )}
      <footer data-page-footer className="flex items-center gap-3 border-t border-line px-5 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
          <input type="checkbox" checked={off} onChange={(e) => turnOff(e.target.checked)} />
          {t("Don't show this at start")}
        </label>
        {page === "checks" ? (
          <>
            <button type="button" onClick={() => setPage("projects")} className="ml-auto rounded-md px-3 py-1 text-slate-200 hover:bg-overlay-hover">
              {t("Tell me more")}
            </button>
            <button type="button" onClick={() => void closeWindow()} className="rounded-md bg-brand-fill px-3 py-1 font-medium text-on-accent hover:bg-brand-fill-hover">
              {t("I know my way around")}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setPage("checks")} className="ml-auto flex items-center gap-1 rounded-md px-3 py-1 text-slate-200 hover:bg-overlay-hover">
              <ArrowLeft className="size-3.5" />
              {t("Back")}
            </button>
            <button type="button" onClick={() => void closeWindow()} className="rounded-md bg-brand-fill px-3 py-1 font-medium text-on-accent hover:bg-brand-fill-hover">
              {t("Let's go")}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/** The second page: the project list, empty at the first start, explained in four cards: what it
 *  shows, what a project is, what "hearing its sessions" means, how projects get on it and open. */
function ProjectsExplained() {
  const menu = <Ellipsis className="inline size-4 rounded bg-raised p-0.5 align-text-bottom text-slate-200" />;
  const cards: { icon: ReactNode; title: string; lead: string; points: ReactNode[] }[] = [
    {
      icon: <LayoutList className="size-5" />,
      title: t("The project list"),
      lead: t("The project list is on the left side of every project window, and the start page shows the same list. At the first start it is empty. Later it shows:"),
      points: [
        <><b>{t("Waiting in other projects")}</b>: {t("projects in which an AI session asks you something or has finished its turn (only while there are any)")}</>,
        <><b>{t("Recent")}</b>: {t("the projects you opened last")}</>,
        <><b>{t("Your projects")}</b>, {t("grouped by the folders they are in")}</>,
      ],
    },
    {
      icon: <FolderGit2 className="size-5" />,
      title: t("A project"),
      lead: t("A project is a folder you work on with AI. Usually it is a git repository, or a folder with several repositories."),
      points: [t("CodeDeck shows you the project's AI sessions, what they changed and the project's git history."), t("When an AI session makes changes in the project, CodeDeck takes snapshots you can always go back to."), t("You keep working with your AI sessions where you are used to: in the terminal or in the desktop app.")],
    },
    {
      icon: <Radio className="size-5" />,
      title: t("Hearing AI sessions"),
      lead: t("Your coding agent tells CodeDeck every step of an AI session: when it starts, when it works, when it asks you something and when it has finished its turn."),
      points: [
        t("This works for every project on the list, even while its window is closed."),
        t("The list then marks the project with “asks” or “done”, and the desktop can notify you."),
        t("For that you connect the coding agent with CodeDeck once: on the first page of this window, or later under Settings → Coding agents."),
      ],
    },
    {
      icon: <FolderPlus className="size-5" />,
      title: t("Adding and opening"),
      lead: t("You add new projects to the list with the menu ⋯ beside “Projects”:"),
      points: [
        <>{menu} <b>{t("Add a project…")}</b>: {t("adds one folder")}</>,
        <>{menu} <b>{t("All projects in a folder…")}</b>: {t("adds every folder in it, e.g. all folders in ~/projects")}</>,
        t("A click on a project switches the view to it."),
      ],
    },
  ];
  return (
    <div data-page="projects" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6 pb-4">
      <header className="flex items-center gap-3">
        <img src="/codedeck.svg" alt="" className="size-10" />
        <div className="flex flex-col">
          <h1 className="text-[17px] font-semibold text-slate-100">{t("Your projects")}</h1>
          <p className="text-slate-400">{t("How you work with the project list.")}</p>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <section key={card.title} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3.5">
            <h2 className="flex items-center gap-2.5 font-semibold text-slate-100">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-soft">{card.icon}</span>
              {card.title}
            </h2>
            <p className="text-[12px] text-slate-300">{card.lead}</p>
            <ul className="flex flex-col gap-1 text-[12px] text-slate-400 [&_b]:font-medium [&_b]:text-slate-200">
              {card.points.map((point, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-slate-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <button type="button" onClick={() => void openUrl(HOME_URL)} className="self-start text-[12px] text-brand-soft hover:underline">
        {t("More on the website")}
      </button>
    </div>
  );
}

/** One thing looked for: name (linked to its page), status, urgency, what it does as a tooltip. */
function Row({ check: c }: { check: Check }) {
  const urgency = URGENCY[c.urgency];
  const status =
    c.status === "found" ? (
      <span className="flex items-center gap-1 text-added">
        <CheckMark className="size-3.5" />
        {t("found")}
      </span>
    ) : c.status === "limited" ? (
      <span className="flex items-center gap-1 text-changed">
        <TriangleAlert className="size-3.5" />
        {t("limited")}
      </span>
    ) : (
      <span className={`flex items-center gap-1 ${c.urgency === "essential" ? "text-problem" : "text-slate-500"}`}>
        <X className="size-3.5" />
        {t("missing")}
      </span>
    );
  return (
    <div className="flex flex-col px-3 py-1">
      <div className="flex items-center gap-3">
        <span className="w-40 shrink-0 truncate">
          {c.url ? (
            <button type="button" onClick={() => void openUrl(c.url!)} className="text-slate-100 hover:text-brand-soft hover:underline" title={c.url}>
              {nameOf(c)}
            </button>
          ) : (
            <span className="text-slate-100">{nameOf(c)}</span>
          )}
        </span>
        <span className="flex w-44 shrink-0 items-center gap-2 text-[12px]">
          {status}
          {c.detail && <span className="truncate text-slate-500">{c.detail}</span>}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${urgency.className}`} title={urgency.means()}>
          {urgency.label()}
        </span>
        <Tooltip content={purposeOf(c)} className="ml-auto flex" delay={0}>
          <Info className="size-4 text-slate-500 hover:text-slate-200" aria-label={t("What it does for CodeDeck")} />
        </Tooltip>
      </div>
      {c.status === "missing" && c.install && <CopyLine text={c.install} />}
      {c.kind === "tool" && c.status === "found" && <Connect harness={c.id.replace(/^tool:/, "")} />}
    </div>
  );
}

/**
 * Whether the coding agent reports to CodeDeck, with Connect beside each configuration that does not
 * yet. It is the step a first start needs most, so it is here, where one looks at the start, and not
 * only in the settings (user, 2026-11-21).
 */
function Connect({ harness }: { harness: string }) {
  const hooks = useConnections();
  const accounts = useAccounts().filter((a) => a.harness === harness && a.kind !== "backup");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!hooks.setups) return null;
  const of = (dir: string) => hooks.setups?.find((c) => c.harness === harness && c.dir === dir);
  const open = accounts.filter((a) => {
    const c = of(a.dir);
    return c && (!c.installed || c.other);
  });
  const connect = async (dir: string) => {
    setBusy(dir);
    setError(null);
    try {
      hooks.update(await setHarnessConnection(harness, dir, true));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };
  if (!accounts.length) return null;
  if (!open.length) {
    return (
      <span className="ml-43 flex items-center gap-1 py-0.5 text-[12px] text-added">
        <CheckMark className="size-3.5" />
        {t("Connected with CodeDeck")}
      </span>
    );
  }
  return (
    <div className="ml-43 flex flex-col gap-1 py-1 text-[12px]">
      <span className="text-problem">{t("Not connected yet: CodeDeck does not hear its AI sessions.")}</span>
      {open.map((a) => (
        <span key={a.dir} className="flex items-center gap-2">
          <span className="truncate text-slate-200">{a.name}</span>
          <span className="truncate font-mono text-[11px] text-slate-500">{a.dir.replace(/^\/home\/[^/]+/, "~")}</span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void connect(a.dir)}
            className="ml-auto shrink-0 rounded-md bg-brand-fill px-2 py-0.5 font-medium text-on-accent hover:bg-brand-fill-hover disabled:opacity-60"
          >
            {of(a.dir)?.other ? t("Use this one") : t("Connect")}
          </button>
        </span>
      ))}
      {error && <span className="text-problem">{error}</span>}
    </div>
  );
}

/** What the three urgencies mean. */
function Legend() {
  return (
    <div className="flex flex-col gap-1 text-[12px] text-slate-400">
      {(Object.keys(URGENCY) as Check["urgency"][]).map((k) => (
        <span key={k} className="flex items-center gap-2">
          <span className={`w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] ${URGENCY[k].className}`}>{URGENCY[k].label()}</span>
          {URGENCY[k].means()}
        </span>
      ))}
    </div>
  );
}

/** A command to copy: what installs a missing program, what to bind to a key. */
function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <code className="selectable min-w-0 truncate rounded bg-base/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">{text}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
        }}
        className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
      >
        <Copy className="size-3" />
        {copied ? t("Copied") : t("Copy")}
      </button>
    </span>
  );
}

/** Under Wayland: what works differently, and the command a desktop binds to a key instead of the
 *  global shortcut (docs/SITZUNGEN-PRUEFUNG.md, decision 4). */
function WaylandWarning({ command }: { command: string }) {
  const items: [string, ReactNode][] = [
    [t("Global shortcuts (Ctrl+Alt+L)"), <>{t("Bind this command to a key in your desktop's keyboard settings; it brings CodeDeck to the front or away:")}<CopyLine text={command} /></>],
    [t("If you started an AI session by hand in a terminal, “Terminal” cannot bring that window to the front"), t("Switch to it yourself. AI sessions started in CodeDeck run in tmux and open in a new terminal as usual.")],
    [t("Placing windows: the start page at the screen's edge, project windows beside it"), t("The desktop places the windows; CodeDeck keeps their size.")],
    [t("Coming to the front on a click in a notification or the tray"), t("The desktop may only say that CodeDeck wants attention: click it in the taskbar.")],
    [t("Marks on the taskbar icon (asks, done)"), t("The window title and the taskbar's attention signal tell what waits.")],
  ];
  return (
    <section className="flex flex-col gap-2 rounded-md border border-changed/40 bg-area-wait px-3 py-2.5">
      <h2 className="flex items-center gap-2 font-semibold text-changed">
        <TriangleAlert className="size-4" />
        {t("Wayland limits some functions")}
      </h2>
      <p className="text-[12px]">{t("Under Wayland, programs may not reach into the windows of other programs. That protects you, but it is why a few things in CodeDeck work differently here. Everything else works as usual.")}</p>
      <dl className="flex flex-col gap-2">
        {items.map(([lost, instead]) => (
          <div key={lost} className="flex flex-col gap-0.5">
            <dt className="text-slate-100">{lost}</dt>
            <dd className="flex flex-col text-[12px] text-slate-400">{instead}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
