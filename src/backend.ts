// The one place that talks to the Rust backend. Outside the Tauri window (plain `npm run dev`
// in a browser) it answers from the sample data instead, so the UI can be worked on alone.

import { parsePatch } from "./diff";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { EventCallback, EventName, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Events for this window. One process serves every window (D25): what concerns a project goes to
 * its window only, what concerns all (settings, shortcuts) reaches every window.
 */
function listen<T>(event: EventName, handler: EventCallback<T>): Promise<UnlistenFn> {
  return getCurrentWebviewWindow().listen<T>(event, handler);
}
import { project as mockProject, tree as mockTree, type FileNode, type GitState } from "./mock";

/** The commit the mock's root repository is on. */
const MOCK_ROOT_HEAD = "root0".padEnd(40, "0");

export interface ProjectInfo {
  name: string;
  /** Absolute path of the root */
  path: string;
  /** For display, home shortened to `~` */
  root: string;
  /** The display path cut into its folders, each with the absolute path it stands for */
  crumbs: Crumb[];
}

export interface Crumb {
  label: string;
  path: string;
}

export interface RecentProject {
  name: string;
  path: string;
  /** For display, home shortened to `~` */
  display: string;
}

/** One row of the file list. Paths are project-relative with `/`; the root is `""`. */
export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  /** Bytes; 0 for folders */
  size: number;
}

export type { GitState };

export interface FileStatus {
  /** Project-relative */
  path: string;
  state: GitState;
  /** Part of the change is in the index */
  staged: boolean;
  /** An untracked folder: everything below it is untracked too */
  dir: boolean;
}

export interface RepoStatus {
  /** Project-relative; `""` for the repo the whole project belongs to */
  path: string;
  name: string;
  /** The project root lies inside this repo, below its top level */
  outer: boolean;
  /** Then: the root's path within the repo, else `""` */
  prefix: string;
  /** A linked worktree: the folder name of the repository it belongs to */
  worktreeOf: string | null;
  branch: string | null;
  /** The commit checked out; null before the first commit */
  head: string | null;
  upstream: string | null;
  /** Names of the remotes; empty when there is nowhere to push or fetch from */
  remotes: string[];
  ahead: number;
  behind: number;
  files: FileStatus[];
  error: string | null;
}

/** One git command that ran, as one would type it in the repo's directory. */
export interface GitRun {
  /** Counts up from 1 in this window's process */
  id: number;
  repo: string;
  command: string;
  ok: boolean;
  /** Exit code; null when git could not start */
  code: number | null;
  ms: number;
  /** Unix milliseconds */
  at: number;
  /** It changed something (add, commit, push…), not only read */
  changes: boolean;
  /** What it printed, stdout then stderr; very long output is cut */
  output: string;
}

export interface PathStats {
  files: number;
  bytes: number;
  truncated: boolean;
}

export interface FsChange {
  /** Directories whose listing may have changed */
  dirs: string[];
  /** What was created, changed or removed */
  paths: string[];
}

/** Running inside the Tauri window, with the real backend. */
export const live = isTauri();

/** Rough token estimate for text of a given size. */
export const tokensFor = (bytes: number) => Math.ceil(bytes / 4);

export function projectInfo(): Promise<ProjectInfo> {
  if (live) return invoke("project_info");
  return Promise.resolve(mockInfo(MOCK_PATH));
}

/** "Remove from Recently": only the projects in `keep` (still shown there) stay; the next opening of a
 *  project puts it back. */
export function forgetRecent(keep: string[]): Promise<void> {
  if (live) return invoke("forget_recent", { keep });
  mockRecent.splice(0, mockRecent.length, ...mockRecent.filter((p) => keep.includes(p)));
  mockOverviewListeners.forEach((l) => l());
  return Promise.resolve();
}

/** Closes this project window ("Close project"); the last one leaves the start page. */
export function closeWindow(): Promise<void> {
  if (live) return invoke("close_window");
  console.info("would close this window");
  return Promise.resolve();
}

/** Switches this window to another directory (absolute path). */
export function openProject(path: string): Promise<ProjectInfo> {
  if (live) return invoke("open_project", { path });
  mockRecent.splice(0, mockRecent.length, path, ...mockRecent.filter((p) => p !== path));
  mockOverviewListeners.forEach((l) => l());
  return Promise.resolve(mockInfo(path));
}

/** Opens a file (project-relative) in the system's default program, a folder in the file manager. */
export function openPath(path: string): Promise<void> {
  if (live) return invoke("open_path", { path });
  console.info("would open", path);
  return Promise.resolve();
}

/** Viewing or editing: CodeDeck keeps a program for each, per kind of file. */
export type Role = "view" | "edit";

export interface App {
  /** Desktop file id, e.g. `org.gnome.TextEditor.desktop` */
  id: string;
  name: string;
  /** Registered for exactly this type, not just a broader one such as `text/plain` */
  recommended: boolean;
  /** Chosen in CodeDeck before, for any kind of file */
  used: boolean;
}

export interface FileApps {
  /** The kind of file a choice is remembered for, e.g. `*.md` */
  kind: string;
  mime: string;
  /** The system's default program for the type */
  system: App | null;
  /** `chosen`: picked in CodeDeck, else it is the system's default */
  view: { app: App | null; chosen: boolean };
  edit: { app: App | null; chosen: boolean };
  /** Every program installed for the type, the system's default first */
  candidates: App[];
}

/** Opens a file (project-relative) in its program for viewing or editing. */
export function openFile(path: string, role: Role): Promise<void> {
  if (live) return invoke("open_file", { path, role });
  console.info(`would ${role}`, path);
  return Promise.resolve();
}

const mockApps: App[] = [
  { id: "org.gnome.TextEditor.desktop", name: "Text Editor", recommended: true, used: false },
  { id: "code.desktop", name: "Visual Studio Code", recommended: false, used: false },
];
const mockChoices: Record<Role, Record<string, string>> = { view: {}, edit: {} };

export function fileApps(path: string): Promise<FileApps> {
  if (live) return invoke("file_apps", { path });
  const name = path.split("/").pop() ?? path;
  const kind = name.lastIndexOf(".") > 0 ? `*${name.slice(name.lastIndexOf(".")).toLowerCase()}` : name;
  const pick = (role: Role) => {
    const app = mockApps.find((a) => a.id === mockChoices[role][kind]);
    return { app: app ?? mockApps[0], chosen: !!app };
  };
  return Promise.resolve({ kind, mime: "text/plain", system: mockApps[0], view: pick("view"), edit: pick("edit"), candidates: mockApps });
}

/** Remembers a program for viewing or editing this kind of file; `null`: the system's default. */
export function chooseFileApp(path: string, role: Role, app: string | null): Promise<void> {
  if (live) return invoke("choose_file_app", { path, role, app });
  const name = path.split("/").pop() ?? path;
  const kind = name.lastIndexOf(".") > 0 ? `*${name.slice(name.lastIndexOf(".")).toLowerCase()}` : name;
  if (app) mockChoices[role][kind] = app;
  else delete mockChoices[role][kind];
  return Promise.resolve();
}

/** Shows a file selected in its folder in the default file manager; a folder is opened itself. */
export function showInFileManager(path: string): Promise<void> {
  if (live) return invoke("show_in_file_manager", { path });
  console.info("would show in the file manager", path);
  return Promise.resolve();
}

/** Opens a directory in a new, independent CodeDeck window. */
export function openWindow(path: string): Promise<void> {
  if (live) return invoke("open_window", { path });
  window.open(`?project=${encodeURIComponent(path)}`, "_blank");
  return Promise.resolve();
}

/** Recently opened projects, newest first, without the current one. Shared by all windows. */
export function recentProjects(): Promise<RecentProject[]> {
  if (live) return invoke("recent_projects");
  return Promise.resolve(
    ["/home/you/projects/billing-web", "/home/you/projects/orbit-cli", "/home/you/notes"].map((path) => ({
      name: path.split("/").pop()!,
      path,
      display: path.replace("/home/you", "~"),
    })),
  );
}

/** The system's folder dialog; `null` when cancelled. */
export function pickFolder(): Promise<string | null> {
  if (live) return invoke("pick_folder");
  return Promise.resolve(window.prompt("Open project", "/home/you/projects/"));
}

/** Lists one directory. The backend watches every directory listed this way. */
export function readDir(path: string): Promise<Entry[]> {
  if (live) return invoke("read_dir", { path });
  const nodes = path ? find(mockTree, path)?.children : mockTree;
  return nodes ? Promise.resolve(nodes.map(toEntry)) : Promise.reject(`${path}: not found`);
}

export function pathStats(path: string): Promise<PathStats> {
  if (live) return invoke("path_stats", { path });
  const files = leaves(find(mockTree, path));
  const bytes = files.reduce((sum, f) => sum + (f.tokens ?? 0) * 4, 0);
  return Promise.resolve({ files: files.length, bytes, truncated: false });
}

/** A file in the scratch folder (`.scratch/` in the project). */
export interface WorkFile {
  /** Project-relative, beginning with `.scratch/` */
  path: string;
  size: number;
  /** Unix milliseconds of the last change */
  modified: number;
}

const DAY = 24 * 3600_000;
let mockScratch: WorkFile[] = [
  { path: ".scratch/bench_limiter.py", size: 2100, modified: Date.now() - 25 * 60_000 },
  { path: ".scratch/bench-results.csv", size: 14_300, modified: Date.now() - 24 * 60_000 },
  { path: ".scratch/load-test.log", size: 1_400_000, modified: Date.now() - 9 * DAY },
  { path: ".scratch/sketches/limiter-sketch.html", size: 210_000, modified: Date.now() - 12 * DAY },
  // A folder of a longer piece of work, so the preview shows the tree
  ...Array.from({ length: 14 }, (_, i) => ({
    path: `.scratch/shots/hb-${["bar", "menu", "about", "settings", "keys", "quick", "notif"][i % 7]}-${Math.floor(i / 7) + 1}.png`,
    size: 80_000 + i * 3000,
    modified: Date.now() - (90 + i) * 60_000,
  })),
  { path: ".scratch/shots/old/first.png", size: 51_000, modified: Date.now() - 2 * DAY },
];

/** The files in the scratch folder, newest first; from now on a new one there is reported at once. */
export function scratchList(): Promise<WorkFile[]> {
  if (live) return invoke("scratch_list");
  return Promise.resolve([...mockScratch]);
}

/** Moves files or folders of the scratch folder to the trash. */
export function scratchTrash(paths: string[]): Promise<void> {
  if (live) return invoke("scratch_trash", { paths });
  // A folder takes everything in it along
  mockScratch = mockScratch.filter((f) => !paths.some((p) => f.path === p || f.path.startsWith(`${p}/`)));
  return Promise.resolve();
}

