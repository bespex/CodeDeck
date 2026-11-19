import { useRef } from "react";
import type { Side } from "../layout";
import { t } from "../i18n";

interface Props {
  side: Side;
  /** Sets the width of that column; `null` goes back to the default */
  onResize: (side: Side, width: number | null, store: boolean) => void;
}

/** Reads the drawn width of a column from the grid: its tracks are projects, sessions, line, deck, line, files. */
function widthOf(side: Side, grid: HTMLElement | null): number {
  const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").map(parseFloat) : [];
  return (side === "files" ? tracks[5] : tracks[1]) ?? 0;
}

/**
 * The hairline between two columns, in a grid track of no width. The line itself is the border of
 * the panel beside it; this only adds a wider grip over it that lights up under the mouse.
 * Drag or arrow keys resize, double click goes back to the default width.
 */
export function Splitter({ side, onResize }: Props) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Dragging to the right widens the session list (left) but narrows the file list (right)
  const sign = side === "files" ? -1 : 1;
  const grid = (e: { currentTarget: HTMLElement }) => e.currentTarget.closest<HTMLElement>("[data-columns]");

  return (
    <div className="relative z-20 w-0 shrink-0">
      <button
        type="button"
        aria-label={side === "files" ? t("Resize the file list") : t("Resize the session list")}
        title={t("Drag to resize · double click: default width")}
        className="absolute inset-y-0 -left-[3px] w-[7px] cursor-col-resize touch-none bg-clip-content px-[2px] outline-none hover:bg-ai/60 focus-visible:bg-ai/60"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width: widthOf(side, grid(e)) };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onResize(side, drag.current.width + sign * (e.clientX - drag.current.x), false);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const moved = e.clientX !== drag.current.x;
          if (moved) onResize(side, drag.current.width + sign * (e.clientX - drag.current.x), true);
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onResize(side, null, true)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const step = (e.shiftKey ? 64 : 16) * (e.key === "ArrowRight" ? 1 : -1);
          onResize(side, widthOf(side, grid(e)) + sign * step, true);
        }}
      />
    </div>
  );
}
