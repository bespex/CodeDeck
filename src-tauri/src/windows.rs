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
    /// Git for the project, with the log of the commands run for this window
    pub git: Arc<Git>,
    pub watch: Watch,
    pub bridge: Arc<Bridge>,
    /// Where the full window was while it is a sidebar
    pub place: FullPlace,
    /// What follows the project's name in the title, e.g. "● 2 asking"; set by the window
    pub title_status: Mutex<String>,
    /// Whether a session asks, whether a turn is done: the dot on the window's icon
    pub waiting: Mutex<(bool, bool)>,
    /// What the window reports about its project for the overview (git, next prompt, workbench)
    pub summary: Mutex<serde_json::Value>,
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

    /// Forgets a closed window: its watcher, bridge and git view go with it.
    pub fn remove(&self, label: &str) {
        self.all.locked().remove(label);
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
    let current = Arc::new(Current(RwLock::new(Arc::new(project))));
    let git = Arc::new(Git::new());
    let watch = Watch::start(app.clone(), label.clone(), current.clone()).map_err(|e| e.to_string())?;
    let bridge = Bridge::new(app, label.clone(), current.clone(), git.clone());
    let win = Arc::new(Win {
        label: label.clone(),
        current,
        git,
        watch,
        bridge,
        place: FullPlace::default(),
        title_status: Mutex::new(String::new()),
        waiting: Mutex::new((false, false)),
        summary: Mutex::new(serde_json::Value::Null),
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
        windows.remove(&label);
        return Err(e.to_string());
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
const OVERVIEW_WIDTH: f64 = 330.0;

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
}

/// The overview's view of my projects in their order, then open windows of projects not on the list.
pub fn overview_state(app: &AppHandle) -> Vec<OverviewProject> {
    let last = crate::window::last_label(app);
    let mut open = app.state::<Windows>().all();
    open.sort_by_key(|w| w.label.trim_start_matches('w').parse::<u32>().unwrap_or(0));
    let listed = crate::projects::list();
    let entry = |root: &Path, win: Option<&Arc<Win>>, listed: bool| {
        let [r, g, b] = crate::icon::project_color(root);
        OverviewProject {
            label: win.map(|w| w.label.clone()),
            name: root.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy().into_owned()),
            path: root.display().to_string(),
            color: format!("#{r:02x}{g:02x}{b:02x}"),
            state: win.map(|w| w.bridge.state()),
            summary: win.map_or(serde_json::Value::Null, |w| w.summary.locked().clone()),
            front: win.is_some_and(|w| last.as_deref() == Some(w.label.as_str())),
            listed,
        }
    };
    let window_of = |root: &Path| open.iter().find(|w| w.current.get().root == root);
    let mut all: Vec<OverviewProject> = listed.iter().map(|p| entry(&p.path, window_of(&p.path), true)).collect();
    for w in &open {
        let root = w.current.get().root.clone();
        if !listed.iter().any(|p| p.path == root) {
            all.push(entry(&root, Some(w), false));
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
            crate::window::obey(&window, crate::window::Request::Front);
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
