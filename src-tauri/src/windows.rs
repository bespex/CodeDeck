//! The windows of the one CodeDeck process (D25). Each shows a project of its own, with its own
//! file watcher, git view and sessions; the process has one socket and the global shortcuts for
//! all of them. Commands find the window that called them here.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::bridge::Bridge;
use crate::git::Git;
use crate::project::Project;
use crate::watch::Watch;
use crate::window::FullPlace;
use crate::{Current, Locked};

/// One window and what belongs to it.
pub struct Win {
    pub label: String,
    /// The project it shows; it can be switched
    pub current: Arc<Current>,
    pub watch: Watch,
    /// The bridge of the project it shows: it belongs to the project, not to the window
    bridge: Mutex<Arc<Bridge>>,
    /// What follows the project's name in the title, e.g. "● 2 asking"; set by the window
    pub title_status: Mutex<String>,
    /// Whether a session asks, whether a turn is done: the dot on the window's icon
    pub waiting: Mutex<(bool, bool)>,
    /// What the window reports about its project for the overview (git, next prompt, workbench)
    pub summary: Mutex<serde_json::Value>,
    /// The window draws its icon itself (the project's mark): no plain icon over it any more
    pub drawn_icon: Mutex<bool>,
}

impl Win {
    pub fn bridge(&self) -> Arc<Bridge> {
        self.bridge.locked().clone()
    }

    /// Git of the project it shows, with the log of the commands run for that project.
    pub fn git(&self) -> Arc<Git> {
        self.bridge().git()
    }

    /// Shows another project: leaves the bridge of the old one, takes the new one's.
    pub fn switch_to(&self, app: &AppHandle, project: Arc<Project>) {
        self.bridge().show_in(app, None);
        let bridge = bridge_for(app, &project.root);
        self.current.set(project);
        *self.bridge.locked() = bridge.clone();
        bridge.show_in(app, Some(self.label.clone()));
    }
}

// ── One bridge per project (docs/UEBERSICHT.md, step b) ──────────────────────

/// The bridges of my projects and of every project with a window: they hear their sessions and
/// keep the snapshots whether a window is open or not.
#[derive(Default)]
pub struct Bridges(Mutex<HashMap<std::path::PathBuf, Arc<Bridge>>>);

impl Bridges {
    pub fn all(&self) -> Vec<Arc<Bridge>> {
        self.0.locked().values().cloned().collect()
    }
}

/// The bridge of a project, made the first time it is asked for.
pub fn bridge_for(app: &AppHandle, root: &Path) -> Arc<Bridge> {
    let bridges = app.state::<Bridges>();
    if let Some(bridge) = bridges.0.locked().get(root) {
        return bridge.clone();
    }
    // Made outside the lock: it starts reading the tools' logs in the background
    let made = Bridge::new(app, Arc::new(Current(RwLock::new(Arc::new(Project { root: root.to_path_buf() })))));
    bridges.0.locked().entry(root.to_path_buf()).or_insert(made).clone()
}

/// A bridge for each project on my list, at the start.
pub fn listen_to_my_projects(app: &AppHandle) {
    for project in crate::projects::list() {
        bridge_for(app, &project.path);
    }
}

/// Lets a project go that is neither on my list nor shown in a window.
pub fn forget_bridge(app: &AppHandle, root: &Path) {
    let shown = app.state::<Windows>().all().iter().any(|w| w.current.get().root == root);
    if !shown && !crate::projects::list().iter().any(|p| p.path == root) {
        app.state::<Bridges>().0.locked().remove(root);
    }
}

#[derive(Default)]
pub struct Windows {
    all: Mutex<HashMap<String, Arc<Win>>>,
    next: AtomicU32,
}

impl Windows {
    pub fn all(&self) -> Vec<Arc<Win>> {
        self.all.locked().values().cloned().collect()
    }

