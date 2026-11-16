import { useEffect, useRef, useState } from "react";
import { Anchor, ChevronUp, CircleDot, Flag, GitMerge, Layers, Sparkles, Undo2 } from "lucide-react";
import type { RepoStatus, Snapshot } from "../backend";
import { useSessionMarks } from "../assistant";
import type { TrailCommit } from "../history";
import { aheadBehind, plural } from "../git";
import { Tooltip, TooltipHint } from "./Tooltip";

/** What the deck shows: the uncommitted state, one commit, or what changed since a snapshot. */
export type Point =
  | { kind: "now" }
  | { kind: "commit"; repo: string; hash: string }
  | { kind: "snapshot"; repo: string; hash: string }
  /** Two points of one repository, the older one first */
  | { kind: "compare"; repo: string; from: string; to: string };

interface Props {
  commits: TrailCommit[];
  /** Snapshots taken before an assistant wrote, newest first */
  snapshots: Snapshot[];
  repos: RepoStatus[];
  point: Point;
  onSelect: (point: Point) => void;
  /** Ctrl+click: compare this point with the one shown */
  onCompare: (repo: string, hash: string) => void;
  /** The repository of what is selected in the file list: its commits stay bright */
  focusRepo: string | null;
}

/** Snapshots in a row, from this many on, fold into one point until it is opened. */
const FOLD_FROM = 3;

/** Hovering opens the trail after this pause, so passing the mouse over it does not. */
const OPEN_DELAY_MS = 220;

const ROW = "h-[42px]";
/** Width of the open trail, if the window leaves room for it on the left. */
const WIDTH = 400;

/** Dates in the language of the interface, with the 24-hour clock. */
// Dates follow the language of the interface (a live binding)
import { LOCALE } from "../i18n";
import { snapshotLabel, t } from "../i18n";
export { LOCALE };

/**
 * The history as a vertical line on the left of the deck, newest on top. At rest a narrow
 * column of points; while the mouse is on it, it widens over the deck into a readable timeline
 * with days, messages and repositories. A point shows what changed there.
 */
