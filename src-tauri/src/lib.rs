//! CodeDeck backend.
//!
//! One process with a window per project (D25, see [`windows`]): the project directory, its file
//! list and a file watcher, git for every repository in it. One socket for the process, through
//! which coding tools report what they do (see [`hub`], [`harness`]).

mod accounts;
mod autostart;
mod apps;
mod attention;
mod bridge;
mod config;
mod doors;
mod filemarks;
mod fileops;
mod findings;
mod git;
mod guides;
mod harness;
mod history;
mod icon;
pub mod hook;
mod hub;
mod identity;
mod journal;
mod markers;
mod place;
mod platform;
mod project;
mod projects;
mod recent;
mod rules;
mod snapshot;
mod terminal;
mod tmux;
mod tray;
mod updates;
mod usage;
mod watch;
mod scratch;
mod prompts;
mod settings;
mod welcome;
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
        // Until the window draws its own icon (its mark), the plain one in its colour
        if !*win.drawn_icon.locked() {
            let (asks, done) = *win.waiting.locked();
            let _ = window.set_icon(icon::render(icon::project_color(&win.current.get().root), asks, done));
        }
    }
}

/// What follows the project's name in the window title, e.g. "● 2 asking" (in the interface's language).
#[tauri::command]
fn set_title_status(status: String, asks: Option<u32>, done: Option<u32>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let win = windows::of(&window)?;
    *win.title_status.locked() = status;
    *win.waiting.locked() = (asks.unwrap_or(0) as usize, done.unwrap_or(0) > 0);
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

/// What this computer offers: tmux, a terminal, X11 or Wayland, shortcuts, tray (found once).
#[tauri::command]
fn platform() -> platform::Abilities {
    platform::abilities()
}

/// What CodeDeck looked for on this computer, for the welcome; `fresh` looks again first (the user
/// may have installed something meanwhile) and tells every window what changed.
#[tauri::command(async)]
fn checkup(app: AppHandle, fresh: bool) -> Vec<welcome::Check> {
    let found = if fresh { platform::refresh() } else { platform::get() };
    if fresh {
        let _ = app.emit(PLATFORM_CHANGED, platform::abilities());
        // ▶ and the doors follow what is there now
        for bridge in app.state::<windows::Bridges>().all() {
            bridge.notify(&app);
        }
    }
    welcome::checks(found)
}

/// Event to every window when what the computer offers was looked at again; payload [`platform::Abilities`].
const PLATFORM_CHANGED: &str = "platform_changed";

/// Whether the welcome shows at the start (its checkbox).
#[tauri::command]
fn welcome_at_start() -> bool {
    welcome::shown_at_start()
}

/// The welcome was closed; `off`: not at the next starts.
#[tauri::command]
fn welcome_done(off: bool) -> Result<(), String> {
    welcome::done(off)
}

/// The welcome's window takes the size its page needs.
#[tauri::command]
fn welcome_fit(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    welcome::fit(&app, width, height)
}

/// Whether this project window shows the help on its parts now (once per start, a window in sight).
#[tauri::command]
fn window_help(window: WebviewWindow) -> bool {
    window.label() != windows::OVERVIEW && window.label() != welcome::LABEL && !settings::is_panel(window.label()) && welcome::window_help_due(window.is_visible().unwrap_or(false))
}

/// Opens the welcome (from the app menu).
#[tauri::command]
fn open_welcome(app: AppHandle) -> Result<(), String> {
    welcome::open(&app)
}

/// Opens the settings in their own window, at `section` if given; they need no project.
#[tauri::command]
fn open_settings(app: AppHandle, section: Option<String>) -> Result<(), String> {
    settings::open(&app, section.as_deref())
}

/// Opens About or the keyboard shortcuts in a window of their own: from the start page, which has
/// no room for them as a dialog.
#[tauri::command]
fn open_panel(app: AppHandle, view: String) -> Result<(), String> {
    if view == settings::LABEL {
        return settings::open(&app, None);
    }
    settings::open_panel(&app, &view, "")
}

/// The tools CodeDeck supports, the default one first: for windows without a project (settings,
/// welcome), which have no bridge to ask.
#[tauri::command]
fn harness_list() -> Vec<harness::HarnessInfo> {
    harness::all().iter().map(|h| harness::HarnessInfo::of(*h)).collect()
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
    // The start page and the settings have no project: the rest is the same
    let root = windows::of(&window).ok().map(|win| win.current.get().root.clone());
    let info = app_info();
    let env = |key: &str| std::env::var(key).unwrap_or_else(|_| "?".into());
    let mut out = String::new();
    let _ = writeln!(out, "CodeDeck {} ({}) · {} · {} · {}", info.version, info.commit, info.os, env("XDG_SESSION_TYPE"), env("XDG_CURRENT_DESKTOP"));
    let _ = writeln!(out, "Program: {}", std::env::current_exe().map_or_else(|e| e.to_string(), |p| p.display().to_string()));
    let _ = writeln!(out, "Project: {}", root.as_ref().map_or_else(|| format!("none ({})", window.label()), |r| r.display().to_string()));
    let p = platform::abilities();
    let _ = writeln!(
        out,
        "Detected: tmux {} · terminal {} · {} · tray {}",
        p.tmux.as_deref().unwrap_or("missing"),
        p.terminal.as_deref().unwrap_or("missing"),
        if p.wayland { "Wayland" } else if p.raise_windows { "X11" } else { "no display" },
        if p.tray { "yes" } else { "no host" }
    );
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
    let _ = writeln!(out, "Attention: {}", serde_json::to_string(&attention::load()).unwrap_or_default());
    if let Some(file) = root.as_ref().and_then(|r| journal::file_for(r)) {
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
        Some(role) if apps::open(&full, role, &apps::Launch::default())? => Ok(()),
        Some(_) => app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string()),
    }
}

