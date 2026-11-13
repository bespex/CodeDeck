import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FolderGit2,
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
  stateMeaning,
  stateSymbol,
  syncSummary,
  type Steps,
} from "../git";
import { stateColor } from "./FilesPanel";

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

const FILES_SHOWN = 6;
const WIDTH = 340;

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

  const files = repo.files.slice(0, FILES_SHOWN);
  const inRepo = (path: string) => (repo.path ? path.slice(repo.path.length + 1) : path);
  const pull = pullSteps();
  const push = pushSteps(repo);
  const fetch = fetchSteps();
  const noRemote = repo.remotes.length === 0;
  const pushTitle = noRemote
    ? "No remote to push to: add one below"
    : !repo.branch
    ? "No branch checked out"
    : !repo.upstream
      ? `Publish branch ${repo.branch} to ${remoteOf(repo)}`
      : repo.ahead > 0
        ? `Send ${repo.ahead} commit${repo.ahead === 1 ? "" : "s"} to ${repo.upstream}`
        : "Nothing to push";

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={`Git actions for ${repo.name}`}
      style={{ ...position, width: WIDTH }}
      className="surface-overlay fixed z-30 flex flex-col overflow-hidden rounded-lg text-[12px]"
    >
      <header className="flex items-start gap-2 border-b border-overlay-line px-3 py-2">
        {repo.worktreeOf ? (
          <GitFork className="mt-0.5 size-4 shrink-0 text-slate-400" />
        ) : (
          <FolderGit2 className="mt-0.5 size-4 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-100">{repo.name}</span>
            <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-slate-400">
              <GitBranch className="size-3 shrink-0" />
              <span className="truncate">{repo.branch ?? "detached"}</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-500">{syncSummary(repo)}</div>
          {repo.worktreeOf && (
            <div className="text-[11px] text-slate-500">Worktree of {repo.worktreeOf}: shares its history</div>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          disabled={running}
          className="rounded p-0.5 text-slate-500 hover:bg-overlay-hover hover:text-slate-200"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <section className="border-b border-overlay-line px-3 py-2">
        <div className="mb-1 text-[11px] text-slate-500">{changeSummary(repo)}</div>
        {files.map((f) => (
          <div key={f.path} className="flex h-5 items-center gap-2" title={stateMeaning[f.state]}>
            <span className={`w-3 text-center font-mono text-[11px] ${stateColor[f.state]}`}>
              {stateSymbol(f.state)}
            </span>
            <span className="truncate font-mono text-[11px] text-slate-300">{inRepo(f.path)}</span>
            {f.staged && <span className="ml-auto shrink-0 text-[11px] text-slate-500">staged</span>}
          </div>
        ))}
        {repo.files.length > FILES_SHOWN && (
          <div className="text-[11px] text-slate-500">and {repo.files.length - FILES_SHOWN} more</div>
        )}
      </section>

      <section className="flex flex-col gap-2 border-b border-overlay-line px-3 py-2">
        {repo.files.length > 0 && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canCommit && !running) run(commit, () => setMessage(""));
            }}
          >
            <input
              ref={input}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Commit message"
              disabled={running}
              className="selectable min-w-0 flex-1 rounded-md border border-overlay-line bg-base px-2 py-1 text-slate-200 outline-none placeholder:text-slate-600 focus:border-brand"
            />
            <button
              type="submit"
              aria-disabled={!canCommit || running}
              title={
                staged > 0
                  ? `Commit the ${staged} staged change${staged === 1 ? "" : "s"} (staged before, the rest stays)`
                  : `Commit all ${repo.files.length} change${repo.files.length === 1 ? "" : "s"} shown above`
              }
              {...showing(commit)}
              className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-white not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
            >
              <Check className="size-3.5" />
              Commit
            </button>
          </form>
        )}
        <div className="flex gap-1">
          <ActionButton
            icon={ArrowDown}
            label="Pull"
            title={
              !repo.upstream
                ? "No upstream to pull from"
                : `Get new commits from ${repo.upstream}. Fast-forward only: never creates a merge commit`
            }
            disabled={!repo.upstream || running}
            onClick={() => run(pull)}
            {...showing(pull)}
          />
          <ActionButton
            icon={ArrowUp}
            label="Push"
            title={pushTitle}
            disabled={noRemote || !repo.branch || (!!repo.upstream && repo.ahead === 0) || running}
            onClick={() => run(push)}
            {...showing(push)}
          />
          <ActionButton
            icon={RefreshCw}
            label="Fetch"
            title={noRemote ? "No remote to fetch from" : "Look for new commits on the remote; your files stay as they are"}
            disabled={noRemote || running}
            onClick={() => run(fetch)}
            {...showing(fetch)}
          />
        </div>
        {noRemote && <AddRemote running={running} onRun={(steps) => run(steps)} showing={showing} />}
      </section>

      {/* The command line: what an action will run, or what ran. Room for two commands from the
          start: if it grew on hover, the panel would move the button away from under the mouse */}
      <section className="selectable max-h-48 min-h-[50px] overflow-y-auto bg-base px-3 py-2 font-mono text-[11px]">
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
            {running ? "Running…" : "Point at an action to see its git command"}
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
      <span className="text-[11px] text-slate-500">No remote yet: this repository exists only here.</span>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Remote URL, e.g. git@github.com:you/repo.git"
          spellCheck={false}
          className="selectable min-w-0 flex-1 rounded-md border border-overlay-line bg-base px-2 py-1 font-mono text-[11px] text-slate-200 outline-none placeholder:font-sans placeholder:text-slate-600 focus:border-brand"
        />
        <button
          type="submit"
          aria-disabled={!ready}
          title="Adds it as origin; then Push publishes the branch there"
          {...props.showing(steps)}
          className="flex items-center gap-1 rounded-md border border-overlay-line px-2 py-1 text-slate-300 not-aria-disabled:hover:bg-overlay-hover not-aria-disabled:hover:text-slate-100 aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          Add remote
        </button>
      </div>
    </form>
  );
}

function ActionButton(props: {
  icon: typeof ArrowDown;
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { icon: Icon, label, disabled, onClick, ...rest } = props;
  // aria-disabled instead of disabled: the tooltip must still say why it is not available
  return (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={() => !disabled && onClick()}
      {...rest}
      className="flex items-center gap-1 rounded-md border border-overlay-line px-2 py-1 text-slate-300 not-aria-disabled:hover:bg-overlay-hover not-aria-disabled:hover:text-slate-100 aria-disabled:cursor-default aria-disabled:opacity-40"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
