import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Same pause as the system tooltips: passing over something does not flash it. */
const DELAY_MS = 450;
const WIDTH = 300;

/**
 * A tooltip with structure (bold, code, quieter hints) where the plain `title` is not enough.
 * Opens below the element, or above it near the bottom of the window; a click closes it.
 */
export function Tooltip(props: {
  content: ReactNode;
  children: ReactNode;
  /** Below (default; above near the window's bottom) or to the right, for things in a column */
  side?: "below" | "right";
  className?: string;
}) {
  const { content, children, side = "below" } = props;
  const [at, setAt] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLSpanElement>(null);

  // After a click the tooltip stays away until the mouse has left: what it explains is done,
  // and a menu or popover may have opened over it
  const clicked = useRef(false);

  const show = () => {
    clearTimeout(timer.current);
    if (clicked.current) return;
    timer.current = setTimeout(() => box.current?.isConnected && setAt(box.current.getBoundingClientRect()), DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setAt(null);
  };

  const above = at && at.bottom > window.innerHeight - 160;
  const left = at && Math.min(Math.max(8, side === "right" ? at.right + 8 : at.left), window.innerWidth - WIDTH - 8);
  const vertical = !at
    ? {}
    : side === "right"
      ? { top: Math.min(at.top, window.innerHeight - 220) }
      : above
        ? { bottom: window.innerHeight - at.top + 6 }
        : { top: at.bottom + 6 };

  return (
    <span
      ref={box}
      className={props.className ?? "flex min-w-0"}
      onMouseEnter={show}
      onMouseLeave={() => {
        clicked.current = false;
        hide();
      }}
      // Only keyboard focus shows it; a click focuses too, and then it is not wanted
      onFocus={(e) => e.target.matches(":focus-visible") && show()}
      onBlur={hide}
      onMouseDown={() => {
        clicked.current = true;
        hide();
      }}
      onContextMenu={hide}
    >
      {children}
      {/* On the page itself, not inside the element: WebKitGTK cuts a fixed element off at the
          edge of a scrolling container around it (the trail), Chromium does not */}
      {at &&
        createPortal(
        <span
          role="tooltip"
          style={{
            left: left!,
            width: WIDTH,
            ...vertical,
          }}
          className="pointer-events-none fixed z-40 flex flex-col gap-0.5 surface-overlay rounded-md px-2.5 py-2 font-sans text-[12px] leading-snug whitespace-normal text-slate-300"
        >
          {content}
        </span>,
          document.body,
        )}
    </span>
  );
}

/** The quiet part at the end of a tooltip: how to use the thing, not what it is. */
export function TooltipHint({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 border-t border-overlay-line pt-1.5 text-[11px] text-slate-500">{children}</span>;
}
