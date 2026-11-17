//! CodeDeck backend.
//!
//! One process with a window per project (D25, see [`windows`]): the project directory, its file
//! list and a file watcher, git for every repository in it. One socket for the process, through
//! which coding tools report what they do (see [`hub`], [`harness`]).

mod apps;
mod attention;
mod bridge;
mod config;
mod doors;
mod findings;
mod git;
mod harness;
mod history;
mod icon;
pub mod hook;
mod hub;
mod identity;
mod journal;
mod markers;
mod place;
mod project;
mod projects;
mod recent;
mod rules;
mod snapshot;
mod updates;
mod usage;
mod watch;
mod scratch;
mod window;
mod windows;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, RwLock};

use tauri_plugin_opener::OpenerExt;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use apps::{FileApps, Role};
use bridge::AssistantState;
use harness::Connection;
use markers::Marker;
use snapshot::Snapshot;
use git::{ActionResult, GitRun, RepoStatus};
use history::{Patch, RepoLog};
use project::{Entry, PathStats, Project, ProjectInfo};
use recent::RecentProject;
use windows::{Win, Windows};

/// Locks that survive a panic elsewhere: with one process for all windows, a thread that panicked
/// while holding a lock must not take every window down with it (D25).
pub(crate) trait Locked<T> {
    fn locked(&self) -> MutexGuard<'_, T>;
}

impl<T> Locked<T> for Mutex<T> {
    fn locked(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The project a window shows. It can be switched; holders of the old one keep a valid copy.
pub struct Current(RwLock<Arc<Project>>);

impl Current {
    pub fn get(&self) -> Arc<Project> {
        self.0.read().unwrap_or_else(PoisonError::into_inner).clone()
    }

    fn set(&self, project: Arc<Project>) {
        *self.0.write().unwrap_or_else(PoisonError::into_inner) = project;
    }
}

/// Window title, so that several CodeDeck windows can be told apart in the task bar; in front
/// what waits for the user, as the window last said.
pub(crate) fn title_of(win: &Win) -> String {
    let project = win.current.get();
    let name = project.root.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy());
    attention::title(&name, &win.title_status.locked())
}

/// Title and icon: the icon carries the project's colour and a dot for what waits.
pub(crate) fn set_title(app: &AppHandle, win: &Win) {
    if let Some(window) = app.get_webview_window(&win.label) {
        let _ = window.set_title(&title_of(win));
        let (asks, done) = *win.waiting.locked();
        let _ = window.set_icon(icon::render(icon::project_color(&win.current.get().root), asks, done));
    }
}

/// What follows the project's name in the window title, e.g. "● 2 asking" (in the interface's language).
#[tauri::command]
fn set_title_status(status: String, asks: Option<u32>, done: Option<u32>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let win = windows::of(&window)?;
    *win.title_status.locked() = status;
    *win.waiting.locked() = (asks.unwrap_or(0) > 0, done.unwrap_or(0) > 0);
    set_title(&app, &win);
    Ok(())
}

#[tauri::command]
fn attention_settings() -> attention::Settings {
    attention::load()
}

#[tauri::command]
fn set_attention_settings(settings: attention::Settings, app: AppHandle) -> Result<(), String> {
    attention::save(&settings)?;
    window::settings_changed(&app);
    Ok(())
}

/// The settings of this machine every window shares (language, …).
#[tauri::command]
fn machine_settings() -> serde_json::Map<String, serde_json::Value> {
    config::machine_settings()
}

/// Sets one of them; the other windows are told.
#[tauri::command]
fn set_machine_setting(key: String, value: serde_json::Value, app: AppHandle) -> Result<(), String> {
    config::set_machine_setting(&key, value)?;
    window::settings_changed(&app);
    Ok(())
}

/// How the window of a project was divided when the user left it (`null`: never changed).
#[tauri::command]
fn layout(project: String) -> serde_json::Value {
    config::layout(&project)
}

/// Remembers it for the next start; only this project's windows care, so no one is told.
#[tauri::command]
fn set_layout(project: String, value: serde_json::Value) -> Result<(), String> {
    config::set_layout(&project, value)
}

/// What the About dialog and a bug report say about this program.
#[derive(serde::Serialize)]
struct AppInfo {
    version: &'static str,
    commit: &'static str,
    os: String,
}

#[tauri::command]
fn app_info() -> AppInfo {
    // The distribution's name, e.g. "Linux Mint 22.1"
    let os = std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|t| t.lines().find_map(|l| l.strip_prefix("PRETTY_NAME=").map(|v| v.trim_matches('"').to_string())))
        .unwrap_or_else(|| std::env::consts::OS.to_string());
    AppInfo { version: env!("CARGO_PKG_VERSION"), commit: env!("CODEDECK_COMMIT"), os }
}

