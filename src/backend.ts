// The one place that talks to the Rust backend. Outside the Tauri window (plain `npm run dev`
// in a browser) it answers from the sample data instead, so the UI can be worked on alone.

import { parsePatch } from "./diff";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

/** Switches this window to another directory (absolute path). */
export function openProject(path: string): Promise<ProjectInfo> {
  if (live) return invoke("open_project", { path });
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
];

/** The files in the scratch folder, newest first; from now on a new one there is reported at once. */
export function scratchList(): Promise<WorkFile[]> {
  if (live) return invoke("scratch_list");
  return Promise.resolve([...mockScratch]);
}

/** Moves files of the scratch folder to the trash. */
export function scratchTrash(paths: string[]): Promise<void> {
  if (live) return invoke("scratch_trash", { paths });
  mockScratch = mockScratch.filter((f) => !paths.includes(f.path));
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
}

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
  /** Where its running turn began: the snapshot per repository it was about to write in; empty between turns */
  turn: { repo: string; hash: string }[];
  /** Files it wrote, project-relative, newest first */
  touched: { path: string; at: number }[];
  /** What it got from CodeDeck, the newest first: attachments with a prompt, the rules at its start */
  received: { at: number; labels: string[] }[];
}

export interface AssistantState {
  /** An event arrived since this window started */
  heard: boolean;
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
  /** The session the attachments are meant for; `null`: whichever session in the project prompts first */
  target: string | null;
  /** The session it was meant for until that one ended or left the list: it now goes to any session */
  targetLost: string | null;
  /** The session that got the start rules last, and when */
  ruled: { session: string; at: number } | null;
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

const MOCK_CAPABILITIES: Capabilities = { liveStatus: true, beforeWrite: true, attach: "withNextPrompt", startRules: true, pastSessions: true, usage: false };

const mockAssistant: AssistantState = {
  heard: true,
  harnesses: [{ id: "claude", name: "Claude Code", shortName: "Claude", capabilities: MOCK_CAPABILITIES }],
  sessions: [
    {
      id: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a",
      harness: "claude",
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
    },
    {
      id: "b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f",
      harness: "claude",
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
      step: "Bash",
      turnDone: null,
      turn: [],
      touched: [{ path: "docs/api.md", at: Date.now() - 4 * 60_000 }],
      received: [],
    },
    {
      id: "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d",
      harness: "claude",
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
      turn: [],
      touched: [{ path: "src/config.rs", at: Date.now() - 7 * 60_000 }],
      received: [],
    },
    {
      id: "d92a0b13-7c4e-4d5f-9a6b-0e1f2a3b4c5d",
      harness: "claude",
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
      turn: [],
      touched: [],
      received: [],
    },
  ],
  identities: [
    { id: "c41d7e02-5b9f-4a3c-8e21-9d0f1a2b3c4d", color: 2, short: "C", title: "Config defaults" },
    { id: "d92a0b13-7c4e-4d5f-9a6b-0e1f2a3b4c5d", color: 3, short: "D", title: "Initial project layout" },
    { id: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", color: 1, short: "B", title: "Per-client rate limit for orders" },
    { id: "b07e11d4-6c3a-4f2e-8d90-1a2b3c4d5e6f", color: 0, short: "A", title: "Limiter documentation" },
  ],
  attachments: [],
  preview: null,
  delivered: null,
  target: null,
  targetLost: null,
  ruled: { session: "3f9c2a71-0d2e-4b1c-9a55-7f1e2c3d4b5a", at: Date.now() - 20 * 60_000 },
};
/** The titles the tool gave the mock sessions, to go back to */
const mockToolTitles = new Map(mockAssistant.sessions.map((s) => [s.id, s.title]));
const mockAssistantListeners = new Set<(state: AssistantState) => void>();

export function assistantState(): Promise<AssistantState> {
  if (live) return invoke("assistant_state");
  return Promise.resolve(mockAssistant);
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
    mockAssistantListeners.forEach((cb) => cb(held));
  }
  const list = mockAssistant.attachments;
  mockAssistant.preview = list.length ? list.map((a) => a.text).join("\n\n") : null;
  if (list.length === 0) Object.assign(mockAssistant, { target: null, targetLost: null });
  mockAssistantListeners.forEach((cb) => cb({ ...mockAssistant }));
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
  const s = mockAssistant.sessions[0];
  const list = mockAssistant.attachments;
  if (!list.length) return;
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

/** The session the attachments are meant for; `null`: whichever session in the project prompts first. */
export function attachFor(session: string | null): Promise<void> {
  if (live) return invoke("attach_for", { session });
  Object.assign(mockAssistant, { target: session, targetLost: null });
  mockAssistantListeners.forEach((cb) => cb({ ...mockAssistant }));
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
  mockAssistantListeners.forEach((cb) => cb({ ...mockAssistant }));
  return Promise.resolve();
}

/** Takes a session off the list of this project; it comes back by itself when it takes its next step. */
export function forgetSession(id: string): Promise<void> {
  if (live) return invoke("forget_session", { id });
  mockAssistant.sessions = mockAssistant.sessions.filter((s) => s.id !== id);
  mockAssistantListeners.forEach((cb) => cb({ ...mockAssistant }));
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
}

let mockConnections: Connection[] = [
  { harness: "claude", dir: "~/.claude", settings: "~/.claude/settings.json", installed: true, other: null, command: "/usr/bin/codeck hook" },
  { harness: "claude", dir: "~/.claude-work", settings: "~/.claude-work/settings.json", installed: false, other: null, command: "/usr/bin/codeck hook" },
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
