import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Anchor, ArrowRight, Check, ChevronDown, ChevronRight, Code, ExternalLink, Filter, Flag, FolderGit2, GitBranch, ListTree, Pencil, Sparkles, Undo2, X } from "lucide-react";
import {
  gitCommitDiff,
  gitCompare,
  hasMarkdownViewer,
  showMarkdown,
  showPatch,
  gitRestoreSnapshot,
  gitSnapshotDiff,
  gitWorkingDiff,
  onFsChanged,
  sessionSeen,
  type AssistantState,
  type Commit,
  type Patch,
  type RepoStatus,
  type Snapshot,
} from "../../backend";
import { mainHarness, shortId, useSessionMarks } from "../../assistant";
import { changedSinceViewed, reviewKey, reviewSlot, toggleReviewed, useReviewed } from "../../reviewed";
import { turnShown, turnsOf, useTurnWriters, useWantedTurn, type Turn } from "../../turns";
import { NoteSessionContext } from "../../notes";
import { ChangeScopeContext, EMPTY_TREE, short, useChangeScope, type ChangeScope } from "../../changes";
import { Section, Toolbar } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { changeSummary, commitSteps, commandLine, plural, rewordSteps, stateMeaning, stateSymbol, type GitView, type Steps } from "../../git";
import { diffSize, parsePatch, type FileDiff } from "../../diff";
import { toProject, useGitRun, type Done, type TrailCommit } from "../../history";
import { LOCALE, type Point } from "../Trail";
import { stateColor } from "../FilesPanel";
import { Tooltip, TooltipHint } from "../Tooltip";
import { AttachChange, AttachedAtRest, Commands, DiffBody, FileTools, inUntrackedDir, LineCounts, useDirq, Viewed, ChangedSinceViewed, You, type Working } from "./DiffParts";
import { StructureTree } from "./StructureTree";
import { known, snapshotLabel, t } from "../../i18n";

/** Diffs longer than this open collapsed. */
const LONG_DIFF = 400;