/// What happened in this project since `since` (Unix milliseconds), oldest first: the material of
/// the timeline in Activity and of the notices.
#[tauri::command]
fn journal_lines(window: WebviewWindow, since: u64) -> Result<Vec<journal::Line>, String> {
    Ok(journal::read(&windows::of(&window)?.current.get().root, since))
}

/// What helps to find out what went wrong, as text to paste into a bug report or a chat: the
/// program, the desktop, the connections, the global shortcuts, the last hook messages. The
/// frontend adds what it knows (sessions, form, language). Home is written as `~`.
#[tauri::command]
fn diagnostics(window: WebviewWindow, shortcuts: State<window::Shortcuts>, all: State<Windows>) -> Result<String, String> {
    use std::fmt::Write as _;
    let win = windows::of(&window)?;
    let info = app_info();
    let env = |key: &str| std::env::var(key).unwrap_or_else(|_| "?".into());
    let root = win.current.get().root.clone();
    let mut out = String::new();
    let _ = writeln!(out, "CodeDeck {} ({}) · {} · {} · {}", info.version, info.commit, info.os, env("XDG_SESSION_TYPE"), env("XDG_CURRENT_DESKTOP"));
    let _ = writeln!(out, "Program: {}", std::env::current_exe().map_or_else(|e| e.to_string(), |p| p.display().to_string()));
    let _ = writeln!(out, "Project: {}", root.display());
    let processes = std::fs::read_dir(hook::socket_dir())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "sock"))
        .count();
    let _ = writeln!(out, "Windows: {} in process {} ({} CodeDeck process(es) listening)", all.all().len(), std::process::id(), processes);
    let _ = writeln!(out, "Connections:");
    for harness in harness::all() {
        for c in harness.connections() {
            let state = match (&c.other, c.installed) {
                (Some(other), _) => format!("reports to another CodeDeck: {other}"),
                (None, true) => "connected".into(),
                (None, false) => "not connected".into(),
            };
            let _ = writeln!(out, "  {} {}: {state}", c.harness, c.dir);
        }
    }
    let keys: Vec<String> = shortcuts.get().keys.iter().map(|k| format!("{} {}", k.keys, k.state)).collect();
    let _ = writeln!(out, "Global shortcuts: {}", if keys.is_empty() { "not registered yet".into() } else { keys.join(", ") });
    let _ = writeln!(out, "Last switch of the form: {}", { let l = win.place.last(); if l.is_empty() { "none".to_string() } else { l } });
    let _ = writeln!(out, "Attention: {}", serde_json::to_string(&attention::load()).unwrap_or_default());
    if let Some(file) = journal::file_for(&root) {
        let _ = writeln!(out, "Journal: {}", file.display());
    }
    // The last hook messages: when, which tool, what, which session, which windows heard it
    let trace = std::fs::read_to_string(hook::socket_dir().join("hook-trace.log")).unwrap_or_default();
    let lines: Vec<&str> = trace.lines().collect();
    let _ = writeln!(out, "Last hook messages ({} of {}):", lines.len().min(40), lines.len());
    for line in &lines[lines.len().saturating_sub(40)..] {
        let _ = writeln!(out, "  {line}");
    }
    Ok(match std::env::var("HOME") {
        Ok(home) if !home.is_empty() => out.replace(&home, "~"),
        _ => out,
    })
}

