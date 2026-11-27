import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleDot, Layers, Lightbulb, ListChecks, Map as MapIcon, Paperclip } from "lucide-react";
import { openFile, type Plan, type PlanEntry, type PlanStage, type PlanState } from "../../backend";
import { currentStage, planItems, planKey, stageWord, stepItem, type PlanItem } from "../../plan";
import { useAttachEnabled } from "../../attachments";
import { useConnections } from "../../assistant";
import { plural, t } from "../../i18n";
import { Tooltip } from "../Tooltip";

const DOT: Record<PlanState, string> = { done: "bg-added", active: "bg-changed", open: "bg-slate-700" };
const STATE_ICON: Record<PlanState, ReactNode> = {
  done: <CircleCheck className="size-3.5 text-added" />,
  active: <CircleDot className="size-3.5 text-changed" />,
  open: <CircleDashed className="size-3.5 text-slate-500" />,
};

type Open = "steps" | "stages" | "tasks" | "ideas" | null;

/**
 * The plan at the top of the Workbench (roadmap U8.3): what the project's planning files say. The
 * stage being worked on with its steps as dots and the next step, which goes to the next prompt with
 * one click; below, in one line, the other stages in progress, the open points and tasks and the
 * ideas, each opening its list. The one surface of the view (docs/UMSETZUNG.md "U8 und U9"); there
 * only when the project has a planning file.
 */
