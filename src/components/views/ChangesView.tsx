import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Anchor, Check, ChevronDown, ChevronRight, Code, FolderGit2, GitBranch, ListTree, Pencil, Sparkles, Undo2 } from "lucide-react";
import {
  gitCommitDiff,
  gitRestoreSnapshot,
  gitSnapshotDiff,
  gitWorkingDiff,
  onFsChanged,
  type Commit,
  type Patch,
  type RepoStatus,
  type Snapshot,
} from "../../backend";
import { shortId } from "../../assistant";
import { changeSummary, commitSteps, commandLine, plural, rewordSteps, stateMeaning, stateSymbol, type GitView, type Steps } from "../../git";
import { diffSize, parsePatch, type FileDiff } from "../../diff";
import { toProject, useGitRun, type Done, type TrailCommit } from "../../history";
import { LOCALE, type Point } from "../Trail";
import { stateColor } from "../FilesPanel";
import { Tooltip } from "../Tooltip";
import { Commands, DiffBody, FileButtons, inUntrackedDir, LineCounts, type Working } from "./DiffParts";
import { StructureTree } from "./StructureTree";

/** Diffs longer than this open collapsed. */
const LONG_DIFF = 400;

interface Props {
  git: GitView;
  point: Point;
  commits: TrailCommit[];
  snapshots: Snapshot[];
  /** The working tree was put back as in a snapshot */
  onRestored: () => void;
  /** Selected in the file list: its diff is scrolled into view */
  selected: string | null;
  onShowNow: () => void;
  onSelect: (point: Point) => void;
}

/** Structure: which files and folders changed, as a tree. Code: every diff, one after another. */
type Mode = "structure" | "code";
const MODE_KEY = "codedeck.changes.mode";

function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "code" ? "code" : "structure";
  } catch {
    return "structure";
  }
}