/// Opens a web address in the browser; only http(s), so nothing local can be started this way.
#[tauri::command]
fn open_url(url: String, app: AppHandle) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("{url}: not a web address"));
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Copies a file a session left outside the project into the scratch folder.
#[tauri::command]
fn fetch_outside(path: String, app: AppHandle, window: WebviewWindow) -> Result<String, String> {
    windows::of(&window)?.bridge().fetch_outside(&app, &path)
}

/// Opens a file left outside the project in its program, or shows it in the file manager. Only
/// files CodeDeck noted as left outside: nothing else outside the project is reached this way.
#[tauri::command]
fn open_outside(path: String, role: Option<Role>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !windows::of(&window)?.bridge().is_found(&path) {
        return Err(format!("{path}: not a file left outside"));
    }
    let full = PathBuf::from(&path);
    match role {
        None => app.opener().reveal_item_in_dir(&full).map_err(|e| e.to_string()),
        Some(role) if apps::open(&full, role)? => Ok(()),
        Some(_) => app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string()),
    }
}

/// Forgets a file left outside or a published page.
#[tauri::command]
fn forget_found(key: String, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().forget_found(&app, &key);
    Ok(())
}

/// Sidebar or full window; the width the window had before.
/// Async, so it runs off the main thread: it waits for the desktop to restore a maximized window.
#[tauri::command]
async fn set_compact(on: bool, width: f64, window: tauri::WebviewWindow) -> Result<f64, String> {
    let win = windows::of(&window)?;
    window::set_compact(&window, &win.place, on, width).map_err(|e| e.to_string())
}

/// Where the global shortcuts stand: held by CodeDeck or by another program.
#[tauri::command]
fn global_shortcuts(shortcuts: State<window::Shortcuts>) -> window::ShortcutStatus {
    shortcuts.get()
}

/// Tells the user something happened, in the ways they chose (taskbar, desktop notification).
#[tauri::command]
fn notify_attention(key: String, summary: String, body: String, app: AppHandle, window: tauri::WebviewWindow) {
    attention::notify(&app, &window, &key, &summary, &body);
}

#[tauri::command]
fn project_info(window: WebviewWindow) -> Result<ProjectInfo, String> {
    Ok(windows::of(&window)?.current.get().info())
}

/// Lists one directory and keeps watching it from now on.
#[tauri::command]
fn read_dir(path: &str, window: WebviewWindow) -> Result<Vec<Entry>, String> {
    let win = windows::of(&window)?;
    let project = win.current.get();
    let entries = project.read_dir(path)?;
    win.watch.add(&project.resolve(path)?);
    Ok(entries)
}

#[tauri::command]
fn path_stats(path: &str, window: WebviewWindow) -> Result<PathStats, String> {
    project_of(&window)?.stats(path)
}

/// The project of the window that called.
fn project_of(window: &WebviewWindow) -> Result<Arc<Project>, String> {
    Ok(windows::of(window)?.current.get())
}

