import { useEffect, useState } from "react";
import { Eye, FileText, SquarePen } from "lucide-react";
import { openFile, type AssistantState, type Snapshot } from "../../backend";
import { shortId, touchedFiles, useSessionMarks } from "../../assistant";
import type { GitView } from "../../git";
import { Document, Row, Rows, Section } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { LOCALE } from "../Trail";
import { Tooltip, ToolTipBody } from "../Tooltip";
import { plural, snapshotLabel, t } from "../../i18n";
import { lanesOf, spanOf, useJournal } from "../../timeline";

const clock = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

/** The current time, moved on every half minute so that "now" on the timeline keeps up. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * What are the sessions doing? When each worked and waited today, how safe the work is, and the
 * documents they wrote: the results of their work, to read first.
 */
export function ActivityView({ assistant, git, snapshots }: { assistant: AssistantState; git: GitView; snapshots: Snapshot[] }) {
  const marks = useSessionMarks();
  const docs = recentDocs(assistant);
  const button = "rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100";
  return (
    <div className="flex min-h-full flex-col">
      <Today assistant={assistant} snapshots={snapshots} />
      <Safety git={git} anchors={snapshots.length} />
      <Section title={t("Documents written")} note={t("last 24 hours")}>
        {docs.length === 0 ? (
          <p>{t("None yet. Documents a session writes in this project show up here, to read first.")}</p>
        ) : (
          <Rows>
            {docs.map(([path, at]) => {
              const mark = marks.of(marks.writer(path));
              return (
                <Row key={path}>
                  <FileText className="size-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{path}</span>
                  {mark && <SessionBadge mark={mark} />}
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Tooltip content={<span>{t("View")}</span>}>
                    <button type="button" aria-label={t("View {path}", { path })} onClick={() => openFile(path, "view")} className={button}>
                      <Eye className="size-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip content={<span>{t("Edit, e.g. to add comments for the assistant")}</span>}>
                    <button type="button" aria-label={t("Edit {path}", { path })} onClick={() => openFile(path, "edit")} className={button}>
                      <SquarePen className="size-3.5" />
                    </button>
                  </Tooltip>
                </Row>
              );
            })}
          </Rows>
        )}
      </Section>
    </div>
  );
}

const DOC_TYPES = /\.(md|markdown|html?|txt|adoc|rst)$/i;
/** How far back "recently" goes. */
const RECENT_DOCS_MS = 24 * 3600_000;

function recentDocs(state: AssistantState): [string, number][] {
  const since = Date.now() - RECENT_DOCS_MS;
  return [...touchedFiles(state)].filter(([path, at]) => DOC_TYPES.test(path) && at > since).sort((a, b) => b[1] - a[1]);
}

/** The legend of the timeline: what a block, a tick and the line mean. */
function Legend() {
  const swatch = "inline-block h-2 w-3.5 rounded-[3px]";
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
      <span className="flex items-center gap-1.5"><span className={`${swatch} bg-ai`} />{t("working")}</span>
      <span className="flex items-center gap-1.5"><span className={`${swatch} bg-changed`} />{t("waiting for you")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-0.5 bg-slate-50" />{t("anchor")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-0.5 bg-brand" />{t("now")}</span>
    </span>
  );
}

