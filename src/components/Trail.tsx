import { useEffect, useRef, useState } from "react";
import { CircleDot, GitMerge, Sparkles } from "lucide-react";
import type { RepoStatus } from "../backend";
import type { TrailCommit } from "../history";

/** What the deck shows: the uncommitted state, or one commit. */
export type Point = { kind: "now" } | { kind: "commit"; repo: string; hash: string };

interface Props {
  commits: TrailCommit[];
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
export function Trail({ commits, repos, point, onSelect, focusRepo }: Props) {
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
        <ol className="relative py-2 before:absolute before:top-4 before:bottom-4 before:right-[22px] before:w-px before:bg-line">
          <li>
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
              files={uncommitted}
              title={
                uncommitted
                  ? `Uncommitted changes${several ? ` in ${dirtyRepos} repo${dirtyRepos === 1 ? "" : "s"}` : ""}`
                  : "Nothing uncommitted: the working tree matches the last commit"
              }
            />
          </li>

          {commits.map(({ repo, commit }) => {
            const day = dayLabel(commit.at);
            const showDay = day !== lastDay;
            lastDay = day;
            const selected = point.kind === "commit" && point.repo === repo && point.hash === commit.hash;
            const dimmed = focusRepo !== null && repo !== focusRepo;
            return (
              <li key={`${repo}:${commit.hash}`} className={dimmed ? "opacity-35" : ""}>
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
                <TrailRow
                  open={open}
                  selected={selected}
                  onClick={() => onSelect({ kind: "commit", repo, hash: commit.hash })}
                  dot={<CommitDot commit={commit} selected={selected} />}
                  time={clock(commit.at)}
                  files={commit.files}
                  title={commit.subject}
                />
              </li>
            );
          })}
        </ol>
        {commits.length === 0 && open && (
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
  files: number;
  title: string;
}) {
  return (
    <button
      type="button"
      aria-current={props.selected}
      aria-label={props.title}
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
            <span className="text-slate-300">{props.time}</span>
            <span className="text-slate-500">
              {props.files} file{props.files === 1 ? "" : "s"}
            </span>
          </span>
          <span
            className={`line-clamp-2 min-w-0 flex-1 pr-3 pl-4 text-[12px] leading-[15px] ${
              props.selected ? "text-slate-50" : "text-slate-200"
            }`}
          >
            {props.title}
          </span>
        </>
      )}
    </button>
  );
}

/** Assistant commits carry a spark; commits not yet pushed have a dashed ring. */
function CommitDot({ commit, selected }: { commit: TrailCommit["commit"]; selected: boolean }) {
  const ring = selected
    ? "border-brand bg-brand/25"
    : commit.unpushed
      ? "border-dashed border-slate-400 bg-panel"
      : "border-transparent bg-transparent";
  return (
    <span className={`grid size-[18px] place-items-center rounded-full border ${ring}`}>
      {commit.assistant ? (
        <Sparkles className="size-3 text-ai" />
      ) : commit.merge ? (
        <GitMerge className="size-3 text-slate-400" />
      ) : (
        <span className={`size-[7px] rounded-full ${selected ? "bg-brand-soft" : "bg-slate-400"}`} />
      )}
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
