import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Eye, FolderSearch, SquarePen, type LucideIcon } from "lucide-react";
import { openPath, showInFileManager } from "../backend";

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  /** Quiet second part, e.g. where it opens */
  hint?: string;
  disabled?: boolean;
  /** Why it is disabled */
  why?: string;
  run: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  /** What the menu is about, as its first, quiet line */
  title: string;
  items: MenuItem[];
}

/** A menu opened by the right mouse button: `open(event, title, items)` on `onContextMenu`. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const open = (e: MouseEvent, title: string, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, title, items });
  };
  const element = menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />;
  return { open, element };
}

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: menu.x, top: menu.y });

  // Stays inside the window: opens up or to the left near its edges
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setAt({
      left: Math.min(menu.x, window.innerWidth - r.width - 4),
      top: menu.y + r.height > window.innerHeight - 4 ? Math.max(4, menu.y - r.height) : menu.y,
    });
  }, [menu]);

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "mousedown" && box.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      role="menu"
      style={at}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [...(box.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }}
      className="surface-overlay fixed z-50 min-w-56 rounded-lg py-1 text-[12px]"
    >
      <div className="truncate px-3 pt-0.5 pb-1 font-mono text-[11px] text-slate-500">{menu.title}</div>
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.disabled ? item.why : undefined}
          onClick={() => {
            onClose();
            item.run();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-200 outline-none hover:bg-overlay-hover focus-visible:bg-overlay-hover disabled:text-slate-500 disabled:hover:bg-transparent"
        >
          <item.icon className="size-3.5 shrink-0 text-slate-400" />
          <span>{item.label}</span>
          {item.hint && <span className="ml-auto pl-4 text-[11px] text-slate-500">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * What can be done with a file or folder of the project (project-relative path) outside
 * CodeDeck. `gone`: it does not exist on disk any more (deleted), so there is nothing to open.
 */
export function pathItems(path: string, isDir: boolean, gone = false): MenuItem[] {
  const why = "Deleted: no longer on disk";
  const report = (e: unknown) => console.error(e);
  const hint = (usual?: string) => (gone ? "deleted" : usual);
  if (isDir) {
    return [
      { icon: FolderSearch, label: "Open in file manager", hint: hint(), disabled: gone, why, run: () => openPath(path).catch(report) },
    ];
  }
  return [
    { icon: Eye, label: "View", hint: hint("default program"), disabled: gone, why, run: () => openPath(path).catch(report) },
    { icon: SquarePen, label: "Edit", hint: hint("default program"), disabled: gone, why, run: () => openPath(path).catch(report) },
    {
      icon: FolderSearch,
      label: "Show in file manager",
      hint: hint("its folder"),
      disabled: gone,
      why,
      run: () => showInFileManager(path).catch(report),
    },
  ];
}