interface Props {
  git: GitView;
  point: Point;
  commits: TrailCommit[];
  snapshots: Snapshot[];
  /** Only this session's snapshots are on the trail */
  sessionFilter: string | null;
  onSessionFilter: (session: string | null) => void;
  /** The working tree was put back as in a snapshot */
  onRestored: () => void;
  /** Selected in the file list: its diff is scrolled into view */
  selected: string | null;
  onShowNow: () => void;
  onSelect: (point: Point) => void;
  /** The sessions: their running turns, and the name of their tool */
  assistant: AssistantState;
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

export function ChangesView(props: Props) {
  const { git, point, commits, snapshots, onRestored, selected, onShowNow, onSelect } = props;
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

  // What the uncommitted changes are made of: the turns since the last commit. One of them can
  // be looked at on its own; it stays chosen when it ends while it is shown
  const turns = useMemo(() => turnsOf(git.repos, snapshots, props.assistant.sessions), [git.repos, snapshots, props.assistant.sessions]);
  const [scope, setScope] = useState<string | null>(null);
  // A session's card asked for its latest turn: shown once its snapshots are read
  const wantedTurn = useWantedTurn();
  useEffect(() => {
    if (!wantedTurn) return;
    const latest = turns.filter((t) => t.session === wantedTurn).sort((a, b) => b.at - a.at)[0];
    if (!latest) return;
    onShowNow();
    setScope(latest.key);
    turnShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedTurn, turns]);
  const turn = turns.find((t) => t.key === scope);
  // Looking at a session's finished turn is seeing it: it waits for you no longer
  const latestOf = turn?.session ? turns.filter((t) => t.session === turn.session).sort((a, b) => b.at - a.at)[0] : undefined;
  const seenSession = turn?.to && latestOf?.key === turn.key ? turn.session : null;
  useEffect(() => {
    const s = props.assistant.sessions.find((x) => x.id === seenSession);
    if (s && s.turnDone != null && !s.seen) void sessionSeen(s.id);
  }, [seenSession, props.assistant.sessions]);
  const turnRepo = turn && git.repos.find((r) => r.path === turn.repo);
  // Files a session reported writing in its running turn, project-relative
  const writing = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of props.assistant.sessions) if (s.turn.length) for (const t of s.touched) if (!map.has(t.path)) map.set(t.path, s.id);
    return map;
  }, [props.assistant.sessions]);

  let title: ReactNode;
  let body: ReactNode;
  if (point.kind === "commit") {
    const entry = commits.find((c) => c.repo === point.repo && c.commit.hash === point.hash);
    const repo = git.repos.find((r) => r.path === point.repo);
    title = entry ? (
      <>
        <span>{t("Commit")}</span>
        <code className="font-mono text-[11px] text-slate-300">{entry.commit.short}</code>
      </>
    ) : (
      t("Commit")
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
        <Empty>{t("That commit is no longer in the history shown.")}</Empty>
      );
  } else if (point.kind === "snapshot") {
    const snapshot = snapshots.find((s) => s.repo === point.repo && s.hash === point.hash);
    const repo = git.repos.find((r) => r.path === point.repo);
    title = (
      <>
        <span>{t("Since snapshot")}</span>
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
          filtered={props.sessionFilter !== null && props.sessionFilter === snapshot.session}
          onFilter={(on) => props.onSessionFilter(on ? snapshot.session : null)}
          onRestored={() => {
            onRestored();
            onShowNow();
          }}
        />
      ) : (
        <Empty>{t("That snapshot is gone: snapshots are kept for 14 days, 50 per repository.")}</Empty>
      );
  } else if (point.kind === "compare") {
    const repo = git.repos.find((r) => r.path === point.repo);
    const describe = (hash: string) => {
      const c = commits.find((x) => x.repo === point.repo && x.commit.hash === hash)?.commit;
      if (c) return { short: c.short, title: c.subject, at: c.at, snapshot: false };
      const s = snapshots.find((x) => x.repo === point.repo && x.hash === hash);
      return { short: s?.short ?? hash.slice(0, 7), title: s?.label ?? "", at: s?.at ?? 0, snapshot: true };
    };
    const [from, to] = [describe(point.from), describe(point.to)];
    title = (
      <>
        <span>{t("Between")}</span>
        <code className="font-mono text-[11px] text-slate-300">{from.short}</code>
        <ArrowRight className="size-3" />
        <code className="font-mono text-[11px] text-slate-300">{to.short}</code>
      </>
    );
    body = repo ? (
      <CompareChanges key={`${point.from}:${point.to}`} repo={repo} point={point} from={from} to={to} several={git.repos.length > 1} mode={mode} selected={selected} onShowNow={onShowNow} />
    ) : (
      <Empty>{t("That repository is no longer in the project.")}</Empty>
    );
  } else if (turn && turnRepo) {
    title = <Scopes turns={turns} scope={turn.key} onScope={setScope} repos={git.repos} />;
    body = (
      <TurnChanges
        key={turn.key}
        turn={turn}
        repo={turnRepo}
        who={mainHarness(props.assistant).shortName}
        several={git.repos.length > 1}
        mode={mode}
        selected={selected}
        onStart={() => onSelect({ kind: "snapshot", repo: turn.repo, hash: turn.from })}
      />
    );
  } else {
    const dirty = git.repos.filter((r) => r.files.length > 0);
    title = turns.length > 0 ? <Scopes turns={turns} scope={null} onScope={setScope} repos={git.repos} /> : t("Uncommitted changes");
    body =
      git.repos.length === 0 ? (
        <Empty>{t("No Git repository in this project.")}</Empty>
      ) : dirty.length === 0 ? (
        <Empty>
          {t("Nothing uncommitted: every file is as in its last commit.")}
          <br />
          {t("Pick a point on the trail to see what a commit changed.")}
        </Empty>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          {dirty.map((repo) => (
            <RepoChanges key={repo.path} repo={repo} git={git} several={git.repos.length > 1} mode={mode} selected={selected} turns={turns} writing={writing} />
          ))}
        </div>
      );
  }

  return (
    <div className="flex min-h-full flex-col">
      <Toolbar>
        {title}
        <ModeSwitch mode={mode} setMode={setMode} />
      </Toolbar>
      <div className="flex-1">{body}</div>
    </div>
  );
}

/**
 * What of the uncommitted changes is shown: one turn, or all of them. A turn is the stretch
 * between two points of the trail; choosing it here is the same as Ctrl+clicking those two.
 */
/** Turns shown as buttons; earlier ones are in a list, so the bar stays one short row. */
const TURNS_SHOWN = 2;

