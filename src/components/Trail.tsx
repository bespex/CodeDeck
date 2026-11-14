import { useEffect, useRef, useState } from "react";
import { Anchor, CircleDot, GitMerge, Sparkles, Undo2 } from "lucide-react";
import type { RepoStatus, Snapshot } from "../backend";
import type { TrailCommit } from "../history";
import { aheadBehind, plural } from "../git";

/** What the deck shows: the uncommitted state, one commit, or what changed since a snapshot. */
export type Point =
  | { kind: "now" }
  | { kind: "commit"; repo: string; hash: string }
  | { kind: "snapshot"; repo: string; hash: string };

interface Props {
  commits: TrailCommit[];
  /** Snapshots taken before an assistant wrote, newest first */
  snapshots: Snapshot[];
  repos: RepoStatus[];
  point: Point;
  onSelect: (point: Point) => void;
  /** The repository of what is selected in the file list: its commits stay bright */
  focusRepo: string | null;
}

/** Hovering opens the trail after this pause, so passing the mouse over it does not. */
const OPEN_DELAY_MS = 220;

const ROW = "h-[42px]";
/** Width of the open trail, if the window leaves room for it on the left. */
const WIDTH = 400;

/** Dates in the language of the interface, with the 24-hour clock. */
export const LOCALE = "en-GB";

/**
 * The history as a vertical line on the left of the deck, newest on top. At rest a narrow
 * column of points; while the mouse is on it, it widens over the deck into a readable timeline
 * with days, messages and repositories. A point shows what changed there.
 */
