import { useEffect, useMemo, useState } from "react";
import { FilesPanel } from "./components/FilesPanel";
import { GitLog } from "./components/GitLog";
import { Deck } from "./components/Deck";
import { SessionsPanel } from "./components/SessionsPanel";
import { StatusBar } from "./components/StatusBar";
import { live, openProject, openWindow, projectInfo, type Entry, type ProjectInfo } from "./backend";
import { initialPins } from "./mock";
import { pinFromEntry, type Pin } from "./focus";
import { useGit } from "./git";
import { SessionMarksContext, sessionMarks, touchedFiles, useAssistant } from "./assistant";
import { RepoActions, type Anchor } from "./components/RepoActions";

export default function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [pins, setPins] = useState<Pin[]>(live ? [] : initialPins);
  const [selected, setSelected] = useState<string | null>(null);
  const git = useGit(project?.path);
  const assistant = useAssistant();
  // The session the mouse is on in the list: its snapshots and files stand out everywhere
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const marks = useMemo(() => sessionMarks(assistant, hoveredSession, setHoveredSession), [assistant, hoveredSession]);
  // Git actions of one repository, hanging at the element that opened them
  const [actions, setActions] = useState<{ repo: string; anchor: Anchor } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Ctrl+Shift+G shows and hides the git commands from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setLogOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    if (pins.some((p) => p.id === entry.path)) return;
    const created = await pinFromEntry(entry);
    setPins((current) => (current.some((p) => p.id === created.id) ? current : [...current, created]));
  };
  // Here: everything that belongs to the old project goes; the panels start fresh via `key`
  const open = async (path: string, newWindow: boolean) => {
    if (newWindow) return openWindow(path);
    const next = await openProject(path);
    setPins([]);
    setSelected(null);
    setActions(null);
    setProject(next);
  };

  const unpin = (id: string) => setPins((current) => current.filter((p) => p.id !== id));

  return (
    <SessionMarksContext.Provider value={marks}>
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,20%)_minmax(0,1fr)_minmax(300px,25%)]">
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
          onRepoActions={openActions}
          touched={touchedFiles(assistant)}
        />
        <Deck key={`deck:${project?.path}`} git={git} selected={selected} assistant={assistant} />
        <SessionsPanel
          assistant={assistant}
          pins={pins}
          onPin={pin}
          onUnpin={unpin}
          onClear={() => setPins([])}
          onShowFile={setSelected}
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
