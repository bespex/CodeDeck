import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AppWindow, ChevronRight, Eye, FolderSearch, Search, SquarePen, type LucideIcon } from "lucide-react";
import { openPath, showInFileManager } from "../backend";
import { AppName, chooserMenu, openAs } from "../apps";
import { t } from "../i18n";

export interface MenuItem {
  /** None: an empty space, so that labels stay aligned (e.g. beside a check mark) */
  icon?: LucideIcon;
  label: string;
  /** Quiet second part, e.g. where it opens */
  hint?: ReactNode;
  disabled?: boolean;
  /** Why it is disabled */
  why?: string;
  run: () => void;
  /** Opens a further menu in place of this one instead of running */
  more?: () => Promise<SubMenu>;
  /** A line above it: the start of another group */
  divider?: boolean;
}

export interface MenuState {
  x: number;
  y: number;
  /** What the menu is about, as its first, quiet line */
  title: string;
  items: MenuItem[];
  /** A search field above the items: typing searches `all` instead of showing `items` */
  search?: { placeholder: string; all: MenuItem[] };
}

/** A further menu shown in place of the first one: everything but where it opened. */
export type SubMenu = Omit<MenuState, "x" | "y">;

/** A menu opened by the right mouse button: `open(event, title, items)` on `onContextMenu`. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const open = (e: MouseEvent, title: string, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, title, items });
  };
  const element = menu && <ContextMenu menu={menu} onMore={setMenu} onClose={() => setMenu(null)} />;
  return { open, element };
}

const matches = (item: MenuItem, needle: string) =>
  item.label.toLowerCase().includes(needle) || (typeof item.hint === "string" && item.hint.toLowerCase().includes(needle));

function ContextMenu({ menu, onMore, onClose }: { menu: MenuState; onMore: (menu: MenuState) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [at, setAt] = useState({ left: menu.x, top: menu.y, maxHeight: window.innerHeight - menu.y - 4 });
  const [query, setQuery] = useState("");
  // The listeners stay put while the parent renders anew (and hands in a new function)
  const close = useRef(onClose);
  close.current = onClose;

  const needle = query.trim().toLowerCase();
  const shown = menu.search && needle ? menu.search.all.filter((item) => matches(item, needle)) : menu.items;

  // Stays inside the window: opens up or to the left near its edges. Placed for the menu as it
  // opens; a search that shortens the list does not make it jump
  // A menu taller than the window scrolls
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.maxHeight = "none";
    const r = el.getBoundingClientRect();
    const fitsBelow = menu.y + r.height <= window.innerHeight - 4;
    const top = fitsBelow ? menu.y : Math.max(4, menu.y - r.height);
    const maxHeight = window.innerHeight - top - 4;
    // Back on the element itself: React leaves the style alone when the value has not changed
    el.style.maxHeight = `${maxHeight}px`;
    setAt({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top, maxHeight });
  }, [menu]);

  // Into the first item, or the search field; anew when a further menu takes its place
  useEffect(() => {
    setQuery("");
    (input.current ?? box.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  }, [menu]);

  // Where the keys were before the menu opened: closed with a key, they go back there, so one goes
  // on moving through the file list with the keys (user, 2026-11-21)
  const before = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const outside = (e: Event) => !box.current?.contains(e.target as Node);
    const dismiss = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        // Escape, or the key that opened it (the menu key, Shift+F10)
        const again = e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
        if (e.key !== "Escape" && !again) return;
        e.preventDefault();
        e.stopPropagation();
        close.current();
        const back = before.current;
        if (back instanceof HTMLElement && back.isConnected) requestAnimationFrame(() => back.focus());
        return;
      }
      // Scrolling the menu's own list, or clicking in it, keeps it open
      if ((e.type === "mousedown" || e.type === "wheel") && !outside(e)) return;
      close.current();
    };
    const blur = () => close.current();
    window.addEventListener("mousedown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("blur", blur);
    window.addEventListener("wheel", dismiss, { passive: true });
    return () => {
      window.removeEventListener("mousedown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("wheel", dismiss);
    };
  }, []);

  const choose = (item: MenuItem) => {
    if (item.more) {
      item.more().then((next) => onMore({ x: menu.x, y: menu.y, ...next }), onClose);
      return;
    }
    onClose();
    item.run();
  };

  return (
    <div
      ref={box}
      role="menu"
      style={at}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [...(box.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }}
      className="surface-overlay fixed z-50 flex max-w-96 min-w-56 flex-col rounded-lg py-1 text-[12px]"
    >
      <div className="shrink-0 truncate px-3 pt-0.5 pb-1 font-mono text-[11px] text-slate-500">{menu.title}</div>
      {menu.search && (
        <label className="mx-2 mb-1 flex shrink-0 items-center gap-2 rounded-md border border-line bg-base px-2 py-1 focus-within:border-ai">
          <Search className="size-3.5 shrink-0 text-slate-500" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const first = shown.find((item) => !item.disabled);
              if (e.key === "Enter" && first) choose(first);
            }}
            placeholder={menu.search.placeholder}
            className="w-full bg-transparent text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
      )}
      <div className="min-h-0 overflow-y-auto">
        {shown.length === 0 && <div className="px-3 py-1.5 text-slate-500 italic">{t("Nothing matches")}</div>}
        {shown.map((item, i) => [
          item.divider && i > 0 && !needle && <div key={`line:${i}`} className="my-1 h-px bg-overlay-line" />,
          <button
            key={`${i}:${item.label}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled ? item.why : undefined}
            onClick={() => choose(item)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-200 outline-none hover:bg-overlay-hover focus-visible:bg-overlay-hover disabled:text-slate-500 disabled:hover:bg-transparent"
          >
            {item.icon ? <item.icon className="size-3.5 shrink-0 text-slate-400" /> : <span className="size-3.5 shrink-0" />}
            <span className="truncate">{item.label}</span>
            {item.hint && <span className="ml-auto truncate pl-4 text-[11px] text-slate-500">{item.hint}</span>}
            {item.more && <ChevronRight className={`size-3.5 shrink-0 text-slate-500 ${item.hint ? "" : "ml-auto"}`} />}
          </button>,
        ])}
      </div>
    </div>
  );
}

/**
 * What can be done with a file or folder of the project (project-relative path) outside
 * CodeDeck. `gone`: it does not exist on disk any more (deleted), so there is nothing to open.
 */
