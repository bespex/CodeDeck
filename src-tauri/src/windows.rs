//! The windows of the one CodeDeck process (D25). Each shows a project of its own, with its own
//! file watcher, git view and sessions; the process has one socket and the global shortcuts for
//! all of them. Commands find the window that called them here.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
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
    /// What goes in front of the title, e.g. "● 2 waiting · "; set by the window
    pub title_prefix: Mutex<String>,
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
        title_prefix: Mutex::new(String::new()),
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
    crate::window::shown(app);
    crate::exclude_scratch(app, &win);
    Ok(label)
}
