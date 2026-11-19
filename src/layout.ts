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

const clamp = (side: Side, width: number) => Math.round(Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, width)));

/**
 * The column widths of this project's window. They are loaded when the project changes and stored
 * per project, so the division survives a restart and every project keeps its own.
 */
export function useLayout(project: string | undefined) {
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
        if (side === "files") delete next.filesFolded;
        if (width === null) delete next[side];
        else next[side] = clamp(side, width);
      }, store),
    [update],
  );

  /** Folds the file list to its rail or opens it again; without `folded` it switches. */
  const fold = useCallback(
    (folded?: boolean) =>
      update((next) => {
        if (folded ?? !next.filesFolded) next.filesFolded = true;
        else delete next.filesFolded;
      }, true),
    [update],
  );

  // A fixed maximum with a lower minimum: in a narrow window the columns give way before the deck does
  const track = (side: Side, fallback: string) =>
    layout[side] === undefined ? fallback : `minmax(${LIMITS[side].min}px,${layout[side]}px)`;
  const folded = layout.filesFolded === true;
  const files = folded ? `${RAIL}px` : track("files", "minmax(220px,20%)");
  const columns = `${files} 0px minmax(${DECK_MIN}px,1fr) 0px ${track("right", "minmax(300px,25%)")}`;
  return { columns, resize, folded, fold };
}
