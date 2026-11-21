import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GitBranch,
  GitFork,
  RefreshCw,
  SquareTerminal,
  X,
  Plus,
} from "lucide-react";
import { gitAction, type RepoStatus } from "../backend";
import {
  changeSummary,
  commandLine,
  commitSteps,
  fetchSteps,
  pullSteps,
  pushSteps,
  remoteOf,
  addRemoteSteps,
  type Steps,
} from "../git";
import { plural, t } from "../i18n";

/** Where the panel hangs: below a badge in the tree, above the branch in the status bar. */
export interface Anchor {
  element: HTMLElement;
  rect: DOMRect;
  above: boolean;
}

interface Done {
  command: string;
  ok: boolean;
  output: string;
}

const WIDTH = 380;

/**
 * The common Git actions for one repository, right where its branch is shown. Every action is
 * one or two plain git commands; the panel shows them before they run and what they printed.
 */
export function RepoActions(props: { repo: RepoStatus; anchor: Anchor; onClose: () => void; onDone: () => void }) {
  const { repo, anchor } = props;
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState<Steps | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Done[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLElement>(null);
  const [tallest, setTallest] = useState(0);
  useLayoutEffect(() => {
    const height = Math.min(output.current?.offsetHeight ?? 0, 192);
    if (height > tallest) setTallest(height);
  });
  const input = useRef<HTMLInputElement>(null);

  const staged = repo.files.filter((f) => f.staged).length;
  const canCommit = repo.files.length > 0 && message.trim().length > 0;
  const commit = commitSteps(repo, message);
  const preview = hovered ?? (message.trim() ? commit : null);

  useEffect(() => {
    if (repo.files.length > 0) input.current?.focus();
  }, [repo.files.length]);

  useEffect(() => {
    const close = (e: Event) => {
      if (running) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") props.onClose();
        return;
      }
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !anchor.element.contains(target)) props.onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  });

  const run = async (steps: Steps, after?: () => void) => {
    setRunning(true);
    const results: Done[] = [];
    for (const args of steps) {
      const result = await gitAction(repo.path, args).catch((e) => ({ ok: false, output: String(e) }));
      results.push({ command: commandLine(args), ...result });
      setDone([...results]);
      if (!result.ok) break;
    }
    setRunning(false);
    if (results.every((r) => r.ok)) after?.();
    props.onDone();
  };

  /** Hovering or focusing an action shows its commands in the preview line. */
  const showing = (steps: Steps) => ({
    onMouseEnter: () => setHovered(steps),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(steps),
    onBlur: () => setHovered(null),
  });

  const left = Math.min(Math.max(8, anchor.rect.right - WIDTH), window.innerWidth - WIDTH - 8);
  const position = anchor.above
    ? { bottom: window.innerHeight - anchor.rect.top + 6, left }
    : { top: anchor.rect.bottom + 6, left };

  const pull = pullSteps();
  const push = pushSteps(repo);
  const fetch = fetchSteps();
  const noRemote = repo.remotes.length === 0;
  const canPush = !noRemote && !!repo.branch && (!repo.upstream || repo.ahead > 0);
  const toPush = !repo.branch
    ? t("No branch checked out")
    : noRemote
      ? t("Local only: no remote to push to yet")
      : !repo.upstream
        ? t("Not published yet: the branch has no upstream")
        : repo.ahead > 0
          ? t("{commits} not pushed yet", { commits: plural(repo.ahead, "commit") })
          : t("Nothing to push: in sync with {upstream}", { upstream: repo.upstream });
  // Only asked while there is something to push (`canPush`)
  const pushSays = !repo.upstream
    ? t("Publishes the branch on {remote}, so your commits are safe there too.", { remote: remoteOf(repo) })
    : t("Sends your commits to {upstream}, so they are safe on the remote too.", { upstream: repo.upstream });

  // Pull only when it can do something (user, 2026-11-21): new commits there and none of your own
  // that are not pushed; with both, `--ff-only` would stop, and CodeDeck does not merge. The numbers
  // are as of the last fetch, which is why Fetch stands right above
  const canPull = !!repo.upstream && repo.behind > 0 && repo.ahead === 0;
  const pullSays = !repo.upstream
    ? t("No upstream to pull from.")
    : repo.behind === 0
      ? t("Nothing to get, as of the last fetch. Fetch looks whether there is something new.")
      : repo.ahead > 0
        ? t("There are new commits here and there. CodeDeck does not merge them; that works in the terminal, e.g. with git pull --rebase.")
        : t("Brings {commits} from {upstream} into your files.", { commits: plural(repo.behind, "new commit"), upstream: repo.upstream });

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={t("Git actions for {repo}", { repo: repo.name })}
      style={{ ...position, width: WIDTH }}
      className="surface-overlay fixed z-30 flex flex-col overflow-hidden rounded-lg text-[12px]"
    >
      {/* The heading with its shortcut, the branch right-aligned beside it, in bold (user, 2026-11-21) */}
      <header className="flex flex-col gap-0.5 border-b border-overlay-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-semibold text-slate-100">{t("Git actions ({key})", { key: `${t("Ctrl")}+G` })}</span>
          <span className="ml-auto flex min-w-0 items-center gap-1 text-[12px]">
            {repo.worktreeOf ? <GitFork className="size-3.5 shrink-0 text-brand-soft" /> : <GitBranch className="size-3.5 shrink-0 text-brand-soft" />}
            <span className="truncate font-mono font-semibold text-brand-soft">{repo.branch ?? t("detached")}</span>
          </span>
          <button
            type="button"
            aria-label={t("Close")}
            onClick={props.onClose}
            disabled={running}
            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-overlay-hover hover:text-slate-200"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {/* A repository in a folder of the project: which one */}
        {repo.path && <div className="text-[11px] text-slate-500">{repo.name}</div>}
        {repo.worktreeOf && <div className="text-[11px] text-slate-500">{t("Worktree of {repo}: shares its history", { repo: repo.worktreeOf })}</div>}
      </header>

      {/* Fetch and pull: what is new on the remote */}
      <section className="flex flex-col gap-1.5 border-b border-overlay-line px-3 py-2">
        <ActionRow
          icon={RefreshCw}
          label="Fetch"
          says={noRemote ? t("No remote to fetch from.") : t("Looks for new commits on the remote. Your files stay as they are.")}
          disabled={noRemote || running}
          onClick={() => run(fetch)}
          {...showing(fetch)}
        />
        <ActionRow
          icon={ArrowDown}
          label="Pull"
          says={pullSays}
          disabled={!canPull || running}
          onClick={() => run(pull)}
          {...showing(pull)}
        />
      </section>

      {/* Commit: the uncommitted changes, the message, the button */}
      <section className="flex flex-col gap-1.5 border-b border-overlay-line px-3 py-2">
        <div className={`font-semibold ${repo.files.length > 0 ? "text-changed" : "text-slate-400"}`}>{changeSummary(repo)}</div>
        {repo.files.length > 0 && (
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canCommit && !running) run(commit, () => setMessage(""));
            }}
          >
            <input
              ref={input}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("Commit message")}
              disabled={running}
              className="selectable min-w-0 rounded-md border border-overlay-line bg-base px-2 py-1 text-slate-200 outline-none placeholder:text-slate-600 focus:border-brand"
            />
            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                aria-disabled={!canCommit || running}
                {...showing(commit)}
                className="flex w-[76px] shrink-0 items-center justify-center gap-1 rounded-md bg-brand-fill py-1 font-medium text-on-accent not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
              >
                <Check className="size-3.5" />
                {t("Commit")}
              </button>
              <span className="text-[11px] text-slate-400">
                {staged > 0
                  ? t("Saves the {changes} staged before as one commit in your repository; the rest stays.", { changes: plural(staged, "change") })
                  : t("Saves all {changes} as one commit in your repository.", { changes: plural(repo.files.length, "change") })}
              </span>
            </div>
          </form>
        )}
      </section>

      {/* Push: what is not pushed yet, the button */}
      <section className="flex flex-col gap-1.5 border-b border-overlay-line px-3 py-2">
        {/* The branch stands at the top already (user, 2026-11-21) */}
        <div className={`font-semibold ${repo.ahead > 0 ? "text-changed" : "text-slate-400"}`}>{toPush}</div>
        {/* Nothing to push: only the line above, as for no uncommitted changes (user, 2026-11-21) */}
        {canPush && <ActionRow icon={ArrowUp} label="Push" says={pushSays} disabled={running} onClick={() => run(push)} {...showing(push)} />}
        {noRemote && <AddRemote running={running} onRun={(steps) => run(steps)} showing={showing} />}
      </section>

      {/* The command line: what an action will run, or what ran. It never gets shorter while the
          panel is open (room for two commands from the start): the panel grows upwards, and a
          change of height on hover would move the button away from under the mouse */}
      <section
        ref={output}
        // Only once measured: an inline 0 would undo the class's room for two commands
        style={tallest > 0 ? { minHeight: tallest } : undefined}
        className="selectable max-h-48 min-h-[50px] overflow-y-auto bg-base px-3 py-2 font-mono text-[11px]"
      >
        {preview && !running ? (
          preview.map((args, i) => (
            <div key={i} className="flex gap-1.5 text-slate-300">
              <span className="text-slate-600">$</span>
              <span className="break-all">{commandLine(args)}</span>
            </div>
          ))
        ) : done.length > 0 ? (
          done.map((d, i) => (
            <div key={i} className="mb-1">
              <div className="flex gap-1.5 text-slate-300">
                <span className={d.ok ? "text-added" : "text-problem"}>{d.ok ? "✓" : "✗"}</span>
                <span className="break-all">{d.command}</span>
              </div>
              {d.output && (
                <pre className={`mt-0.5 pl-4 whitespace-pre-wrap ${d.ok ? "text-slate-500" : "text-problem"}`}>
                  {d.output}
                </pre>
              )}
            </div>
          ))
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500">
            <SquareTerminal className="size-3" />
            {running ? t("Running…") : t("Point at an action to see its git command")}
          </div>
        )}
      </section>
    </div>
  );
}