export function Trail({ commits, snapshots, repos, point, onSelect, onCompare, focusRepo }: Props) {
  const marks = useSessionMarks();
  const [open, setOpen] = useState(false);
  // Runs of snapshots opened by a click, by the newest snapshot of the run
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
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
  const rows = foldRuns(items, (run) => {
    const newest = run[0].kind === "snapshot" ? run[0].snapshot.hash : "";
    const picked = run.some((x) => x.kind === "snapshot" && (point.kind === "snapshot" || point.kind === "compare") && x.repo === point.repo &&
      (point.kind === "snapshot" ? point.hash === x.snapshot.hash : point.from === x.snapshot.hash || point.to === x.snapshot.hash));
    return !unfolded.has(newest) && !picked;
  });
  let lastDay = "";

  return (
    <div ref={column} className="relative w-11 shrink-0 border-r border-line bg-panel" aria-label={t("Trail")}>
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
              time={t("now")}
              symbol={<PointTip name={t("Now")} meaning={t("The working tree as it is: what is not committed yet. Amber while there is something.")} />}
              detail={plural(uncommitted, "file")}
              title={
                uncommitted
                  ? several
                    ? t("Uncommitted changes in {repos}", { repos: plural(dirtyRepos, "repository") })
                    : t("Uncommitted changes")
                  : t("Nothing uncommitted: the working tree matches the last commit")
              }
            />
          </li>

          {rows.map((row) => {
            if (row.kind === "fold") {
              const { run, last } = row;
              const newest = run[0].kind === "snapshot" ? run[0].snapshot : null;
              const oldest = run[run.length - 1].kind === "snapshot" ? (run[run.length - 1] as { snapshot: Snapshot }).snapshot : null;
              if (!newest || !oldest) return null;
              const day = dayLabel(newest.at);
              const showDay = day !== lastDay;
              lastDay = dayLabel(oldest.at);
              const sessions = [...new Set(run.map((x) => (x.kind === "snapshot" ? x.snapshot.session : null)))].map((id) => marks.of(id)).filter((m) => !!m);
              return (
                <li key={`fold:${newest.hash}`} className="relative">
                  <Segment zone="uncommitted" to={last ? "middle" : undefined} />
                  {showDay && <DayLine day={day} open={open} />}
                  <TrailRow
                    open={open}
                    selected={false}
                    onClick={() => setUnfolded(new Set(unfolded).add(newest.hash))}
                    dot={<FoldDot count={run.length} color={sessions.length === 1 ? sessions[0]!.color : undefined} />}
                    symbol={<PointTip name={t("Several snapshots (stack)")} meaning={t("{n} snapshots in a row, folded so the trail stays short. A click shows them one by one.", { n: run.length })} />}
                    time={clock(newest.at)}
                    detail={plural(run.length, "snapshot")}
                    title={`${t("from {from} to {to}", { from: clock(oldest.at), to: clock(newest.at) })}${sessions.length ? ` · ${sessions.map((m) => m!.short).join(", ")}` : ""}`}
                    label={t("{n} snapshots folded; open them", { n: run.length })}
                    quiet
                  />
                </li>
              );
            }
            const { item, i, firstOfRun } = row;
            const { repo } = item;
            const at = item.kind === "commit" ? item.commit.at : item.snapshot.at;
            const day = dayLabel(at);
            const showDay = day !== lastDay;
            lastDay = day;
            const hash = item.kind === "commit" ? item.commit.hash : item.snapshot.hash;
            const selected =
              point.kind === "compare"
                ? point.repo === repo && (point.from === hash || point.to === hash)
                : point.kind === item.kind && point.repo === repo && point.hash === hash;
            const session = item.kind === "snapshot" ? item.snapshot.session : null;
            const mark = marks.of(session);
            // A session hovered in the list: the other sessions' snapshots step back. Commits stay
            // as they are: nothing tells which session a commit belongs to
            const dimmed = (focusRepo !== null && repo !== focusRepo) || (marks.hovered !== null && session !== null && session !== marks.hovered);
            // Snapshots are newer than their repository's last commit: work not committed yet
            const zone = item.kind === "commit" ? zoneOf(item.commit, byPath.get(repo)) : null;
            const repoName = several ? (byPath.get(repo)?.name ?? repo) : undefined;
            return (
              <li key={`${item.kind}:${repo}:${hash}`} className={`relative transition-opacity ${dimmed ? "opacity-35" : ""}`}>
                <Segment zone={zone ?? "uncommitted"} to={i === items.length - 1 ? "middle" : undefined} />
                {showDay && <DayLine day={day} open={open} />}
                {firstOfRun && open && (
                  // An opened run can be folded again
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(unfolded);
                      next.delete(firstOfRun);
                      setUnfolded(next);
                    }}
                    className="flex h-6 w-full items-center justify-end gap-1 pr-12 text-[11px] text-slate-500 hover:text-slate-200"
                  >
                    <ChevronUp className="size-3" />
                    {t("Fold these snapshots")}
                  </button>
                )}
                {item.kind === "commit" && zone ? (
                  <TrailRow
                    open={open}
                    selected={selected}
                    onClick={(e) => (e.ctrlKey ? onCompare(repo, hash) : onSelect({ kind: "commit", repo, hash }))}
                    dot={<CommitDot commit={item.commit} zone={zone} selected={selected} />}
                    symbol={<CommitSymbol commit={item.commit} zone={zone} />}
                    time={clock(at)}
                    detail={plural(item.commit.files, "file")}
                    title={item.commit.subject}
                    label={`${item.commit.subject} (${t(ZONE_WORDS[zone])})`}
                    warm={zone === "unpushed"}
                    repo={repoName}
                    remote={boundary.get(repo) === hash ? remoteMark(byPath.get(repo)) : undefined}
                  />
                ) : item.kind === "snapshot" ? (
                  <TrailRow
                    open={open}
                    selected={selected}
                    onClick={(e) => (e.ctrlKey ? onCompare(repo, hash) : onSelect({ kind: "snapshot", repo, hash }))}
                    dot={<SnapshotDot snapshot={item.snapshot} selected={selected} color={mark?.color} />}
                    symbol={<SnapshotSymbol snapshot={item.snapshot} />}
                    time={clock(at)}
                    detail={mark ? t("session {id}", { id: mark.short }) : t("snapshot")}
                    title={snapshotLabel(item.snapshot.label)}
                    label={`${mark ? t("Snapshot of session {short}", { short: mark.short }) : t("Snapshot")}: ${snapshotLabel(item.snapshot.label)}`}
                    quiet
                    repo={repoName}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        {items.length === 0 && open && (
          <p className="py-2 pr-14 text-right text-[11px] text-slate-500">{t("No commits yet.")}</p>
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
  onClick: (e: React.MouseEvent) => void;
  dot: React.ReactNode;
  /** What the point's symbol means, in a tooltip after a pause */
  symbol: React.ReactNode;
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
      <span className="relative z-10 grid w-11 shrink-0 place-items-center">
        <Tooltip side="right" className="flex" content={props.symbol}>
          {props.dot}
        </Tooltip>
      </span>
      {props.open && (
        <>
          {/* As wide as it needs: "12 Dateien" is longer than "12 files", and neither may wrap */}
          <span className="flex min-w-[60px] shrink-0 flex-col items-end font-mono text-[11px] leading-[15px] whitespace-nowrap tabular-nums">
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
    repo.upstream ? t("{upstream} is here", { upstream: repo.upstream }) : t("The newest commit on a remote; the branch has no upstream"),
    repo.ahead > 0 && t("{commits} above to push", { commits: plural(repo.ahead, "commit") }),
    repo.behind > 0 && t("{commits} on the remote to pull", { commits: plural(repo.behind, "commit") }),
  ]
    .filter(Boolean)
    .join(". ");
  return { name, sync, hint };
}

/**
 * The row's piece of the vertical line, so the line shows the three zones: amber while not
 * committed, faint amber while not pushed, grey once on a remote. One width and no dashes, so the
 * line reads as one unbroken thread; the hollow points tell what is not pushed. The first row
 * starts its piece at the point, the last one ends it there.
 */
function Segment({ zone, from, to }: { zone: LineZone; from?: "middle"; to?: "middle" }) {
  const look = zone === "uncommitted" ? "border-changed/70" : zone === "unpushed" ? "border-changed/35" : "border-slate-600/80";
  // The point sits 21px above the row's bottom; a day heading may come before it
  const span = from === "middle" ? "top-[21px] bottom-0" : to === "middle" ? "top-0 bottom-[21px]" : "inset-y-0";
  return <span aria-hidden className={`pointer-events-none absolute right-[21px] w-0 border-r-2 ${look} ${span}`} />;
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

/** The tooltip of a point: what its symbol stands for, and what clicking does. */
function PointTip({ name, meaning }: { name: string; meaning: string }) {
  return (
    <>
      <span className="font-semibold text-slate-100">{name}</span>
      <span>{meaning}</span>
      <TooltipHint>{t("Click: show what changed. Ctrl+click: compare with the point shown.")}</TooltipHint>
    </>
  );
}

function CommitSymbol({ commit, zone }: { commit: TrailCommit["commit"]; zone: Zone }) {
  const kind = commit.assistant
    ? t("Commit by an assistant (the spark)")
    : commit.merge
      ? t("Merge commit")
      : zone === "unpushed"
        ? t("Commit (hollow ring)")
        : t("Commit (filled point)");
  const where =
    zone === "unpushed"
      ? t("Only here so far: not pushed yet. The line is amber up to the last pushed commit.")
      : zone === "local"
        ? t("The repository has no remote, so there is nothing to push.")
        : t("On the remote: pushed.");
  return <PointTip name={kind} meaning={where} />;
}

function SnapshotSymbol({ snapshot }: { snapshot: Snapshot }) {
  return snapshot.back ? (
    <PointTip name={t("Went back (turning arrow)")} meaning={t("Someone went back to an earlier point here; what was there before is kept in this snapshot.")} />
  ) : snapshot.turnFrom ? (
    <PointTip name={t("End of a turn (flag)")} meaning={t("Snapshot when a session finished its turn, in the session's colour. It shows what the turn changed.")} />
  ) : (
    <PointTip name={t("Before writing")} meaning={t("Snapshot just before a session first wrote in a turn, in the session's colour. To go back to.")} />
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

/**
 * An anchor icon where the assistant was about to write and a flag where its turn was over, in its
 * session's colour; a turning arrow where one went back.
 */
function SnapshotDot({ snapshot, selected, color }: { snapshot: Snapshot; selected: boolean; color?: string }) {
  const Icon = snapshot.back ? Undo2 : snapshot.turnFrom ? Flag : Anchor;
  const own = !snapshot.back && !selected ? color : undefined;
  return (
    <span
      style={own ? { borderColor: `color-mix(in srgb, ${own} 65%, transparent)` } : undefined}
      className={`grid size-[18px] place-items-center rounded-[5px] border ${
        selected ? "border-brand bg-brand/25" : "border-changed/60 bg-panel"
      }`}
    >
      <Icon style={!snapshot.back && color ? { color } : undefined} className={`size-[11px] ${snapshot.back ? "text-slate-400" : "text-changed"}`} />
    </span>
  );
}

function dayLabel(at: number): string {
  const date = new Date(at * 1000);
  const today = new Date();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days === 0) return t("Today");
  if (days === 1) return t("Yesterday");
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

/** The day between rows: a line across the open trail, a tick on the closed one. */
function DayLine({ day, open }: { day: string; open: boolean }) {
  return open ? (
    // It stops short of the points' column so the trail's line runs on through it
    <div className="flex h-6 items-center gap-2.5 pr-11 pl-3">
      <span className="h-px flex-1 bg-slate-600" />
      <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{day}</span>
      <span className="h-px flex-1 bg-slate-600" />
    </div>
  ) : (
    <div className="flex h-6 flex-row-reverse items-center">
      <span title={day} className="relative z-10 mr-[18px] h-px w-[9px] bg-slate-500" />
    </div>
  );
}

/** Several snapshots folded into one point: a stack with their number. */
function FoldDot({ count, color }: { count: number; color?: string }) {
  return (
    <span
      style={color ? { borderColor: `color-mix(in srgb, ${color} 65%, transparent)` } : undefined}
      className="relative grid size-[18px] place-items-center rounded-[5px] border border-changed/60 bg-panel"
    >
      <Layers style={color ? { color } : undefined} className="size-[11px] text-changed" />
      <span className="absolute -top-1.5 -right-2 rounded-full bg-slate-600 px-1 text-[9px] leading-[13px] font-semibold text-slate-100 tabular-nums">{count}</span>
    </span>
  );
}

type Row =
  | { kind: "item"; item: TrailItem; i: number; firstOfRun: string | null }
  | { kind: "fold"; run: TrailItem[]; last: boolean };

/**
 * The trail's rows: runs of at least [`FOLD_FROM`] snapshots without a commit between them become
 * one row, if `folded` says so for the run; the first row of an opened run carries the run's key,
 * so it can be folded again.
 */
function foldRuns(items: TrailItem[], folded: (run: TrailItem[]) => boolean): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < items.length) {
    let end = i;
    while (end < items.length && items[end].kind === "snapshot") end++;
    const run = items.slice(i, end);
    if (run.length >= FOLD_FROM) {
      const key = (run[0] as { snapshot: Snapshot }).snapshot.hash;
      if (folded(run)) {
        rows.push({ kind: "fold", run, last: end === items.length });
      } else {
        run.forEach((item, k) => rows.push({ kind: "item", item, i: i + k, firstOfRun: k === 0 ? key : null }));
      }
      i = end;
    } else {
      rows.push({ kind: "item", item: items[i], i, firstOfRun: null });
      i++;
    }
  }
  return rows;
}