function Scopes(props: { turns: Turn[]; scope: string | null; onScope: (key: string | null) => void; repos: RepoStatus[] }) {
  const marks = useSessionMarks();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const chip = (on: boolean) =>
    `flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 ${on ? "bg-raised text-slate-100" : "text-slate-400 hover:bg-raised/70 hover:text-slate-100"}`;
  const earlier = props.turns.slice(0, Math.max(0, props.turns.length - TURNS_SHOWN));
  const shown = props.turns.slice(earlier.length);
  // An earlier turn that is picked stands in for the list's button, so what is shown is in sight
  const picked = earlier.find((t) => t.key === props.scope);
  const who = (turn: Turn) => marks.of(turn.session)?.title ?? (turn.session ? t("Session {id}", { id: shortId(turn.session) }) : "");
  const tip = (turn: Turn) => (
    <>
      <span>{turn.prompt ?? t("A turn without a prompt")}</span>
      <span className="text-slate-400">
        {who(turn)}
        {turn.to ? ` · ${t("done {time}", { time: clock(turn.at) })}` : ` · ${t("still working")}`}
      </span>
    </>
  );
  const label = (turn: Turn) => {
    const mark = marks.of(turn.session);
    const repo = props.repos.length > 1 ? props.repos.find((r) => r.path === turn.repo)?.name : null;
    return (
      <>
        {mark && <SessionBadge mark={mark} />}
        {t("Turn {n}", { n: turn.n })}
        {repo && <span className="text-slate-500">{repo}</span>}
        {!turn.to && <span className="size-1.5 animate-pulse rounded-full bg-ai" />}
      </>
    );
  };

  return (
    <div className="flex min-w-0 items-center gap-1" role="radiogroup" aria-label={t("Which changes to show")}>
      {earlier.length > 0 && (
        <div ref={box} className="relative shrink-0">
          <Tooltip
            content={
              <>
                <span>{t("{n} turns since the last commit", { n: props.turns.length })}</span>
                <TooltipHint>{t("Committing starts the count again")}</TooltipHint>
              </>
            }
          >
            <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={chip(!!picked || open)}>
              {picked ? label(picked) : t("Earlier ({n})", { n: earlier.length })}
              <ChevronDown className={`size-3.5 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </Tooltip>
          {open && (
            <div role="menu" className="surface-overlay absolute top-7 left-0 z-30 flex max-h-[60vh] w-[420px] flex-col overflow-y-auto rounded-lg p-1 text-[12px]">
              {[...earlier].reverse().map((turn) => {
                const mark = marks.of(turn.session);
                return (
                  <button
                    key={turn.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={props.scope === turn.key}
                    onClick={() => {
                      props.onScope(turn.key);
                      setOpen(false);
                    }}
                    className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-overlay-hover ${props.scope === turn.key ? "bg-overlay-hover" : ""}`}
                  >
                    <span className="flex w-[74px] shrink-0 items-center gap-1.5 text-slate-200">
                      {mark && <SessionBadge mark={mark} />}
                      {t("Turn {n}", { n: turn.n })}
                    </span>
                    <span className="w-10 shrink-0 text-slate-500 tabular-nums">{clock(turn.at)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-300">{turn.prompt ?? t("A turn without a prompt")}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* The rest scrolls when the deck is narrow; the list above must not, or it would be cut off */}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((turn) => (
          <Tooltip key={turn.key} className="flex shrink-0" content={tip(turn)}>
            <button type="button" role="radio" aria-checked={props.scope === turn.key} onClick={() => props.onScope(turn.key)} className={chip(props.scope === turn.key)}>
              {label(turn)}
            </button>
          </Tooltip>
        ))}
        <button type="button" role="radio" aria-checked={props.scope === null} onClick={() => props.onScope(null)} className={chip(props.scope === null)}>
          {t("All uncommitted")}
        </button>
      </div>
    </div>
  );
}

const clock = (at: number) => new Date(at * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

/** Counts up while `active` whenever files change on disk, a moment after the last change. */
function useDiskTick(active = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const stop = onFsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setTick((t) => t + 1), 400);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [active]);
  return tick;
}

/** Lines of a turn's report shown in place; the whole of it opens as a page. */
const REPORT_LINES = 3;

let marqInstalled: Promise<boolean> | null = null;

/**
 * What the assistant said at the end of a turn. It is Markdown, so here only its first lines
 * stand, as they are; the whole of it opens formatted in Marq. Without Marq it unfolds in place.
 */
function Report({ turn, who }: { turn: Turn; who: string }) {
  const [installed, setInstalled] = useState(false);
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    marqInstalled ??= hasMarkdownViewer().catch(() => false);
    marqInstalled.then(setInstalled);
  }, []);
  const lines = (turn.report ?? "").split("\n").filter((l) => l.trim());
  const more = lines.length - REPORT_LINES;
  const page = [
    `# ${t("Turn {n}: what {who} said at the end", { n: turn.n, who })}`,
    turn.prompt ? `> ${t("You asked:")} ${turn.prompt}` : "",
    turn.report ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const link = "text-[12px] text-ai hover:underline";
  return (
    <div className="selectable border-l-2 border-ai/60 pl-3 text-slate-200">
      <p className="whitespace-pre-line">{all ? turn.report : lines.slice(0, REPORT_LINES).join("\n")}</p>
      <div className="mt-1 flex items-center gap-3">
        {more > 0 && !all && <span className="text-[12px] text-slate-500">{plural(more, "more line")}</span>}
        {installed ? (
          <button type="button" onClick={() => showMarkdown(page).then(() => setFailed(null), (e) => setFailed(String(e)))} className={`flex items-center gap-1 ${link}`}>
            <ExternalLink className="size-3" />
            {t("Read in Marq")}
          </button>
        ) : (
          more > 0 && (
            <button type="button" onClick={() => setAll(!all)} className={link}>
              {all ? t("Show less") : t("Show all")}
            </button>
          )
        )}
        {failed && <span className="text-[12px] text-problem">{failed}</span>}
      </div>
    </div>
  );
}