/** Moves a file of the scratch folder into the project (`to` is project-relative); the new path. */
export function scratchMove(from: string, to: string): Promise<string> {
  if (live) return invoke("scratch_move", { from, to });
  if (!mockScratch.some((f) => f.path === from)) return Promise.reject(`${from}: not in .scratch/`);
  if (to.startsWith(".scratch")) return Promise.reject(`${to}: that is the scratch folder itself`);
  mockScratch = mockScratch.filter((f) => f.path !== from);
  return Promise.resolve(to);
}

/** Calls back after changes on disk; returns the function that stops listening. */
export function onFsChanged(callback: (change: FsChange) => void): () => void {
  if (live) {
    const unlisten = listen<FsChange>("fs_changed", (event) => callback(event.payload));
    return () => void unlisten.then((stop) => stop());
  }
  // Sample data: report the files flagged in the mock tree once
  const timer = setTimeout(() => {
    const paths = mockTree.flatMap((n) => leaves(n)).filter((f) => f.ai).map((f) => f.path);
    callback({ dirs: [], paths });
  }, 0);
  return () => clearTimeout(timer);
}

const MOCK_PATH =
  new URLSearchParams(window.location.search).get("project") ?? `/home/you/projects/${mockProject.name}`;

/** Sample project info for any path; the file list stays the sample tree. */
function mockInfo(path: string): ProjectInfo {
  const parts = path.replace(/^\/home\/you\/?/, "").split("/").filter(Boolean);
  const crumbs = [{ label: "~", path: "/home/you" }];
  parts.forEach((label, i) => crumbs.push({ label, path: `/home/you/${parts.slice(0, i + 1).join("/")}` }));
  return {
    name: parts.at(-1) ?? "you",
    path,
    root: ["~", ...parts].join("/"),
    crumbs,
  };
}

/** Status of every repository in the project; `rescan` looks for repositories again. */
export function gitStatus(rescan: boolean): Promise<RepoStatus[]> {
  if (live) return invoke("git_status", { rescan });
  const files = mockTree
    .flatMap((n) => leaves(n))
    .filter((f) => f.git)
    .map((f) => ({ path: f.path, state: f.git!, staged: f.git === "A", dir: false }));
  const sub = (path: string, branch: string, changed: string[]): RepoStatus => ({
    path,
    name: path,
    outer: false,
    prefix: "",
    worktreeOf: path === "fixtures" ? "orbit-api" : null,
    branch,
    head: path ? `${path}0`.padEnd(40, "0") : MOCK_ROOT_HEAD,
    upstream: `origin/${branch}`,
    remotes: ["origin"],
    ahead: changed.length ? 1 : 0,
    behind: 0,
    files: changed.map((p) => ({ path: `${path}/${p}`, state: "M", staged: false, dir: false })),
    error: null,
  });
  return Promise.resolve([
    { ...sub("", mockProject.branch, []), name: mockProject.name, files },
    sub("fixtures", "main", []),
    sub("docs", "gh-pages", ["api.md"]),
  ]);
}

export interface ActionResult {
  ok: boolean;
  /** What git printed, both streams */
  output: string;
}

/** Runs exactly these git arguments in a repository (by project-relative path). */
export function gitAction(repo: string, args: string[]): Promise<ActionResult> {
  if (live) return invoke("git_action", { repo, args });
  const output = args[0] === "push" ? "To github.com:you/repo.git\n   1a2b3c4..5d6e7f8  main -> main" : "";
  mockRun(`git ${args.join(" ")}`, [repo || mockProject.name], output);
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true, output }), 400));
}

/** Makes the project folder a git repository (`git init -b main`); only for a project without one. */
export function gitInit(): Promise<ActionResult> {
  if (live) return invoke("git_init");
  mockRun("git init -b main", [mockProject.name], "Initialized empty Git repository");
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true, output: "" }), 400));
}

export interface Commit {
  hash: string;
  short: string;
  /** Unix seconds, author date */
  at: number;
  author: string;
  /** The author is the Git identity configured here */
  byYou: boolean;
  subject: string;
  /** The body without trailers, for reading */
  body: string;
  /** The whole message as written, trailers included, for editing */
  message: string;
  /** On no remote (or there is no remote): its message can still be changed */
  local: boolean;
  /** The co-author that marks it as made with an assistant, if any */
  assistant: string | null;
  files: number;
  insertions: number;
  deletions: number;
  /** On no remote yet */
  unpushed: boolean;
  merge: boolean;
  /** The first commit: it has no parent */
  root: boolean;
}

export interface RepoLog {
  /** Project-relative path of the repository */
  path: string;
  commits: Commit[];
  error: string | null;
}

export interface Patch {
  /** Unified diff; untracked files appear as new files */
  text: string;
  /** The text was cut at its size limit; `changes` is complete nevertheless */
  truncated: boolean;
  /** Every changed file, with the renames and moves Git recognised */
  changes: Change[];
  /** Folders that did not exist before and do now (repository-relative) */
  newDirs: string[];
  /** Folders that existed before and do not any more */
  goneDirs: string[];
}

/** One changed file as `git diff --raw --numstat` reports it; paths are repository-relative. */
export interface Change {
  path: string;
  /** The old path of a rename, the source of a copy */
  from: string | null;
  /** A added, D deleted, M modified, R renamed, C copied, T type changed */
  status: "A" | "D" | "M" | "R" | "C" | "T";
  /** How similar a renamed or copied file is to its source, in percent */
  similarity: number | null;
  /** `100644` file, `100755` executable, `120000` link, `160000` repository, `000000` none */
  oldMode: string;
  newMode: string;
  /** Lines; null for binary files */
  added: number | null;
  removed: number | null;
}

/** The latest commits of the given repositories. */
export function gitHistory(repos: string[]): Promise<RepoLog[]> {
  if (live) return invoke("git_history", { repos });
  return Promise.resolve(repos.map((path) => ({ path, commits: mockCommits(path), error: null })));
}

/** Uncommitted changes of one repository, as a patch. */
export function gitWorkingDiff(repo: string): Promise<Patch> {
  if (live) return invoke("git_working_diff", { repo });
  return Promise.resolve(repo === "docs" ? mockPatch(MOCK_DOCS_PATCH) : mockPatch(MOCK_PATCH, MOCK_MOVES));
}

/** What one commit changed, as a patch. */
export function gitCommitDiff(repo: string, hash: string): Promise<Patch> {
  if (live) return invoke("git_commit_diff", { repo, hash });
  return Promise.resolve(mockPatch(MOCK_PATCH, MOCK_MOVES));
}

/**
 * The working tree of a repository, kept before an assistant wrote for the first time in a turn,
 * and again when the turn was over.
 */
export interface Snapshot {
  /** Project-relative path of the repository */
  repo: string;
  hash: string;
  short: string;
  /** Unix seconds */
  at: number;
  /** What it was taken before, e.g. the prompt of the turn */
  label: string;
  /** The assistant session that was about to write */
  session: string | null;
  /** The first thing it was about to do, e.g. `Edit src/main.rs` */
  tool: string | null;
  /** Taken before going back to another snapshot */
  back: boolean;
  /** The commit that was checked out when it was taken */
  parent: string | null;
  /** For the end of a turn: the snapshot the turn began at */
  turnFrom: string | null;
  /** For the end of a turn: what the assistant said last, as it said it */
  report: string | null;
}

/** Snapshots of the given repositories, newest first. */
export function gitSnapshots(repos: string[]): Promise<Snapshot[]> {
  if (live) return invoke("git_snapshots", { repos });
  const now = Math.floor(Date.now() / 1000);
  const [b, c] = ["3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d"];
  const snap = (name: string, ago: number, label: string, session: string, more: Partial<Snapshot>): Snapshot => ({
    repo: "",
    hash: name.padEnd(40, "0"),
    short: `${name}00`.slice(0, 7),
    at: now - ago,
    label,
    session,
    tool: null,
    back: false,
    parent: MOCK_ROOT_HEAD,
    turnFrom: null,
    report: null,
    ...more,
  });
  return Promise.resolve(
    repos.includes("")
      ? [
          // Since the last commit (4 minutes ago): turns in a row, to show how many of them fold
          snap("snap9", 40, "After: Name the limiter settings consistently", c, { turnFrom: "snap8".padEnd(40, "0") }),
          snap("snap8", 90, "After: Log rejected requests", b, { turnFrom: "snap7".padEnd(40, "0") }),
          snap("snap7", 140, "After: Read the burst size from the config", c, { turnFrom: "snap6".padEnd(40, "0") }),
          snap("snap6", 190, "After: Explain the limiter in the README", b, { turnFrom: "snap5".padEnd(40, "0") }),
          snap("snap5", 220, "Before: Explain the limiter in the README", b, { tool: "Edit README.md" }),
          snap("snap4", 300, "After: Add a per-client rate limit to the orders endpoint.", b, {
            turnFrom: "snap3".padEnd(40, "0"),
            report:
              "The orders endpoint now has a per-client rate limit.\n\n- New middleware `src/middleware/rate_limit.rs`: a token bucket per client, 20 requests per second, bursts up to 40.\n- `src/routes/orders.rs` uses it.\n- `tests/rate_limit.rs` covers refill, burst and rejection.\n\nOne test fails: `burst_refills_fractionally`. The refill uses whole seconds; I left that for you to decide.",
          }),
          snap("snap3", 600, "Before: Add a per-client rate limit to the orders endpoint.", b, { tool: "Write src/middleware/rate_limit.rs" }),
          snap("snap2", 840, "After: Tighten the config defaults", c, { turnFrom: "snap1".padEnd(40, "0"), report: "Tightened the defaults in `src/config.rs`: the rate limit is read from the environment and falls back to 20." }),
          snap("snap1", 900, "Before: Tighten the config defaults", c, { tool: "Edit src/config.rs" }),
        ]
      : [],
  );
}

/** What changed since a snapshot, as a patch. */
export function gitSnapshotDiff(repo: string, hash: string): Promise<Patch> {
  if (live) return invoke("git_snapshot_diff", { repo, hash });
  return Promise.resolve(mockPatch(MOCK_PATCH, MOCK_MOVES));
}

/** Puts the working tree back as it was in a snapshot; the present is kept as one before. */
export function gitRestoreSnapshot(repo: string, hash: string): Promise<void> {
  if (live) return invoke("git_restore_snapshot", { repo, hash });
  mockRun(`git restore --source=${hash.slice(0, 7)} --worktree -- .`, [repo]);
  return Promise.resolve();
}

