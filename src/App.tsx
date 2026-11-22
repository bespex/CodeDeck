import { useEffect, useMemo, useRef, useState } from "react";
import { FilesPanel } from "./components/FilesPanel";
import { GitLog } from "./components/GitLog";
import { Deck } from "./components/Deck";
import { SessionsPanel } from "./components/SessionsPanel";
import { overviewState, closeWindow, live, onOpenView, openProject, openSettings, openWindow, projectInfo, type Entry, type ProjectInfo } from "./backend";
import { currentView, openView, type ViewId } from "./view";
import { initialPins } from "./mock";
import { files, pinFromEntry } from "./files";
import { switchAttachments, useAttachments } from "./attachments";
import { useDirqComments } from "./dirqComments";
import { recall, remember, showProject, switchTook } from "./projectMemory";
import { useGit } from "./git";
import { SessionMarksContext, sessionMarks, elsewhereOf, touchedFiles, useAssistant } from "./assistant";
import { RepoActions, type Anchor } from "./components/RepoActions";
import { useAttention } from "./attention";
import { setNewsProject } from "./news";
import { Dialogs } from "./components/Dialogs";
import { openDialog } from "./dialogs";
import { revealInTree } from "./fileView";
import { projectSwitched } from "./windowIcon";
import { useLayout, useProjectsFolded } from "./layout";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { recentOf, useOverview } from "./components/OverviewApp";
import { Splitter } from "./components/Splitter";

// The preview starts with something attached, to show what that looks like
if (!live) files.add(initialPins);