/**
 * One turn: what was asked, what the assistant said at the end (its own words, nothing made up
 * here), then what changed between the turn's two snapshots.
 */
function TurnChanges(props: {
  turn: Turn;
  repo: RepoStatus;
  /** The tool's name */
  who: string;
  several: boolean;
  mode: Mode;
  selected: string | null;
  /** Shows the snapshot the turn began at, where going back is offered */
  onStart: () => void;
}) {
  const { turn, repo } = props;
  const mark = useSessionMarks().of(turn.session);
  const tick = useDiskTick(turn.to === null);
  const { patch, error } = usePatch(
    () => (turn.to ? gitCompare(repo.path, turn.from, turn.to) : gitSnapshotDiff(repo.path, turn.from)),
    `${repo.path}:${turn.from}:${turn.to}:${tick}`,
  );
  const files = useMemo(() => (patch ? parsePatch(patch.text) : []), [patch]);
  const scope: ChangeScope = {
    repo,
    range: turn.to ? ["diff", short(turn.from), short(turn.to)] : ["diff", short(turn.from)],
    label: `Turn ${turn.n}${mark?.title ? ` (${mark.title})` : ""}${turn.to ? "" : " so far"}${inRepo(repo)}`,
    shown: `${t("Turn {n}", { n: turn.n })}${mark?.title ? ` (${mark.title})` : ""}${turn.to ? "" : ` ${t("so far")}`}${inRepoShown(repo)}`,
    worktree: turn.to === null,
  };

  return (
    <ChangeScopeContext.Provider value={scope}>
      <Section
        title={turn.to ? t("What {who} did in turn {n}", { who: props.who, n: turn.n }) : t("What {who} is doing in turn {n}", { who: props.who, n: turn.n })}
        note={turn.to ? t("done {time}", { time: clock(turn.at) }) : t("still working")}
        aside={
          <>
            <AttachChange />
            <DirqButton patch={patch} />
            <Tooltip content={<span>{t("Shows the point this turn began at. From there you can put the files back as they were.")}</span>}>
              <button type="button" onClick={props.onStart} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[12px] text-slate-300 hover:bg-raised hover:text-slate-100">
                <Undo2 className="size-3" />
                {t("Before this turn…")}
              </button>
            </Tooltip>
          </>
        }
      >
        <div className="flex max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            {mark && <SessionBadge mark={mark} />}
            {turn.session && <span className="text-slate-300">{mark?.title ?? t("Session {id}", { id: shortId(turn.session) })}</span>}
            {props.several && <span className="font-semibold text-slate-300">{repo.name}</span>}
            {patch && <span>{t("{files} changed", { files: plural(patch.changes.length, "file") })}</span>}
            <LookedCount repo={repo} files={files} />
          </div>
          {turn.prompt && (
            <p className="selectable">
              <span className="text-slate-500">{t("You asked:")} </span>
              <span className="text-slate-300">{turn.prompt}</span>
            </p>
          )}
          {turn.report ? (
            <Report turn={turn} who={props.who} />
          ) : (
            <p className="text-slate-500">
              {turn.to
                ? t("It said nothing at the end of this turn.")
                : t("This is what changed so far. Its closing words appear here when it is done.")}
            </p>
          )}
          <p className="text-[12px] text-slate-500">
            {t("A turn is what changed between two points of the trail. Ctrl+click any two points there to compare them the same way.")}
          </p>
        </div>
      </Section>
      {/* A line commented here is preferably meant for the session of this turn */}
      <NoteSessionContext.Provider value={turn.session}>
      <div className="px-4 pt-3 pb-4">
        {error && <p className="selectable text-problem">{error}</p>}
        {patch && patch.changes.length === 0 && <p className="text-slate-500">{t("Nothing changed in this turn yet.")}</p>}
        {patch && props.mode === "structure" && <StructureTree patch={patch} files={files} repo={repo} selected={props.selected} />}
        {patch && props.mode === "code" && (
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <FileSection key={file.path} repo={repo} id={`diff:${toProject(repo, file.path)}`} file={file} />
            ))}
            {patch.truncated && <p className="text-[12px] text-changed">{t("The diff is very long and was cut off here.")}</p>}
          </div>
        )}
      </div>
      </NoteSessionContext.Provider>
    </ChangeScopeContext.Provider>
  );
}

/** For a change's name: which repository, when it is not the project's own. */
const inRepo = (repo: RepoStatus) => (repo.path ? ` in ${repo.name}` : "");
const inRepoShown = (repo: RepoStatus) => (repo.path ? ` ${t("in {repo}", { repo: repo.name })}` : "");