export function PlanTile({ plan }: { plan: Plan | null }) {
  const [open, setOpen] = useState<Open>(null);
  const attached = planItems.use();
  const enabled = useAttachEnabled();
  const { connected } = useConnections();
  const canAttach = enabled && connected;
  if (!plan || (!plan.roadmap && !plan.tasks && !plan.ideas)) return null;

  const { roadmap, tasks, ideas } = plan;
  const current = currentStage(plan);
  const others = (roadmap?.stages ?? []).filter((s) => s.state === "active" && s !== current?.stage);
  const toggle = (which: Open) => setOpen(open === which ? null : which);
  const isAttached = (item: PlanItem) => attached.some((a) => planKey(a) === planKey(item));
  const counts = current ? (["done", "active", "open"] as PlanState[]).map((s) => [s, current.stage.steps.filter((x) => x.state === s).length] as const) : [];
  const openTasks = (tasks?.questions.length ?? 0) + (tasks?.tasks.length ?? 0);

  return (
    <section data-tour="plan" className="mx-4 mt-4 rounded-lg bg-raised/50 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
        <MapIcon className="size-3.5" /> {t("Plan")}
        {roadmap ? (
          <button type="button" onClick={() => void openFile(roadmap.path, "view")} className="action-text font-normal tracking-normal normal-case">
            {roadmap.asOf ? t("from {file} · as of {date}", { file: roadmap.path, date: roadmap.asOf }) : t("from {file}", { file: roadmap.path })}
          </button>
        ) : (
          (tasks ?? ideas) && (
            <button type="button" onClick={() => void openFile((tasks ?? ideas)!.path, "view")} className="action-text font-normal tracking-normal normal-case">
              {t("from {file}", { file: (tasks ?? ideas)!.path })}
            </button>
          )
        )}
      </div>

      {current ? (
        <>
          <div className="mt-2 flex min-w-0 items-baseline gap-2">
            <button type="button" onClick={() => void openFile(roadmap!.path, "view", current.stage.line)} className="action-text truncate text-left text-[15px] font-semibold text-slate-100">
              {[current.stage.id, current.stage.title].filter(Boolean).join(" · ")}
            </button>
            <span className="shrink-0 text-[12px] text-slate-500">{stageWord(current.stage.state)}</span>
          </div>
          {current.stage.steps.length > 0 && (
            <button type="button" onClick={() => toggle("steps")} className="action-text group mt-1.5 flex flex-wrap items-center gap-1 text-left" aria-expanded={open === "steps"}>
              {/* One dot per step, in the order of the file; each says which step it is */}
              {current.stage.steps.map((s) => (
                <Tooltip key={s.line} content={<StepTip step={s} />} className="flex">
                  <span className={`size-2 rounded-full ${DOT[s.state]}`} />
                </Tooltip>
              ))}
              {/* The counts are the legend: each with a dot in its colour */}
              <span className="ml-2 flex items-center gap-2.5 text-[12px] text-slate-500 group-hover:text-slate-100 group-aria-expanded:text-slate-100">
                {counts
                  .filter(([, n]) => n > 0)
                  .map(([s, n]) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className={`size-1.5 rounded-full ${DOT[s]}`} />
                      {n} {stateWord(s)}
                    </span>
                  ))}
              </span>
              {open === "steps" ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          )}
          {open === "steps" && (
            <ul className="mt-1.5">
              {current.stage.steps.map((s) => (
                <EntryRow key={s.line} entry={s} path={roadmap!.path} icon={STATE_ICON[s.state]} item={s.state === "done" ? null : stepItem(roadmap!.path, current.stage, s)} attached={isAttached} canAttach={canAttach} />
              ))}
            </ul>
          )}
          {current.next && open !== "steps" && (
            <NextStep text={current.next.text} item={stepItem(roadmap!.path, current.stage, current.next)} attached={isAttached} canAttach={canAttach} />
          )}
        </>
      ) : roadmap ? (
        <p className="mt-2 text-[13px] text-slate-400">{roadmap.stages.length ? t("Every stage of the roadmap is done.") : t("The roadmap has no stages yet.")}</p>
      ) : (
        <LooseCards plan={plan} attached={isAttached} canAttach={canAttach} />
      )}

      <div className={`${roadmap ? "mt-3" : "mt-2"} flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-500`}>
        {others.length > 0 && (
          <button type="button" onClick={() => toggle("stages")} aria-expanded={open === "stages"} className="action-text flex items-center gap-1">
            <Layers className="size-3.5" />
            {t("Also in progress: {stages}", { stages: plural(others.length, "stage") })}
          </button>
        )}
        {tasks && (
          <button type="button" onClick={() => toggle("tasks")} aria-expanded={open === "tasks"} className="action-text flex items-center gap-1">
            <ListChecks className="size-3.5" />
            {openTasks === 0
              ? t("TODO: nothing open")
              : `TODO: ${[tasks.questions.length > 0 && plural(tasks.questions.length, "open question"), tasks.tasks.length > 0 && plural(tasks.tasks.length, "task")].filter(Boolean).join(" · ")}`}
          </button>
        )}
        {ideas && ideas.ideas.length > 0 && (
          <button type="button" onClick={() => toggle("ideas")} aria-expanded={open === "ideas"} className="action-text flex items-center gap-1">
            <Lightbulb className="size-3.5" /> {plural(ideas.ideas.length, "idea")}
          </button>
        )}
      </div>

      {open === "tasks" && tasks && (
        <div className="mt-2">
          {tasks.questions.length > 0 && <Heading>{t("Open points")}</Heading>}
          <ul>
            {tasks.questions.map((e) => (
              <EntryRow key={e.line} entry={e} path={tasks.path} icon={<CircleDashed className="size-3.5 text-slate-500" />} item={{ kind: "question", path: tasks.path, line: e.line, text: e.text }} attached={isAttached} canAttach={canAttach} />
            ))}
          </ul>
          {tasks.tasks.length > 0 && <Heading>{t("Planned tasks")}</Heading>}
          <ul>
            {tasks.tasks.map((e) => (
              <EntryRow key={e.line} entry={e} path={tasks.path} icon={STATE_ICON[e.state]} item={{ kind: "task", path: tasks.path, line: e.line, text: e.text }} attached={isAttached} canAttach={canAttach} />
            ))}
          </ul>
        </div>
      )}
      {open === "stages" && roadmap && (
        <div className="mt-2">
          <Heading>{t("Other stages in progress")}</Heading>
          <ul>
            {/* Real work first, then what only waits for a practical test */}
            {[...others]
              .sort((a, b) => Number(onlyTestLeft(a)) - Number(onlyTestLeft(b)))
              .map((stage) => {
                const next = stage.steps.find((x) => x.state !== "done");
                const waits = onlyTestLeft(stage);
                return (
                  <li key={stage.line} className="flex min-h-8 items-start gap-2 py-0.5">
                    <span className="w-12 shrink-0 pt-px font-mono text-[11px] text-slate-500">{stage.id}</span>
                    <Tooltip content={next ? <StepTip step={next} path={roadmap.path} /> : <span>{stage.title}</span>} className="flex min-w-0 flex-1">
                      <button type="button" onClick={() => void openFile(roadmap.path, "view", stage.line)} className="action-text min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px] text-slate-200">{stage.title}</span>
                        <span className="block truncate text-[11px] text-slate-500">{waits ? t("only the practical test is left") : next ? t("next: {step}", { step: next.text }) : t("no open steps")}</span>
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
      {open === "ideas" && ideas && (
        <div className="mt-2">
          <Heading>{t("Ideas: drafts, nothing is built without your approval")}</Heading>
          <ul>
            {ideas.ideas.map((e) => (
              <EntryRow key={e.line} entry={e} path={ideas.path} icon={<Lightbulb className="size-3.5 text-slate-500" />} item={null} attached={isAttached} canAttach={false} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** How many entries of a TODO or IDEAS file show as cards when there is no roadmap. */
const CARDS = 3;

/**
 * Without a roadmap the plan shows the next entries of the TODO file (planned tasks first, then open
 * points), or, with no TODO either, the first ideas: as small cards side by side, as wide as there
 * is room. Cards, not a line of dots and a "next": these entries do not build on each other as the
 * steps of a stage do (user, 2026-11-27).
 */
function LooseCards({ plan, attached, canAttach }: { plan: Plan; attached: (i: PlanItem) => boolean; canAttach: boolean }) {
  const { tasks, ideas } = plan;
  type Card = { entry: PlanEntry; path: string; kind: "task" | "question" | "idea" };
  const cards: Card[] = tasks
    ? [...tasks.tasks.map((entry) => ({ entry, path: tasks.path, kind: "task" as const })), ...tasks.questions.map((entry) => ({ entry, path: tasks.path, kind: "question" as const }))]
    : (ideas?.ideas ?? []).map((entry) => ({ entry, path: ideas!.path, kind: "idea" as const }));
  if (cards.length === 0) return <p className="mt-2 text-[13px] text-slate-400">{tasks ? t("Nothing open in the TODO file.") : t("No ideas written down yet.")}</p>;
  const word = { task: t("Task"), question: t("Open point"), idea: t("Idea") };
  const Icon = { task: ListChecks, question: CircleDashed, idea: Lightbulb };
  return (
    <>
      <div className="mt-2 mb-1.5 text-[11px] font-medium tracking-wide text-brand-soft uppercase">{tasks ? t("Next from the TODO file") : t("Ideas: drafts, nothing is built without your approval")}</div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
        {cards.slice(0, CARDS).map(({ entry, path, kind }) => {
          const K = Icon[kind];
          const item: PlanItem | null = kind === "idea" ? null : { kind, path, line: entry.line, text: entry.text };
          return (
            <li key={`${kind}${entry.line}`} className="group flex min-w-0 flex-col rounded-md bg-brand/[0.07] px-2.5 py-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                <K className="size-3.5 text-brand-soft" />
                <span>{word[kind]}</span>
                {item && (
                  <span className="ml-auto">
                    <Clip item={item} attached={attached} canAttach={canAttach} />
                  </span>
                )}
              </div>
              <button type="button" onClick={() => void openFile(path, "view", entry.line)} title={`${path}:${entry.line}`} className="action-text block text-left">
                <span className="line-clamp-3 text-[13px] leading-snug text-slate-100">{entry.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h4 className="mt-1.5 mb-0.5 text-[11px] font-medium text-slate-500">{children}</h4>;
}

/** The paperclip: on hover, staying lit once attached, as everywhere. */
function Clip({ item, attached, canAttach, label }: { item: PlanItem; attached: (i: PlanItem) => boolean; canAttach: boolean; label?: string }) {
  if (!canAttach) return null;
  const on = attached(item);
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? t("Remove from next prompt") : t("Attach to next prompt")}
      onClick={() => planItems.toggle([item])}
      // With a label it is text to click like the others (`action-text`); bare, the paperclip of a row
      className={
        label
          ? `action-text flex shrink-0 items-center gap-1 text-[12px] whitespace-nowrap ${on ? "text-brand-soft" : "text-slate-300"}`
          : `flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-raised ${on ? "text-brand-soft" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-100 focus:opacity-100"}`
      }
    >
      <Paperclip className="size-3.5" />
      {label && (on ? t("Attached") : label)}
    </button>
  );
}

/**
 * The next step: what the plan is for, so it has room. Up to three lines, on a faint surface in the
 * accent colour inside the plan's own, so it stands out without a line or a frame of its own.
 */
function NextStep({ text, item, attached, canAttach }: { text: string; item: PlanItem; attached: (i: PlanItem) => boolean; canAttach: boolean }) {
  return (
    <div className="mt-3 flex items-start gap-3 rounded-md bg-brand/[0.07] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[11px] font-medium tracking-wide text-brand-soft uppercase">{t("Next")}</div>
        <button type="button" onClick={() => void openFile(item.path, "view", item.line)} title={`${item.path}:${item.line}`} className="action-text block text-left">
          <span className="line-clamp-3 text-[14px] leading-snug text-slate-100">{text}</span>
        </button>
      </div>
      <span className="shrink-0 pt-4">
        <Clip item={item} attached={attached} canAttach={canAttach} label={t("For the next prompt")} />
      </span>
    </div>
  );
}

/**
 * A stage whose open steps are all practical tests: built, waiting for the user to try it. Told in
 * words, not by a status or colour of its own (user, 2026-11-27: simple is better); the convention
 * stays as it is, and testing several steps at once changes nothing.
 */
function onlyTestLeft(stage: PlanStage): boolean {
  const left = stage.steps.filter((x) => x.state !== "done");
  return left.length > 0 && left.every((x) => /praxistest|practical test|manual test/i.test(x.text));
}

const stateWord = (s: PlanState) => (s === "done" ? t("done") : s === "active" ? t("in progress") : t("open"));

/** What a step is, for the tooltip of its dot or line: its whole text, its state, where it stands. */
function StepTip({ step, path }: { step: PlanEntry; path?: string }) {
  return (
    <span className="flex max-w-96 flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`size-2 rounded-full ${DOT[step.state]}`} />
        {stateWord(step.state)}
        {path && <span className="font-mono">· {path}:{step.line}</span>}
      </span>
      <span>{step.text}</span>
    </span>
  );
}

function EntryRow({ entry, path, icon, item, attached, canAttach }: { entry: PlanEntry; path: string; icon: ReactNode; item: PlanItem | null; attached: (i: PlanItem) => boolean; canAttach: boolean }) {
  return (
    <li className="group flex min-h-7 items-start gap-2 py-0.5">
      <Tooltip content={<span>{stateWord(entry.state)}</span>} className="flex shrink-0 pt-0.5">
        {icon}
      </Tooltip>
      <Tooltip content={<StepTip step={entry} path={path} />} className="flex min-w-0 flex-1">
        <button
          type="button"
          onClick={() => void openFile(path, "view", entry.line)}
          className={`action-text min-w-0 flex-1 text-left text-[13px] leading-snug ${entry.state === "done" ? "text-slate-500" : "text-slate-300"}`}
        >
          <span className="line-clamp-2">{entry.text}</span>
        </button>
      </Tooltip>
      {item && <Clip item={item} attached={attached} canAttach={canAttach} />}
    </li>
  );
}
