import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Search, SquareTerminal, X } from "lucide-react";
import type { GitRun } from "../backend";
import { LOCALE } from "./Trail";
import { t } from "../i18n";

type Show = "all" | "changes";
const SHOW_KEY = "codedeck.gitlog.show";

/** One row: a command, or the same read command run in several repositories at once. */
interface Group {
  key: number;
  runs: GitRun[];
}

/** The same read in several repos within this time is one row (e.g. the history of all repos). */
const ROUND_MS = 2000;

/** A run as plain text, the way a terminal would have shown it. */
function runText(run: GitRun): string {
  const time = new Date(run.at).toLocaleTimeString(LOCALE);
  const end = run.code === null ? "did not run to the end" : `exit code ${run.code}`;
  return `[${time}] ${run.repo}\n$ ${run.command}\n${run.output.trimEnd()}${run.output.trim() ? "\n" : ""}(${end} · ${run.ms} ms)`;
}

/** Copies and says so on the button for a moment. */
function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    });
  };
  return [done, copy];
}

function group(runs: GitRun[]): Group[] {
  const groups: Group[] = [];
  for (const run of runs) {
    const last = groups.at(-1);
    const head = last?.runs[0];
    if (head && !run.changes && !head.changes && head.command === run.command && run.at - head.at < ROUND_MS) {
      last.runs.push(run);
    } else {
      groups.push({ key: run.id, runs: [run] });
    }
  }
  return groups;
}

/**
 * Every git command CodeDeck ran, with what git printed: newest at the bottom like a terminal.
 * Commands that changed something stand out. The status check that runs every few seconds is
 * left out unless it fails; reads of the same command in several repos at once share a row.
 */