export function pathItems(path: string, isDir: boolean, gone = false): MenuItem[] {
  const why = t("Deleted: no longer on disk");
  const report = (e: unknown) => console.error(e);
  const hint = (usual?: string) => (gone ? t("deleted") : usual);
  if (isDir) {
    return [
      { icon: FolderSearch, label: t("Open in file manager"), hint: hint(), disabled: gone, why, run: () => openPath(path).catch(report) },
    ];
  }
  const app = (role: "view" | "edit") => (gone ? t("deleted") : <AppName path={path} role={role} />);
  const choose = (role: "view" | "edit") => () => chooserMenu(path, role);
  return [
    { icon: Eye, label: t("View"), hint: app("view"), disabled: gone, why, run: () => openAs(path, "view") },
    { icon: SquarePen, label: t("Edit"), hint: app("edit"), disabled: gone, why, run: () => openAs(path, "edit") },
    { icon: AppWindow, label: t("View with…"), disabled: gone, why, run: () => {}, more: choose("view") },
    { icon: AppWindow, label: t("Edit with…"), disabled: gone, why, run: () => {}, more: choose("edit") },
    {
      icon: FolderSearch,
      label: t("Show in file manager"),
      hint: hint(t("its folder")),
      disabled: gone,
      why,
      run: () => showInFileManager(path).catch(report),
    },
  ];
}