export function ChangesView({ git, point, commits, snapshots, onRestored, selected, onShowNow, onSelect }: Props) {
  // After a message was changed the commit has a new hash: the one at the same place is shown
  const [rewritten, setRewritten] = useState<{ repo: string; index: number; hashes: string } | null>(null);
  useEffect(() => {
    if (!rewritten) return;
    const ofRepo = commits.filter((c) => c.repo === rewritten.repo);
    if (ofRepo.map((c) => c.commit.hash).join() === rewritten.hashes) return; // not read again yet
    const next = ofRepo[rewritten.index];
    setRewritten(null);
    if (next) onSelect({ kind: "commit", repo: rewritten.repo, hash: next.commit.hash });
  }, [commits, rewritten, onSelect]);

  const [mode, setModeState] = useState<Mode>(savedMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // Remembering is a convenience only
    }
  };

  useEffect(() => {
    if (!selected || mode !== "code") return;
    document.getElementById(`diff:${selected}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selected, mode]);

  let title: ReactNode;
  let body: ReactNode;
  if (point.kind === "commit") {
    const entry = commits.find((c) => c.repo === point.repo && c.commit.hash === point.hash);
    const repo = git.repos.find((r) => r.path === point.repo);
    title = entry ? (
      <>
        <span>Commit</span>
        <code className="font-mono text-[11px] text-slate-300">{entry.commit.short}</code>
      </>
    ) : (
      "Commit"
    );
    body =
      entry && repo ? (
        <CommitChanges
          entry={entry}
          repo={repo}
          repoCommits={commits.filter((c) => c.repo === repo.path).map((c) => c.commit)}
          several={git.repos.length > 1}
          mode={mode}
          selected={selected}
          onShowNow={onShowNow}
          onDone={git.refresh}
          onRewritten={(index, hashes) => setRewritten({ repo: repo.path, index, hashes })}
        />
      ) : (
        <Empty>That commit is no longer in the history shown.</Empty>
      );
  } else if (point.kind === "snapshot") {
    const snapshot = snapshots.find((s) => s.repo === point.repo && s.hash === point.hash);
    const repo = git.repos.find((r) => r.path === point.repo);
    title = (
      <>
        <span>Since snapshot</span>
        {snapshot && <code className="font-mono text-[11px] text-slate-300">{snapshot.short}</code>}
      </>
    );
    body =
      snapshot && repo ? (
        <SnapshotChanges
          key={snapshot.hash}
          snapshot={snapshot}
          repo={repo}
          several={git.repos.length > 1}
          mode={mode}
          selected={selected}
          onShowNow={onShowNow}
          onRestored={() => {
            onRestored();
            onShowNow();
          }}
        />
      ) : (
        <Empty>That snapshot is gone: snapshots are kept for 14 days, 50 per repository.</Empty>
      );
  } else {
    const dirty = git.repos.filter((r) => r.files.length > 0);
    title = "Uncommitted changes";
    body =
      git.repos.length === 0 ? (
        <Empty>No Git repository in this project.</Empty>
      ) : dirty.length === 0 ? (
        <Empty>
          Nothing uncommitted: every file is as in its last commit.
          <br />
          Pick a point on the trail to see what a commit changed.
        </Empty>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          {dirty.map((repo) => (
            <RepoChanges key={repo.path} repo={repo} git={git} several={git.repos.length > 1} mode={mode} selected={selected} />
          ))}
        </div>
      );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-9 shrink-0 items-center gap-2 border-b border-line bg-base px-4 text-[12px] text-slate-400">
        {title}
        <ModeSwitch mode={mode} setMode={setMode} />
      </div>
      <div className="flex-1">{body}</div>
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const options: [Mode, typeof ListTree, string, string][] = [
    ["structure", ListTree, "Structure", "Which files and folders are new, deleted, moved, renamed or changed, as a tree. Click a file for its diff."],
    ["code", Code, "Code", "Every changed line, file after file"],
  ];
  return (
    <div className="ml-auto flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Show changes as">
      {options.map(([m, Icon, label, says]) => (
        <Tooltip key={m} content={<span>{says}</span>}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 ${
              mode === m ? "bg-raised text-slate-100" : "text-slate-500 hover:text-slate-200"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="grid h-full place-items-center p-8 text-center text-slate-500">{children}</div>;
}

/** Loads a patch and reloads it when `key` changes. */
function usePatch(load: () => Promise<Patch>, key: string) {
  const [patch, setPatch] = useState<Patch | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((p) => alive && (setPatch(p), setError(null)))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { patch, error };
}

/** The uncommitted changes of one repository, with its commit line on top. */
function RepoChanges(props: { repo: RepoStatus; git: GitView; several: boolean; mode: Mode; selected: string | null }) {
  const { repo, git, several, mode } = props;
  // Edits to a file that is already modified do not change the status, only the disk
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const stop = onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), 400);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  const key = `${JSON.stringify(repo.files)}:${repo.head}:${tick}`;
  const { patch, error } = usePatch(() => gitWorkingDiff(repo.path), key);
  const files = useMemo(() => (patch ? parsePatch(patch.text) : []), [patch]);
  const status = useMemo(() => new Map(repo.files.map((f) => [f.path, f])), [repo.files]);

  return (
    <section>
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {several && <FolderGit2 className="size-4 self-center text-slate-400" />}
        <span className="font-semibold text-slate-100">{repo.name}</span>
        <code className="flex items-center gap-1 rounded bg-panel px-1.5 font-mono text-[11px] text-slate-300">
          <GitBranch className="size-3" />
          {repo.branch ?? "detached"}
        </code>
        <span className="text-[12px] text-slate-500">{changeSummary(repo)}</span>
      </header>
      <CommitLine repo={repo} onDone={git.refresh} />
      {error && <p className="selectable mt-2 text-problem">{error}</p>}
      {patch && mode === "structure" && (
        <div className="mt-3">
          <StructureTree patch={patch} files={files} repo={repo} onDone={git.refresh} selected={props.selected} />
        </div>
      )}
      {patch && mode === "code" && (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((file) => {
            const path = toProject(repo, file.path);
            return (
              <FileSection
                key={file.path}
                id={`diff:${path}`}
                file={file}
                working={{ repo, status: status.get(path) ?? inUntrackedDir(repo, path), onDone: git.refresh }}
              />
            );
          })}
          {patch.truncated && <p className="text-[12px] text-changed">The diff is very long and was cut off here.</p>}
        </div>
      )}
    </section>
  );
}

/** Message, Commit button, and the command line showing what it runs and what it said. */
function CommitLine({ repo, onDone }: { repo: RepoStatus; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [focus, setFocus] = useState(false);
  const { run, running, done } = useGitRun(repo.path, onDone);
  const steps = commitSteps(repo, message);
  const staged = repo.files.filter((f) => f.staged).length;
  const ready = message.trim().length > 0 && !running;

  return (
    <div className="rounded-lg border border-line bg-panel">
      <form
        className="flex gap-2 p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ready && (await run(steps))) setMessage("");
        }}
      >
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={`Commit message for ${repo.name}`}
          disabled={running}
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-base px-2 py-1 text-slate-200 outline-none placeholder:text-slate-600 focus:border-brand"
        />
        <Tooltip
          content={
            <>
              <span>
                {staged > 0
                  ? `Commits the ${staged} staged file${staged === 1 ? "" : "s"}; the rest stays uncommitted`
                  : `Commits all ${repo.files.length} changed file${repo.files.length === 1 ? "" : "s"}`}
              </span>
              <Commands steps={steps} />
            </>
          }
        >
          <button
            type="submit"
            aria-disabled={!ready}
            className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-white not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
          >
            <Check className="size-3.5" />
            Commit
          </button>
        </Tooltip>
      </form>
      {(focus || message || done.length > 0) && (
        <CommandLine preview={message.trim() && !running ? steps : null} done={done} running={running} />
      )}
    </div>
  );
}

/** What will run, or what ran and what git said. */
export function CommandLine({ preview, done, running }: { preview: Steps | null; done: Done[]; running: boolean }) {
  return (
    <div className="selectable max-h-40 overflow-y-auto border-t border-line bg-base px-3 py-1.5 font-mono text-[11px]">
      {preview ? (
        preview.map((args, i) => (
          <div key={i} className="text-slate-400">
            <span className="text-slate-600">$ </span>
            {commandLine(args)}
          </div>
        ))
      ) : done.length > 0 ? (
        done.map((d, i) => (
          <div key={i}>
            <div className="text-slate-300">
              <span className={d.ok ? "text-added" : "text-problem"}>{d.ok ? "✓ " : "✗ "}</span>
              {d.command}
            </div>
            {d.output && (
              <pre className={`pl-4 whitespace-pre-wrap ${d.ok ? "text-slate-500" : "text-problem"}`}>{d.output}</pre>
            )}
          </div>
        ))
      ) : (
        <div className="text-slate-500">{running ? "Running…" : "Type a message; the command appears here"}</div>
      )}
    </div>
  );
}

/** One commit: what it says about itself, then its files. */
function CommitChanges(props: {
  entry: TrailCommit;
  repo: RepoStatus;
  /** The repository's commits, newest first */
  repoCommits: Commit[];
  several: boolean;
  mode: Mode;
  selected: string | null;
  onShowNow: () => void;
  onDone: () => void;
  /** The message was changed: the commit at this place (newest first) is the new one */
  onRewritten: (index: number, oldHashes: string) => void;
}) {
  const c = props.entry.commit;
  const { patch, error } = usePatch(() => gitCommitDiff(props.repo.path, c.hash), `${props.repo.path}:${c.hash}`);
  const files = useMemo(() => (patch ? parsePatch(patch.text) : []), [patch]);
  const [editing, setEditing] = useState(false);
  return (
    <div className="p-4">
      <header className="group mb-3">
        {editing ? (
          <MessageEditor
            commit={c}
            repo={props.repo}
            commits={props.repoCommits}
            onCancel={() => setEditing(false)}
            onDone={props.onDone}
            onSaved={() => {
              setEditing(false);
              props.onRewritten(
                props.repoCommits.findIndex((x) => x.hash === c.hash),
                props.repoCommits.map((x) => x.hash).join(),
              );
            }}
          />
        ) : (
          <div className="flex items-start gap-2">
            <h2 className="text-[15px] font-semibold text-slate-50">{c.subject}</h2>
            {c.local && (
              <Tooltip
                content={
                  <>
                    <span>Change the message</span>
                    <span className="text-slate-400">Not pushed yet, so it can still be changed without rewriting what others have</span>
                  </>
                }
              >
                <button
                  type="button"
                  aria-label="Change the commit message"
                  onClick={() => setEditing(true)}
                  className="mt-0.5 rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-slate-100 focus-visible:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
          <code className="selectable rounded bg-panel px-1.5 font-mono text-[11px] text-slate-200">{c.short}</code>
          {props.several && <span className="font-semibold text-slate-300">{props.repo.name}</span>}
          <span>{c.byYou ? "you" : c.author}</span>
          {c.assistant && (
            <span className="flex items-center gap-1 text-ai">
              <Sparkles className="size-3" /> with {c.assistant}
            </span>
          )}
          <span>{new Date(c.at * 1000).toLocaleString(LOCALE)}</span>
          {c.unpushed && <span className="text-changed">not pushed yet</span>}
          <button
            type="button"
            onClick={props.onShowNow}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
          >
            Back to uncommitted
          </button>
        </div>
        {c.body && !editing && <p className="selectable mt-2 whitespace-pre-line text-slate-300">{c.body}</p>}
      </header>
      {error && <p className="selectable text-problem">{error}</p>}
      {patch && props.mode === "structure" && (
        <StructureTree patch={patch} files={files} repo={props.repo} selected={props.selected} />
      )}
      {patch && props.mode === "code" && (
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <FileSection key={file.path} id={`diff:${toProject(props.repo, file.path)}`} file={file} />
          ))}
          {patch.truncated && <p className="text-[12px] text-changed">The diff is very long and was cut off here.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * A snapshot: what it was taken before, what changed since, and going back to it. Going back
 * keeps the present as a snapshot first, so it can be undone from the trail the same way.
 */
function SnapshotChanges(props: {
  snapshot: Snapshot;
  repo: RepoStatus;
  several: boolean;
  mode: Mode;
  selected: string | null;
  onShowNow: () => void;
  onRestored: () => void;
}) {
  const { snapshot: s, repo } = props;
  // What changed since depends on the disk: read again when it changes
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const stop = onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), 400);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  const { patch, error } = usePatch(() => gitSnapshotDiff(repo.path, s.hash), `${repo.path}:${s.hash}:${tick}`);
  const files = useMemo(() => (patch ? parsePatch(patch.text) : []), [patch]);
  const [asking, setAsking] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const changed = patch?.changes.length ?? 0;

  const goBack = async () => {
    setRunning(true);
    setFailed(null);
    try {
      await gitRestoreSnapshot(repo.path, s.hash);
      props.onRestored();
    } catch (e) {
      setFailed(String(e));
    } finally {
      setRunning(false);
      setAsking(false);
    }
  };

  return (
    <div className="p-4">
      <header className="mb-3">
        <div className="flex items-start gap-2">
          {s.back ? <Undo2 className="mt-1 size-4 shrink-0 text-slate-400" /> : <Anchor className="mt-1 size-4 shrink-0 text-changed" />}
          <h2 className="selectable text-[15px] font-semibold text-slate-50">{s.label}</h2>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
          <code className="selectable rounded bg-panel px-1.5 font-mono text-[11px] text-slate-200">{s.short}</code>
          {props.several && <span className="font-semibold text-slate-300">{repo.name}</span>}
          <span>{new Date(s.at * 1000).toLocaleString(LOCALE)}</span>
          {s.session && (
            <span className="flex items-center gap-1 text-ai">
              <Sparkles className="size-3" /> session {shortId(s.session)}
            </span>
          )}
          {s.tool && <code className="font-mono text-[11px] text-slate-500">{s.tool}</code>}
          <button
            type="button"
            onClick={props.onShowNow}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
          >
            Back to uncommitted
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-line bg-panel p-3">
          {!asking ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-slate-400">
                {changed === 0
                  ? "Nothing changed since this snapshot."
                  : `${plural(changed, "file")} changed since this snapshot${s.back ? "" : " was taken, before the assistant wrote"}.`}
              </p>
              <button
                type="button"
                disabled={changed === 0 || running}
                onClick={() => setAsking(true)}
                className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-white not-disabled:hover:bg-brand-fill-hover disabled:opacity-40"
              >
                <Undo2 className="size-3.5" />
                Go back to here
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-slate-300">
                Puts {plural(changed, "file")} back as they were in {repo.name}; files that are new since then are
                deleted. What is there now is kept as a snapshot first, so you can come back to it.
              </p>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="rounded-md border border-line px-2.5 py-1 text-slate-300 hover:bg-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={running}
                onClick={goBack}
                className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-white not-disabled:hover:bg-brand-fill-hover disabled:opacity-40"
              >
                <Undo2 className="size-3.5" />
                {running ? "Going back…" : "Go back"}
              </button>
            </div>
          )}
          {failed && <p className="selectable mt-2 text-problem">{failed}</p>}
        </div>
      </header>
      {error && <p className="selectable text-problem">{error}</p>}
      {patch && props.mode === "structure" && (
        <StructureTree patch={patch} files={files} repo={repo} selected={props.selected} />
      )}
      {patch && props.mode === "code" && (
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <FileSection key={file.path} id={`diff:${toProject(repo, file.path)}`} file={file} />
          ))}
          {patch.truncated && <p className="text-[12px] text-changed">The diff is very long and was cut off here.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The whole message (trailers included, so a co-author stays) in a text field, with the git
 * commands that will change it shown below as one types.
 */
function MessageEditor(props: {
  commit: Commit;
  repo: RepoStatus;
  commits: Commit[];
  onCancel: () => void;
  onDone: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(props.commit.message);
  const { run, running, done } = useGitRun(props.repo.path, props.onDone);
  const steps = rewordSteps(props.commits, props.repo.head, props.commit.hash, text);
  const refused = typeof steps === "string" ? steps : null;
  const unchanged = text.trim() === props.commit.message.trim();
  const ready = !refused && !unchanged && !running;
  const newer = props.commits.findIndex((c) => c.hash === props.commit.hash);
  const save = async () => {
    if (ready && (await run(steps as Steps))) props.onSaved();
  };

  return (
    <div className="rounded-lg border border-line bg-panel">
      <textarea
        autoFocus
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onCancel();
          if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            save();
          }
        }}
        rows={Math.min(14, Math.max(3, text.split("\n").length + 1))}
        disabled={running}
        className="selectable block w-full resize-y rounded-t-lg bg-base px-3 py-2 font-mono text-[12px] leading-[18px] text-slate-100 outline-none"
      />
      <div className="flex items-center gap-2 border-t border-line px-2 py-1.5 text-[12px]">
        <span className={refused ? "text-problem" : "text-slate-500"}>
          {refused ??
            (props.repo.head === props.commit.hash
              ? "The newest commit is amended; staged changes stay out of it"
              : `The ${newer} newer commit${newer === 1 ? "" : "s"} get${newer === 1 ? "s" : ""} new hashes too; your uncommitted changes are put aside and back`)}
        </span>
        <button
          type="button"
          onClick={props.onCancel}
          className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={!ready}
          onClick={save}
          title="Ctrl+Enter"
          className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-0.5 font-medium text-white not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <Check className="size-3.5" />
          Change message
        </button>
      </div>
      <CommandLine preview={!refused && !running && done.length === 0 ? (steps as Steps) : null} done={done} running={running} />
    </div>
  );
}

/** One file: a header with its state, numbers and actions, then its diff. */
function FileSection({ id, file, working }: { id: string; file: FileDiff; working?: Working }) {
  const size = diffSize(file);
  const [open, setOpen] = useState(size <= LONG_DIFF);
  const state = working?.status?.state ?? file.status;
  const slash = file.path.lastIndexOf("/");
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <article id={id} className="scroll-mt-2 overflow-hidden rounded-lg border border-line bg-panel">
      <header className="group flex h-8 items-center gap-2 pr-2 pl-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
          <Tooltip
            content={<span>{stateMeaning[state]}{working?.status?.staged ? " · staged for the next commit" : ""}</span>}
            className="flex shrink-0"
          >
            <span className={`w-3 text-center font-mono text-[11px] ${stateColor[state]}`}>{stateSymbol(state)}</span>
          </Tooltip>
          <span className="min-w-0 truncate font-mono text-[12px]">
            {file.from && <span className="text-slate-500">{file.from} → </span>}
            <span className="text-slate-500">{file.path.slice(0, slash + 1)}</span>
            <span className="text-slate-100">{file.path.slice(slash + 1)}</span>
          </span>
          <LineCounts added={file.added} removed={file.removed} />
          {working?.status?.staged && <span className="shrink-0 text-[11px] text-slate-500">staged</span>}
        </button>
        {working && <FileButtons path={file.path} from={file.from} added={file.status === "A"} working={working} />}
      </header>
      {open && <DiffBody file={file} />}
      {!open && size > LONG_DIFF && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t border-line py-1.5 text-[12px] text-slate-500 hover:text-slate-200"
        >
          Show {size} lines
        </button>
      )}
    </article>
  );
}