export default function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const pins = files.use();
  const [selected, setSelected] = useState<string | null>(null);
  const git = useGit(project?.path);
  // What was seen in the Workbench is kept per project
  useEffect(() => setNewsProject(project?.path ?? null), [project?.path]);
  const assistant = useAssistant();
  // Window title, taskbar and desktop notification for what needs the user while they look elsewhere
  useAttention(assistant, git.runs, project?.name);
  // The session the mouse is on in the list: its snapshots and files stand out everywhere
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  // Sessions of a project below or above this one (an umbrella) are marked as such
  const [listedProjects] = useOverview();
  const marks = useMemo(
    () => sessionMarks(assistant, hoveredSession, setHoveredSession, (cwd) => (project ? elsewhereOf(project.path, cwd, listedProjects) : null)),
    [assistant, hoveredSession, project, listedProjects],
  );
  // Attachments follow what the backend says (receipts, whether the tool takes them)
  useAttachments();
  // Comments written in Dirq become line comments of the next prompt, like those written here
  useDirqComments(marks.writer);
  // Git actions of one repository, hanging at the element that opened them
  const [actions, setActions] = useState<{ repo: string; anchor: Anchor } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Widths of file list and right column, as the user left them in this project
  const [projectsFolded, foldProjects] = useProjectsFolded();
  const layout = useLayout(project?.path, projectsFolded);
  const { fold } = layout;
  // For the key handler, which is set up once: the project shown and the way to show another
  const currentPath = useRef<string | null>(null);
  currentPath.current = project?.path ?? null;
  const openRef = useRef<(path: string, newWindow: boolean) => Promise<unknown>>(async () => {});
  // Ctrl+Shift+G shows and hides the git commands from anywhere, Ctrl+Shift+L folds the project list,
  // Ctrl+B the file list
  // (in the window only, as the sidebar in VS Code)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Tab") {
        // Back to the project shown before (user, 2026-11-19: two projects one moves between)
        e.preventDefault();
        void overviewState().then((all) => {
          const previous = recentOf(all, currentPath.current)[0];
          if (previous) void openRef.current(previous.path, false);
        });
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "w") {
        // Close project: the window goes with it (docs/PLAN.md "Projektliste im Fenster statt Übersicht")
        e.preventDefault();
        void closeWindow();
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        fold();
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "g") {
        // The git actions of the project's repository, as a click on git's button in the file column
        // (branch in its header, or the folded rail) does; again closes them (user, 2026-11-21)
        e.preventDefault();
        document.querySelector<HTMLElement>("[data-git-actions]")?.click();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setLogOpen((o) => !o);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
        // The project list folds and opens (it took the place of the overview window)
        e.preventDefault();
        foldProjects();
      }
    };
    window.addEventListener("keydown", onKey);
    // The overview of all projects opens a view here (docs/UEBERSICHT.md)
    // Its dialogs too: they need more room than the overview has
    const stopView = onOpenView((view) => {
      if (view === "settings") void openSettings();
      else if (view === "about" || view === "shortcuts") openDialog({ kind: view });
      else openView(view as ViewId);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      stopView();
    };
  }, [fold, foldProjects]);
  const actionsRepo = actions && git.repos.find((r) => r.path === actions.repo);
  const openActions = (repo: string, element: HTMLElement, above: boolean) =>
    setActions((current) =>
      current?.repo === repo ? null : { repo, anchor: { element, rect: element.getBoundingClientRect(), above } },
    );

  useEffect(() => {
    projectInfo().then((info) => {
      showProject(info?.path ?? null);
      setProject(info);
    });
  }, []);

  // How long a switch takes until files and git are there: the measure for keeping one web view per
  // window (docs/PLAN.md "Projektliste im Fenster statt Übersicht", step a)
  const switchStart = useRef<{ at: number; unloaded: boolean } | null>(null);
  useEffect(() => {
    const start = switchStart.current;
    if (!start) return;
    // Right after the switch `loaded` still tells of the old project: only a load after it counts
    if (!git.loaded) start.unloaded = true;
    else if (start.unloaded) {
      const ms = performance.now() - start.at;
      switchStart.current = null;
      switchTook(ms);
      console.info(`CodeDeck: project switch took ${Math.round(ms)} ms`);
    }
  }, [git.loaded, project?.path]);

  const pin = async (entry: Entry) => {
    if (files.has(entry.path)) return;
    files.add([await pinFromEntry(entry)]);
  };
  // Here: the panels start fresh via `key`, but what the window showed of the old project stays with
  // it and comes back with it (attachments, selection, view, open folders, the deck's point)
  const open = async (path: string, newWindow: boolean, view?: string) => {
    if (newWindow) return openWindow(path);
    // The project shown already: only the view the list asked for
    if (path === project?.path) return void (view && openView(view as ViewId));
    switchStart.current = { at: performance.now(), unloaded: false };
    const old = project?.path ?? null;
    remember(old, "selected", selected);
    remember(old, "view", currentView());
    const next = await openProject(path);
    projectSwitched();
    showProject(next.path);
    switchAttachments(old, next.path);
    setSelected(recall<string | null>(next.path, "selected") ?? null);
    openView((view as ViewId | undefined) ?? recall<ViewId>(next.path, "view") ?? "changes");
    setActions(null);
    setProject(next);
  };
  openRef.current = open;
  // The preview has no project menu yet: a way to switch for checking with tools/shot.mjs
  if (!live) (window as unknown as { openProject?: typeof open }).openProject = open;

  const unpin = (id: string) => files.remove([id]);
  // Showing a file in the tree needs the tree: a folded list opens first
  const showFile = (path: string) => {
    fold(false);
    setSelected(path);
    revealInTree(path);
  };

  return (
    <SessionMarksContext.Provider value={marks}>
    <div className="flex h-full flex-col">
      <div data-columns className="grid min-h-0 flex-1" style={{ gridTemplateColumns: layout.columns }}>
        <ProjectsPanel project={project} assistant={assistant} onOpen={(path, newWindow, view) => void open(path, newWindow, view)} folded={projectsFolded} onFold={foldProjects} />
        {/* Made anew for each project, as the deck and the file list: its parts read the project's account
            once (usage, the sessions' tool) and would otherwise keep the old project's */}
        <SessionsPanel
          key={`sessions:${project?.path}`}
          assistant={assistant}
          pins={pins}
          onPin={pin}
          onUnpin={unpin}
          onClear={files.clear}
          onShowFile={showFile}
          git={git}
          project={project}
          onOpenProject={open}
          onToggleLog={() => setLogOpen((o) => !o)}
        />
        <Splitter side="right" onResize={layout.resize} />
        <Deck key={`deck:${project?.path}`} git={git} selected={selected} assistant={assistant} onResize={layout.resize} />
        <Splitter side="files" onResize={layout.resize} />
        <FilesPanel
          key={`files:${project?.path}`}
          project={project}
          git={git}
          selected={selected}
          pinned={new Set(pins.map((p) => p.id))}
          onSelect={setSelected}
          onPin={pin}
          onUnpin={unpin}
          onOpenProject={open}
          onToggleLog={() => setLogOpen((o) => !o)}
          logOpen={logOpen}
          assistant={assistant}
          onRepoActions={openActions}
          touched={touchedFiles(assistant)}
          folded={layout.folded}
          onFold={fold}
        />
      </div>
      {logOpen && <GitLog runs={git.runs} onClose={() => setLogOpen(false)} />}
      <Dialogs assistant={assistant} />
      {actions && actionsRepo && (
        <RepoActions
          key={actions.repo}
          repo={actionsRepo}
          anchor={actions.anchor}
          onClose={() => setActions(null)}
          onDone={git.refresh}
        />
      )}
    </div>
    </SessionMarksContext.Provider>
  );
}