/** Calls back after a snapshot was taken. */
export function onSnapshotTaken(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("snapshot_taken", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** A comment for the assistant: a line that begins with `@ai`, or with a comment that does (`<!-- @ai …`, `// @ai …`, `# @ai …`). */
export interface Marker {
  /** Project-relative */
  path: string;
  line: number;
  /** What it says, without the marker syntax */
  text: string;
}

export function findMarkers(): Promise<Marker[]> {
  if (live) return invoke("find_markers");
  return Promise.resolve([
    { path: "docs/api.md", line: 4, text: "Name the header that says when to retry" },
    { path: "docs/api.md", line: 19, text: "Example for a held order" },
    { path: "docs/limits.md", line: 2, text: "Shorter; one table instead of the list" },
  ]);
}

/** What a coding tool, or one of its sessions, lets CodeDeck do. The interface offers only this. */
export interface Capabilities {
  /** It reports each step as it happens, so working / waiting / done is known */
  liveStatus: boolean;
  /** It reports before it writes, so a snapshot can be taken first */
  beforeWrite: boolean;
  /** How text gets into a session: added to the next prompt, only by copy and paste, or not at all */
  attach: "withNextPrompt" | "clipboard" | "none";
  /** Text can be given to a session when it starts */
  startRules: boolean;
  /** Its logs tell of sessions CodeDeck did not hear from */
  pastSessions: boolean;
  /** It tells how much of the account's allowance is used */
  usage: boolean;
  /** Its desktop app keeps profiles; CodeDeck can make one and start the app with it */
  desktopProfiles: boolean;
  /** CodeDeck can start and continue its sessions (in tmux) */
  launch: boolean;
  /** Sessions it keeps in the background can be joined in a terminal */
  background: boolean;
  /** A session reachable remotely can be shown in its desktop app */
  desktop: boolean;
}

/** A way into a session: its desktop app, or a terminal (attached to tmux, joining it in the background, or its own window to the front) */
export type Door = "desktop" | "tmux" | "attach" | "window";
/** What can be done to a session's process from CodeDeck */
export type SessionAction = "continue" | "restart" | "stop";

export const isTerminalDoor = (d: Door) => d !== "desktop";

/** A coding tool CodeDeck supports. Its names are the only place texts take a tool's name from. */
export interface HarnessInfo {
  id: string;
  /** In sentences, e.g. "Claude Code" */
  name: string;
  /** Where space is short, e.g. "Claude" */
  shortName: string;
  capabilities: Capabilities;
}

/** A coding assistant session working in the project, as it reported or as its log tells. */
export interface Session {
  id: string;
  /** `id` of the tool it runs in, see `AssistantState.harnesses` */
  harness: string;
  /** What is possible with this session; less than its tool's while it is known from its log only */
  capabilities: Capabilities;
  /** Index of its colour (`--color-session-<n>`), the same wherever the session shows up */
  color: number;
  /** A letter or a few characters to tell it apart at a glance */
  short: string;
  /** Where it runs: project-relative (`""` is the root), or absolute outside the project */
  cwd: string;
  /** The tool's account it runs in, if it told: the usage is the account's */
  account?: string | null;
  /** working; waiting for an answer or a permission; idle: its turn is over; ended */
  status: "working" | "waiting" | "idle" | "ended";
  /** Unix milliseconds */
  started: number;
  last: number;
  /** The latest prompt, shortened */
  prompt: string | null;
  prompts: number;
  /** The title the user gave it in CodeDeck, else the one the tool gave it */
  title: string | null;
  /** The title is the user's */
  renamed: boolean;
  /** The model of its latest answer, as it is shown */
  model: string | null;
  /** What it is waiting for */
  message: string | null;
  /** What it is doing or did last, e.g. `Write docs/api.md` */
  step: string | null;
  /** Unix milliseconds: when its latest turn ended, as it reported; `null` while it works and for a session that never reported */
  turnDone: number | null;
  /** The user saw its finished turn (went into it, opened the turn, put it aside): it waits no longer. Starts over with the next turn */
  seen: boolean;
  /** What it said at the end of its latest turn, plain and shortened; `null` while it works */
  report: string | null;
  /** The session it was split off from when that one was sent to the background */
  continues: string | null;
  /** It was sent to the background: the session that goes on with its conversation there */
  movedTo: string | null;
  /** Where its running turn began: the snapshot per repository it was about to write in; empty between turns */
  turn: { repo: string; hash: string }[];
  /** Files it wrote, project-relative, newest first */
  touched: { path: string; at: number }[];
  /** What it got from CodeDeck, the newest first: attachments with a prompt, the rules at its start */
  received: { at: number; labels: string[] }[];
  /** Where it runs, as its latest message said; missing for a session known from its log only */
  place?: Place | null;
  /** Its process still runs; `null`/missing when that is not known (known from its log only) */
  alive?: boolean | null;
  /** The ways into it that work now, the default first (double click, the card's main button); decided by the backend */
  doors: Door[];
  /** What can be done to its process now */
  actions: SessionAction[];
  /** Why a running session has no way in: no terminal program, or its own terminal window cannot be raised here */
  noDoor: "noTerminal" | "ownTerminal" | null;
}

/** Where a session runs. Only observed so far; groundwork for starting and finding sessions (`docs/SITZUNGEN.md`) */
export interface Place {
  /** The tool's process */
  pid: number | null;
  /** When that process started (clock ticks since boot), so that a reused process id is not taken for it */
  since: number | null;
  /** The tmux pane, and the name of its tmux session once known */
  tmux: { pane: string; session: string | null } | null;
  /** The id CodeDeck gave it when it started it itself */
  launched: string | null;
  /** A link that reaches it from another device or the browser, while it is reachable there */
  remote: string | null;
  /** It runs in the background, hosted by its tool without a terminal: the handle to join it with */
  background?: string | null;
}

/** One limit of an account: the percentage used (it can pass 100) and when it starts over. */
export interface UsageWindow {
  used: number;
  /** Unix seconds */
  resetsAt: number;
}

/** What a tool last stated about one account's allowance (step 2.4); nothing here is estimated. */
export interface AccountUsage {
  /** The tool's account: for Claude Code its configuration folder, as `Connection.dir` says */
  account: string;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  /** Unix milliseconds */
  seen: number;
}

export interface AssistantState {
  /** ▶ can start a session of this project here: its tool starts sessions and tmux is there */
  canStart: boolean;
  /** An event arrived since this window started */
  heard: boolean;
  /** How much of each account's allowance is used, as the tools last stated it */
  usage: AccountUsage[];
  /** The tools CodeDeck supports, the default one first */
  harnesses: HarnessInfo[];
  /** In the order they came in, the newest first: a session keeps its place */
  sessions: Session[];
  /** Colour, short name and title of every session remembered for the project, also those no longer listed */
  identities: { id: string; color: number; short: string; title: string | null }[];
  /** What is attached to the next prompt, in parts that can be removed one by one */
  attachments: Attachment[];
  /** Exactly the text the next prompt gets with it, as the backend builds it; `null` with nothing attached */
  preview: string | null;
  /** The attachments that went out last (which session took them, when, which parts at which revision), until the next is attached */
  delivered: { session: string; at: number; labels: string[]; parts: { key: string; rev: number }[] } | null;
  /** The session the attachments are meant for; `null`: see `any` and `held` */
  target: string | null;
  /** Chosen on purpose: whichever session in the project prompts first gets them */
  any: boolean;
  /** The attachments wait and reach no one: nothing is chosen and more than one session could take them */
  held: boolean;
  /** The session it was meant for until that one ended or left the list: nothing is chosen now */
  targetLost: string | null;
  /** The session that got the start rules last, and when */
  ruled: { session: string; at: number } | null;
  /** What the project's sessions left outside it (2.2) */
  found: Found;
}

/** Files left outside the project and pages published elsewhere, by the project's sessions. */
export interface Found {
  /** Only files that are still there, newest first */
  outside: OutsideFile[];
  pages: PublishedPage[];
}

export interface OutsideFile {
  /** Absolute */
  path: string;
  session: string;
  /** Unix milliseconds of the write */
  at: number;
  /** Project-relative path of the copy in the scratch folder, once fetched */
  fetched: string | null;
  size: number;
  modified: number;
}

export interface PublishedPage {
  url: string;
  title: string;
  session: string;
  /** Unix milliseconds: when the session last named it */
  at: number;
}

/** One part of what is attached to the next prompt. */
export interface Attachment {
  /** `files`, `changes`, `notes` (line comments) or `markers` (hints) */
  key: string;
  text: string;
  label: string;
  /** The window's count of its changes to the part, see `attachments.ts` */
  rev: number;
}

const MOCK_CAPABILITIES: Capabilities = { liveStatus: true, beforeWrite: true, attach: "withNextPrompt", startRules: true, pastSessions: true, usage: true, desktopProfiles: true, launch: true, background: true, desktop: true };

/** A second tool for the preview (`?tool=minimal`, docs/SITZUNGEN-PRUEFUNG.md K7): no start, no desktop
 *  app, no live status. Nothing it cannot do may be offered; the project then runs with it. */
const MINIMAL: Capabilities = { liveStatus: false, beforeWrite: false, attach: "clipboard", startRules: false, pastSessions: true, usage: false, desktopProfiles: false, launch: false, background: false, desktop: false };
const withMinimal = new URLSearchParams(window.location.search).get("tool") === "minimal";

/** The mock's stand-in for `doors.rs` `ways`: what is offered for a session on the preview's computer. */
function mockWays(s: Session, p: Platform): Pick<Session, "doors" | "actions" | "noDoor"> {
  const c = s.capabilities;
  const background = !!s.place?.background;
  const over = s.status === "ended" || s.alive === false || (!c.liveStatus && s.alive !== true);
  const moved = !!s.movedTo;
  const none = { doors: [] as Door[], actions: [] as SessionAction[], noDoor: null };
  if (over) {
    const can = background ? c.background && !!p.terminal : c.launch && !!p.tmux;
    return { ...none, actions: can && !moved ? ["continue"] : [] };
  }
  if (moved || !s.place) return none;
  const place = s.place;
  const doors: Door[] = place.remote && c.desktop ? ["desktop"] : [];
  const door: Door | null = background ? (c.background && p.terminal ? "attach" : null) : place.tmux ? (p.terminal ? "tmux" : null) : place.pid != null && p.raiseWindows ? "window" : null;
  if (door) doors.push(door);
  const noDoor = door ? null : background || place.tmux ? (p.terminal ? null : "noTerminal") : place.pid != null ? "ownTerminal" : null;
  const ours = !!place.launched && !!place.tmux?.session && s.status !== "working";
  const actions: SessionAction[] = ours ? [...(c.launch && p.tmux ? (["restart"] as const) : []), "stop"] : [];
  return { doors, actions, noDoor };
}

const mockAssistant: AssistantState = {
  canStart: true,
  heard: true,
  // One account at an easy pace, one that would use its week up before the reset
  usage: [
    { account: "/home/me/.claude", fiveHour: { used: 38, resetsAt: Math.floor(Date.now() / 1000) + 4 * 3600 }, sevenDay: { used: 31, resetsAt: Math.floor(Date.now() / 1000) + 4 * 86400 }, seen: Date.now() - 20_000 },
    { account: "/home/me/.claude-private", fiveHour: { used: 86, resetsAt: Math.floor(Date.now() / 1000) + 3 * 3600 }, sevenDay: { used: 48, resetsAt: Math.floor(Date.now() / 1000) + 3 * 86400 }, seen: Date.now() - 90_000 },
  ],
  harnesses: [
    { id: "claude", name: "Claude Code", shortName: "Claude", capabilities: MOCK_CAPABILITIES },
    ...(withMinimal ? [{ id: "minimal", name: "Minimal Tool", shortName: "Minimal", capabilities: MINIMAL }] : []),
  ],
  sessions: [
    {
      id: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a",
      harness: "claude",
      doors: [],
      actions: [],
      noDoor: null,
      capabilities: MOCK_CAPABILITIES,
      color: 1,
      short: "B",
      renamed: false,
      cwd: "",
      status: "working",
      started: Date.now() - 20 * 60_000,
      last: Date.now() - 5_000,
      prompt: "Held orders in the fixture should not count against the limit.",
      prompts: 2,
      title: "Per-client rate limit for orders",
      model: "opus-5-5",
      message: null,
      step: "Edit tests/rate_limit.rs",
      turnDone: null,
      seen: false,
      continues: null,
      movedTo: null,
      report: null,
      // Its second turn runs; it began where the first one ended
      turn: [{ repo: "", hash: "snap4".padEnd(40, "0") }],
      touched: [
        { path: "tests/rate_limit.rs", at: Date.now() - 40_000 },
        { path: "src/middleware/rate_limit.rs", at: Date.now() - 120_000 },
        { path: ".scratch/bench-results.csv", at: Date.now() - 24 * 60_000 },
        { path: ".scratch/bench_limiter.py", at: Date.now() - 25 * 60_000 },
      ],
      received: [
        { at: Date.now() - 12 * 60_000, labels: ["2 line comments", "1 change"] },
        { at: Date.now() - 20 * 60_000, labels: ["Start rules"] },
      ],
      place: { pid: 48211, since: 991_204, tmux: { pane: "%3", session: "orbit-api" }, launched: "b7k-mock", remote: "https://claude.ai/code/session_01MockB7Kq" },
    },
    {
      id: "b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f",
      harness: "claude",
      doors: [],
      actions: [],
      noDoor: null,
      capabilities: MOCK_CAPABILITIES,
      color: 0,
      short: "A",
      renamed: false,
      cwd: "docs",
      status: "waiting",
      started: Date.now() - 50 * 60_000,
      last: Date.now() - 3 * 60_000,
      prompt: "Document the limiter",
      prompts: 1,
      title: "Limiter documentation",
      model: "sonnet-5-5",
      message: "Claude needs your permission to use Bash",
      step: "Bash cargo test --all -- --nocapture",
      turnDone: null,
      seen: false,
      continues: null,
      movedTo: null,
      report: null,
      turn: [],
      touched: [{ path: "docs/api.md", at: Date.now() - 4 * 60_000 }],
      received: [],
      place: { pid: 50377, since: 1_002_310, tmux: null, launched: null, remote: null },
    },
    {
      id: "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d",
      harness: "claude",
      doors: [],
      actions: [],
      noDoor: null,
      capabilities: MOCK_CAPABILITIES,
      color: 2,
      short: "C",
      renamed: false,
      cwd: "",
      status: "idle",
      started: Date.now() - 70 * 60_000,
      last: Date.now() - 6 * 60_000,
      prompt: "Tighten the config defaults",
      prompts: 3,
      title: "Config defaults",
      model: "sonnet-5-5",
      message: null,
      step: "Edit src/config.rs",
      turnDone: Date.now() - 6 * 60_000,
      seen: false,
      continues: null,
      movedTo: null,
      report: "Defaults now come from the environment, with the old values as fallback. README and the config tests are updated. Still open: the migration note for existing deployments.",
      turn: [],
      touched: [{ path: "src/config.rs", at: Date.now() - 7 * 60_000 }],
      received: [],
    },
    {
      id: "d92a0b13-7c4e-4d5f-9a6b-0e1f2a3b4c5d",
      harness: "claude",
      doors: [],
      actions: [],
      noDoor: null,
      // Known from its log only: nothing that needs it to report
      capabilities: { ...MOCK_CAPABILITIES, liveStatus: false, beforeWrite: false, attach: "none" },
      color: 3,
      short: "D",
      renamed: false,
      cwd: "",
      status: "idle",
      started: Date.now() - 20 * 3600_000,
      last: Date.now() - 19 * 3600_000,
      prompt: "Sketch the project layout",
      prompts: 0,
      title: "Initial project layout",
      model: "opus-5-5",
      message: null,
      step: null,
      turnDone: null,
      seen: false,
      continues: null,
      // Sent to the background: it goes on there as E
      movedTo: "e5b81c24-9d3a-4e7f-8c12-3a4b5c6d7e8f",
      report: "The layout stands: src/ for the service, tests/ beside it, docs/ for the API. Next would be the first endpoint.",
      turn: [],
      touched: [],
      received: [],
    },
    {
      // Sent to the background (no terminal): its turn ended with a question the tool recorded
      id: "e5b81c24-9d3a-4e7f-8c12-3a4b5c6d7e8f",
      harness: "claude",
      doors: [],
      actions: [],
      noDoor: null,
      capabilities: MOCK_CAPABILITIES,
      color: 4,
      short: "E",
      renamed: false,
      cwd: "",
      status: "waiting",
      started: Date.now() - 18 * 3600_000,
      last: Date.now() - 9 * 60_000,
      prompt: "Go on with the first endpoint",
      prompts: 1,
      title: "Initial project layout",
      model: "opus-5-5",
      message: "Shall I make a first commit, or do you want to try the app yourself first?",
      step: null,
      turnDone: Date.now() - 9 * 60_000,
      seen: false,
      continues: "d92a0b13-7c4e-4d5f-9a6b-0e1f2a3b4c5d",
      movedTo: null,
      report: null,
      turn: [],
      touched: [{ path: "src/routes/orders.rs", at: Date.now() - 12 * 60_000 }],
      received: [],
      place: { pid: 83595, since: 314_634, tmux: null, launched: null, remote: null, background: "e5b81c24" },
    },
    ...(withMinimal
      ? [
          {
            // The second tool, started by CodeDeck in tmux, with a remote link: only its terminal is a
            // way in, it can be stopped but not restarted (its tool does not start)
            id: "f1a2b3c4-0000-4000-8000-00000000000f",
            harness: "minimal",
            doors: [],
            actions: [],
            noDoor: null,
            capabilities: MINIMAL,
            color: 5,
            short: "F",
            renamed: false,
            cwd: "",
            status: "idle" as const,
            started: Date.now() - 30 * 60_000,
            last: Date.now() - 2 * 60_000,
            prompt: "Rename the config keys",
            prompts: 1,
            title: "Config keys",
            model: null,
            message: null,
            step: null,
            turnDone: null,
            seen: false,
            continues: null,
            movedTo: null,
            report: null,
            turn: [],
            touched: [],
            received: [],
            place: { pid: 91234, since: 1_100_000, tmux: { pane: "%7", session: "work" }, launched: "minimal-mock", remote: "https://example.org/session/f" },
            alive: true,
          },
        ]
      : []),
  ],
  identities: [
    { id: "e5b81c24-9d3a-4e7f-8c12-3a4b5c6d7e8f", color: 4, short: "E", title: "Initial project layout" },
    { id: "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d", color: 2, short: "C", title: "Config defaults" },
    { id: "d92a0b13-7c4e-4d5f-9a6b-0e1f2a3b4c5d", color: 3, short: "D", title: "Initial project layout" },
    { id: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", color: 1, short: "B", title: "Per-client rate limit for orders" },
    { id: "b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f", color: 0, short: "A", title: "Limiter documentation" },
  ],
  attachments: [],
  preview: null,
  delivered: null,
  target: null,
  any: false,
  held: false,
  targetLost: null,
  ruled: { session: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", at: Date.now() - 20 * 60_000 },
  found: {
    outside: [
      {
        path: "/home/me/.claude/plans/api-docs-outline.md",
        session: "b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f",
        at: Date.now() - 42 * 60_000,
        fetched: null,
        size: 3100,
        modified: Date.now() - 42 * 60_000,
      },
      {
        path: "/tmp/limiter-bench.csv",
        session: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a",
        at: Date.now() - 3 * 3600_000,
        fetched: ".scratch/limiter-bench.csv",
        size: 14_200,
        modified: Date.now() - 3 * 3600_000,
      },
    ],
    pages: [
      {
        url: "https://claude.ai/artifact/7d1f3c2a-rate-limit-dashboard",
        title: "Rate limit dashboard mock-up",
        session: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a",
        at: Date.now() - 95 * 60_000,
      },
    ],
  },
};
/** The titles the tool gave the mock sessions, to go back to */
const mockToolTitles = new Map(mockAssistant.sessions.map((s) => [s.id, s.title]));
const mockAssistantListeners = new Set<(state: AssistantState) => void>();

export function assistantState(): Promise<AssistantState> {
  if (live) return invoke("assistant_state");
  return Promise.resolve(mockWithWays(mockAssistant));
}

/** The mock state with what the backend works out when it is asked: ways per session, whether ▶ starts. */
function mockWithWays(state: AssistantState): AssistantState {
  const p = mockPlatform();
  // With the second tool the project runs with it, and it cannot start sessions
  return { ...state, canStart: !!p.tmux && !withMinimal, sessions: state.sessions.map((s) => ({ ...s, ...mockWays(s, p) })) };
}

export function onAssistantChanged(callback: (state: AssistantState) => void): () => void {
  if (live) {
    const unlisten = listen<AssistantState>("assistant_changed", (event) => callback(event.payload));
    return () => void unlisten.then((stop) => stop());
  }
  mockAssistantListeners.add(callback);
  return () => mockAssistantListeners.delete(callback);
}

/** A receipt the mock holds back, to play the race of a prompt and an attachment (see `mockSendPrompt`). */
let mockHeldReceipt: AssistantState | null = null;

/** The mock's stand-in for the backend: the attachments joined as the backend joins them. */
function mockChanged() {
  // As in the backend, the receipt went out before anything that came after it
  if (mockHeldReceipt) {
    const held = mockHeldReceipt;
    mockHeldReceipt = null;
    mockAssistantListeners.forEach((cb) => cb(mockWithWays(held)));
  }
  const list = mockAssistant.attachments;
  mockAssistant.preview = list.length ? list.map((a) => a.text).join("\n\n") : null;
  if (list.length === 0) Object.assign(mockAssistant, { target: null, any: false, targetLost: null });
  mockAssistant.held = mockHeld();
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
}

/** As the backend decides it: nothing chosen, and more than one running session could take the attachments. */
function mockHeld(): boolean {
  const a = mockAssistant;
  const receivers = a.sessions.filter((s) => s.status !== "ended" && s.capabilities.attach === "withNextPrompt" && s.alive !== false);
  return a.attachments.length > 0 && !a.target && !a.any && receivers.length > 1;
}

/** One part of the attachments to the next prompt; `null` removes that part. */
export function attach(key: string, text: string | null, label?: string, rev = 0): Promise<void> {
  if (live) return invoke("attach", { key, text, label: label ?? null, rev });
  const list = mockAssistant.attachments;
  const part = { key, text: text ?? "", label: label ?? "", rev };
  // Replaced in place, as the backend does: the order stays the order of attaching
  mockAssistant.attachments =
    text === null ? list.filter((a) => a.key !== key) : list.some((a) => a.key === key) ? list.map((a) => (a.key === key ? part : a)) : [...list, part];
  if (text !== null) mockAssistant.delivered = null;
  mockChanged();
  return Promise.resolve();
}

/**
 * In the preview only: a prompt is sent in the first session, which takes the attachments. `hold`:
 * the receipt reaches the window only with the next change, as when something is attached while
 * the prompt is being sent.
 */
export function mockSendPrompt(hold = false) {
  const s = mockAssistant.sessions.find((x) => x.id === mockAssistant.target) ?? mockAssistant.sessions[0];
  const list = mockAssistant.attachments;
  if (!list.length || mockAssistant.held) return;
  const at = Date.now();
  const labels = list.map((a) => a.label);
  mockAssistant.delivered = { session: s.id, at, labels, parts: list.map((a) => ({ key: a.key, rev: a.rev })) };
  mockAssistant.sessions = mockAssistant.sessions.map((x) => (x.id === s.id ? { ...x, received: [{ at, labels }, ...x.received] } : x));
  mockAssistant.attachments = [];
  mockAssistant.preview = null;
  if (hold) mockHeldReceipt = { ...mockAssistant };
  else mockChanged();
}
if (!live) (window as unknown as { mockSendPrompt: (hold?: boolean) => void }).mockSendPrompt = mockSendPrompt;

/** Preview only: the working session asks for a permission, as if its tool said so. */
function mockAsk() {
  mockAssistant.sessions = mockAssistant.sessions.map((x) =>
    x.status === "working" ? { ...x, status: "waiting", message: "Claude needs your permission to use Bash", last: Date.now() } : x,
  );
  mockChanged();
}
if (!live) (window as unknown as { mockAsk: () => void }).mockAsk = mockAsk;

/**
 * The session the attachments are meant for. Without one, `any` makes it whichever session in the
 * project prompts first; otherwise nothing is chosen (with several sessions they wait).
 */
export function attachFor(session: string | null, any = false): Promise<void> {
  if (live) return invoke("attach_for", { session, any });
  Object.assign(mockAssistant, { target: session, any: any && !session, targetLost: null });
  mockChanged();
  return Promise.resolve();
}

/** The rules every session gets when it starts, word for word (the mock copies the backend's). */
export function startRules(): Promise<string> {
  if (live) return invoke("start_rules");
  return Promise.resolve(
    "Rules from CodeDeck, the app the user watches this project with. They are always the same and the user sees them there:\n" +
      "- Put drafts, mock-ups, throwaway scripts and test data into .scratch/ in this project, not into /tmp or your home folder. Git ignores that folder; the user sees it in CodeDeck.\n" +
      "- When you publish a page somewhere else (a shared document, an artifact, a gist, a paste), say so in your answer and give its link.",
  );
}

/** The user's title and short name for a session; an empty title brings the tool's back, an empty short name keeps it. */
export function renameSession(id: string, title: string | null, short: string | null): Promise<void> {
  if (live) return invoke("rename_session", { id, title, short });
  const name = title?.trim() || null;
  mockAssistant.sessions = mockAssistant.sessions.map((s) =>
    s.id === id ? { ...s, title: name ?? mockToolTitles.get(id) ?? null, renamed: name !== null, short: short?.trim().slice(0, 4) || s.short } : s,
  );
  mockAssistant.identities = mockAssistant.sessions.map((s) => ({ id: s.id, color: s.color, short: s.short, title: s.title }));
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
  return Promise.resolve();
}

/** Takes a session off the list of this project; it comes back by itself when it takes its next step. */
export function forgetSession(id: string): Promise<void> {
  if (live) return invoke("forget_session", { id });
  mockAssistant.sessions = mockAssistant.sessions.filter((s) => s.id !== id);
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
  return Promise.resolve();
}

/** The user saw a session's finished turn: it waits no longer (until its next turn). */
export function sessionSeen(id: string): Promise<void> {
  if (live) return invoke("session_seen", { id });
  mockAssistant.sessions = mockAssistant.sessions.map((s) => (s.id === id && s.turnDone != null ? { ...s, seen: true } : s));
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
  return Promise.resolve();
}

/** Continues this one conversation in tmux (not the latest, as `startSession` does): the tmux session's name. */
export function resumeSession(project: string, session: string): Promise<string> {
  if (live) return invoke("resume_session", { project, session });
  return Promise.resolve(`codedeck-${project.split("/").pop()}`);
}

/** Copies a file a session left outside into the scratch folder; the copy's project-relative path. */
export function fetchOutside(path: string): Promise<string> {
  if (live) return invoke("fetch_outside", { path });
  const name = path.split("/").pop() ?? "file";
  const copy = `.scratch/${name}`;
  mockAssistant.found = { ...mockAssistant.found, outside: mockAssistant.found.outside.map((f) => (f.path === path ? { ...f, fetched: copy } : f)) };
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
  return Promise.resolve(copy);
}

/** Opens a file left outside in its program for viewing, or (`role` null) shows it in the file manager. */
export function openOutside(path: string, role: "view" | "edit" | null): Promise<void> {
  if (live) return invoke("open_outside", { path, role });
  console.info(role ? "would open" : "would show in the file manager", path);
  return Promise.resolve();
}

/** Forgets a file left outside (by its path) or a published page (by its address). */
export function forgetFound(key: string): Promise<void> {
  if (live) return invoke("forget_found", { key });
  mockAssistant.found = {
    outside: mockAssistant.found.outside.filter((f) => f.path !== key),
    pages: mockAssistant.found.pages.filter((p) => p.url !== key),
  };
  mockAssistantListeners.forEach((cb) => cb(mockWithWays(mockAssistant)));
  return Promise.resolve();
}

/** Whether one account's coding tool reports to CodeDeck. */
export interface Connection {
  /** `id` of the tool */
  harness: string;
  /** The account's configuration directory */
  dir: string;
  /** The file the connection is written into */
  settings: string;
  installed: boolean;
  /** It reports to another CodeDeck than this one, e.g. a development build */
  other: string | null;
  /** What the tool runs to report, for this CodeDeck */
  command: string;
  /** CodeDeck sits on its status line and hears the usage from there */
  usage: boolean;
  /** The status line of the user's that stays in use alongside; `null`: there is none */
  usageKeeps: string | null;
  /** What it would run as the status line, for this CodeDeck (the one that stays is `--then` in it) */
  usageCommand?: string;
}

let mockConnections: Connection[] = [
  { harness: "claude", dir: "/home/me/.claude", settings: "/home/me/.claude/settings.json", installed: true, other: null, command: "/usr/bin/codedeck hook", usage: true, usageKeeps: "bash /home/me/.claude/statusline.sh" },
  { harness: "claude", dir: "/home/me/.claude-private", settings: "/home/me/.claude-private/settings.json", installed: false, other: null, command: "/usr/bin/codedeck hook", usage: true, usageKeeps: null },
];

/** The connection of every tool and account found. */
export function harnessConnections(): Promise<Connection[]> {
  if (live) return invoke("harness_connections");
  return Promise.resolve(mockConnections);
}

/** Makes the tool of one account (`dir`) report to CodeDeck, or stops that. */
export function setHarnessConnection(harness: string, account: string, install: boolean): Promise<Connection[]> {
  if (live) return invoke("set_harness_connection", { harness, account, install });
  mockConnections = mockConnections.map((c) => (c.harness === harness && c.dir === account ? { ...c, installed: install, other: null } : c));
  return Promise.resolve(mockConnections);
}

/** Puts CodeDeck on the status line of one account (`dir`) to hear its usage, or takes it off. */
export function setUsageConnection(harness: string, account: string, install: boolean): Promise<Connection[]> {
  if (live) return invoke("set_usage_connection", { harness, account, install });
  mockConnections = mockConnections.map((c) => (c.harness === harness && c.dir === account ? { ...c, usage: install } : c));
  return Promise.resolve(mockConnections);
}

/** What changed from one commit (or snapshot) to another: the older one first. */
export function gitCompare(repo: string, from: string, to: string): Promise<Patch> {
  if (live) return invoke("git_compare", { repo, from, to });
  return Promise.resolve(mockPatch(MOCK_PATCH, MOCK_MOVES));
}

/** Whether Dirq, the diff viewer of be spex, is installed. */
export function hasDiffViewer(): Promise<boolean> {
  if (live) return invoke("has_diff_viewer");
  return Promise.resolve(true);
}

/** Shows a patch in Dirq (one window, reused). */
export function showPatch(text: string): Promise<void> {
  if (live) return invoke("show_patch", { text });
  console.info("would show in dirq", text.length, "bytes");
  return Promise.resolve();
}

/** Whether Marq, the Markdown viewer of be spex, is installed. */
export function hasMarkdownViewer(): Promise<boolean> {
  if (live) return invoke("has_markdown_viewer");
  return Promise.resolve(true);
}

/** Shows Markdown text as a page in Marq (one window, reused). */
export function showMarkdown(text: string): Promise<void> {
  if (live) return invoke("show_markdown", { text });
  console.info("would show in marq", text.length, "characters");
  return Promise.resolve();
}

/** The git commands run so far, oldest first. */
export function gitLog(): Promise<GitRun[]> {
  if (live) return invoke("git_log");
  return Promise.resolve([]);
}

/** Calls back after every git command. */
export function onGitRan(callback: (run: GitRun) => void): () => void {
  if (live) {
    const unlisten = listen<GitRun>("git_ran", (event) => callback(event.payload));
    return () => void unlisten.then((stop) => stop());
  }
  mockListeners.add(callback);
  return () => mockListeners.delete(callback);
}

/** Calls back after changes inside a `.git` directory. */
export function onGitChanged(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("git_changed", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

const mockListeners = new Set<(run: GitRun) => void>();
let mockId = 0;
function mockRun(command: string, repos: string[], output = "", ok = true) {
  const at = Date.now();
  const changes = /^git (add|commit|pull|push|fetch|restore|rm|clean)\b/.test(command);
  repos.forEach((repo) =>
    mockListeners.forEach((cb) =>
      cb({ id: ++mockId, repo, command, ok, code: ok ? 0 : 1, ms: 9, at, changes, output }),
    ),
  );
}

function toEntry(node: FileNode): Entry {
  return {
    name: node.name,
    path: node.path,
    isDir: !!node.children,
    size: (node.tokens ?? 0) * 4,
  };
}

function find(nodes: FileNode[], path: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children && path.startsWith(`${node.path}/`)) return find(node.children, path);
  }
}

function leaves(node: FileNode | undefined): FileNode[] {
  if (!node) return [];
  return node.children ? node.children.flatMap(leaves) : [node];
}

function mockCommits(repo: string): Commit[] {
  const now = Math.floor(Date.now() / 1000);
  const rows: [number, string, string | null, boolean][] =
    repo === ""
      ? [
          [4 * 60, "Add rate limit middleware", "Claude", true],
          [11 * 60, "Wire limiter into orders route", "Claude", false],
          [38 * 60, "Tighten config defaults", null, false],
          [26 * 3600, "Extract order validation", "Claude", false],
          [28 * 3600, "Bump axum to 0.8", null, false],
          [3 * 86400, "Initial project layout", null, false],
        ]
      : repo === "docs"
        ? [
            [20 * 60, "Document the limiter", "Claude", true],
            [27 * 3600, "Publish API reference", null, false],
          ]
        : [[5 * 86400, "Sample orders for tests", null, false]];
  return rows.map(([ago, subject, assistant, unpushed], i) => {
    const hash = `${repo || "root"}${i}`.padEnd(40, "0");
    return {
      hash,
      short: hash.slice(0, 7),
      at: now - ago,
      author: i === 2 ? "Kim Weber" : "You",
      byYou: i !== 2,
      subject,
      body: i === 0 ? "Token bucket per client, configured in limits.toml." : "",
      message: `${subject}${i === 0 ? "\n\nToken bucket per client, configured in limits.toml." : ""}${assistant ? "\n\nCo-authored-by: Claude <noreply@anthropic.com>" : ""}`,
      local: unpushed,
      assistant,
      files: 2 + i,
      insertions: 40 - i * 5,
      deletions: i * 3,
      unpushed,
      merge: false,
      root: i === rows.length - 1,
    };
  });
}

/** What the backend reports, derived from a patch, plus changes without a diff of their own. */
function mockPatch(text: string, extra: Change[] = []): Patch {
  const changes: Change[] = parsePatch(text).map((f) => ({
    path: f.path,
    from: f.from ?? null,
    status: f.status,
    similarity: f.status === "R" ? 100 : null,
    oldMode: f.status === "A" ? "000000" : "100644",
    newMode: f.status === "D" ? "000000" : "100644",
    added: f.binary ? null : f.added,
    removed: f.binary ? null : f.removed,
  }));
  const all = [...changes, ...extra];
  return {
    text,
    truncated: false,
    changes: all,
    newDirs: all.some((c) => c.path.startsWith("src/middleware/")) ? ["src/middleware", "src/http"] : [],
    goneDirs: extra.length ? ["src/net", "docs/old"] : [],
  };
}

const move = (from: string, path: string, similarity = 100, added = 0, removed = 0): Change => ({
  path, from, status: "R", similarity, oldMode: "100644", newMode: "100644", added, removed,
});

const MOCK_MOVES: Change[] = [
  move("src/net/client.rs", "src/http/client.rs"),
  move("src/net/retry.rs", "src/http/retry.rs", 92, 4, 2),
  move("src/util.rs", "src/helpers.rs"),
  { path: "docs/old/setup.md", from: null, status: "D", similarity: null, oldMode: "100644", newMode: "000000", added: 0, removed: 41 },
  { path: "scripts/release.sh", from: null, status: "M", similarity: null, oldMode: "100644", newMode: "100755", added: 0, removed: 0 },
  { path: "assets/logo.png", from: null, status: "A", similarity: null, oldMode: "000000", newMode: "100644", added: null, removed: null },
];

const MOCK_PATCH = `diff --git a/src/routes/orders.rs b/src/routes/orders.rs
index 1a2b3c4..5d6e7f8 100644
--- a/src/routes/orders.rs
+++ b/src/routes/orders.rs
@@ -12,7 +12,9 @@ use crate::limits::Limiter;
 pub async fn create_order(
     State(app): State<App>,
     Json(order): Json<NewOrder>,
-) -> Result<Json<Order>, ApiError> {
+) -> Result<Json<Order>, ApiError> {
+    app.limiter.check(&order.client)?;
+
     let order = app.orders.insert(order).await?;
     Ok(Json(order))
 }
diff --git a/src/middleware/rate_limit.rs b/src/middleware/rate_limit.rs
new file mode 100644
--- /dev/null
+++ b/src/middleware/rate_limit.rs
@@ -0,0 +1,6 @@
+//! Token bucket per client.
+pub struct Limiter {
+    capacity: u32,
+    refill_per_sec: u32,
+}
+
diff --git a/src/config.rs b/src/config.rs
index 2b3c4d5..6e7f8a9 100644
--- a/src/config.rs
+++ b/src/config.rs
@@ -3,4 +3,4 @@
 pub struct Config {
-    pub timeout_secs: u64 = 30,
+    pub timeout_secs: u64 = 10,
     pub port: u16,
 }
diff --git a/tests/rate_limit.rs b/tests/rate_limit.rs
new file mode 100644
--- /dev/null
+++ b/tests/rate_limit.rs
@@ -0,0 +1,3 @@
+#[test]
+fn refuses_the_eleventh_request() {}
+
diff --git a/Cargo.toml b/Cargo.toml
index 3c4d5e6..7f8a9b0 100644
--- a/Cargo.toml
+++ b/Cargo.toml
@@ -8,3 +8,4 @@ edition = "2021"
 axum = "0.8"
 tokio = { version = "1", features = ["full"] }
+governor = "0.6"
`;

const MOCK_DOCS_PATCH = `diff --git a/api.md b/api.md
index 1111111..2222222 100644
--- a/api.md
+++ b/api.md
@@ -1,3 +1,5 @@
 # API
+
+Requests beyond 10 per second get \`429 Too Many Requests\`.
 
 ## Orders
`;

/* ── Attention ───────────────────────────────────────────────────────────── */

/** What the user wants to be told about, and how (kept for the machine, shared by all windows). */
export interface AttentionSettings {
  asks: boolean;
  done: boolean;
  gitFailed: boolean;
  taskbar: boolean;
  desktop: boolean;
  /** "Do not disturb" until then (Unix milliseconds); the window title still counts */
  quietUntil: number | null;
}

let mockAttention: AttentionSettings = { asks: true, done: true, gitFailed: false, taskbar: true, desktop: true, quietUntil: null };

export function attentionSettings(): Promise<AttentionSettings> {
  if (live) return invoke("attention_settings");
  return Promise.resolve({ ...mockAttention });
}

export function setAttentionSettings(settings: AttentionSettings): Promise<void> {
  if (live) return invoke("set_attention_settings", { settings });
  mockAttention = { ...settings };
  return Promise.resolve();
}

/** Tells the user, in the ways they chose; the preview only keeps what it would have said. A new one with the same `key` replaces the old one on the desktop. */
export function notifyAttention(key: string, summary: string, body: string): Promise<void> {
  if (live) return invoke("notify_attention", { key, summary, body });
  mockNotifications.push({ summary, body });
  return Promise.resolve();
}
const mockNotifications: { summary: string; body: string }[] = [];
if (!live) (window as unknown as { mockNotifications: typeof mockNotifications }).mockNotifications = mockNotifications;

/** What follows the project's name in the window title, e.g. "● 2 asking"; empty for nothing. */
export function setTitleStatus(status: string, asks = 0, done = 0): Promise<void> {
  if (live) return invoke("set_title_status", { status, asks, done });
  document.title = status ? `orbit-api ${status} – CodeDeck` : "orbit-api – CodeDeck";
  return Promise.resolve();
}

/* ── The app itself ──────────────────────────────────────────────────────── */

export interface AppInfo {
  version: string;
  /** Short hash of the commit it was built from; empty when built outside a repository */
  commit: string;
  /** The distribution, e.g. "Linux Mint 22.1" */
  os: string;
}

export function appInfo(): Promise<AppInfo> {
  if (live) return invoke("app_info");
  return Promise.resolve({ version: "0.1.1", commit: "fdffba4", os: "Linux Mint 22.1 (preview)" });
}

/** What this computer offers CodeDeck, found once when it starts (`platform.rs`). */
export interface Platform {
  /** tmux version, e.g. "tmux 3.4"; null: sessions cannot be started or continued from CodeDeck */
  tmux: string | null;
  /** The terminal program's name; null: no terminal door */
  terminal: string | null;
  /** A session started by hand in a terminal can have its window brought to the front (X11) */
  raiseWindows: boolean;
  globalShortcuts: boolean;
  placeWindows: boolean;
  wayland: boolean;
  /** `$XDG_CURRENT_DESKTOP`, e.g. "X-Cinnamon" */
  desktop: string;
  /** A tray host runs */
  tray: boolean;
}

export function platform(): Promise<Platform> {
  if (live) return invoke("platform");
  return Promise.resolve(mockPlatform());
}

function mockPlatform(): Platform {
  // In the preview `?platform=wayland,notmux,noterminal,notray` shows what CodeDeck does without them
  const off = (new URLSearchParams(window.location.search).get("platform") ?? "").split(",");
  const wayland = off.includes("wayland");
  return {
    tmux: off.includes("notmux") ? null : "tmux 3.4",
    terminal: off.includes("noterminal") ? null : "x-terminal-emulator",
    raiseWindows: !wayland,
    globalShortcuts: !wayland,
    placeWindows: !wayland,
    wayland,
    desktop: wayland ? "KDE" : "X-Cinnamon",
    tray: !off.includes("notray"),
  };
}

/** Opens a web address in the browser. */
export function openUrl(url: string): Promise<void> {
  if (live) return invoke("open_url", { url });
  console.info("would open", url);
  return Promise.resolve();
}


// ── The overview of all projects (docs/UEBERSICHT.md) ─────────────────────────

/** What a project window tells the overview about its project; every field optional. */
export interface ProjectSummary {
  /** Git in a few words, e.g. "3 uncommitted · ↑2"; `gitFailed` when a command failed */
  git?: string;
  gitFailed?: boolean;
  /** Files not committed yet */
  uncommitted?: number;
  /** Parts attached to the next prompt */
  next?: number;
  /** New in the Workbench since the last look */
  news?: number;
}

/** One of my projects as the overview shows it, with its window or without. */
export interface OverviewProject {
  /** The label of its window; `null` while it has none */
  label: string | null;
  name: string;
  path: string;
  /** `#rrggbb` until the user picks a mark */
  color: string;
  /** Its sessions; `null` without a window, until sessions are kept without one */
  state: AssistantState | null;
  summary: ProjectSummary | null;
  /** Its window has the focus or had it last */
  front: boolean;
  /** On my list of projects */
  listed: boolean;
  /** Its window is loaded and shown, not hidden */
  visible: boolean;
  /** On today's list */
  daily: boolean;
  /** The AI configuration its sessions should run with (a configuration folder) */
  account: string | null;
  /** Its mark as chosen; `null`: the first letter on its colour */
  mark: ProjectMarkSpec | null;
  /** Its place among the projects shown lately, 0 the newest; `null` when not among them */
  recent: number | null;
}

/** A project's mark (docs/UEBERSICHT.md): a Lucide icon, an emoji or its first letter, on a colour. */
export interface ProjectMarkSpec {
  kind: "icon" | "emoji" | "letter";
  value?: string;
  /** `#rrggbb`; missing: the project's colour */
  color?: string;
}

/** Changes one setting of one of my projects. */
export function setProject(path: string, field: "daily" | "account" | "mark", value: unknown): Promise<void> {
  if (live) return invoke("set_project", { path, field, value });
  return Promise.resolve();
}

/** How this window's project looks: name, colour, mark. */
export interface ProjectLook {
  path: string;
  name: string;
  color: string;
  mark: ProjectMarkSpec | null;
  /** The configuration folder of the AI account its sessions run with, if one was chosen */
  account: string | null;
}

export function myProject(): Promise<ProjectLook | null> {
  if (live) return invoke("my_project");
  return Promise.resolve({ path: "/home/me/projects/acme/acme-orbit-api", name: "orbit-api", color: "#7f95ff", mark: { kind: "icon", value: "satellite" }, account: "/home/me/.claude" });
}

/** Sets the window's icon to these RGBA pixels (`size` × `size`). */
export function setWindowIconPixels(rgba: number[], size: number): Promise<void> {
  if (live) return invoke("set_window_icon", { rgba, size });
  return Promise.resolve();
}

/** One of my projects changed (its mark, its account): the payload is its path. */
export function onProjectChanged(callback: (path: string) => void): () => void {
  if (live) {
    const unlisten = listen<string>("project_changed", (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** The overview window shows this instead of a project. */
export const isOverview = new URLSearchParams(window.location.search).get("view") === "overview";

const mockOverview = (): Omit<OverviewProject, "recent">[] => [
  { label: "w1", name: "acme-orbit-api", path: "/home/me/projects/acme/acme-orbit-api", color: "#7f95ff", state: mockAssistant, summary: { git: "3 uncommitted · ↑2", uncommitted: 3, next: mockAssistant.attachments.length, news: 0 }, front: true, listed: true, visible: true, daily: true, account: "/home/me/.claude", mark: { kind: "icon", value: "satellite" } },
  {
    label: "w2",
    name: "ai-driven-development",
    path: "/home/me/projects/ai-driven-development",
    color: "#4fc9bd",
    state: { ...mockAssistant, sessions: mockAssistant.sessions.slice(0, 1).map((s) => ({ ...s, id: "x1", title: "Kapitel 3 überarbeiten", status: "idle" as const, turnDone: Date.now() - 60_000 })), attachments: [] },
    summary: { git: "clean", news: 3 },
    front: false,
    listed: true,
    visible: false,
    daily: true,
    account: "/home/me/.claude-private",
    mark: { kind: "emoji", value: "🧠" },
  },
  { label: null, name: "billing-ui", path: "/home/me/projects/acme/billing-ui", color: "#c3cf6c", state: null, summary: null, front: false, listed: true, visible: false, daily: false, account: null, mark: null },
];

export function overviewState(): Promise<OverviewProject[]> {
  if (live) return invoke("overview_state");
  const all = mockOverview().map((p) => ({ ...p, recent: mockRecent.indexOf(p.path) >= 0 ? mockRecent.indexOf(p.path) : null }));
  // The preview keeps a dragged or sorted order as the backend would
  const rank = (p: OverviewProject) => (mockOrder.indexOf(p.path) + 1 || Infinity) + (p.listed ? 0 : 1e6);
  return Promise.resolve(mockOrder.length ? [...all].sort((a, b) => rank(a) - rank(b)) : all);
}

let mockOrder: string[] = [];
/** Projects shown lately in the preview, newest first (the backend's recent.json) */
const mockRecent = ["/home/me/projects/acme/acme-orbit-api", "/home/me/projects/acme/billing-ui"];
const mockOverviewListeners = new Set<() => void>();

/** Something the overview shows changed: ask again. */
export function onOverviewChanged(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("overview_changed", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  mockOverviewListeners.add(callback);
  return () => void mockOverviewListeners.delete(callback);
}

/** Puts my projects in this order (dragged in the overview). */
export function reorderProjects(paths: string[]): Promise<void> {
  if (live) return invoke("reorder_projects", { paths });
  mockOrder = paths;
  mockOverviewListeners.forEach((f) => f());
  return Promise.resolve();
}

/** How my projects can be sorted, once: by name, by AI configuration then name, today's list first. */
export type ProjectSort = "name" | "account" | "daily";

/** Sorts my projects once; afterwards dragging goes on from that order. */
export function sortProjects(by: ProjectSort): Promise<void> {
  if (live) return invoke("sort_projects", { by });
  const listed = mockOverview().filter((p) => p.listed);
  const ranked = [...listed].sort((a, b) => (mockOrder.indexOf(a.path) + 1 || Infinity) - (mockOrder.indexOf(b.path) + 1 || Infinity));
  const name = (p: Omit<OverviewProject, "recent">) => p.path.toLowerCase();
  const byName = (a: Omit<OverviewProject, "recent">, b: Omit<OverviewProject, "recent">) => name(a).localeCompare(name(b)) || a.path.localeCompare(b.path);
  const sorted =
    by === "daily"
      ? [...ranked.filter((p) => p.daily), ...ranked.filter((p) => !p.daily)]
      : by === "account"
        ? [...ranked].sort((a, b) => Number(!a.account) - Number(!b.account) || (a.account ?? "").localeCompare(b.account ?? "") || byName(a, b))
        : [...ranked].sort(byName);
  mockOrder = sorted.map((p) => p.path);
  mockOverviewListeners.forEach((f) => f());
  return Promise.resolve();
}

/** The project window tells the overview about its project. */
export function reportSummary(summary: ProjectSummary): Promise<void> {
  if (live) return invoke("report_summary", { summary });
  return Promise.resolve();
}

/** Puts a project on my list, without a window. */
export function addProject(path: string): Promise<void> {
  if (live) return invoke("add_project", { path });
  return Promise.resolve();
}

/** Puts every folder inside a folder on my list: how many were new, how many there already. */
export function addProjectsIn(path: string): Promise<[number, number]> {
  if (live) return invoke("add_projects_in", { path });
  return Promise.resolve([2, 1]);
}

/** Takes a project off my list; nothing on disk changes. */
export function removeProject(path: string): Promise<void> {
  if (live) return invoke("remove_project", { path });
  return Promise.resolve();
}

/** Opens a project's window, or brings it to the front. */
export function showProject(path: string): Promise<void> {
  if (live) return invoke("show_project", { path });
  return Promise.resolve();
}

/** Hides a loaded project window, or shows it again in front. */
export function toggleProjectWindow(label: string): Promise<void> {
  if (live) return invoke("toggle_project_window", { label });
  return Promise.resolve();
}

// ── Accounts (step 3.2) ───────────────────────────────────────────────────────

/** A tool's account (for Claude Code a configuration folder) with what the user set for it. */
export interface Account {
  harness: string;
  /** Its configuration folder: sessions and projects name it by this */
  dir: string;
  name: string;
  /** `#rrggbb` */
  color: string;
  /** Its mark, on a hexagon; `null`: its first letter */
  mark: ProjectMarkSpec | null;
  /** The desktop app's data folder for it; `null`: the app's default */
  desktopProfile: string | null;
  /** in use (has sessions) · not used yet · looks like a backup copy */
  kind: "used" | "unused" | "backup";
  connected: boolean;
}

const mockAccounts: Account[] = [
  { harness: "claude", dir: "/home/me/.claude", name: "Work", color: "#7f95ff", mark: { kind: "icon", value: "briefcase" }, desktopProfile: "/home/me/.config/claude-desktop-work", kind: "used", connected: true },
  { harness: "claude", dir: "/home/me/.claude-private", name: "Private", color: "#4fc9bd", mark: { kind: "icon", value: "house" }, desktopProfile: null, kind: "used", connected: true },
  { harness: "claude", dir: "/home/me/.claude-cleanup-2026", name: "claude-cleanup-2026", color: "#e391d0", mark: null, desktopProfile: null, kind: "backup", connected: false },
];
const mockAccountListeners = new Set<() => void>();

export function accountsList(): Promise<Account[]> {
  if (live) return invoke("accounts_list");
  return Promise.resolve(mockAccounts.map((a) => ({ ...a })));
}

/** Changes an account's name, colour or desktop profile (`null`: back to the default). */
export function setAccount(dir: string, field: "name" | "color" | "desktopProfile" | "mark", value: unknown): Promise<void> {
  if (live) return invoke("set_account", { dir, field, value });
  const a = mockAccounts.find((x) => x.dir === dir);
  if (a) Object.assign(a, { [field]: value ?? (field === "name" ? dir.split("/").pop()!.replace(/^\./, "") : null) });
  mockAccountListeners.forEach((l) => l());
  return Promise.resolve();
}

/** Moves a configuration folder that looks like a backup, or was never used, to the trash. */
export function trashAccount(dir: string): Promise<void> {
  if (live) return invoke("trash_account", { dir });
  mockAccounts.splice(mockAccounts.findIndex((a) => a.dir === dir), 1);
  mockAccountListeners.forEach((l) => l());
  return Promise.resolve();
}

/** Makes a profile of the tool's desktop app for an account: the app starts with a folder of its
 *  own to sign in, and the account keeps it. */
export function createDesktopProfile(dir: string): Promise<string> {
  if (live) return invoke("create_desktop_profile", { dir });
  const profile = `/home/me/.config/claude-desktop-${dir.split("/").pop()?.replace(/^\./, "")}`;
  const account = mockAccounts.find((a) => a.dir === dir);
  if (account) account.desktopProfile = profile;
  mockAccountListeners.forEach((l) => l());
  return Promise.resolve(profile);
}

/** The desktop app's profiles found on this computer. */
export function desktopProfiles(): Promise<string[]> {
  if (live) return invoke("desktop_profiles");
  return Promise.resolve(["/home/me/.config/Claude", "/home/me/.config/claude-desktop-work"]);
}

export function onAccountsChanged(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("accounts_changed", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  mockAccountListeners.add(callback);
  return () => mockAccountListeners.delete(callback);
}

/** Starts a session in tmux: a new conversation (`fresh`), else the last one continues. The tmux
 *  session's name, or `null` when one runs there already. */
export function startSession(project: string, fresh: boolean): Promise<string | null> {
  if (live) return invoke("start_session", { project, fresh });
  return Promise.resolve(`codedeck-${project.split("/").pop()}`);
}

/** Starts the sessions of today's list that have none running: the projects started and skipped. */
export function startToday(): Promise<[string[], string[]]> {
  if (live) return invoke("start_today");
  return Promise.resolve([["billing-ui"], ["orbit-api"]]);
}

/** Stops a session in tmux (its conversation is kept); with `restart` it starts again at once. */
export function stopSession(project: string, session: string, restart: boolean): Promise<void> {
  if (live) return invoke("stop_session", { project, session, restart });
  return Promise.resolve();
}

/** Goes into a session: in the tool's desktop app, or in a terminal. */
/** Goes into a session: its desktop app, its terminal, or `auto` (the desktop app where it is reachable there, its log asked too; else the terminal). */
export function openSession(project: string, session: string, door: "desktop" | "terminal" | "auto"): Promise<void> {
  if (live) return invoke("open_session", { project, session, door });
  // As the backend does: going into it is looking at it
  return sessionSeen(session);
}

/** Brings a project's window to the front, with a view of its deck open if given. */
export function focusProject(label: string, view?: string): Promise<void> {
  if (live) return invoke("focus_project", { label, view: view ?? null });
  return Promise.resolve();
}

/** Ends CodeDeck with all its windows. */
export function quit(): Promise<void> {
  if (live) return invoke("quit");
  return Promise.resolve();
}

/** Shows or hides the overview (Ctrl+Alt+L). */
export function toggleOverview(): Promise<void> {
  if (live) return invoke("toggle_overview");
  window.open("?view=overview", "_blank", "width=340,height=800");
  return Promise.resolve();
}

/** The overview asks this project window to open a view of its deck. */
export function onOpenView(callback: (view: string) => void): () => void {
  if (live) {
    const unlisten = listen<string>("open_view", (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** A global shortcut and who holds it (docs/SEITENLEISTE.md, "Tastenkürzel"). */
export interface GlobalShortcut {
  keys: string;
  action: "showHide" | "sidebar";
  /** here: CodeDeck holds it (for all its windows) · taken: another program · unsupported: Wayland */
  state: "here" | "taken" | "unsupported";
}

export function globalShortcuts(): Promise<GlobalShortcut[]> {
  if (live) return invoke<{ keys: GlobalShortcut[] }>("global_shortcuts").then((s) => s.keys);
  return Promise.resolve([
    { keys: "Ctrl+Alt+C", action: "showHide", state: "here" },
    { keys: "Ctrl+Alt+L", action: "sidebar", state: "here" },
  ]);
}

/** Calls back when a global shortcut was taken or lost. */
export function onShortcutsChanged(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("shortcuts_changed", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** One line of the project's journal (`journal.rs`): an event of a session, or a window opening the project. */
export interface JournalLine {
  /** Unix milliseconds */
  at: number;
  /** `prompt_submitted`, `before_write`, `after_write`, `waiting`, `turn_done`, `session_started`, `session_ended`, or `opened` */
  kind: string;
  session?: string;
  /** Project-relative where it lies in the project */
  file?: string;
  tool?: string;
  /** The prompt or the message, shortened */
  text?: string;
  /** With `turn_done`, when the tool says it: what still runs in the background */
  background?: { id: string; kind: string; text: string }[];
  /** With a prompt the tool made itself: the background task whose end it announces */
  taskEnded?: string;
}

/** What happened in the project since `since` (Unix milliseconds), oldest first. */
export function journalLines(since: number): Promise<JournalLine[]> {
  if (live) return invoke("journal_lines", { since });
  const now = Date.now();
  const min = (m: number) => now - m * 60_000;
  const [a, b, c] = ["b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f", "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d"];
  const lines: JournalLine[] = [
    { at: min(190), kind: "opened" },
    { at: min(180), kind: "session_started", session: c },
    { at: min(178), kind: "prompt_submitted", session: c, text: "Add defaults to the config loader" },
    { at: min(176), kind: "after_write", session: c, file: "src/config.rs", tool: "Edit" },
    { at: min(172), kind: "turn_done", session: c, background: [{ id: "c1", kind: "shell", text: "npm run dev" }] },
    { at: min(95), kind: "prompt_submitted", session: a, text: "Refresh the API docs for the limiter" },
    { at: min(92), kind: "after_write", session: a, file: "docs/api.md", tool: "Write" },
    { at: min(88), kind: "waiting", session: a, text: "Claude needs your permission to use Bash" },
    { at: min(80), kind: "after_write", session: a, file: "docs/limits.md", tool: "Write" },
    { at: min(74), kind: "turn_done", session: a, background: [{ id: "b1", kind: "shell", text: "Build the deb" }] },
    { at: min(61), kind: "prompt_submitted", session: a, text: "Background task finished", taskEnded: "b1" },
    { at: min(59), kind: "turn_done", session: a },
    { at: min(40), kind: "prompt_submitted", session: b, text: "Per-client rate limit for orders" },
    { at: min(36), kind: "after_write", session: b, file: "src/middleware/rate_limit.rs", tool: "Edit" },
    { at: min(35), kind: "after_write", session: b, file: "src/routes/orders.rs", tool: "Edit" },
    { at: min(22), kind: "turn_done", session: b },
    { at: min(20), kind: "prompt_submitted", session: b, text: "Held orders in the fixture should not count against the limit." },
    { at: min(6), kind: "after_write", session: b, file: "tests/rate_limit.rs", tool: "Edit" },
  ];
  return Promise.resolve(lines.filter((l) => l.at >= since));
}

/** What helps to find out what went wrong, as text (program, desktop, connections, last hook messages). */
export function diagnostics(): Promise<string> {
  if (live) return invoke("diagnostics");
  return Promise.resolve(
    "CodeDeck 0.1.1 (fdffba4) · Preview · x11 · X-Cinnamon\nProject: ~/projects/orbit-api\nWindows: 1\nConnections:\n  claude ~/.claude: connected\nGlobal shortcuts: Ctrl+Alt+C here, Ctrl+Alt+L here\nLast hook messages (0 of 0):\n",
  );
}

/** The settings of this machine every window shares (`~/.config/codedeck/settings.json`). */
export function machineSettings(): Promise<Record<string, unknown>> {
  if (live) return invoke("machine_settings");
  return Promise.resolve(JSON.parse(localStorage.getItem("codedeck.mockSettings") ?? "{}"));
}

/** Sets one machine setting (`null` removes it); the other windows are told. */
export function setMachineSetting(key: string, value: unknown): Promise<void> {
  if (live) return invoke("set_machine_setting", { key, value });
  const all = JSON.parse(localStorage.getItem("codedeck.mockSettings") ?? "{}");
  if (value === null) delete all[key];
  else all[key] = value;
  localStorage.setItem("codedeck.mockSettings", JSON.stringify(all));
  return Promise.resolve();
}

/** How the window of a project is divided, in pixels; a missing width means the default. */
export interface Layout {
  files?: number;
  right?: number;
  /** The file list is folded to its rail (missing: folded); `files` keeps the width it comes back with */
  filesFolded?: boolean;
}

/** The division the user left the project with (`~/.config/codedeck/layouts.json`). */
export function layoutOf(project: string): Promise<Layout | null> {
  if (live) return invoke("layout", { project });
  const all = JSON.parse(localStorage.getItem("codedeck.mockLayouts") ?? "{}");
  return Promise.resolve(all[project] ?? null);
}

/** Remembers the division for the next start; `null` goes back to the default. */
export function setLayout(project: string, value: Layout | null): Promise<void> {
  if (live) return invoke("set_layout", { project, value });
  const all = JSON.parse(localStorage.getItem("codedeck.mockLayouts") ?? "{}");
  if (value === null) delete all[project];
  else all[project] = value;
  localStorage.setItem("codedeck.mockLayouts", JSON.stringify(all));
  return Promise.resolve();
}

/** Calls back when another window changed a setting of this machine (language, notifications). */
export function onSettingsChanged(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("settings_changed", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** A session started in tmux that has not reported yet: it may wait for a question. */
export interface PendingSession {
  /** The tmux session's name */
  name: string;
  id: string;
  /** When it was started (Unix ms): at first it starts, after a while it probably waits */
  since: number;
  /** The command it was started with, if CodeDeck kept it */
  command: string | null;
  /** It can be opened in a terminal here (a terminal program was found) */
  door: boolean;
}

/** The sessions CodeDeck started in tmux for a project that nothing was heard of yet. */
export function pendingSessions(project: string): Promise<PendingSession[]> {
  if (live) return invoke("pending_sessions", { project });
  const name = `codedeck-${project.split("/").pop()}-2`;
  return Promise.resolve([{ name, id: "pending-mock", since: Date.now() - 60_000, command: mockStartCommand(project, name), door: !!mockPlatform().terminal }]);
}

function mockStartCommand(project: string, name: string): string {
  const base = project.split("/").pop();
  return `tmux new-session -d -s ${name} -c ${project} -e CODEDECK_SESSION=3f9c2a71-0000-4000-8000-000000000000 -e CLAUDE_CONFIG_DIR=/home/me/.claude-work -- /bin/bash -lc 'exec claude --resume 3f9c2a71-0000-4000-8000-000000000000 -n ${base} --remote-control ${base}'`;
}

/** How a session CodeDeck started in tmux was started and how it is ended; `null` for one it did not start. */
export interface SessionCommands {
  /** `null` when it was started before CodeDeck kept the command */
  start: string | null;
  /** The tool's part of it, to be read at a glance */
  tool: string | null;
  stop: string;
}

export function sessionCommands(project: string, name: string): Promise<SessionCommands | null> {
  if (live) return invoke("session_commands", { project, name });
  const base = project.split("/").pop();
  return Promise.resolve({
    start: mockStartCommand(project, name),
    tool: `claude --resume 3f9c2a71-0000-4000-8000-000000000000 -n ${base} --remote-control ${base}`,
    stop: `tmux kill-session -t =${name}`,
  });
}

/** Whether CodeDeck starts at login (in the tray), and with which program. */
export interface AutostartState {
  on: boolean;
  /** The program the entry starts */
  program: string | null;
  /** Whether that is the program running now */
  this: boolean;
  /** Whether the program running now is a development build (it needs the dev server, so it cannot start at login) */
  dev: boolean;
  /** Whether the entry starts a development build: at login its windows stay empty */
  needs_server: boolean;
}

export function autostartState(): Promise<AutostartState> {
  if (live) return invoke("autostart_state");
  const on = localStorage.getItem("codedeck.mockAutostart") === "1";
  return Promise.resolve({ on, program: on ? "/usr/bin/codedeck" : null, this: true, dev: false, needs_server: false });
}

export function setAutostart(on: boolean): Promise<AutostartState> {
  if (live) return invoke("set_autostart", { on });
  localStorage.setItem("codedeck.mockAutostart", on ? "1" : "0");
  return autostartState();
}

/** A session was started in tmux somewhere: its row can show at once. */
export function onSessionsStarted(callback: () => void): () => void {
  if (live) {
    const unlisten = listen("sessions_started", () => callback());
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** Today's list was started as CodeDeck started ("at start"): the projects started and skipped, or what went wrong. */
export function onTodayStarted(callback: (outcome: { Ok?: [string[], string[]]; Err?: string }) => void): () => void {
  if (live) {
    const unlisten = listen<{ Ok?: [string[], string[]]; Err?: string }>("today_started", (e) => callback(e.payload));
    return () => void unlisten.then((stop) => stop());
  }
  return () => {};
}

/** Opens such a session in a terminal (to answer what it asks), or ends it. */
export function pendingSession(project: string, name: string, end: boolean): Promise<void> {
  if (live) return invoke("pending_session", { project, name, end });
  return Promise.resolve();
}