    /// Forgets a closed window and its watcher; its project's bridge goes on without it.
    pub fn remove(&self, app: &AppHandle, label: &str) {
        let gone = self.all.locked().remove(label);
        if let Some(win) = gone {
            win.bridge().show_in(app, None);
            forget_bridge(app, &win.current.get().root);
        }
    }

    fn get(&self, label: &str) -> Option<Arc<Win>> {
        self.all.locked().get(label).cloned()
    }
}

/// The window that called a command.
pub fn of(window: &WebviewWindow) -> Result<Arc<Win>, String> {
    window.app_handle().state::<Windows>().get(window.label()).ok_or_else(|| format!("{}: not a CodeDeck window", window.label()))
}

/// Opens a new window on a project. Callable from any thread but the main one's command handlers
/// (building a window waits for the main thread).
pub fn open(app: &AppHandle, project: Project) -> Result<String, String> {
    let windows = app.state::<Windows>();
    let label = format!("w{}", windows.next.fetch_add(1, Ordering::Relaxed) + 1);
    crate::recent::remember(&project.root);
    // A project with a window is one of mine (docs/UEBERSICHT.md, "Meine Projekte")
    crate::projects::add(&project.root);
    let bridge = bridge_for(app, &project.root);
    let current = Arc::new(Current(RwLock::new(Arc::new(project))));
    let watch = Watch::start(app.clone(), label.clone(), current.clone()).map_err(|e| e.to_string())?;
    let win = Arc::new(Win {
        label: label.clone(),
        current,
        watch,
        bridge: Mutex::new(bridge.clone()),
        title_status: Mutex::new(String::new()),
        waiting: Mutex::new((false, false)),
        summary: Mutex::new(serde_json::Value::Null),
        drawn_icon: Mutex::new(false),
    });
    // Known before the page loads: it asks for its project at once
    windows.all.locked().insert(label.clone(), win.clone());
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::default())
        .title(crate::title_of(&win))
        .inner_size(1440.0, 900.0)
        .min_inner_size(280.0, 400.0)
        .background_color(tauri::window::Color(2, 6, 23, 255))
        .build();
    if let Err(e) = built {
        windows.all.locked().remove(&label);
        return Err(e.to_string());
    }
    bridge.show_in(app, Some(label.clone()));
    // Beside the overview, with a margin to the screen's edges (user, 2026-11-17). Off this thread:
    // placing waits for the window manager, and `open` may run on the main thread
    if let Some(window) = app.get_webview_window(&label) {
        let app = app.clone();
        std::thread::spawn(move || crate::window::place_beside_overview(&app, &window));
    }
    crate::set_title(app, &win);
    crate::window::shown(app);
    crate::exclude_scratch(app, &win);
    overview_changed(app);
    Ok(label)
}

// ── The overview (docs/UEBERSICHT.md) ─────────────────────────────────────────

/// The label of the overview: one window for every project, no project of its own.
pub const OVERVIEW: &str = "overview";
/// Width of the overview when it opens, in logical pixels.
const OVERVIEW_WIDTH: f64 = 450.0;

/// One of my projects, as the overview shows it, with its window or without.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewProject {
    /// The label of its window; `None` while it has none
    pub label: Option<String>,
    pub name: String,
    pub path: String,
    /// Its colour, `#rrggbb`, until the user picks a mark
    pub color: String,
    /// Its sessions and what waits; `None` without a window (until sessions are kept without one)
    pub state: Option<crate::bridge::AssistantState>,
    /// What its window reported (git, next prompt, workbench); `null` until it did
    pub summary: serde_json::Value,
    /// Its window has the focus or had it last
    pub front: bool,
    /// On my list of projects (an open window of a project taken off the list is not)
    pub listed: bool,
    /// Its window is loaded and shown (not hidden from the overview)
    pub visible: bool,
    /// On today's list
    pub daily: bool,
    /// The AI configuration its sessions should run with
    pub account: Option<String>,
    /// Its mark, as chosen; `null`: the first letter on its colour
    pub mark: serde_json::Value,
}