/// Forgets a file left outside or a published page.
#[tauri::command]
fn forget_found(key: String, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().forget_found(&app, &key);
    Ok(())
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

/// Where a viewer is to open: a rectangle of this window in CSS pixels (the deck), turned into the
/// `--geometry` of a be spex viewer (physical pixels of the screen).
#[derive(serde::Deserialize)]
struct Place {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Opens a file of the project in its program for viewing or editing: the one chosen in CodeDeck,
/// for viewing else the be spex viewer for the type, else the system's default. A be spex viewer
/// reuses its window, jumps to `line` and opens over `place` (docs/QIEW.md).
#[tauri::command]
fn open_file(path: &str, role: Role, line: Option<u32>, place: Option<Place>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let full = project_of(&window)?.resolve(path)?;
    let geometry = place.and_then(|p| {
        let scale = window.scale_factor().ok()?;
        let at = window.inner_position().ok()?;
        let px = |v: f64| (v * scale).round() as i64;
        // Qiew sets the size of the content and the position of the whole window: its title bar and
        // borders come on top of the size. They are what this window has too (the same window
        // manager draws both), so they are taken off, and the viewer keeps inside the place
        let (outer, inner) = (window.outer_size().ok()?, window.inner_size().ok()?);
        let frame_w = i64::from(outer.width.saturating_sub(inner.width));
        let frame_h = i64::from(outer.height.saturating_sub(inner.height));
        let (w, h) = ((px(p.width) - frame_w).max(1), (px(p.height) - frame_h).max(1));
        Some(format!("{w}x{h}+{}+{}", at.x as i64 + px(p.x), at.y as i64 + px(p.y)))
    });
    if apps::open(&full, role, &apps::Launch { line, geometry })? {
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
    // The project lists of every window: which is shown here, and what was shown lately
    windows::overview_changed(&app);
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

/// Scratch files that lie in the project as well, same name and bytes: for tidying up.
#[tauri::command]
async fn scratch_twins(window: WebviewWindow) -> Result<Vec<scratch::Twin>, String> {
    let project = project_of(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (files, _) = scratch::list(&project);
        scratch::twins(&project, &files)
    })
    .await
    .map_err(|e| e.to_string())
}

/// What the user marked in this project's file list: hidden, shown again, important.
#[tauri::command]
fn file_marks(window: WebviewWindow) -> Result<filemarks::FileMarks, String> {
    Ok(filemarks::of(&project_of(&window)?.root))
}

/// Marks a path of the project (`hidden`, `shown`, `important`) or takes the mark off.
#[tauri::command]
fn set_file_mark(kind: String, path: String, on: bool, window: WebviewWindow) -> Result<filemarks::FileMarks, String> {
    filemarks::set(&project_of(&window)?.root, &kind, &path, on)
}

/// What the project's planning files say (U8.3): roadmap stages and steps, open points and tasks, ideas.
#[tauri::command]
async fn guide_plan(window: WebviewWindow) -> Result<guides::Plan, String> {
    let project = project_of(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let found = guides::of(&project);
        guides::plan_of(&project, &found)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Makes a file the project's guide file of a role, or with `role` null takes that choice back (U8.2).
#[tauri::command]
fn set_guide_role(path: String, role: Option<String>, window: WebviewWindow) -> Result<filemarks::FileMarks, String> {
    filemarks::set_guide(&project_of(&window)?.root, role.as_deref(), &path)
}

/// Renames a file or folder of the project in place; its new path.
#[tauri::command]
fn path_rename(path: String, name: String, window: WebviewWindow) -> Result<String, String> {
    let project = project_of(&window)?;
    let to = fileops::rename(&project, &path, &name)?;
    // The marks in the file list go along; failing that, the file is renamed all the same
    if let Err(e) = filemarks::moved(&project.root, &[(path, to.clone())]) {
        eprintln!("codedeck: file marks after renaming: {e}");
    }
    Ok(to)
}

/// Makes an empty file or folder in a folder of the project; its path.
#[tauri::command]
fn path_create(dir: String, name: String, folder: bool, window: WebviewWindow) -> Result<String, String> {
    fileops::create(&*project_of(&window)?, &dir, &name, folder)
}

/// Moves files or folders of the project into another of its folders; what moved, old and new path.
/// Their marks in the file list go along.
#[tauri::command]
fn path_move(paths: Vec<String>, dir: String, window: WebviewWindow) -> Result<Vec<(String, String)>, String> {
    let project = project_of(&window)?;
    let moved = fileops::move_into(&project, &paths, &dir)?;
    if let Err(e) = filemarks::moved(&project.root, &moved) {
        eprintln!("codedeck: file marks after moving: {e}");
    }
    Ok(moved)
}

/// Moves files or folders of the project to the trash.
#[tauri::command]
fn path_trash(paths: Vec<String>, window: WebviewWindow) -> Result<(), String> {
    fileops::trash(&*project_of(&window)?, &paths)
}

/// Every file of the project, for the search over the whole project.
#[tauri::command]
async fn project_files(window: WebviewWindow) -> Result<Vec<String>, String> {
    let project = project_of(&window)?;
    tauri::async_runtime::spawn_blocking(move || fileops::all_files(&project)).await.map_err(|e| e.to_string())
}

/// The project's guide files with their role (U8.2): instructions, README, TODO, IDEAS, ROADMAP.
#[tauri::command]
async fn guide_files(window: WebviewWindow) -> Result<Vec<guides::Guide>, String> {
    let project = project_of(&window)?;
    tauri::async_runtime::spawn_blocking(move || guides::of(&project)).await.map_err(|e| e.to_string())
}

/// Opens a terminal in a folder of the project (for a file: its folder).
#[tauri::command]
fn open_terminal_in(path: String, window: WebviewWindow) -> Result<(), String> {
    let project = project_of(&window)?;
    let full = if path.is_empty() { project.root.clone() } else { project.resolve(&path)? };
    let dir = if full.is_dir() { full } else { full.parent().map(Path::to_path_buf).ok_or("no folder")? };
    terminal::open_in(&dir)
}

/// Moves files of the scratch folder to the trash.
#[tauri::command]
fn scratch_trash(paths: Vec<String>, window: WebviewWindow) -> Result<(), String> {
    scratch::trash(&*project_of(&window)?, &paths)
}

/// Old scratch files to the trash by the expiry rules (U8.5), sparing `protected` (what the window
/// knows must stay: attached, not seen yet, in use); what went. A line in the journal tells it.
#[tauri::command]
async fn scratch_expire(protected: Vec<String>, window: WebviewWindow) -> Result<Vec<String>, String> {
    let win = windows::of(&window)?;
    let project = win.current.get();
    let gone = tauri::async_runtime::spawn_blocking(move || scratch::expire(&project, &protected, bridge::now_ms())).await.map_err(|e| e.to_string())??;
    if !gone.is_empty() {
        win.bridge().note(&journal::Line::expired(bridge::now_ms(), &gone));
    }
    Ok(gone)
}

/// A picture of the scratch folder as a `data:` address for a thumbnail; `null` for other files or big ones.
#[tauri::command]
async fn scratch_thumbnail(path: String, window: WebviewWindow) -> Result<Option<String>, String> {
    let project = project_of(&window)?;
    tauri::async_runtime::spawn_blocking(move || scratch::thumbnail(&project, &path)).await.map_err(|e| e.to_string())?
}

/// Moves a file of the scratch folder into the project; the new project-relative path.
#[tauri::command]
fn scratch_move(from: String, to: String, window: WebviewWindow) -> Result<String, String> {
    scratch::move_into(&*project_of(&window)?, &from, &to)
}

/// The prepared prompts, last changed first; their folder is watched from now on.
#[tauri::command]
fn prompt_list(window: WebviewWindow) -> Result<Vec<prompts::Prompt>, String> {
    let win = windows::of(&window)?;
    let (found, dir) = prompts::list(&win.current.get());
    if let Some(dir) = dir {
        win.watch.add(&dir);
    }
    Ok(found)
}

/// A prepared prompt's text.
#[tauri::command]
fn prompt_read(name: String, window: WebviewWindow) -> Result<String, String> {
    prompts::read(&*project_of(&window)?, &name)
}

/// Saves a prepared prompt's text.
#[tauri::command]
fn prompt_write(name: String, text: String, window: WebviewWindow) -> Result<(), String> {
    prompts::write(&*project_of(&window)?, &name, &text)
}

/// A new, empty prepared prompt; its name, made unique.
#[tauri::command]
fn prompt_create(name: String, window: WebviewWindow) -> Result<String, String> {
    prompts::create(&*project_of(&window)?, &name)
}

/// Renames a prepared prompt; the new name.
#[tauri::command]
fn prompt_rename(from: String, to: String, window: WebviewWindow) -> Result<String, String> {
    prompts::rename(&*project_of(&window)?, &from, &to)
}

/// Moves a prepared prompt to the trash.
#[tauri::command]
fn prompt_trash(name: String, window: WebviewWindow) -> Result<(), String> {
    prompts::trash(&*project_of(&window)?, &name)
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

/// Shows a patch in Dirq (see `apps::show_patch`): `id` names what it is, `line` the line of the
/// patch to show, `file` the one file to show alone. `annotate` (only for a patch of the working tree) lets the user comment on lines;
/// the comments come back to the hub as line comments of this project. `repo` (project-relative)
/// lets Dirq read the repository for more lines around a change.
#[tauri::command]
fn show_patch(
    text: String,
    id: Option<String>,
    line: Option<u32>,
    file: Option<String>,
    annotate: Option<bool>,
    repo: Option<String>,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    let root = windows::of(&window)?.current.get().root.clone();
    let repo_rel = repo.unwrap_or_default();
    let inside = std::path::Path::new(&repo_rel).components().all(|c| matches!(c, std::path::Component::Normal(_)));
    let repo_dir = Some(root.join(&repo_rel)).filter(|dir| inside && dir.is_dir());
    let socket = app.try_state::<hub::Hub>().map(|hub| hub.socket().to_path_buf());
    let annotate = annotate.unwrap_or(false) && inside && socket.is_some();
    if annotate && let Some(id) = &id {
        hub::remember_dirq_doc(&apps::dirq_id(id), &root, &repo_rel);
    }
    apps::show_patch(&text, &apps::PatchLaunch { id, line, file, annotate, socket, repo: repo_dir })
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

/// The session the attachments are meant for. Without one, `any` makes it whichever session in
/// the project prompts first; otherwise nothing is chosen.
#[tauri::command]
fn attach_for(session: Option<String>, any: Option<bool>, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?.bridge().set_target(&app, session, any.unwrap_or(false));
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

/// The user saw a session's finished turn: it waits no longer (until its next turn).
#[tauri::command]
fn session_seen(id: String, app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    windows::of(&window)?;
    // Every project that hears the session (its own, and those above it): seen is seen everywhere
    for bridge in app.state::<windows::Bridges>().all() {
        bridge.seen(&app, &id);
    }
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
fn set_harness_connection(harness: String, account: String, install: bool, app: AppHandle) -> Result<Vec<Connection>, String> {
    let tool = harness::by_id(Some(&harness)).ok_or_else(|| format!("{harness}: not a tool CodeDeck knows"))?;
    tool.connect(&account, install)?;
    // The settings are a window of their own now: the others hear of it, as of accounts
    let _ = app.emit("connections_changed", ());
    let _ = app.emit("accounts_changed", ());
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

/// Puts every folder inside `path` on my list (from the overview's `⋯`): how many were new, and how
/// many were there already.
#[tauri::command]
fn add_projects_in(path: String, app: AppHandle) -> Result<(usize, usize), String> {
    let (mut added, mut known) = (0, 0);
    for folder in projects::subfolders(Path::new(&path))? {
        let Ok(project) = Project::open(&folder) else { continue };
        if projects::add(&project.root) {
            added += 1;
            // From now on it hears its sessions, before any window opens
            windows::bridge_for(&app, &project.root);
        } else {
            known += 1;
        }
    }
    windows::overview_changed(&app);
    Ok((added, known))
}

/// Takes a project off my list; its window, if open, stays.
#[tauri::command]
fn remove_project(path: String, app: AppHandle) -> Result<(), String> {
    projects::remove(Path::new(&path))?;
    windows::forget_bridge(&app, Path::new(&path));
    windows::overview_changed(&app);
    Ok(())
}

/// Puts my projects in the order they were dragged into in the overview.
#[tauri::command]
fn reorder_projects(paths: Vec<String>, app: AppHandle) -> Result<(), String> {
    projects::reorder(&paths.into_iter().map(PathBuf::from).collect::<Vec<_>>())?;
    windows::overview_changed(&app);
    Ok(())
}

/// Sorts my projects once (from the overview's `⋯`): by `name`, by `account` (the AI
/// configuration's name, then the project's), or `daily` (today's list to the top).
#[tauri::command]
fn sort_projects(by: String, app: AppHandle) -> Result<(), String> {
    let by = projects::SortBy::of(&by).ok_or_else(|| format!("{by}: no such order"))?;
    let accounts = accounts::list();
    projects::sort(by, &|dir| accounts.iter().find(|a| a.dir == dir).map(|a| a.name.clone()))?;
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

/// How this window's project looks: its name, colour and mark (for the window's icon).
#[derive(serde::Serialize)]
struct ProjectLook {
    path: String,
    name: String,
    color: String,
    mark: serde_json::Value,
    /// The AI configuration its sessions run with, if the user chose one
    account: Option<String>,
}

#[tauri::command]
fn my_project(window: WebviewWindow) -> Result<ProjectLook, String> {
    let root = project_of(&window)?.root.clone();
    let [r, g, b] = icon::project_color(&root);
    let listed = projects::list().into_iter().find(|p| p.path == root);
    let account = listed.as_ref().and_then(|p| p.account.clone());
    let mark = listed.and_then(|p| p.mark).unwrap_or(serde_json::Value::Null);
    Ok(ProjectLook {
        path: root.display().to_string(),
        name: root.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy().into_owned()),
        color: format!("#{r:02x}{g:02x}{b:02x}"),
        mark,
        account,
    })
}

/// The window's icon as the window drew it (its project's mark and what waits), RGBA pixels.
#[tauri::command]
fn set_window_icon(rgba: Vec<u8>, size: u32, window: WebviewWindow) -> Result<(), String> {
    if rgba.len() != (size * size * 4) as usize {
        return Err("the pixels do not match the size".into());
    }
    let win = windows::of(&window)?;
    *win.drawn_icon.locked() = true;
    let set = window.set_icon(tauri::image::Image::new_owned(rgba, size, size));
    // Under Wayland the taskbar takes the icon from the desktop file: a mark that is not shown is no
    // error (title and attention still tell what waits)
    if platform::get().wayland {
        return Ok(());
    }
    set.map_err(|e| e.to_string())
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

/// The accounts of every tool with their names, colours and desktop profiles (step 3.2).
#[tauri::command]
fn accounts_list() -> Vec<accounts::Account> {
    accounts::list()
}

/// Changes an account's `name`, `color` or `desktopProfile`; every window hears of it.
#[tauri::command]
fn set_account(dir: String, field: String, value: serde_json::Value, app: AppHandle) -> Result<(), String> {
    accounts::set(&dir, &field, value)?;
    let _ = app.emit("accounts_changed", ());
    Ok(())
}

/// Moves a configuration folder that looks like a backup, or was never used, to the trash.
#[tauri::command]
fn trash_account(dir: String, app: AppHandle) -> Result<(), String> {
    accounts::trash(&dir)?;
    let _ = app.emit("accounts_changed", ());
    Ok(())
}

/// Makes a new profile of the tool's desktop app for an account: starts the app with a folder of
/// its own, so the user can sign in there, and keeps it as the account's profile.
#[tauri::command]
fn create_desktop_profile(dir: String, app: AppHandle) -> Result<String, String> {
    let account = accounts::list().into_iter().find(|a| a.dir == dir).ok_or("unknown account")?;
    let tool = harness::by_id(Some(&account.harness)).ok_or("unknown tool")?;
    let (profile, command) = tool.new_desktop_profile(&account.name).ok_or("this tool's desktop app has no profiles")?;
    let mut start = std::process::Command::new(&command[0]);
    start.args(&command[1..]);
    apps::detach(start)?;
    accounts::set(&dir, "desktopProfile", serde_json::json!(profile))?;
    let _ = app.emit("accounts_changed", ());
    Ok(profile)
}

/// The desktop app's profiles found here, to pick the one an account belongs to.
#[tauri::command]
fn desktop_profiles() -> Vec<String> {
    let mut all: Vec<String> = harness::all().iter().flat_map(|h| h.desktop_profiles()).collect();
    all.dedup();
    all
}

/// How the message begins when a session CodeDeck started earlier has not reported yet.
const SILENT_START: &str = "A session started earlier";

/// Starts a session of a project in tmux (docs/SITZUNGEN.md B2), with the project's AI
/// configuration and Remote Control. `fresh`: a new conversation; else the latest one that did not
/// end is continued, and nothing starts while one runs already. The tmux session's name.
fn start_in(app: &AppHandle, root: &Path, fresh: bool) -> Result<Option<String>, String> {
    let bridge = windows::bridge_for(app, root);
    let (running, resume) = bridge.start_info();
    if running && !fresh {
        return Ok(None);
    }
    // Started by CodeDeck earlier and silent so far: the tool probably waits for a question, e.g.
    // whether to trust the folder. Another one would only wait beside it (user, 2026-11-18: eight)
    if !fresh {
        let ours = tmux::started_for(root);
        // One of them reported: it runs, even if its log says nothing of it yet
        if ours.iter().any(|s| bridge.knows(&s.id)) {
            return Ok(None);
        }
        if let Some(silent) = ours.first() {
            let name = &silent.name;
            return Err(format!("{SILENT_START} ({name}) has not reported yet. It probably waits for a question, e.g. whether to trust this folder: open it with  tmux attach -t {name}"));
        }
    }
    // The project's tool, not simply the first one (docs/SITZUNGEN-PRUEFUNG.md K6)
    let (tool, account) = projects::start_with(root)?;
    let (_, name) = tmux::start(root, tool, account.as_deref(), if fresh { None } else { resume.as_deref() })?;
    started(app);
    Ok(Some(name))
}

/// Tells every window that a session was started in tmux: its "Starting…" row shows at once, not
/// at the next look at tmux.
fn started(app: &AppHandle) {
    let _ = app.emit("sessions_started", ());
}

/// Starts a session in one project: `fresh` a new conversation, else the last one continues.
/// `None` when one runs there already (and `fresh` is false).
#[tauri::command]
async fn start_session(project: String, fresh: bool, app: AppHandle) -> Result<Option<String>, String> {
    let root = Project::open(Path::new(&project))?.root;
    start_in(&app, &root, fresh)
}

/// Continues one conversation of a project in tmux, the one the user picked (not, as
/// [`start_session`] does, the latest): in its own tool and account, else the project's.
#[tauri::command]
async fn resume_session(project: String, session: String, app: AppHandle) -> Result<String, String> {
    let root = Project::open(Path::new(&project))?.root;
    let bridge = windows::bridge_for(&app, &root);
    if !bridge.ways_of(&session).unwrap_or_default().actions.contains(&doors::Action::Continue) {
        return Err("this session cannot be continued from here".into());
    }
    // Already being continued: a second process of the same conversation would only get in the
    // way. Most likely the first waits for an answer before it reports, so show it instead
    if let Some(running) = tmux::started_for(&root).into_iter().find(|s| s.id == session) {
        let place = harness::Place { tmux: Some(harness::Tmux { pane: String::new(), session: Some(running.name.clone()) }), ..Default::default() };
        doors::terminal(&place, None)?;
        return Ok(running.name);
    }
    // One the tool keeps in the background goes on there: joining it brings it back
    if let Some((tool, account, Some(place))) = bridge.session_place(&session).filter(|(_, _, p)| p.as_ref().is_some_and(|p| p.background.is_some())) {
        let job = place.background.clone().unwrap_or_default();
        let attach = harness::by_id(Some(tool)).and_then(|t| t.attach(&job, account.as_deref()));
        doors::terminal(&place, attach)?;
        return Ok(job);
    }
    let (tool, account) = bridge.resume_info(&session)?;
    let tool = harness::by_id(Some(tool)).ok_or("unknown tool")?;
    let account = account.or_else(|| projects::list().into_iter().find(|p| p.path == root).and_then(|p| p.account));
    let (_, name) = tmux::start(&root, tool, account.as_deref(), Some(&session))?;
    started(&app);
    Ok(name)
}

/// Starts the sessions of every project on today's list that has none running, one after the
/// other (docs/SITZUNGEN.md A12). The names of the projects started and of those skipped.
#[tauri::command]
async fn start_today(app: AppHandle) -> Result<(Vec<String>, Vec<String>), String> {
    today(&app)
}

/// The machine setting that starts today's list when CodeDeck starts ("at start", A12).
const TODAY_AT_START: &str = "startTodayAtStart";

/// At the start of the process, if the user wants it: today's list, once every project on it
/// knows what runs there (else a quiet running session would be started a second time). The
/// windows hear the outcome (`today_started`).
fn today_at_start(app: &AppHandle) {
    if config::machine_settings().get(TODAY_AT_START).and_then(|v| v.as_bool()) != Some(true) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        for project in projects::list().into_iter().filter(|p| p.daily) {
            windows::bridge_for(&app, &project.path).wait_loaded(std::time::Duration::from_secs(20));
        }
        let outcome = today(&app);
        if let Err(e) = &outcome {
            eprintln!("codedeck: today's list: {e}");
        }
        let _ = app.emit("today_started", outcome);
    });
}

fn today(app: &AppHandle) -> Result<(Vec<String>, Vec<String>), String> {
    let (mut started, mut skipped) = (Vec::new(), Vec::new());
    for project in projects::list().into_iter().filter(|p| p.daily) {
        let name = project.path.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned());
        match start_in(app, &project.path, false) {
            Ok(Some(_)) => {
                started.push(name);
                // A breath between two: every tool start reads its configuration and logs in
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
            Ok(None) => skipped.push(name),
            // Started before and silent: it waits in tmux; the others still start
            Err(e) if e.starts_with(SILENT_START) => skipped.push(format!("{name} (waits in tmux)")),
            Err(e) => return Err(e),
        }
    }
    Ok((started, skipped))
}

/// Stops a session CodeDeck started in tmux; its conversation is kept. With `restart`, the same
/// conversation starts again in a fresh process (B6). A session in a tmux session the user made is
/// refused by [`tmux::stop`]: ending it would end the user's other work there.
#[tauri::command]
async fn stop_session(project: String, session: String, restart: bool, app: AppHandle) -> Result<(), String> {
    let root = Project::open(Path::new(&project))?.root;
    let bridge = windows::bridge_for(&app, &root);
    let (harness_id, account, place) = bridge.session_place(&session).ok_or("this session is not known (any more)")?;
    // Only what the interface offers: sessions CodeDeck started, not while they work
    let actions = bridge.ways_of(&session).unwrap_or_default().actions;
    if !actions.contains(if restart { &doors::Action::Restart } else { &doors::Action::Stop }) {
        return Err("CodeDeck did not start this session: end it where it runs".into());
    }
    let name = place
        .and_then(|p| p.tmux)
        .and_then(|t| t.session)
        .ok_or("it does not run in tmux: end it where it runs")?;
    tmux::stop(&name)?;
    if restart {
        std::thread::sleep(std::time::Duration::from_millis(600));
        let tool = harness::by_id(Some(harness_id)).ok_or("unknown tool")?;
        let account = projects::list().into_iter().find(|p| p.path == root).and_then(|p| p.account).or(account);
        tmux::start(&root, tool, account.as_deref(), Some(&session))?;
        started(&app);
    }
    Ok(())
}

/// A session CodeDeck started in tmux that has not reported yet: it may wait for a question (e.g.
/// whether to trust the folder), and without a report it would not be seen at all.
#[derive(serde::Serialize)]
struct Pending {
    /// The tmux session's name
    name: String,
    /// The id of the session it will become
    id: String,
    /// When it was started, Unix milliseconds: at first it is starting, later it probably waits
    since: u64,
    /// The command it was started with, if CodeDeck kept it
    command: Option<String>,
    /// It can be opened in a terminal here (a terminal program was found)
    door: bool,
}

/// The sessions started in tmux for a project that nothing was heard of yet.
// Async: asked every few seconds, and tmux and /proc must not hold up the window
#[tauri::command]
async fn pending_sessions(project: String, app: AppHandle) -> Vec<Pending> {
    let root = Path::new(&project);
    let bridge = windows::bridge_for(&app, root);
    tmux::started_for(root)
        .into_iter()
        // Not `knows`: a continued conversation keeps its id, and its new process may wait for an
        // answer (trust the folder?) while the card still shows the ended one
        .filter(|s| !bridge.heard_since(&s.id, s.since))
        .map(|s| Pending { command: tmux::command_of(&s.name), name: s.name, id: s.id, since: s.since, door: platform::get().terminal.is_some() })
        .collect()
}

/// Opens such a session in a terminal (to see its question and answer it), or ends it.
#[tauri::command]
async fn pending_session(project: String, name: String, end: bool) -> Result<(), String> {
    // Only what CodeDeck started for this project: never an arbitrary tmux session
    if !tmux::started_for(Path::new(&project)).iter().any(|s| s.name == name) {
        return Err("that session is not one CodeDeck started here (any more)".into());
    }
    if end {
        return tmux::stop(&name);
    }
    doors::terminal(&harness::Place { tmux: Some(harness::Tmux { pane: String::new(), session: Some(name) }), ..Default::default() }, None)
}

/// Whether CodeDeck starts at login (in the tray), and with which program.
#[tauri::command]
fn autostart_state() -> autostart::State {
    autostart::state()
}

/// Starts CodeDeck at login with this program, or no longer.
#[tauri::command]
fn set_autostart(on: bool) -> Result<autostart::State, String> {
    autostart::set(on)?;
    Ok(autostart::state())
}

/// How a session CodeDeck started in tmux was started, and how it is ended (nothing happens out of
/// sight, docs/SITZUNGEN.md A3). `None` for a session CodeDeck did not start.
#[derive(serde::Serialize)]
struct Commands {
    /// `None` when CodeDeck started it before it kept the command
    start: Option<String>,
    /// The tool's part of it, to be read at a glance
    tool: Option<String>,
    stop: String,
}

#[tauri::command]
async fn session_commands(project: String, name: String) -> Option<Commands> {
    // Only what CodeDeck started for this project: never an arbitrary tmux session
    if !tmux::started_for(Path::new(&project)).iter().any(|s| s.name == name) {
        return None;
    }
    Some(Commands { start: tmux::command_of(&name), tool: tmux::tool_command_of(&name), stop: tmux::stop_command(&name) })
}

/// Goes into a session of a project: `door` is "desktop" (the tool's desktop app) or "terminal".
// Async, so not on the main thread: it may read the session's log first and starts programs
#[tauri::command]
async fn open_session(project: String, session: String, door: String, app: AppHandle) -> Result<(), String> {
    enter_session(&app, Path::new(&project), &session, &door)
}

/// Goes into a session, from the list or from a click on its notification: see [`open_session`].
pub(crate) fn enter_session(app: &AppHandle, project: &Path, session: &str, door: &str) -> Result<(), String> {
    let bridge = windows::bridge_for(app, project);
    // Going into it is looking at it: a finished turn waits no longer
    bridge.seen(app, session);
    // A fresh session has not told its link yet: its log may have it already
    if door != "terminal" {
        bridge.discover_remote(app, session);
    }
    let (harness, account, place) = bridge.session_place(session).ok_or("this session is not known (any more)")?;
    let place = place.ok_or("this session has not said where it runs yet")?;
    // The same decision the interface shows (docs/SITZUNGEN-PRUEFUNG.md K2); `auto` (a double
    // click) takes the first: the desktop app where the session is reachable there, else its terminal
    let ways = bridge.ways_of(session).unwrap_or_default();
    let chosen = match door {
        "auto" => ways.doors.first().copied(),
        "terminal" => ways.doors.iter().copied().find(|d| d.is_terminal()),
        "desktop" => ways.doors.iter().copied().find(|d| *d == doors::Door::Desktop),
        _ => return Err(format!("{door}: no such way in")),
    };
    let Some(chosen) = chosen else {
        return Err(match (door, ways.no_door) {
            ("desktop", _) => "not reachable from the desktop app: Remote Control is off or not connected",
            (_, Some(doors::NoDoor::NoTerminal)) => "no terminal program was found on this computer",
            (_, Some(doors::NoDoor::OwnTerminal)) => "its terminal window cannot be brought to the front on this desktop",
            _ => "there is no way into this session from here",
        }
        .into());
    };
    match if chosen.is_terminal() { "terminal" } else { "desktop" } {
        "terminal" => {
            // A session in the background is opened by its tool, in its account
            let attach = place.background.as_deref().and_then(|job| harness::by_id(Some(harness))?.attach(job, account.as_deref()));
            doors::terminal(&place, attach)
        }
        "desktop" => {
            let remote = place.remote.as_deref().ok_or("not reachable from the desktop app: Remote Control is off or not connected")?;
            let tool = harness::by_id(Some(harness)).ok_or("unknown tool")?;
            // The app's data folder for the session's account, as set under Settings → Accounts
            let profile = account.as_deref().and_then(accounts::desktop_profile);
            let command = tool.desktop_command(remote, profile.as_deref()).ok_or("this tool has no desktop app to open it in")?;
            let mut start = std::process::Command::new(&command[0]);
            start.args(&command[1..]);
            apps::detach(start)
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

/// "Remove from Recently" in the project list: `recent.json` keeps only the projects still shown there
/// (`keep`), every list shows it at once.
#[tauri::command]
fn forget_recent(app: AppHandle, keep: Vec<String>) {
    recent::forget(&keep.into_iter().map(PathBuf::from).collect::<Vec<_>>());
    windows::overview_changed(&app);
}

/// "Close project" (Ctrl+W): the window goes with its project; when it was the last project window the
/// start page shows (see `Destroyed`). A window has no state without a project to fall back to.
#[tauri::command]
fn close_window(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
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
    // At login (`--tray`): no window, the overview waits in the tray; nothing to do if CodeDeck runs
    let tray_only = std::env::args().nth(1).as_deref() == Some(autostart::TRAY);
    // `--toggle` (bound to a key in the desktop, where CodeDeck cannot hold one): the running one
    // comes to the front or goes away; without one, CodeDeck starts and shows the start page
    let toggle = std::env::args().nth(1).as_deref() == Some(hub::TOGGLE);
    if toggle && hub::toggle() {
        return;
    }
    let project = if tray_only || toggle {
        if hub::running() {
            return;
        }
        None
    } else {
        match Project::from_args() {
            // This program runs already: it opens the window, this start ends here
            Ok(Some(project)) if hub::hand_over(&project.root) => return,
            Ok(Some(project)) => Some(project),
            // Without a folder (the menu, a launcher): the running one comes to the front, never away
            Ok(None) if hub::to_front() => return,
            Ok(None) => None,
            Err(message) => {
                eprintln!("codedeck: {message}");
                std::process::exit(2);
            }
        }
    };
    // Without a project and not at login in the tray, the start page shows at once
    let start_page = toggle || (!tray_only && project.is_none());

    tauri::Builder::default()
        .manage(Windows::default())
        .manage(windows::Bridges::default())
        .manage(window::Shortcuts::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(window::plugin())
        .on_window_event(|window, event| match event {
            // The window in front is the one the global shortcuts act on
            // The welcome is beside the work: shortcuts and the overview keep to the project windows
            // So are the settings
            tauri::WindowEvent::Focused(_) | tauri::WindowEvent::Destroyed if window.label() == welcome::LABEL || settings::is_panel(window.label()) => {}
            tauri::WindowEvent::Focused(focused) => {
                window::focus_changed(window.app_handle(), window.label(), *focused);
                // The overview marks the project window used last
                if *focused && window.label() != windows::OVERVIEW {
                    windows::overview_changed(window.app_handle());
                }
            }
            // Closing the overview hides it: it is found again in the tray, and CodeDeck goes on
            // hearing its sessions with no window in sight. Quit (tray or ⋯) ends it
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == windows::OVERVIEW => {
                api.prevent_close();
                let _ = window.hide();
                tray::refresh(window.app_handle());
            }
            // Where a project window closes, the start page may have to show next
            tauri::WindowEvent::CloseRequested { .. } => windows::closing(window),
            tauri::WindowEvent::Destroyed => {
                let app = window.app_handle();
                app.state::<Windows>().remove(app, window.label());
                windows::overview_changed(app);
                // The last project window closed: the start page shows, CodeDeck goes on hearing its sessions
                if window.label() != windows::OVERVIEW && app.state::<Windows>().all().is_empty() {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        // A moment for the window manager to finish with the closed window: shown in the
                        // same instant, the start page could end up behind what took the focus next
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        match app.get_webview_window(windows::OVERVIEW) {
                            Some(start) if start.is_visible().unwrap_or(false) => window::obey(&start, window::Request::Front),
                            _ => {
                                if let Err(e) = windows::start_page_after_close(&app) {
                                    eprintln!("codedeck: start page: {e}");
                                }
                            }
                        }
                    });
                }
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
            today_at_start(app.handle());
            tray::start(app.handle());
            if let Some(project) = project {
                windows::open(app.handle(), project)?;
            }
            // The start page, the window without a project (docs/UMSETZUNG.md "Projektliste im Fenster statt
            // Übersicht", step c), is made hidden: every project window has the project list, the start
            // page shows only while none is open (the tray, the last project window closed)
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let made = windows::hidden_overview(&handle);
                if let Err(e) = made {
                    eprintln!("codedeck: overview: {e}");
                } else if start_page {
                    let _ = windows::front_or_away(&handle);
                }
            });
            // The welcome, at a start with a window (not at login in the tray)
            if !tray_only {
                welcome::at_start(app.handle());
            }
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
            scratch_twins,
            file_marks,
            set_file_mark,
            path_rename,
            path_create,
            path_move,
            path_trash,
            open_terminal_in,
            project_files,
            guide_files,
            set_guide_role,
            guide_plan,
            scratch_thumbnail,
            scratch_expire,
            scratch_move,
            prompt_list,
            prompt_read,
            prompt_write,
            prompt_create,
            prompt_rename,
            prompt_trash,
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
            session_seen,
            resume_session,
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
            global_shortcuts,
            platform,
            checkup,
            welcome_at_start,
            welcome_done,
            open_welcome,
            open_settings,
            open_panel,
            harness_list,
            welcome_fit,
            window_help,
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
            close_window,
            forget_recent,
            quit,
            add_project,
            set_project,
            my_project,
            set_window_icon,
            open_session,
            pending_sessions,
            pending_session,
            session_commands,
            autostart_state,
            set_autostart,
            start_session,
            accounts_list,
            set_account,
            trash_account,
            desktop_profiles,
            create_desktop_profile,
            start_today,
            stop_session,
            remove_project,
            add_projects_in,
            reorder_projects,
            sort_projects,
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

#[cfg(test)]
mod registration {
    /// A `#[tauri::command]` left out of `generate_handler!` compiles without a word and fails only
    /// in the app, where the preview's mocks hide it (U8: three commands were missing this way).
    #[test]
    fn every_command_is_registered() {
        let src = include_str!("lib.rs");
        let handler = &src[src.find("generate_handler![").expect("handler list")..];
        let handler = &handler[..handler.find(']').unwrap()];
        let listed: std::collections::HashSet<&str> = handler.trim_start_matches("generate_handler![").split(',').map(|n| n.trim().rsplit("::").next().unwrap_or("")).collect();
        let mut missing = Vec::new();
        let mut lines = src.lines().peekable();
        while let Some(line) = lines.next() {
            if line.trim() != "#[tauri::command]" {
                continue;
            }
            let Some(next) = lines.peek() else { break };
            let after = next.trim().trim_start_matches("pub ").trim_start_matches("async ");
            if let Some(name) = after.strip_prefix("fn ").and_then(|r| r.split(['(', '<']).next()) {
                if !listed.contains(name) {
                    missing.push(name.to_string());
                }
            }
        }
        assert!(missing.is_empty(), "commands not in generate_handler!: {missing:?}");
    }
}