export function Trail({ commits, snapshots, repos, point, onSelect, focusRepo }: Props) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(WIDTH);
  const column = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const several = repos.length > 1;
  const uncommitted = repos.reduce((n, r) => n + r.files.length, 0);
  const dirtyRepos = repos.filter((r) => r.files.length > 0).length;
  const nowSelected = point.kind === "now";

  const enter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Opens to the left, over the file list, never past the window's edge
      setWidth(Math.min(WIDTH, column.current?.getBoundingClientRect().right ?? WIDTH));
      setOpen(true);
    }, OPEN_DELAY_MS);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  const byPath = new Map(repos.map((r) => [r.path, r]));
  // Per repository the newest commit that is on a remote: where the remote stands on the trail
  const marked = new Set<string>();
  const boundary = new Map<string, string>();
  for (const { repo, commit } of commits) {
    if (!marked.has(repo) && zoneOf(commit, byPath.get(repo)) === "pushed") {
      marked.add(repo);
      boundary.set(repo, commit.hash);
    }
  }

  const items = trailItems(commits, snapshots);
  let lastDay = "";

  return (
    <div ref={column} className="relative w-11 shrink-0 border-r border-line bg-panel" aria-label="Trail">
      <div
        onMouseEnter={enter}
        onMouseLeave={leave}
        style={{ width: open ? width : 44 }}
        className={`absolute inset-y-0 right-0 z-20 overflow-x-hidden overflow-y-auto transition-[width] duration-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          open ? "surface-overlay rounded-l-lg" : ""
        }`}
      >
        <ol className="relative py-2">
          <li className="relative">
            {items.length > 0 && <Segment zone={uncommitted ? "uncommitted" : "pushed"} from="middle" />}
            <TrailRow
              open={open}
              selected={nowSelected}
              onClick={() => onSelect({ kind: "now" })}
              dot={
                <span
                  className={`grid size-[18px] place-items-center rounded-full border bg-panel ${
                    nowSelected ? "border-brand bg-brand/25" : uncommitted ? "border-changed" : "border-slate-600"
                  }`}
                >
                  <CircleDot className={`size-3 ${uncommitted ? "text-changed" : "text-slate-500"}`} />
                </span>
              }
              time="now"
              detail={plural(uncommitted, "file")}
              title={
                uncommitted
                  ? `Uncommitted changes${several ? ` in ${dirtyRepos} repo${dirtyRepos === 1 ? "" : "s"}` : ""}`
                  : "Nothing uncommitted: the working tree matches the last commit"
              }
            />
          </li>

          {items.map((item, i) => {
            const { repo } = item;
            const at = item.kind === "commit" ? item.commit.at : item.snapshot.at;
            const day = dayLabel(at);
            const showDay = day !== lastDay;
            lastDay = day;
            const hash = item.kind === "commit" ? item.commit.hash : item.snapshot.hash;
            const selected = point.kind === item.kind && point.repo === repo && point.hash === hash;
            const dimmed = focusRepo !== null && repo !== focusRepo;
            // Snapshots are newer than their repository's last commit: work not committed yet
            const zone = item.kind === "commit" ? zoneOf(item.commit, byPath.get(repo)) : null;
            const repoName = several ? (byPath.get(repo)?.name ?? repo) : undefined;
            return (
              <li key={`${item.kind}:${repo}:${hash}`} className={`relative ${dimmed ? "opacity-35" : ""}`}>
                <Segment zone={zone ?? "uncommitted"} to={i === items.length - 1 ? "middle" : undefined} />
                {showDay && (
                  open ? (
                    // A line across the whole trail with the day in its middle
                    <div className="relative z-10 flex h-6 items-center gap-2.5 bg-overlay px-3">
                      <span className="h-px flex-1 bg-slate-600" />
                      <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{day}</span>
                      <span className="h-px flex-1 bg-slate-600" />
                    </div>
                  ) : (
                    <div className="flex h-6 flex-row-reverse items-center">
                      <span className="relative z-10 mr-[18px] h-px w-[9px] bg-slate-500" />
                    </div>
                  )
                )}
                {item.kind === "commit" && zone ? (
                  <TrailRow
                    open={open}
                    selected={selected}
                    onClick={() => onSelect({ kind: "commit", repo, hash })}
                    dot={<CommitDot commit={item.commit} zone={zone} selected={selected} />}
                    time={clock(at)}
                    detail={plural(item.commit.files, "file")}
                    title={item.commit.subject}
                    label={`${item.commit.subject} (${ZONE_WORDS[zone]})`}
                    warm={zone === "unpushed"}
                    repo={repoName}
                    remote={boundary.get(repo) === hash ? remoteMark(byPath.get(repo)) : undefined}
                  />
                ) : item.kind === "snapshot" ? (
                  <TrailRow
                    open={open}
                    selected={selected}
                    onClick={() => onSelect({ kind: "snapshot", repo, hash })}
                    dot={<SnapshotDot snapshot={item.snapshot} selected={selected} />}
                    time={clock(at)}
                    detail="snapshot"
                    title={item.snapshot.label}
                    label={`Snapshot: ${item.snapshot.label}`}
                    quiet
                    repo={repoName}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        {items.length === 0 && open && (
          <p className="py-2 pr-14 text-right text-[11px] text-slate-500">No commits yet.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Three columns, mirrored because the trail opens to the left: the message over two lines; time
 * above and number of files below, right-aligned so they line up; the point on the line, which
 * stays where it was.
 */
function TrailRow(props: {
  open: boolean;
  selected: boolean;
  onClick: () => void;
  dot: React.ReactNode;
  time: string;
  /** Under the time: number of files, or what kind of point it is */
  detail: string;
  title: string;
  /** A snapshot, not a commit: the message in italics */
  quiet?: boolean;
  /** For screen readers, when the title alone does not say enough */
  label?: string;
  /** Not on a remote yet: the time is in the colour of things still to do */
  warm?: boolean;
  /** With several repositories: whose commit it is */
  repo?: string;
  /** On the newest commit a remote has: its name and how far the branch is from it */
  remote?: { name: string; sync: string; hint: string };
}) {
  return (
    <button
      type="button"
      aria-current={props.selected}
      aria-label={props.label ?? props.title}
      onClick={props.onClick}
      className={`relative flex w-full flex-row-reverse items-center text-left outline-none focus-visible:bg-overlay-hover ${ROW} ${
        props.open ? "hover:bg-overlay-hover" : ""
      } ${props.selected && props.open ? "bg-overlay-hover" : ""}`}
    >
      {/* What is shown is marked by a bar at the edge, not only by a colour: amber means changed */}
      {props.selected && <span className="absolute inset-y-2 right-0 w-[3px] rounded-l bg-brand" />}
      <span className="relative z-10 grid w-11 shrink-0 place-items-center">{props.dot}</span>
      {props.open && (
        <>
          <span className="flex w-[60px] shrink-0 flex-col items-end font-mono text-[11px] leading-[15px] tabular-nums">
            <span className={props.warm ? "text-changed" : "text-slate-300"}>{props.time}</span>
            <span className="text-slate-500">{props.detail}</span>
          </span>
          <span
            className={`line-clamp-2 min-w-0 flex-1 pr-3 pl-4 text-[12px] leading-[15px] ${
              props.selected ? "text-slate-50" : props.quiet ? "text-slate-400 italic" : "text-slate-200"
            }`}
          >
            {props.repo && <span className="mr-1.5 font-semibold whitespace-nowrap text-slate-500">{props.repo}</span>}
            {props.remote && (
              <span
                title={props.remote.hint}
                className="mr-1.5 inline-flex max-w-[160px] items-center gap-1 rounded border border-slate-600 px-1 align-[1px] font-mono text-[10px] leading-[13px] whitespace-nowrap text-slate-400"
              >
                <span className="truncate">{props.remote.name}</span>
                {props.remote.sync && <span className="text-changed">{props.remote.sync}</span>}
              </span>
            )}
            {props.title}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Where a commit stands: on a remote, only here though there is a remote to push to, or in a
 * repository without any remote, where there is nothing to push.
 */
type Zone = "pushed" | "unpushed" | "local";

/** The line above the commits: what is not committed yet. */
type LineZone = Zone | "uncommitted";

const ZONE_WORDS: Record<Zone, string> = {
  pushed: "pushed",
  unpushed: "committed, not pushed yet",
  local: "committed; the repository has no remote",
};

function zoneOf(commit: TrailCommit["commit"], repo: RepoStatus | undefined): Zone {
  if (commit.unpushed) return "unpushed";
  return repo && repo.remotes.length === 0 ? "local" : "pushed";
}

/** The chip on the newest pushed commit of a repository. */
function remoteMark(repo: RepoStatus | undefined) {
  if (!repo) return undefined;
  const sync = aheadBehind(repo);
  // The branch is on the folder and in the status bar already; here only where it is
  const name = repo.upstream?.split("/")[0] ?? repo.remotes[0] ?? "remote";
  const hint = [
    repo.upstream ? `${repo.upstream} is here` : "The newest commit on a remote; the branch has no upstream",
    repo.ahead > 0 && `${plural(repo.ahead, "commit")} above to push`,
    repo.behind > 0 && `${plural(repo.behind, "commit")} on the remote to pull`,
  ]
    .filter(Boolean)
    .join(". ");
  return { name, sync, hint };
}

/**
 * The row's piece of the vertical line, so the line shows the three zones: amber while not
 * committed, dashed amber while not pushed, quiet grey once on a remote. The first row starts
 * its piece at the point, the last one ends it there.
 */
function Segment({ zone, from, to }: { zone: LineZone; from?: "middle"; to?: "middle" }) {
  const look =
    zone === "uncommitted"
      ? "right-[21px] border-r-2 border-solid border-changed/70"
      : zone === "unpushed"
        ? "right-[21px] border-r-2 border-dashed border-changed/60"
        : "right-[22px] border-r border-solid border-line";
  // The point sits 21px above the row's bottom; a day heading may come before it
  const span = from === "middle" ? "top-[21px] bottom-0" : to === "middle" ? "top-0 bottom-[21px]" : "inset-y-0";
  return <span aria-hidden className={`pointer-events-none absolute w-0 ${look} ${span}`} />;
}

/**
 * Pushed commits are a filled point, commits not pushed yet a hollow amber ring, assistant
 * commits carry a spark inside it.
 */
function CommitDot({ commit, zone, selected }: { commit: TrailCommit["commit"]; zone: Zone; selected: boolean }) {
  const warm = zone === "unpushed";
  const ring = selected
    ? "border-brand bg-brand/25"
    : warm
      ? "border-changed bg-panel"
      : "border-transparent bg-panel";
  return (
    <span className={`grid size-[18px] place-items-center rounded-full border ${ring}`}>
      {commit.assistant ? (
        <Sparkles className="size-3 text-ai" />
      ) : commit.merge ? (
        <GitMerge className={`size-3 ${warm ? "text-changed" : "text-slate-400"}`} />
      ) : (
        <span
          className={`size-[7px] rounded-full ${
            selected ? "bg-brand-soft" : warm ? "border border-changed bg-transparent" : "bg-slate-400"
          }`}
        />
      )}
    </span>
  );
}

type TrailItem =
  | ({ kind: "commit" } & TrailCommit)
  | { kind: "snapshot"; repo: string; snapshot: Snapshot };

/**
 * Commits and snapshots in one line, newest first. Of the snapshots only those since the
 * repository's latest commit: the steps of the work not committed yet, to go back to.
 */
function trailItems(commits: TrailCommit[], snapshots: Snapshot[]): TrailItem[] {
  const newest = new Map<string, number>();
  for (const c of commits) if (!newest.has(c.repo)) newest.set(c.repo, c.commit.at);
  const items: TrailItem[] = [
    ...commits.map((c) => ({ kind: "commit" as const, ...c })),
    ...snapshots
      .filter((s) => s.at >= (newest.get(s.repo) ?? 0))
      .map((s) => ({ kind: "snapshot" as const, repo: s.repo, snapshot: s })),
  ];
  const at = (x: TrailItem) => (x.kind === "commit" ? x.commit.at : x.snapshot.at);
  return items.sort((a, b) => at(b) - at(a));
}

/** An anchor where the assistant was about to write; a turning arrow where one went back. */
function SnapshotDot({ snapshot, selected }: { snapshot: Snapshot; selected: boolean }) {
  const Icon = snapshot.back ? Undo2 : Anchor;
  return (
    <span
      className={`grid size-[18px] place-items-center rounded-[5px] border ${
        selected ? "border-brand bg-brand/25" : "border-changed/60 bg-panel"
      }`}
    >
      <Icon className={`size-[11px] ${snapshot.back ? "text-slate-400" : "text-changed"}`} />
    </span>
  );
}

function dayLabel(at: number): string {
  const date = new Date(at * 1000);
  const today = new Date();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(LOCALE, { weekday: "long" });
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** 24-hour time; the day is in the heading above. */
const clock = (at: number) => new Date(at * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
