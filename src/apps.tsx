import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { chooseFileApp, fileApps, openFile, type App, type FileApps, type Role } from "./backend";
import type { MenuItem, SubMenu } from "./components/ContextMenu";
import { t } from "./i18n";

/**
 * The programs for viewing and editing a file. Asked for briefly, for a menu or tooltip, so a
 * short cache is enough; it also picks up a new default chosen in the system meanwhile.
 */
const cache = new Map<string, { at: number; apps: Promise<FileApps> }>();
const FRESH_MS = 5_000;

export function appsOf(path: string): Promise<FileApps> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.apps;
  const apps = fileApps(path);
  cache.set(path, { at: Date.now(), apps });
  apps.catch(() => cache.delete(path));
  return apps;
}

const report = (e: unknown) => console.error(e);

/** Opens the file for viewing (double click) or editing (middle click). */
export const openAs = (path: string, role: Role) => openFile(path, role).catch(report);

/** The name of the program that would open the file, e.g. in a tooltip or menu hint. */
export function AppName({ path, role }: { path: string; role: Role }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    appsOf(path)
      .then((apps) => live && setName(apps[role].app?.name ?? t("default program")))
      .catch(() => live && setName(t("default program")));
    return () => {
      live = false;
    };
  }, [path, role]);
  return <>{name ?? "…"}</>;
}


/** Up to this many programs show without a search; beyond it the short list and a search field. */
const SHORT = 6;

/**
 * The menu behind "View with…" / "Edit with…": the system's default and the programs installed
 * for the type. Picking one opens the file in it and remembers it for this kind of file.
 *
 * A type such as `text/rust` brings every program that takes `text/plain`: editors, browsers,
 * e-book readers. So with many, a short list comes first (the current choice, programs chosen in
 * CodeDeck before, then the recommended ones) and a search field finds all the others.
 */
export async function chooserMenu(path: string, role: Role): Promise<SubMenu> {
  const apps = await appsOf(path);
  const current = apps[role];
  const pick = (id: string | null) => async () => {
    try {
      await chooseFileApp(path, role, id);
      cache.clear();
      await openFile(path, role);
    } catch (e) {
      report(e);
    }
  };
  const twice = (app: App) => apps.candidates.filter((other) => other.name === app.name).length > 1;
  const item = (app: App): MenuItem => ({
    icon: current.chosen && current.app?.id === app.id ? Check : undefined,
    label: app.name,
    // Two programs of the same name (e.g. two .desktop files of one program): which one
    hint: twice(app) ? app.id.replace(/\.desktop$/, "") : app.id === apps.system?.id ? t("system default") : undefined,
    run: pick(app.id),
  });
  const systemDefault: MenuItem = {
    icon: current.chosen ? undefined : Check,
    label: t("System default"),
    hint: apps.system?.name ?? t("none set"),
    run: pick(null),
  };
  const title = t(role === "view" ? "View {kind} with · remembered" : "Edit {kind} with · remembered", { kind: apps.kind });
  const all = apps.candidates.map(item);
  if (apps.candidates.length <= SHORT + 1) return { title, items: [systemDefault, ...all] };

  // The system's program is already there as "System default"
  const others = apps.candidates.filter((app) => app.id !== apps.system?.id);
  const rank = (app: App) => (current.chosen && current.app?.id === app.id ? 0 : app.used ? 1 : app.recommended ? 2 : 3);
  const short = others
    .map((app, i) => ({ app, i }))
    .filter(({ app }) => rank(app) < 3)
    .sort((a, b) => rank(a.app) - rank(b.app) || a.i - b.i)
    .slice(0, SHORT)
    .map(({ app }) => item(app));
  return {
    title,
    items: [systemDefault, ...short],
    search: { placeholder: t("Search all {n} programs", { n: apps.candidates.length }), all },
  };
}