/// The overview's view of my projects in their order, then open windows of projects not on the list.
pub fn overview_state(app: &AppHandle) -> Vec<OverviewProject> {
    let last = crate::window::last_label(app);
    let mut open = app.state::<Windows>().all();
    open.sort_by_key(|w| w.label.trim_start_matches('w').parse::<u32>().unwrap_or(0));
    let listed = crate::projects::list();
    let entry = |root: &Path, win: Option<&Arc<Win>>, listed: Option<&crate::projects::Listed>| {
        let [r, g, b] = crate::icon::project_color(root);
        OverviewProject {
            label: win.map(|w| w.label.clone()),
            name: root.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy().into_owned()),
            path: root.display().to_string(),
            color: format!("#{r:02x}{g:02x}{b:02x}"),
            state: Some(bridge_for(app, root).state()),
            summary: win.map_or(serde_json::Value::Null, |w| w.summary.locked().clone()),
            front: win.is_some_and(|w| last.as_deref() == Some(w.label.as_str())),
            listed: listed.is_some(),
            daily: listed.is_some_and(|l| l.daily),
            account: listed.and_then(|l| l.account.clone()),
            mark: listed.and_then(|l| l.mark.clone()).unwrap_or(serde_json::Value::Null),
            visible: win.and_then(|w| app.get_webview_window(&w.label)).is_some_and(|w| w.is_visible().unwrap_or(false)),
        }
    };
    let window_of = |root: &Path| open.iter().find(|w| w.current.get().root == root);
    let mut all: Vec<OverviewProject> = listed.iter().map(|p| entry(&p.path, window_of(&p.path), Some(p))).collect();
    for w in &open {
        let root = w.current.get().root.clone();
        if !listed.iter().any(|p| p.path == root) {
            all.push(entry(&root, Some(w), None));
        }
    }
    all
}

/// Opens the window of one of my projects, or brings it to the front if it is open.
pub fn show_project(app: &AppHandle, path: &Path) -> Result<(), String> {
    let open = app.state::<Windows>().all().into_iter().find(|w| w.current.get().root == path);
    match open.and_then(|w| app.get_webview_window(&w.label)) {
        Some(window) => {
            crate::window::obey(&window, crate::window::Request::Front);
            Ok(())
        }
        None => open_project(app, path),
    }
}

fn open_project(app: &AppHandle, path: &Path) -> Result<(), String> {
    open(app, Project::open(path)?).map(drop)
}

/// Tells the overview that something it shows changed; it asks for the state again.
pub fn overview_changed(app: &AppHandle) {
    use tauri::Emitter;
    let _ = app.emit_to(OVERVIEW, "overview_changed", ());
}

/// Shows the overview, or hides it when it is shown; opens it the first time. Off the main thread.
pub fn toggle_overview(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERVIEW) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // Back at the right edge of its monitor, at the width the user left it: shown again,
            // the window manager may put it elsewhere (user, 2026-11-17)
            let width = window.inner_size().ok().zip(window.scale_factor().ok()).map_or(OVERVIEW_WIDTH, |(s, f)| s.width as f64 / f);
            let _ = window.show();
            let _ = window.unminimize();
            crate::window::set_compact(&window, &FullPlace::default(), true, width).map_err(|e| e.to_string())?;
            let _ = window.set_focus();
        }
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(app, OVERVIEW, WebviewUrl::App("index.html?view=overview".into()))
        .title("CodeDeck")
        .inner_size(OVERVIEW_WIDTH, 800.0)
        .min_inner_size(260.0, 300.0)
        .background_color(tauri::window::Color(2, 6, 23, 255))
        .build()
        .map_err(|e| e.to_string())?;
    // At the right edge of the monitor, as high as the panels leave free: the sidebar's place
    crate::window::set_compact(&window, &FullPlace::default(), true, OVERVIEW_WIDTH).map_err(|e| e.to_string())?;
    Ok(())
}