/// Opens a file of the project in its default program, a folder in the default file manager.
#[tauri::command]
fn open_path(path: &str, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let full = project_of(&window)?.resolve(path)?;
    app.opener().open_path(full.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Opens a file of the project in its program for viewing or editing: the one chosen in CodeDeck,
/// else the system's default for the type.
#[tauri::command]
fn open_file(path: &str, role: Role, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let full = project_of(&window)?.resolve(path)?;
    if apps::open(&full, role)? {
        return Ok(());
    }
    app.opener().open_path(full.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// The programs for viewing and editing a file, and every program installed for its type.
#[tauri::command]
fn file_apps(path: &str, window: WebviewWindow) -> Result<FileApps, String> {
    Ok(apps::for_file(&project_of(&window)?.resolve(path)?))
}

/// Remembers a program for viewing or editing this kind of file; `None` goes back to the system's.
#[tauri::command]
fn choose_file_app(path: &str, role: Role, app: Option<String>, window: WebviewWindow) -> Result<(), String> {
    apps::choose(&project_of(&window)?.resolve(path)?, role, app)
}

/// Shows a file in the default file manager, selected in its folder; a folder is opened itself.
#[tauri::command]
fn show_in_file_manager(path: &str, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let full = project_of(&window)?.resolve(path)?;
    let opener = app.opener();
    if full.is_dir() {
        opener.open_path(full.to_string_lossy(), None::<&str>)
    } else {
        opener.reveal_item_in_dir(&full)
    }
    .map_err(|e| e.to_string())
}

/// Switches this window to another directory.
#[tauri::command]
fn open_project(path: &str, app: AppHandle, window: WebviewWindow) -> Result<ProjectInfo, String> {
    let win = windows::of(&window)?;
    let project = Arc::new(Project::open(Path::new(path))?);
    let old = win.current.get().root.clone();
    win.watch.clear();
    // The sessions belong to the project: the window takes the new project's bridge
    win.switch_to(&app, project.clone());
    projects::add(&project.root);
    windows::forget_bridge(&app, &old);
    recent::remember(&project.root);
    set_title(&app, &win);
    exclude_scratch(&app, &win);
    Ok(project.info())
}

/// Git leaves the scratch folder of the window's project alone (once per repository, in the background).
pub(crate) fn exclude_scratch(app: &AppHandle, win: &Arc<Win>) {
    let (app, win) = (app.clone(), win.clone());
    std::thread::spawn(move || {
        let project = win.current.get();
        let report = reporter(&app, &win.label);
        win.git().exclude_scratch(&report, &project);
    });
}

/// Tells one window about each git command run for it.
fn reporter<'a>(app: &'a AppHandle, label: &'a str) -> impl Fn(&GitRun) + 'a {
    move |run: &GitRun| {
        let _ = app.emit_to(label, GIT_RAN, run);
    }
}

/// The files in the scratch folder, newest first; its folders are watched from now on, so a new
/// file shows up at once.
#[tauri::command]
fn scratch_list(window: WebviewWindow) -> Result<Vec<scratch::WorkFile>, String> {
    let win = windows::of(&window)?;
    let (files, dirs) = scratch::list(&win.current.get());
    dirs.iter().for_each(|d| win.watch.add(d));
    Ok(files)
}

/// Moves files of the scratch folder to the trash.
#[tauri::command]
fn scratch_trash(paths: Vec<String>, window: WebviewWindow) -> Result<(), String> {
    scratch::trash(&*project_of(&window)?, &paths)
}

/// Moves a file of the scratch folder into the project; the new project-relative path.
#[tauri::command]
fn scratch_move(from: String, to: String, window: WebviewWindow) -> Result<String, String> {
    scratch::move_into(&*project_of(&window)?, &from, &to)
}

/// Opens a directory in a new CodeDeck window of this process.
/// Async: building a window waits for the main thread, which a plain command would block.
#[tauri::command]
async fn open_window(path: String, app: AppHandle) -> Result<(), String> {
    let project = Project::open(Path::new(&path))?;
    windows::open(&app, project).map(drop)
}

#[tauri::command]
fn recent_projects(window: WebviewWindow) -> Result<Vec<RecentProject>, String> {
    Ok(recent::list(&project_of(&window)?.root))
}

/// The system's folder dialog, starting next to the current project. `None` when cancelled.
#[tauri::command]
async fn pick_folder(app: AppHandle, window: WebviewWindow) -> Option<String> {
    // Next to the window's project; from the overview, which has none, in the home folder
    let start = match project_of(&window) {
        Ok(current) => current.root.parent().map_or_else(|| current.root.clone(), PathBuf::from),
        Err(_) => std::env::var_os("HOME").map(PathBuf::from)?,
    };
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Open project")
            .set_directory(start)
            .blocking_pick_folder()
            .and_then(|picked| picked.into_path().ok())
            .map(|path| path.display().to_string())
    })
    .await
    .ok()
    .flatten()
}

/// Turns a project without a repository into one: `git init`, then the scratch folder is left
/// alone like in every other project.
#[tauri::command]
async fn git_init(app: AppHandle, window: WebviewWindow) -> Result<ActionResult, String> {
    let win = windows::of(&window)?;
    let done = blocking(app.clone(), win.clone(), |win, project, report| win.git().init(report, &project)).await?;
    if done.ok {
        exclude_scratch(&app, &win);
    }
    Ok(done)
}

/// Status of every repository in the project; `rescan` looks for repositories again.
/// Runs off the main thread: `git status` in a large repo takes a moment.
#[tauri::command]
async fn git_status(rescan: bool, app: AppHandle, window: WebviewWindow) -> Result<Vec<RepoStatus>, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| {
        let (statuses, git_dirs) = win.git().status(report, &project, rescan);
        git_dirs.iter().for_each(|dir| win.watch.add(dir));
        statuses
    })
    .await
}

