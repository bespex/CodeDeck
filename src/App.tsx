import { useEffect, useMemo, useState } from "react";
import { FilesPanel } from "./components/FilesPanel";
import { GitLog } from "./components/GitLog";
import { Deck } from "./components/Deck";
import { SessionsPanel } from "./components/SessionsPanel";
import { StatusBar } from "./components/StatusBar";
import { live, onOpenView, openProject, openWindow, projectInfo, toggleOverview, type Entry, type ProjectInfo } from "./backend";
import { openView, type ViewId } from "./view";
import { initialPins } from "./mock";
import { files, pinFromEntry } from "./files";
import { clearAttachments, useAttachments } from "./attachments";
import { useGit } from "./git";
import { SessionMarksContext, sessionMarks, touchedFiles, useAssistant } from "./assistant";
import { RepoActions, type Anchor } from "./components/RepoActions";
import { useAttention } from "./attention";
import { setNewsProject } from "./news";
import { Dialogs } from "./components/Dialogs";
import { openDialog } from "./dialogs";
import { projectSwitched } from "./windowIcon";
import { useLayout } from "./layout";
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
  const marks = useMemo(() => sessionMarks(assistant, hoveredSession, setHoveredSession), [assistant, hoveredSession]);
  // Attachments follow what the backend says (receipts, whether the tool takes them)
  useAttachments();
  // Git actions of one repository, hanging at the element that opened them
  const [actions, setActions] = useState<{ repo: string; anchor: Anchor } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Widths of file list and right column, as the user left them in this project
  const layout = useLayout(project?.path);
  // Ctrl+Shift+G shows and hides the git commands from anywhere, Ctrl+Shift+L the overview of all
  // projects (docs/UEBERSICHT.md; it replaced the sidebar of each window)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setLogOpen((o) => !o);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        void toggleOverview();
      }
    };
    window.addEventListener("keydown", onKey);
    // The overview of all projects opens a view here (docs/UEBERSICHT.md)
    // Its dialogs too: they need more room than the overview has
    const stopView = onOpenView((view) => {
      if (view === "settings") openDialog({ kind: "settings", section: "general" });
      else if (view === "about" || view === "shortcuts") openDialog({ kind: view });
      else openView(view as ViewId);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      stopView();
    };
  }, []);
  const actionsRepo = actions && git.repos.find((r) => r.path === actions.repo);
  const openActions = (repo: string, element: HTMLElement, above: boolean) =>
    setActions((current) =>
      current?.repo === repo ? null : { repo, anchor: { element, rect: element.getBoundingClientRect(), above } },
    );

  useEffect(() => {
    projectInfo().then(setProject);
  }, []);

  const pin = async (entry: Entry) => {
    if (files.has(entry.path)) return;
    files.add([await pinFromEntry(entry)]);
  };
  // Here: everything that belongs to the old project goes; the panels start fresh via `key`
  const open = async (path: string, newWindow: boolean) => {
    if (newWindow) return openWindow(path);
    const next = await openProject(path);
    projectSwitched();
    clearAttachments();
    setSelected(null);
    setActions(null);
    setProject(next);
  };

  const unpin = (id: string) => files.remove([id]);
  const showFile = (path: string) => setSelected(path);

  return (
    <SessionMarksContext.Provider value={marks}>
    <div className="flex h-full flex-col">
      <div data-columns className="grid min-h-0 flex-1" style={{ gridTemplateColumns: layout.columns }}>
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
          assistant={assistant}
          onRepoActions={openActions}
          touched={touchedFiles(assistant)}
        />
        <Splitter side="files" onResize={layout.resize} />
        <Deck key={`deck:${project?.path}`} git={git} selected={selected} assistant={assistant} onResize={layout.resize} />
        <Splitter side="right" onResize={layout.resize} />
        <SessionsPanel
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
      </div>
      <StatusBar
        git={git}
        onRepoActions={openActions}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen(!logOpen)}
        assistant={assistant}
      />
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