export function GitLog({ runs, onClose }: { runs: GitRun[]; onClose: () => void }) {
  const [show, setShowState] = useState<Show>(() => {
    try {
      return localStorage.getItem(SHOW_KEY) === "changes" ? "changes" : "all";
    } catch {
      return "all";
    }
  });
  const setShow = (s: Show) => {
    setShowState(s);
    try {
      localStorage.setItem(SHOW_KEY, s);
    } catch {
      // Remembering is a convenience only
    }
  };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = runs.filter(
      (r) =>
        (show === "all" || r.changes) &&
        (!q || r.command.toLowerCase().includes(q) || r.repo.toLowerCase().includes(q) || r.output.toLowerCase().includes(q)),
    );
    return group(shown);
  }, [runs, show, query]);
  const actions = runs.filter((r) => r.changes).length;
  const [copiedAll, copyAll] = useCopy();

  // Stays at the bottom while new commands arrive, unless one scrolled up to read
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    if (atBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (key: number, failed: boolean) =>
    setOpen((o) => {
      const next = new Set(o);
      // Failed ones start open; their key is stored negated when closed
      const id = failed ? -key : key;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const isOpen = (g: Group) => {
    const failed = g.runs.some((r) => !r.ok);
    return failed ? !open.has(-g.key) : open.has(g.key);
  };

  return (
    <section
      aria-label={t("Git commands")}
      className="surface-overlay fixed inset-x-2 bottom-7 z-30 flex h-[45vh] min-h-56 flex-col rounded-lg"
    >
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-overlay-line px-3">
        <SquareTerminal className="size-4 text-slate-400" />
        <span className="font-semibold text-slate-100">{t("Git commands")}</span>
        <span className="text-[12px] text-slate-500">
          {t("{n} run here · {changes} changed something", { n: runs.length, changes: actions })}
        </span>
        <div className="ml-auto flex rounded-md border border-overlay-line p-0.5 text-[12px]" role="radiogroup">
          {(
            [
              ["all", "All", "Every command, reading ones included. The status check every few seconds only appears when it fails"],
              ["changes", "Actions", "Only what changed something: add, commit, push, pull, fetch, restore…"],
            ] as const
          ).map(([value, label, says]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={show === value}
              title={t(says)}
              onClick={() => setShow(value)}
              className={`rounded px-2 py-0.5 ${show === value ? "bg-overlay-hover text-slate-100" : "text-slate-500 hover:text-slate-200"}`}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <label className="flex w-56 items-center gap-1.5 rounded-md border border-overlay-line bg-base px-2 py-0.5 focus-within:border-slate-500">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Filter command, repo, output")}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
        <button
          type="button"
          disabled={groups.length === 0}
          onClick={() => copyAll(groups.flatMap((g) => g.runs).map(runText).join("\n\n"))}
          title={t("Copy what is shown, commands and output, as text")}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-slate-400 hover:bg-overlay-hover hover:text-slate-100 disabled:opacity-40"
        >
          {copiedAll ? <Check className="size-3.5 text-added" /> : <Copy className="size-3.5" />}
          {copiedAll ? t("Copied") : t("Copy")}
        </button>
        <button
          type="button"
          onClick={onClose}
          title={t("Close (Esc)")}
          aria-label={t("Close")}
          className="rounded p-1 text-slate-400 hover:bg-overlay-hover hover:text-slate-100"
        >
          <X className="size-4" />
        </button>
      </header>

      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="selectable min-h-0 flex-1 overflow-y-auto py-1 font-mono text-[12px]"
      >
        {groups.length === 0 && (
          <p className="px-4 py-3 font-sans text-slate-500">
            {runs.length === 0 ? t("No git command ran yet.") : t("Nothing matches.")}
          </p>
        )}
        {groups.map((g) => (
          <Entry key={g.key} group={g} open={isOpen(g)} onToggle={() => toggle(g.key, g.runs.some((r) => !r.ok))} />
        ))}
      </div>
    </section>
  );
}

function Entry({ group, open, onToggle }: { group: Group; open: boolean; onToggle: () => void }) {
  const first = group.runs[0];
  const failed = group.runs.filter((r) => !r.ok);
  const ms = Math.max(...group.runs.map((r) => r.ms));
  const Chevron = open ? ChevronDown : ChevronRight;
  const repos = group.runs.length > 1 ? `${group.runs.length} repos` : first.repo;
  const [copied, copy] = useCopy();

  return (
    <div className={open ? "bg-base/40" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-2 px-3 text-left hover:bg-overlay-hover"
      >
        <Chevron className="size-3.5 shrink-0 text-slate-500" />
        <span className="w-[62px] shrink-0 text-[11px] text-slate-500 tabular-nums">
          {new Date(first.at).toLocaleTimeString(LOCALE)}
        </span>
        {failed.length ? (
          <X className="size-3.5 shrink-0 text-problem" aria-label={t("failed")} />
        ) : (
          <Check className={`size-3.5 shrink-0 ${first.changes ? "text-added" : "text-slate-600"}`} aria-label={t("ok")} />
        )}
        <span className="w-28 shrink-0 truncate font-sans text-[12px] text-slate-400" title={group.runs.map((r) => r.repo).join(", ")}>
          {repos}
        </span>
        <span className={`min-w-0 flex-1 truncate ${first.changes ? "font-semibold text-slate-100" : "text-slate-400"}`}>
          {first.command}
        </span>
        {failed.length > 0 && group.runs.length > 1 && (
          <span className="shrink-0 font-sans text-[11px] text-problem">{t("{n} failed", { n: failed.length })}</span>
        )}
        <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{ms} ms</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 pt-1 pr-3 pb-3 pl-[104px]">
          {group.runs.map((run) => (
            <div key={run.id}>
              {group.runs.length > 1 && (
                <div className="mb-0.5 font-sans text-[11px] text-slate-400">
                  {run.repo}
                  {!run.ok && <span className="text-problem"> · {t("failed")}</span>}
                </div>
              )}
              {group.runs.length === 1 && (
                <div className="mb-1 text-slate-300 break-all whitespace-pre-wrap">
                  <span className="text-slate-600">$ </span>
                  {run.command}
                </div>
              )}
              <pre
                className={`max-h-72 overflow-auto rounded-md border border-overlay-line bg-base px-2.5 py-1.5 whitespace-pre-wrap ${
                  run.ok ? "text-slate-300" : "text-problem"
                }`}
              >
                {run.output.trimEnd() || <span className="font-sans text-slate-500 italic">{t("No output")}</span>}
              </pre>
              <div className="mt-0.5 flex items-center gap-2 font-sans text-[11px] text-slate-500">
                <span>
                  {run.code === null ? t("did not run to the end") : t("exit code {code}", { code: run.code })} · {run.ms} ms
                </span>
                <button
                  type="button"
                  onClick={() => copy(runText(run))}
                  title={t("Copy command and output")}
                  className="flex items-center gap-1 rounded px-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-200"
                >
                  {copied ? <Check className="size-3 text-added" /> : <Copy className="size-3" />}
                  {copied ? t("Copied") : t("Copy")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
