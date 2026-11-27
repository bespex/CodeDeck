// Guide files (roadmap U8.2, `guides.rs`): the files that steer the work with the AI. Instructions for
// the tool, the README, and the planning files TODO, IDEAS and ROADMAP. Which names count is a machine
// setting (`guides`), a project can name its own; the backend decides, this file only follows it.

import { useEffect, useState } from "react";
import { BookOpen, Bot, Lightbulb, ListChecks, Map as MapIcon, type LucideIcon } from "lucide-react";
import { guideFiles, onFsChanged, onSettingsChanged, type Guide, type GuideRole } from "./backend";
import { t } from "./i18n";

/** Symbol and name of each role, the same everywhere a guide file shows. */
export const GUIDE_ROLES: Record<GuideRole, { icon: LucideIcon; label: () => string; says: () => string }> = {
  instructions: { icon: Bot, label: () => t("Instructions"), says: () => t("Standing instructions the AI reads at the start of every session") },
  readme: { icon: BookOpen, label: () => t("Description"), says: () => t("What the project is, for people and the AI") },
  tasks: { icon: ListChecks, label: () => t("Tasks"), says: () => t("Open questions and planned tasks") },
  ideas: { icon: Lightbulb, label: () => t("Ideas"), says: () => t("Drafts; nothing here is built without your approval") },
  roadmap: { icon: MapIcon, label: () => t("Roadmap"), says: () => t("Planned stages towards a goal") },
};

/** The names the backend looks for unless told otherwise; shown in the settings as the default. */
export const GUIDE_DEFAULTS: Record<GuideRole, string[]> = {
  instructions: ["AGENTS.md"],
  readme: ["README.md", "README"],
  tasks: ["TODO.md"],
  ideas: ["IDEAS.md"],
  roadmap: ["ROADMAP.md"],
};

const NONE: Guide[] = [];

/** Told when something here changed the project's guide files, so every list reads them again. */
const rereaders = new Set<() => void>();
export function rereadGuides() {
  rereaders.forEach((r) => r());
}

/** Called when `rereadGuides` is: e.g. the plan, which follows the guide files. */
export function onGuidesReread(callback: () => void): () => void {
  rereaders.add(callback);
  return () => void rereaders.delete(callback);
}

const mayBeGuide = (path: string) => {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  return name.endsWith(".md") || name.startsWith("readme");
};

/**
 * The guide files of the project in this window, read again when files come or go in a folder or a
 * setting changes. `project` is its path: another project, another list.
 */
export function useGuides(project: string | undefined): Guide[] {
  const [guides, setGuides] = useState<Guide[]>(NONE);
  useEffect(() => {
    setGuides(NONE);
    if (!project) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = () =>
      void guideFiles()
        .then((g) => alive && setGuides((old) => (JSON.stringify(old) === JSON.stringify(g) ? old : g)))
        .catch(() => {});
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(read, 600);
    };
    read();
    // Guide files are Markdown or a README; any other change cannot add or take away one, and finding
    // them walks the whole project
    const stopFs = onFsChanged((change) => change.paths.some(mayBeGuide) && later());
    const stopSettings = onSettingsChanged(later);
    rereaders.add(read);
    return () => {
      rereaders.delete(read);
      alive = false;
      clearTimeout(timer);
      stopFs();
      stopSettings();
    };
  }, [project]);
  return guides;
}
