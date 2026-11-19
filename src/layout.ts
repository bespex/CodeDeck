import { useCallback, useEffect, useRef, useState } from "react";
import { layoutOf, setLayout, type Layout } from "./backend";

export type Side = "files" | "right";

/** How far each column may be dragged; the deck between them keeps `DECK_MIN`. */
export const LIMITS: Record<Side, { min: number; max: number }> = {
  files: { min: 150, max: 460 },
  right: { min: 250, max: 600 },
};
export const DECK_MIN = 420;
/** The folded file list: a rail as wide as the header is high (docs/KONZEPT.md 4.7 rule 4) */
export const RAIL = 44;
/** The project list at the left (user, 2026-11-19: 300 px are enough), folded a rail of marks; the
 *  start page has the same width (`OVERVIEW_WIDTH` in src-tauri/src/windows.rs) */
export const PROJECTS = 300;
const PROJECTS_FOLDED = "codedeck.projectsFolded";

/** Whether the project list is folded: one choice for this machine, not per project, as the list is
 *  what one moves between projects with. */
export function useProjectsFolded(): [boolean, (folded?: boolean) => void] {
  const [folded, setFolded] = useState(() => localStorage.getItem(PROJECTS_FOLDED) === "1");
  const fold = useCallback((next?: boolean) => {
    setFolded((old) => {
      const value = next ?? !old;
      localStorage.setItem(PROJECTS_FOLDED, value ? "1" : "0");
      return value;
    });
  }, []);
  return [folded, fold];
}

const clamp = (side: Side, width: number) => Math.round(Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, width)));

/**
 * The column widths of this project's window. They are loaded when the project changes and stored
 * per project, so the division survives a restart and every project keeps its own.
 */
export function useLayout(project: string | undefined, projectsFolded: boolean) {
  const [layout, setState] = useState<Layout>({});
  // The callbacks below stay the same across renders (a key handler holds them); they read the project here
  const current = useRef(project);
  current.current = project;
  useEffect(() => {
    setState({});
    if (!project) return;
    let current = true;
    void layoutOf(project).then((stored) => current && setState(stored ?? {}));
    return () => {
      current = false;
    };
  }, [project]);

  const update = useCallback((change: (next: Layout) => void, store: boolean) => {
    setState((old) => {
      const next = { ...old };
      change(next);
      const project = current.current;
      if (store && project) void setLayout(project, Object.keys(next).length ? next : null);
      return next;
    });
  }, []);

  /** While dragging only the window follows; `store` writes once the hand lets go. Dragging the
   *  line of a folded file list pulls it out again. */
  const resize = useCallback(
    (side: Side, width: number | null, store: boolean) =>
      update((next) => {
        if (side === "files") next.filesFolded = false;
        if (width === null) delete next[side];
        else next[side] = clamp(side, width);
      }, store),
    [update],
  );

  /** Folds the file list to its rail or opens it again; without `folded` it switches. */
  const fold = useCallback(
    (folded?: boolean) =>
      update((next) => {
        next.filesFolded = folded ?? !(next.filesFolded ?? true);
      }, true),
    [update],
  );

  // A fixed maximum with a lower minimum: in a narrow window the columns give way before the deck does
  const track = (side: Side, fallback: string) =>
    layout[side] === undefined ? fallback : `minmax(${LIMITS[side].min}px,${layout[side]}px)`;
  // Folded until opened (user, 2026-11-19): CodeDeck has no editor, the tree is for looking things up
  const folded = layout.filesFolded ?? true;
  const files = folded ? `${RAIL}px` : track("files", "minmax(220px,20%)");
  // From left to right: projects, sessions, deck (with the trail at its right), file list (user,
  // 2026-11-19: the session list beside what it did, the files as reference at the right edge). `right`
  // is the session list's width; the name stays, as stored layouts use it. The project list has a
  // fixed width and no line to drag
  const projects = `${projectsFolded ? RAIL : PROJECTS}px`;
  const columns = `${projects} ${track("right", "minmax(300px,25%)")} 0px minmax(${DECK_MIN}px,1fr) 0px ${files}`;
  return { columns, resize, folded, fold };
}
