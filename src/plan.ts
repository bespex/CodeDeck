// The plan of a project (roadmap U8.3): what its planning files say, read by the backend
// (`guides.rs`), and entries of it attached to the next prompt (one part, see `attachments.ts`).
// The text the AI gets is English and not translated, like every attachment.

import { useEffect, useState } from "react";
import { guidePlan, onFsChanged, onSettingsChanged, type Plan, type PlanEntry, type PlanStage } from "./backend";
import { createPart } from "./attachments";
import { onGuidesReread } from "./guides";
import { plural, t } from "./i18n";

/** The part of the attachments that entries of the plan make. */
export const PLAN_KEY = "plan";

/** An entry of a planning file attached to the next prompt. */
export interface PlanItem {
  kind: "step" | "task" | "question";
  path: string;
  line: number;
  text: string;
  /** For a step: its stage, e.g. `M2 Limits per client` */
  stage?: string;
}

/** Lines move when a file is edited: an entry is known by file, kind and text. */
export const planKey = (i: Pick<PlanItem, "path" | "kind" | "text">) => `${i.path}\u0000${i.kind}\u0000${i.text}`;

const KIND_WORD: Record<PlanItem["kind"], string> = { step: "roadmap step", task: "task", question: "open question" };

function planText(items: PlanItem[]): string {
  return [
    "These entries of the project's planning files go with this prompt. Work on a roadmap step or a task as it says; for an open question, help me decide before anything is built. When one is done, update its file as the project's rules say.",
    "",
    ...items.map((i) => `- ${KIND_WORD[i.kind]}, ${i.path}:${i.line}${i.stage ? ` (stage ${i.stage})` : ""}: ${i.text}`),
  ].join("\n");
}

function planLabel(items: PlanItem[]): string {
  return items.length === 1 ? items[0].text : plural(items.length, "plan entry", "plan entries");
}

export const planItems = createPart<PlanItem>(PLAN_KEY, { id: planKey, text: planText, label: planLabel });

/** A step of a stage as an attachment. */
export const stepItem = (path: string, stage: PlanStage, step: PlanEntry): PlanItem => ({
  kind: "step",
  path,
  line: step.line,
  text: step.text,
  stage: [stage.id, stage.title].filter(Boolean).join(" "),
});

/**
 * The stage to show: the first being worked on, else the first open one; its next step is the first
 * open one, else the first being worked on.
 */
export function currentStage(plan: Plan): { stage: PlanStage; next: PlanEntry | null } | null {
  const stages = plan.roadmap?.stages ?? [];
  const stage = stages.find((s) => s.state === "active") ?? stages.find((s) => s.state === "open");
  if (!stage) return null;
  const next = stage.steps.find((s) => s.state === "open") ?? stage.steps.find((s) => s.state === "active") ?? null;
  return { stage, next };
}

const EMPTY: Plan = { roadmap: null, tasks: null, ideas: null };

/** The plan of the project in this window; read again when one of its files or a setting changes. */
export function usePlan(project: string | undefined): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    setPlan(null);
    if (!project) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = () =>
      void guidePlan()
        .then((p) => alive && setPlan((old) => (JSON.stringify(old) === JSON.stringify(p) ? old : p)))
        .catch(() => alive && setPlan(EMPTY));
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 500);
    };
    read();
    // Markdown only: another planning file may have come, or the known ones were edited
    const stopFs = onFsChanged((change) => change.paths.some((p) => p.toLowerCase().endsWith(".md")) && later());
    const stopSettings = onSettingsChanged(later);
    const stopGuides = onGuidesReread(read);
    return () => {
      alive = false;
      stopGuides();
      clearTimeout(timer);
      stopFs();
      stopSettings();
    };
  }, [project]);
  return plan;
}

/** Words for a stage's state, the same in every view. */
export const stageWord = (state: PlanStage["state"]) => (state === "done" ? t("done") : state === "active" ? t("in progress") : t("open"));