/** Without a remote there is nowhere to push: the place to add one, as `origin`. */
function AddRemote(props: {
  running: boolean;
  onRun: (steps: Steps) => void;
  showing: (steps: Steps) => Record<string, () => void>;
}) {
  const [url, setUrl] = useState("");
  const steps = addRemoteSteps(url || "<url>");
  const ready = url.trim().length > 0 && !url.trim().startsWith("-") && !props.running;
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) props.onRun(addRemoteSteps(url));
      }}
    >
      <span className="text-[11px] text-slate-500">{t("No remote yet: this repository exists only here.")}</span>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("Remote URL, e.g. git@github.com:you/repo.git")}
          spellCheck={false}
          className="selectable min-w-0 flex-1 rounded-md border border-overlay-line bg-base px-2 py-1 font-mono text-[11px] text-slate-200 outline-none placeholder:font-sans placeholder:text-slate-600 focus:border-brand"
        />
        <button
          type="submit"
          aria-disabled={!ready}
          title={t("Adds it as origin; then Push publishes the branch there")}
          {...props.showing(steps)}
          className="flex items-center gap-1 rounded-md border border-overlay-line px-2 py-1 text-slate-300 not-aria-disabled:hover:bg-overlay-hover not-aria-disabled:hover:text-slate-100 aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          {t("Add remote")}
        </button>
      </div>
    </form>
  );
}

/** One action in a row: its button, and beside it in words what it does (user, 2026-11-21). */
function ActionRow(props: {
  icon: typeof ArrowDown;
  label: string;
  says: string;
  disabled: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { icon: Icon, label, says, disabled, onClick, ...rest } = props;
  // aria-disabled instead of disabled: hovering still shows the command it would run
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        aria-disabled={disabled}
        onClick={() => !disabled && onClick()}
        {...rest}
        className="flex w-[76px] shrink-0 items-center justify-center gap-1 rounded-md border border-overlay-line py-1 text-slate-300 not-aria-disabled:hover:bg-overlay-hover not-aria-disabled:hover:text-slate-100 aria-disabled:cursor-default aria-disabled:opacity-40"
      >
        <Icon className="size-3.5" />
        {label}
      </button>
      <span className="text-[11px] text-slate-400">{says}</span>
    </div>
  );
}