/// Runs exactly these git arguments in one repository of the project; only common actions
/// (add, commit, pull, push, fetch) are allowed.
#[tauri::command]
async fn git_action(repo: String, args: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<ActionResult, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().action(report, &project, &repo, &args)).await
}

/// The latest commits of the given repositories (project-relative paths).
#[tauri::command]
async fn git_history(repos: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<Vec<RepoLog>, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().history(report, &project, &repos)).await
}

/// Uncommitted changes of one repository as a patch, untracked files included.
#[tauri::command]
async fn git_working_diff(repo: String, app: AppHandle, window: WebviewWindow) -> Result<Patch, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().working_diff(report, &project, &repo)).await?
}

/// What one commit changed, as a patch.
#[tauri::command]
async fn git_commit_diff(repo: String, hash: String, app: AppHandle, window: WebviewWindow) -> Result<Patch, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().commit_diff(report, &project, &repo, &hash)).await?
}

/// Runs git work off the main thread, with the window's project and a reporter for its commands.
async fn blocking<T: Send + 'static>(
    app: AppHandle,
    win: Arc<Win>,
    work: impl FnOnce(&Win, Arc<Project>, git::Report) -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = win.current.get();
        let report = reporter(&app, &win.label);
        work(&win, project, &report)
    })
    .await
    .map_err(|e| e.to_string())
}

/// What changed from one commit (or snapshot) to another, as a patch.
#[tauri::command]
async fn git_compare(repo: String, from: String, to: String, app: AppHandle, window: WebviewWindow) -> Result<Patch, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().compare(report, &project, &repo, &from, &to)).await?
}

/// Whether Dirq, the diff viewer, is installed.
#[tauri::command]
fn has_diff_viewer() -> bool {
    apps::diff_viewer().is_some()
}

/// Shows a patch in Dirq.
#[tauri::command]
fn show_patch(text: String) -> Result<(), String> {
    apps::show_patch(&text)
}

/// Whether Marq, the Markdown viewer, is installed.
#[tauri::command]
fn has_markdown_viewer() -> bool {
    apps::markdown_viewer().is_some()
}

/// Shows Markdown text as a page in Marq.
#[tauri::command]
fn show_markdown(text: String) -> Result<(), String> {
    apps::show_markdown(&text)
}

/// Snapshots of the working tree taken before an assistant wrote, newest first.
#[tauri::command]
async fn git_snapshots(repos: Vec<String>, app: AppHandle, window: WebviewWindow) -> Result<Vec<Snapshot>, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().snapshots(report, &project, &repos)).await
}

/// What changed since a snapshot, as a patch.
#[tauri::command]
async fn git_snapshot_diff(repo: String, hash: String, app: AppHandle, window: WebviewWindow) -> Result<Patch, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().snapshot_diff(report, &project, &repo, &hash)).await?
}

