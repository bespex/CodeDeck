import { useEffect, useState } from "react";
import { layoutOf, setLayout, type Layout } from "./backend";

export type Side = keyof Layout;

/** How far each column may be dragged; the deck between them keeps `DECK_MIN`. */
export const LIMITS: Record<Side, { min: number; max: number }> = {
  files: { min: 150, max: 460 },
  right: { min: 250, max: 600 },
};
export const DECK_MIN = 420;

const clamp = (side: Side, width: number) => Math.round(Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, width)));

/**
 * The column widths of this project's window. They are loaded when the project changes and stored
 * per project, so the division survives a restart and every project keeps its own.
 */
export function useLayout(project: string | undefined) {
  const [layout, setState] = useState<Layout>({});
  useEffect(() => {
    setState({});
    if (!project) return;
    let current = true;
    void layoutOf(project).then((stored) => current && setState(stored ?? {}));
    return () => {
      current = false;
    };
  }, [project]);

  /** While dragging only the window follows; `store` writes once the hand lets go. */
  const resize = (side: Side, width: number | null, store: boolean) => {
    setState((old) => {
      const next = { ...old };
      if (width === null) delete next[side];
      else next[side] = clamp(side, width);
      if (store && project) void setLayout(project, Object.keys(next).length ? next : null);
      return next;
    });
  };

  // A fixed maximum with a lower minimum: in a narrow window the columns give way before the deck does
  const track = (side: Side, fallback: string) =>
    layout[side] === undefined ? fallback : `minmax(${LIMITS[side].min}px,${layout[side]}px)`;
  const columns = `${track("files", "minmax(220px,20%)")} 0px minmax(${DECK_MIN}px,1fr) 0px ${track("right", "minmax(300px,25%)")}`;
  return { columns, resize };
}
