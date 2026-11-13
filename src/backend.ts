// The one place that talks to the Rust backend. Outside the Tauri window (plain `npm run dev`
// in a browser) it answers from the sample data instead, so the UI can be worked on alone.

import { parsePatch } from "./diff";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { project as mockProject, tree as mockTree, type FileNode, type GitState } from "./mock";

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
    head: `${path || "root"}0`.padEnd(40, "0"),
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