/** One row per session: when it worked, when it waited for you, where its anchors are. */
function Today({ assistant, snapshots }: { assistant: AssistantState; snapshots: Snapshot[] }) {
  const marks = useSessionMarks();
  const lines = useJournal(assistant);
  const now = useNow();
  const lanes = lanesOf(lines, assistant.sessions, now);
  const span = spanOf(lanes, now);
  const at = (ms: number) => `${(Math.min(Math.max(ms - span.from, 0), span.to - span.from) / (span.to - span.from)) * 100}%`;
  const width = (from: number, to: number) => `${(Math.max(to - from, 0) / (span.to - span.from)) * 100}%`;
  const nameOf = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  return (
    <Section title={t("Today")} note={t("what each session did, and when")} aside={<Legend />}>
      {lanes.length === 0 ? (
        <p>{t("No session has done anything today yet. Each one that works shows up here, with the time it worked and the time it waited for you.")}</p>
      ) : (
        <Document className="p-3">
          <div className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-y-1.5">
            <div />
            <div className="relative h-4 text-[11px] text-slate-500">
              {span.ticks.map((tick) => (
                <span key={tick} className="absolute top-0 -translate-x-1/2 tabular-nums" style={{ left: at(tick) }}>
                  {clock(tick)}
                </span>
              ))}
            </div>
            {lanes.map((lane) => {
              const mark = marks.of(lane.session);
              return (
                <LaneRow
                  key={lane.session}
                  label={
                    <>
                      <div className="flex items-center gap-1.5">
                        {mark && <SessionBadge mark={mark} />}
                        <span className="truncate text-slate-200">{nameOf(lane.session)}</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {plural(lane.turns, "turn")} · {clock(lane.last)}
                      </div>
                    </>
                  }
                >
                  {lane.blocks.map((b) => (
                    <div key={b.from} className="absolute top-[9px] h-3" style={{ left: at(b.from), width: `max(5px, ${width(b.from, b.to)})` }}>
                      <Tooltip
                        className="block size-full"
                        content={
                          <ToolTipBody
                            label={b.phase === "working" ? t("Working") : t("Waiting for you")}
                            says={`${clock(b.from)}–${b.to >= now - 60_000 && assistant.sessions.find((s) => s.id === lane.session)?.status !== "idle" ? t("now") : clock(b.to)}${b.text ? ` · ${b.text}` : ""}`}
                          />
                        }
                      >
                        <span className={`block size-full rounded ${b.phase === "working" ? "bg-ai" : "bg-changed"}`} />
                      </Tooltip>
                    </div>
                  ))}
                  {snapshots
                    .filter((s) => s.session === lane.session && s.at * 1000 >= span.from && !s.back)
                    .map((s) => (
                      <div key={s.hash} className="absolute top-1 h-[22px] w-2 -translate-x-1/2" style={{ left: at(s.at * 1000) }}>
                        <Tooltip className="flex size-full justify-center" content={<ToolTipBody label={t("Anchor")} says={`${clock(s.at * 1000)} · ${snapshotLabel(s.label)}`} />}>
                          <span className="h-full w-0.5 bg-slate-50" />
                        </Tooltip>
                      </div>
                    ))}
                  <span className="absolute inset-y-0 w-0.5 bg-brand" style={{ left: at(now) }} />
                </LaneRow>
              );
            })}
          </div>
        </Document>
      )}
    </Section>
  );
}

function LaneRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="min-w-0 pr-2.5">{label}</div>
      <div className="relative h-[30px] rounded-md bg-base">{children}</div>
    </>
  );
}

/** What is at risk if the machine fails now: the same three lines as the trail's colours. */
function Safety({ git, anchors }: { git: GitView; anchors: number }) {
  const ahead = git.repos.reduce((n, r) => n + r.ahead, 0);
  const remote = git.repos.some((r) => r.remotes.length > 0);
  const row = (line: string, label: string, value: string) => (
    <div className="flex items-center gap-2.5">
      <span className={`w-5 shrink-0 border-t-2 ${line}`} />
      <span className="flex-1">{label}</span>
      <span className="font-semibold text-slate-100 tabular-nums">{value}</span>
    </div>
  );
  return (
    <Section title={t("How safe is your work")}>
      <div className="flex max-w-md flex-col gap-1.5">
        {row("border-changed", t("Not committed"), plural(git.changed, "file"))}
        {row("border-dashed border-changed", t("Committed, only on this machine"), remote ? plural(ahead, "commit") : "–")}
        {row("border-slate-500", t("Anchors to go back to"), String(anchors))}
        <p className="mt-1 text-[12px]">
          {git.changed > 0
            ? t("Uncommitted work exists only in your folder and in the anchors.")
            : ahead > 0
              ? t("Committed work is not on the remote yet.")
              : !remote
                ? t("There is no remote to push to: everything stays on this machine.")
                : t("Nothing is at risk.")}
        </p>
      </div>
    </Section>
  );
}