/// Puts the working tree back as it was in a snapshot; the present is kept as one before.
#[tauri::command]
async fn git_restore_snapshot(repo: String, hash: String, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().restore_snapshot(report, &project, &repo, &hash)).await?
}

/// The `@ai` markers in the project's documents.
#[tauri::command]
async fn find_markers(app: AppHandle, window: WebviewWindow) -> Result<Vec<Marker>, String> {
    blocking(app, windows::of(&window)?, move |win, project, report| win.git().markers(report, &project)).await
}

/// The assistant sessions in this project, as far as their hooks told.
#[tauri::command]
fn assistant_state(window: WebviewWindow) -> Result<AssistantState, String> {
    Ok(windows::of(&window)?.bridge().state())
}

/// One part (`key`) of the attachments to the next prompt in this project; `None` removes that
/// part. `rev` is the interface's count of its changes to the part, returned with the receipt.
#[tauri::command]
fn attach(key: String, text: Option<String>, label: Option<String>, rev: Option<u64>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().attach(&app, key, text.map(|t| (t, label.unwrap_or_default(), rev.unwrap_or_default())));
    Ok(())
}

/// The session the attachments are meant for; `None`: whichever session in the project prompts first.
#[tauri::command]
fn attach_for(session: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().set_target(&app, session);
    Ok(())
}

/// The rules every session gets when it starts, word for word.
#[tauri::command]
fn start_rules() -> &'static str {
    rules::START_RULES
}

/// The user's title and short name for a session; an empty title brings the tool's back.
#[tauri::command]
fn rename_session(id: String, title: Option<String>, short: Option<String>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().rename(&app, &id, title.as_deref(), short.as_deref());
    Ok(())
}

/// Takes a session off the list of this project until it reports again.
#[tauri::command]
fn forget_session(id: String, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().forget(&app, &id);
    Ok(())
}

/// Whether the coding tools report to CodeDeck, per tool and account.
#[tauri::command]
fn harness_connections() -> Vec<Connection> {
    harness::all().iter().flat_map(|h| h.connections()).collect()
}

/// Puts CodeDeck on the status line of one account to hear the usage, or takes it off; the state
/// of all afterwards.
#[tauri::command]
fn set_usage_connection(harness: String, account: String, install: bool) -> Result<Vec<Connection>, String> {
    let tool = harness::by_id(Some(&harness)).ok_or_else(|| format!("{harness}: not a tool CodeDeck knows"))?;
    tool.connect_usage(&account, install)?;
    Ok(harness_connections())
}

/// Makes the tool of one account report to CodeDeck, or stops that; the state of all afterwards.
#[tauri::command]
fn set_harness_connection(harness: String, account: String, install: bool) -> Result<Vec<Connection>, String> {
    let tool = harness::by_id(Some(&harness)).ok_or_else(|| format!("{harness}: not a tool CodeDeck knows"))?;
    tool.connect(&account, install)?;
    Ok(harness_connections())
}

/// Every open project for the overview: its sessions, what waits, what its window reported.
#[tauri::command]
fn overview_state(app: AppHandle) -> Vec<windows::OverviewProject> {
    windows::overview_state(&app)
}

/// What a project window tells the overview about its project (git, next prompt, workbench).
#[tauri::command]
fn report_summary(summary: serde_json::Value, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let win = windows::of(&window)?;
    let changed = *win.summary.locked() != summary;
    if changed {
        *win.summary.locked() = summary;
        windows::overview_changed(&app);
    }
    Ok(())
}

/// Puts a project on my list without opening a window (from the overview's ＋).
#[tauri::command]
fn add_project(path: String, app: AppHandle) -> Result<(), String> {
    let project = Project::open(Path::new(&path))?;
    projects::add(&project.root);
    // From now on it hears its sessions, before any window opens
    windows::bridge_for(&app, &project.root);
    windows::overview_changed(&app);
    Ok(())
}

/// Takes a project off my list; its window, if open, stays.
#[tauri::command]
fn remove_project(path: String, app: AppHandle) -> Result<(), String> {
    projects::remove(Path::new(&path))?;
    windows::forget_bridge(&app, Path::new(&path));
    windows::overview_changed(&app);
    Ok(())
}