/** How many of the files shown are marked as viewed. */
function LookedCount({ repo, files }: { repo: RepoStatus; files: FileDiff[] }) {
  const reviewed = useReviewed();
  if (files.length === 0) return null;
  const done = files.filter((f) => reviewed(reviewKey(repo.path, f.path, f))).length;
  return <span className={done === files.length ? "text-added" : "text-slate-500"}>{t("{done} of {all} viewed", { done, all: files.length })}</span>;
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const options: [Mode, typeof ListTree, string, string][] = [
    ["structure", ListTree, t("Structure"), t("Which files and folders are new, deleted, moved, renamed or changed, as a tree. Click a file for its diff.")],
    ["code", Code, t("Code"), t("Every changed line, file after file")],
  ];
  return (
    <div className="ml-auto flex rounded-md border border-line p-0.5" role="radiogroup" aria-label={t("Show changes as")}>
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
function RepoChanges(props: {
  repo: RepoStatus;
  git: GitView;
  several: boolean;
  mode: Mode;
  selected: string | null;
  turns: Turn[];
  /** Files a session reported writing in its running turn (project-relative), and that session */
  writing: Map<string, string>;
}) {
  const { repo, git, several, mode } = props;
  const marks = useSessionMarks();
  const ended = useTurnWriters(repo.path, props.turns);
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
  // Who changed a file: the session writing it right now, else the one whose turn changed it
  // last. Shown only if a session is known for one of the files: otherwise "You" would be a guess
  const writer = (path: string) => props.writing.get(toProject(repo, path)) ?? ended.get(path) ?? null;
  const known = files.some((f) => writer(f.path));
  const who = known
    ? (path: string) => {
        const mark = marks.of(writer(path));
        return mark ? <SessionBadge mark={mark} /> : <You />;
      }
    : undefined;

  // Before the first commit there is no HEAD: everything is new against the empty tree
  const scope: ChangeScope = { repo, range: ["diff", repo.head ? "HEAD" : EMPTY_TREE], label: `Uncommitted changes${inRepo(repo)}`, shown: `${t("Uncommitted changes")}${inRepoShown(repo)}`, worktree: true };

  return (
    <ChangeScopeContext.Provider value={scope}>
    <section>
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {several && <FolderGit2 className="size-4 self-center text-slate-400" />}
        <span className="font-semibold text-slate-100">{repo.name}</span>
        <code className="flex items-center gap-1 rounded bg-panel px-1.5 font-mono text-[11px] text-slate-300">
          <GitBranch className="size-3" />
          {repo.branch ?? "detached"}
        </code>
        <span className="text-[12px] text-slate-500">{changeSummary(repo)}</span>
        <span className="text-[12px]">
          <LookedCount repo={repo} files={files} />
        </span>
        {files.length > 0 && (
          <span className="ml-auto flex items-center gap-2 self-center">
            <AttachChange />
            <DirqButton patch={patch} />
          </span>
        )}
      </header>
      <CommitLine repo={repo} files={files} onDone={git.refresh} />
      {error && <p className="selectable mt-2 text-problem">{error}</p>}
      {patch && mode === "structure" && (
        <div className="mt-3">
          <StructureTree patch={patch} files={files} repo={repo} onDone={git.refresh} selected={props.selected} who={who} />
        </div>
      )}
      {patch && mode === "code" && (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((file) => {
            const path = toProject(repo, file.path);
            return (
              <FileSection
                key={file.path}
                repo={repo}
                id={`diff:${path}`}
                file={file}
                who={who?.(file.path)}
                working={{ repo, status: status.get(path) ?? inUntrackedDir(repo, path), onDone: git.refresh }}
              />
            );
          })}
          {patch.truncated && <p className="text-[12px] text-changed">{t("The diff is very long and was cut off here.")}</p>}
        </div>
      )}
    </section>
    </ChangeScopeContext.Provider>
  );
}

/** Message, Commit button, and the command line showing what it runs and what it said. */
function CommitLine({ repo, files, onDone }: { repo: RepoStatus; files: FileDiff[]; onDone: () => void }) {
  const reviewed = useReviewed();
  const [message, setMessage] = useState("");
  const [focus, setFocus] = useState(false);
  const { run, running, done } = useGitRun(repo.path, onDone);
  const steps = commitSteps(repo, message);
  const staged = repo.files.filter((f) => f.staged).length;
  const ready = message.trim().length > 0 && !running;
  // Viewing never decides what is committed; so say how much of it went unseen
  const going = staged > 0 ? files.filter((f) => repo.files.find((s) => s.path === toProject(repo, f.path))?.staged) : files;
  const unviewed = going.filter((f) => !reviewed(reviewKey(repo.path, f.path, f))).length;

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
          placeholder={t("Commit message for {repo}", { repo: repo.name })}
          disabled={running}
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-base px-2 py-1 text-slate-200 outline-none placeholder:text-slate-600 focus:border-brand"
        />
        {unviewed > 0 && message.trim() && (
          <span className="self-center text-[11px] whitespace-nowrap text-changed">{t("{n} not viewed", { n: unviewed })}</span>
        )}
        <Tooltip
          content={
            <>
              <span>
                {staged > 0
                  ? t("Commits the {files} staged; the rest stays uncommitted", { files: plural(staged, "file") })
                  : t("Commits all {files} changed", { files: plural(repo.files.length, "file") })}
                {unviewed > 0 && ` · ${t("{n} of them not viewed", { n: unviewed })}`}
              </span>
              <Commands steps={steps} />
            </>
          }
        >
          <button
            type="submit"
            aria-disabled={!ready}
            className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-on-accent not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
          >
            <Check className="size-3.5" />
            {t("Commit")}
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
        <div className="text-slate-500">{running ? t("Running…") : t("Type a message; the command appears here")}</div>
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
  const scope: ChangeScope = { repo: props.repo, range: ["show", short(c.hash)], label: `Commit ${c.short} "${c.subject}"${inRepo(props.repo)}`, shown: `${t("Commit")} ${c.short} "${c.subject}"${inRepoShown(props.repo)}`, worktree: false };
  return (
    <ChangeScopeContext.Provider value={scope}>
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
                    <span>{t("Change the message")}</span>
                    <span className="text-slate-400">{t("Not pushed yet, so it can still be changed without rewriting what others have")}</span>
                  </>
                }
              >
                <button
                  type="button"
                  aria-label={t("Change the commit message")}
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
          <span>{c.byYou ? t("you") : c.author}</span>
          {c.assistant && (
            <span className="flex items-center gap-1 text-ai">
              <Sparkles className="size-3" /> {t("with {tool}", { tool: c.assistant })}
            </span>
          )}
          <span>{new Date(c.at * 1000).toLocaleString(LOCALE)}</span>
          {c.unpushed && <span className="text-changed">{t("not pushed yet")}</span>}
          <AttachChange />
          <DirqButton patch={patch} />
          <button
            type="button"
            onClick={props.onShowNow}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
          >
            {t("Back to uncommitted")}
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
            <FileSection key={file.path} repo={props.repo} id={`diff:${toProject(props.repo, file.path)}`} file={file} />
          ))}
          {patch.truncated && <p className="text-[12px] text-changed">{t("The diff is very long and was cut off here.")}</p>}
        </div>
      )}
    </div>
    </ChangeScopeContext.Provider>
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
  /** The trail shows only this snapshot's session */
  filtered: boolean;
  onFilter: (on: boolean) => void;
}) {
  const { snapshot: s, repo } = props;
  const mark = useSessionMarks().of(s.session);
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
  const scope: ChangeScope = { repo, range: ["diff", short(s.hash)], label: `Changes since the snapshot "${s.label}"${inRepo(repo)}`, shown: `${t("Changes since the snapshot \"{name}\"", { name: snapshotLabel(s.label) })}${inRepoShown(repo)}`, worktree: true };

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
    <ChangeScopeContext.Provider value={scope}>
    <div className="p-4">
      <header className="mb-3">
        <div className="flex items-start gap-2">
          {s.back ? <Undo2 className="mt-1 size-4 shrink-0 text-slate-400" /> : s.turnFrom ? <Flag className="mt-1 size-4 shrink-0 text-changed" /> : <Anchor className="mt-1 size-4 shrink-0 text-changed" />}
          <h2 className="selectable text-[15px] font-semibold text-slate-50">{snapshotLabel(s.label)}</h2>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
          <code className="selectable rounded bg-panel px-1.5 font-mono text-[11px] text-slate-200">{s.short}</code>
          {props.several && <span className="font-semibold text-slate-300">{repo.name}</span>}
          <span>{new Date(s.at * 1000).toLocaleString(LOCALE)}</span>
          {s.session &&
            (mark ? (
              <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                <SessionBadge mark={mark} />
                <span className="truncate">{mark.title ?? t("Session {id}", { id: shortId(s.session) })}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-ai">
                <Sparkles className="size-3" /> {t("session {id}", { id: shortId(s.session) })}
              </span>
            ))}
          {s.session && (
            <Tooltip content={<span>{props.filtered ? t("Show the snapshots of every AI session again") : t("Show only this AI session's snapshots on the trail")}</span>}>
              <button
                type="button"
                onClick={() => props.onFilter(!props.filtered)}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${
                  props.filtered ? "border-ai/60 bg-ai/15 text-ai" : "border-line text-slate-400 hover:bg-raised hover:text-slate-100"
                }`}
              >
                {props.filtered ? <X className="size-3" /> : <Filter className="size-3" />}
                {t("only this session")}
              </button>
            </Tooltip>
          )}
          {s.tool && <code className="font-mono text-[11px] text-slate-500">{s.tool}</code>}
          {changed > 0 && <AttachChange />}
          <DirqButton patch={patch} />
          <button
            type="button"
            onClick={props.onShowNow}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
          >
            {t("Back to uncommitted")}
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-line bg-panel p-3">
          {!asking ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-slate-400">
                {changed === 0
                  ? t("Nothing changed since this snapshot.")
                  : s.back
                    ? t("{files} changed since this snapshot.", { files: plural(changed, "file") })
                    : s.turnFrom
                      ? t("{files} changed since this snapshot was taken, when the turn was over.", { files: plural(changed, "file") })
                      : t("{files} changed since this snapshot was taken, before the assistant wrote.", { files: plural(changed, "file") })}
              </p>
              <button
                type="button"
                disabled={changed === 0 || running}
                onClick={() => setAsking(true)}
                className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-on-accent not-disabled:hover:bg-brand-fill-hover disabled:opacity-40"
              >
                <Undo2 className="size-3.5" />
                {t("Go back to here")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-slate-300">
                {t("Puts {files} back as they were in {repo}; files that are new since then are deleted. What is there now is kept as a snapshot first, so you can come back to it.", { files: plural(changed, "file"), repo: repo.name })}
              </p>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="rounded-md border border-line px-2.5 py-1 text-slate-300 hover:bg-raised"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled={running}
                onClick={goBack}
                className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-1 font-medium text-on-accent not-disabled:hover:bg-brand-fill-hover disabled:opacity-40"
              >
                <Undo2 className="size-3.5" />
                {running ? t("Going back…") : t("Go back")}
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
            <FileSection key={file.path} repo={repo} id={`diff:${toProject(repo, file.path)}`} file={file} />
          ))}
          {patch.truncated && <p className="text-[12px] text-changed">{t("The diff is very long and was cut off here.")}</p>}
        </div>
      )}
    </div>
    </ChangeScopeContext.Provider>
  );
}

/** Two points of one repository: what changed from the older to the newer one. */
function CompareChanges(props: {
  repo: RepoStatus;
  point: { from: string; to: string };
  from: { short: string; title: string; at: number; snapshot: boolean };
  to: { short: string; title: string; at: number; snapshot: boolean };
  several: boolean;
  mode: Mode;
  selected: string | null;
  onShowNow: () => void;
}) {
  const { repo, point } = props;
  const { patch, error } = usePatch(() => gitCompare(repo.path, point.from, point.to), `${repo.path}:${point.from}:${point.to}`);
  const files = useMemo(() => (patch ? parsePatch(patch.text) : []), [patch]);
  const scope: ChangeScope = {
    repo,
    range: ["diff", short(point.from), short(point.to)],
    label: `Changes from ${props.from.short} "${props.from.title}" to ${props.to.short} "${props.to.title}"${inRepo(repo)}`,
    shown: `${t("Changes from {from} to {to}", { from: props.from.short, to: props.to.short })}${inRepoShown(repo)}`,
    worktree: false,
  };
  const side = (p: typeof props.from, label: string) => (
    <div className="min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        {label}
        {p.snapshot ? <Anchor className="size-3 text-changed" /> : null}
        <code className="font-mono text-slate-300">{p.short}</code>
        {p.at > 0 && <span>{new Date(p.at * 1000).toLocaleString(LOCALE)}</span>}
      </div>
      <div className={`truncate ${p.snapshot ? "text-slate-400 italic" : "text-slate-100"}`}>{p.snapshot ? snapshotLabel(p.title) : p.title}</div>
    </div>
  );
  return (
    <ChangeScopeContext.Provider value={scope}>
    <div className="p-4">
      <header className="mb-3">
        <div className="flex items-stretch gap-2">
          {side(props.from, "from")}
          <ArrowRight className="size-4 self-center text-slate-500" />
          {side(props.to, "to")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
          {props.several && <span className="font-semibold text-slate-300">{repo.name}</span>}
          {patch && <span>{plural(patch.changes.length, "file")} changed</span>}
          <span className="text-slate-500">{t("Ctrl+click another point to compare with that one instead")}</span>
          <AttachChange />
          <DirqButton patch={patch} />
          <button
            type="button"
            onClick={props.onShowNow}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
          >
            {t("Back to uncommitted")}
          </button>
        </div>
      </header>
      {error && <p className="selectable text-problem">{error}</p>}
      {patch && props.mode === "structure" && <StructureTree patch={patch} files={files} repo={repo} selected={props.selected} />}
      {patch && props.mode === "code" && (
        <div className="flex flex-col gap-2">
          {files.map((file) => (
            <FileSection key={file.path} repo={repo} id={`diff:${toProject(repo, file.path)}`} file={file} />
          ))}
          {patch.truncated && <p className="text-[12px] text-changed">{t("The diff is very long and was cut off here.")}</p>}
        </div>
      )}
    </div>
    </ChangeScopeContext.Provider>
  );
}

/** Opens the patch in Dirq, side by side; only offered when Dirq is installed. */
function DirqButton({ patch }: { patch: Patch | null }) {
  const installed = useDirq();
  const [failed, setFailed] = useState<string | null>(null);
  if (!installed || !patch || !patch.text) return null;
  return (
    <Tooltip
      content={
        <>
          <span>{t("Open in Dirq, old and new side by side")}</span>
          {patch.truncated && <span className="text-changed">{t("Only the part shown here: the diff is very long")}</span>}
          {failed && <span className="text-problem">{failed}</span>}
        </>
      }
    >
      <button
        type="button"
        onClick={() => showPatch(patch.text).then(() => setFailed(null), (e) => setFailed(String(e)))}
        className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised hover:text-slate-100"
      >
        <ExternalLink className="size-3" />
        Dirq
      </button>
    </Tooltip>
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
          {(refused && known(refused)) ??
            (props.repo.head === props.commit.hash
              ? t("The newest commit is amended; staged changes stay out of it")
              : t("{commits} after it get new hashes too; your uncommitted changes are put aside and back", { commits: plural(newer, "commit") }))}
        </span>
        <button
          type="button"
          onClick={props.onCancel}
          className="ml-auto rounded-md border border-line px-2 py-0.5 text-slate-300 hover:bg-raised"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          aria-disabled={!ready}
          onClick={save}
          title={t("Ctrl+Enter")}
          className="flex items-center gap-1 rounded-md bg-brand-fill px-2.5 py-0.5 font-medium text-on-accent not-aria-disabled:hover:bg-brand-fill-hover aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <Check className="size-3.5" />
          {t("Change message")}
        </button>
      </div>
      <CommandLine preview={!refused && !running && done.length === 0 ? (steps as Steps) : null} done={done} running={running} />
    </div>
  );
}

/** One file: a header with its tick, state, numbers and actions, then its diff. */
function FileSection({ id, repo, file, working, who }: { id: string; repo: RepoStatus; file: FileDiff; working?: Working; who?: ReactNode }) {
  const size = diffSize(file);
  const lookedKey = reviewKey(repo.path, file.path, file);
  const looked = useReviewed()(lookedKey);
  const slot = reviewSlot(useChangeScope(), lookedKey);
  // Viewed already: it opens closed
  const [open, setOpen] = useState(size <= LONG_DIFF && !looked);
  const state = working?.status?.state ?? file.status;
  const slash = file.path.lastIndexOf("/");
  const Chevron = open ? ChevronDown : ChevronRight;
  // A deleted file is not there to open
  const projectPath = file.status === "D" ? null : toProject(repo, file.path);

  return (
    <article id={id} className="scroll-mt-2 overflow-hidden rounded-lg border border-line bg-panel">
      <header className="group flex h-8 items-center gap-2 pr-2 pl-2">
        <button
          type="button"
          // A click only folds, at once: viewing and editing are in the row's tools (no double click to wait for)
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Chevron className="size-3.5 shrink-0 text-slate-500" />
          <Tooltip
            content={<span>{t(stateMeaning[state])}{working?.status?.staged ? ` · ${t("staged for the next commit")}` : ""}</span>}
            className="flex shrink-0"
          >
            <span className={`w-3 text-center font-mono text-[11px] ${stateColor[state]}`}>{stateSymbol(state)}</span>
          </Tooltip>
          <span className="min-w-0 truncate font-mono text-[12px]">
            {file.from && <span className="text-slate-500">{file.from} → </span>}
            <span className="text-slate-500">{file.path.slice(0, slash + 1)}</span>
            <span className={looked ? "text-slate-400" : "text-slate-100"}>{file.path.slice(slash + 1)}</span>
          </span>
          <ChangedSinceViewed show={changedSinceViewed(lookedKey, slot)} />
          <LineCounts added={file.added} removed={file.removed} />
          {working?.status?.staged && <span className="shrink-0 text-[11px] text-slate-500">{t("staged")}</span>}
        </button>
        {/* On hover, left of what always shows (who changed it, the paperclip of an attached change) */}
        <FileTools path={file.path} projectPath={projectPath} patch={file.patch} added={file.status === "A"} from={file.from} working={working} />
        {who}
        <AttachedAtRest path={file.path} added={file.status === "A"} />
        <Viewed
          viewed={looked}
          name={file.path}
          onChange={() => {
            toggleReviewed(lookedKey, slot);
            if (!looked) setOpen(false);
          }}
        />
      </header>
      {open && <DiffBody file={file} notePath={file.status === "D" ? undefined : toProject(repo, file.path)} />}
      {!open && size > LONG_DIFF && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-t border-line py-1.5 text-[12px] text-slate-500 hover:text-slate-200"
        >
          {t("Show {n} lines", { n: size })}
        </button>
      )}
    </article>
  );
}