/// Changes one setting of one of my projects: `daily`, `account` or `mark`.
#[tauri::command]
fn set_project(path: String, field: String, value: serde_json::Value, app: AppHandle) -> Result<(), String> {
    projects::set(Path::new(&path), &field, value)?;
    windows::overview_changed(&app);
    // Its window draws its mark into the title bar icon
    let _ = app.emit("project_changed", &path);
    Ok(())
}

/// One of my projects as the list keeps it (for its window: the mark).
#[tauri::command]
fn my_project(window: WebviewWindow) -> Result<Option<projects::Listed>, String> {
    let root = project_of(&window)?.root.clone();
    Ok(projects::list().into_iter().find(|p| p.path == root))
}

/// Opens the window of one of my projects, or brings it to the front.
/// Async: building a window waits for the main thread.
#[tauri::command]
async fn show_project(path: String, app: AppHandle) -> Result<(), String> {
    windows::show_project(&app, Path::new(&path))
}

/// Hides a project's window, or shows it again in front (a click on its mark in the overview).
/// Closing is the window's own business; hidden, it keeps its state and comes back at once.
#[tauri::command]
fn toggle_project_window(label: String, app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or_else(|| format!("{label}: no such window"))?;
    if window.is_visible().unwrap_or(false) {
        window::obey(&window, window::Request::Hide);
    } else {
        window::obey(&window, window::Request::Front);
    }
    windows::overview_changed(&app);
    Ok(())
}

/// Goes into a session of a project: `door` is "desktop" (the tool's desktop app) or "terminal".
#[tauri::command]
fn open_session(project: String, session: String, door: String, app: AppHandle) -> Result<(), String> {
    let bridge = windows::bridge_for(&app, Path::new(&project));
    let (harness, account, place) = bridge.session_place(&session).ok_or("this session is not known (any more)")?;
    let place = place.ok_or("this session has not said where it runs yet")?;
    match door.as_str() {
        "terminal" => doors::terminal(&place),
        "desktop" => {
            let remote = place.remote.as_deref().ok_or("not reachable from the desktop app: Remote Control is off or not connected")?;
            let tool = harness::by_id(Some(harness)).ok_or("unknown tool")?;
            // The app's data folder for the session's account, as the user set it (machine settings)
            // (`desktopProfiles`: configuration folder → app data folder, `~` allowed on both sides)
            let profile = account.as_deref().and_then(|account| {
                let profiles = config::machine_settings().get("desktopProfiles").cloned()?;
                let home = std::env::var("HOME").unwrap_or_default();
                let full = |p: &str| p.strip_prefix('~').map_or_else(|| p.to_string(), |rest| format!("{home}{rest}"));
                let found = profiles.as_object()?.iter().find(|(dir, _)| full(dir) == full(account))?;
                found.1.as_str().map(full)
            });
            let command = tool.desktop_command(remote, profile.as_deref()).ok_or("this tool has no desktop app to open it in")?;
            std::process::Command::new(&command[0]).args(&command[1..]).spawn().map(drop).map_err(|e| format!("{}: {e}", command[0]))
        }
        _ => Err(format!("{door}: no such way in")),
    }
}

/// Brings a project's window to the front; with `view`, that tab opens there.
#[tauri::command]
fn focus_project(label: String, view: Option<String>, app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(&label).ok_or_else(|| format!("{label}: no such window"))?;
    window::obey(&window, window::Request::Front);
    if let Some(view) = view {
        let _ = window.emit_to(label.as_str(), "open_view", view);
    }
    Ok(())
}

/// Ends CodeDeck with all its windows (from the overview's menu).
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// Shows or hides the overview of all projects (`Ctrl+Alt+L`).
/// Async: building the window waits for the main thread.
#[tauri::command]
async fn toggle_overview(app: AppHandle) -> Result<(), String> {
    windows::toggle_overview(&app)
}

/// The git commands run so far, oldest first.
#[tauri::command]
fn git_log(window: WebviewWindow) -> Result<Vec<GitRun>, String> {
    Ok(windows::of(&window)?.git().log())
}

/// Event sent after every git command; payload [`GitRun`].
pub(crate) const GIT_RAN: &str = "git_ran";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let project = match Project::from_args() {
        Ok(project) => project,
        Err(message) => {
            eprintln!("codedeck: {message}");
            std::process::exit(2);
        }
    };
    // This program runs already: it opens the window, this start ends here
    if hub::hand_over(&project.root) {
        return;
    }

    tauri::Builder::default()
        .manage(Windows::default())
        .manage(windows::Bridges::default())
        .manage(window::Shortcuts::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(window::plugin())
        .on_window_event(|window, event| match event {
            // The window in front is the one the global shortcuts act on
            tauri::WindowEvent::Focused(focused) => {
                window::focus_changed(window.app_handle(), window.label(), *focused);
                // The overview marks the project window used last
                if *focused && window.label() != windows::OVERVIEW {
                    windows::overview_changed(window.app_handle());
                }
            }
            tauri::WindowEvent::Destroyed => {
                window.app_handle().state::<Windows>().remove(window.app_handle(), window.label());
                windows::overview_changed(window.app_handle());
            }
            _ => {}
        })
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Without the socket CodeDeck works on, only without hearing from assistants
            match hub::Hub::start(app.handle().clone()) {
                Ok(hub) => {
                    app.manage(hub);
                }
                Err(e) => eprintln!("codedeck: no socket for assistants: {e}"),
            }
            // Every project on my list hears its sessions, window or not
            windows::listen_to_my_projects(app.handle());
            windows::open(app.handle(), project)?;
            // The overview of all projects comes along (docs/UEBERSICHT.md; to become a setting)
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = windows::toggle_overview(&handle) {
                    eprintln!("codedeck: overview: {e}");
                }
            });
            updates::check_in_background(app.handle());
            window::claim_shortcuts(app.handle().clone());
            // Hooks of this installation that still run the old `codedeck` (or a program that is
            // gone) now run this one; in the background, it reads every configuration
            std::thread::spawn(|| {
                for harness in harness::all() {
                    for account in harness.follow_program() {
                        eprintln!("codedeck: hooks in {account} now run this program");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_info,
            journal_lines,
            read_dir,
            open_path,
            open_file,
            file_apps,
            choose_file_app,
            show_in_file_manager,
            path_stats,
            open_project,
            scratch_list,
            scratch_trash,
            scratch_move,
            open_window,
            recent_projects,
            pick_folder,
            git_status,
            git_init,
            git_action,
            git_history,
            git_working_diff,
            git_commit_diff,
            git_compare,
            has_diff_viewer,
            show_patch,
            has_markdown_viewer,
            show_markdown,
            git_snapshots,
            git_snapshot_diff,
            git_restore_snapshot,
            find_markers,
            assistant_state,
            attach,
            attach_for,
            start_rules,
            rename_session,
            forget_session,
            harness_connections,
            set_harness_connection,
            set_usage_connection,
            git_log,
            set_title_status,
            attention_settings,
            set_attention_settings,
            notify_attention,
            app_info,
            open_url,
            set_compact,
            global_shortcuts,
            fetch_outside,
            forget_found,
            open_outside,
            diagnostics,
            machine_settings,
            set_machine_setting,
            layout,
            set_layout,
            overview_state,
            report_summary,
            focus_project,
            toggle_overview,
            quit,
            add_project,
            set_project,
            my_project,
            open_session,
            remove_project,
            show_project,
            toggle_project_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building CodeDeck")
        .run(|app, event| {
            // State is not dropped on exit: the socket would stay behind
            if let tauri::RunEvent::Exit = event {
                if let Some(hub) = app.try_state::<hub::Hub>() {
                    hub.close();
                }
            }
        });
}
