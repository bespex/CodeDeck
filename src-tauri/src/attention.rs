//! Getting the user's attention when something happened that they want to know about: a session
//! asks, a turn is over, a git command failed. Which of these count and how they are shown is the
//! user's choice ([`Settings`], kept for the machine). Sessions are watched here, once for the
//! whole process ([`observe`]): every project on the list has its bridge, shown in a window or not.
//! A click on a session's notification goes into that session. A failed git command is told by
//! the window it ran for ([`notify`]); the window title is the window's too.

use crate::Locked;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, UserAttentionType, WebviewWindow};

/// What to tell the user about, and how. The window title always carries the count.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// A session asks something (a permission, a question)
    pub asks: bool,
    /// A session finished its turn and waits for the next prompt
    pub done: bool,
    /// A git command CodeDeck ran failed
    pub git_failed: bool,
    /// The window asks for attention in the taskbar
    pub taskbar: bool,
    /// A notification on the desktop
    pub desktop: bool,
    /// "Do not disturb" until then (Unix milliseconds): no taskbar, no notification; the title still counts
    pub quiet_until: Option<u64>,
}

impl Default for Settings {
    fn default() -> Self {
        Self { asks: true, done: true, git_failed: false, taskbar: true, desktop: true, quiet_until: None }
    }
}

const FILE: &str = "attention.json";

pub fn load() -> Settings {
    crate::config::file(FILE)
        .and_then(|f| std::fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let file = crate::config::file(FILE).ok_or("no config directory")?;
    crate::config::write(&file, &serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?)
}

/// The window's title: the project first, so that a taskbar that cuts it short still tells the
/// windows apart; then what waits, then the app.
pub fn title(project: &str, status: &str) -> String {
    if status.is_empty() { format!("{project} – CodeDeck") } else { format!("{project} {status} – CodeDeck") }
}

/// The desktop notification each key (a session, "git", "several") has on screen. Telling again
/// replaces it: the notification area of the desktop, and the badge on the taskbar icon that counts
/// it, hold one per key and not one per event.
static SHOWN: LazyLock<Mutex<HashMap<String, u32>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

/// Tells the user, in the ways they chose. `summary` and `body` are already in the language of
/// the interface. Nothing is shown when neither way is on.
pub fn notify(app: &AppHandle, window: &WebviewWindow, key: &str, summary: &str, body: &str) {
    let settings = load();
    if settings.quiet_until.is_some_and(|until| until > now_ms()) {
        return;
    }
    if settings.taskbar {
        // Ends by itself as soon as the window gets the focus
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    }
    if settings.desktop {
        let (app, label) = (app.clone(), window.label().to_string());
        // Per window: two projects may both have a session with the same key
        let (key, summary, body) = (format!("{label}:{key}"), summary.to_string(), body.to_string());
        // Waiting for the click blocks: a thread of its own per notification
        std::thread::spawn(move || {
            desktop(&key, &summary, &body, &[], |_| {
                // The way a shortcut does it: Cinnamon refuses the focus to a window that asks for
                // itself, and with one process for all windows another one may stay in front
                if let Some(window) = app.get_webview_window(&label) {
                    crate::window::obey(&window, crate::window::Request::Front);
                }
            })
        });
    }
}

/// A session that waits for the user, as its project's bridge sees it.
#[derive(Clone, Debug, PartialEq)]
pub struct Wait {
    /// A new key is a new reason to tell: the question of a session, or one finished turn
    pub key: String,
    pub session: String,
    /// It asks (a question, a permission); else its turn is over
    pub asks: bool,
    pub title: String,
    pub short: String,
    /// What it asks, or the prompt of the turn that is over
    pub text: Option<String>,
}

/// What waited in each project when last looked at. A project seen for the first time only sets
/// this: what waits already when CodeDeck starts (or a project is added) is not news.
static KNOWN: LazyLock<Mutex<HashMap<PathBuf, HashSet<String>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// What came in and is not told yet, with its project; things that happen together are told together.
static GATHERED: LazyLock<Mutex<Vec<(PathBuf, Wait)>>> = LazyLock::new(|| Mutex::new(Vec::new()));
const GATHER: Duration = Duration::from_millis(1500);

/// The sessions of a project that wait now; what is new among them is told after a moment.
pub fn observe(app: &AppHandle, root: &Path, waits: Vec<Wait>) {
    let keys: HashSet<String> = waits.iter().map(|w| w.key.clone()).collect();
    let before = KNOWN.locked().insert(root.to_path_buf(), keys);
    let Some(before) = before else { return };
    let new = news(&before, waits, &load());
    if new.is_empty() {
        return;
    }
    let first = {
        let mut gathered = GATHERED.locked();
        let first = gathered.is_empty();
        gathered.extend(new.into_iter().map(|w| (root.to_path_buf(), w)));
        first
    };
    if first {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(GATHER);
            tell_sessions(&app);
        });
    }
}

/// What waits now and did not before, as far as the user wants to hear of it.
fn news(before: &HashSet<String>, waits: Vec<Wait>, settings: &Settings) -> Vec<Wait> {
    waits.into_iter().filter(|w| !before.contains(&w.key) && if w.asks { settings.asks } else { settings.done }).collect()
}

/// The window that shows a project, if one does.
fn window_of(app: &AppHandle, root: &Path) -> Option<WebviewWindow> {
    let win = app.state::<crate::windows::Windows>().all().into_iter().find(|w| w.current.get().root == root)?;
    app.get_webview_window(&win.label)
}

/// Tells what was gathered, apart from what the user sees already: a project shown in the window
/// that has the focus. Questions first: they block a session, a finished turn does not.
fn tell_sessions(app: &AppHandle) {
    let mut gathered: Vec<(PathBuf, Wait)> = std::mem::take(&mut *GATHERED.locked());
    // Still waiting: a question answered within the moment is no news any more
    gathered.retain(|(root, w)| KNOWN.locked().get(root).is_some_and(|keys| keys.contains(&w.key)));
    gathered.retain(|(root, _)| !window_of(app, root).is_some_and(|w| w.is_focused().unwrap_or(false)));
    gathered.sort_by_key(|(_, w)| !w.asks);
    let Some((root, first)) = gathered.first().cloned() else { return };
    let settings = load();
    if settings.quiet_until.is_some_and(|until| until > now_ms()) {
        return;
    }
    let shown = window_of(app, &root);
    if settings.taskbar {
        // The window of the project, else the one used last: one of CodeDeck's windows lights up
        let window = shown.clone().or_else(|| crate::window::last_label(app).and_then(|l| app.get_webview_window(&l)));
        if let Some(window) = window {
            let _ = window.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
    if !settings.desktop {
        return;
    }
    let de = crate::tray::german();
    let name = |root: &Path| root.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned());
    let what = |w: &Wait| match (w.asks, de) {
        (true, true) => "fragt",
        (true, false) => "asks",
        (false, true) => "hat ihre Runde beendet",
        (false, false) => "finished its turn",
    };
    let (key, summary, body, into) = if gathered.len() == 1 {
        let text = first.text.clone().unwrap_or_else(|| {
            match (first.asks, de) {
                (true, true) => "Wartet auf deine Antwort",
                (true, false) => "Waits for your answer",
                (false, true) => "Wartet auf deinen nächsten Prompt",
                (false, false) => "Waits for your next prompt",
            }
            .to_string()
        });
        (first.session.clone(), format!("{} {}", first.title, what(&first)), format!("{text} · {}", name(&root)), Some(first.session.clone()))
    } else {
        let lines: Vec<String> = gathered.iter().map(|(r, w)| format!("{}: {} {} · {}", w.short, w.title, what(w), name(r))).collect();
        let summary = if de { format!("{} KI-Sessions warten auf dich", gathered.len()) } else { format!("{} AI sessions need you", gathered.len()) };
        // Several: the one that asks first, or the first of them, is the one a click goes into
        ("sessions".to_string(), summary, lines.join("\n"), first.asks.then(|| first.session.clone()))
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let key = format!("{}:{key}", root.display());
        let show = if de { "In CodeDeck zeigen" } else { "Show in CodeDeck" };
        let open = if de { "Öffnen" } else { "Open" };
        let mut actions = vec![("show", show)];
        if into.is_some() {
            actions.insert(0, ("open", open));
        }
        desktop(&key, &summary, &body, &actions, |action| {
            let session = into.as_deref().filter(|_| action == "open");
            // Into the session: where the user answers or writes the next prompt. If that fails
            // (it has not said where it runs yet), its project in CodeDeck instead
            if session.is_none_or(|s| crate::enter_session(&app, &root, s, "auto").is_err()) {
                let _ = crate::windows::show_project(&app, &root);
            }
        });
    });
}

/// A desktop notification, `key` names it so that telling again replaces it in place. The first
/// of `actions` is what a click on the notification itself does (servers that show it as a button
/// label it so); the others are buttons. `act` gets the id of the action clicked, "" for a click
/// on a notification without actions.
fn desktop(key: &str, summary: &str, body: &str, actions: &[(&str, &str)], act: impl FnOnce(&str)) {
    let mut note = notify_rust::Notification::new();
    note.appname("CodeDeck").summary(summary).body(body).action("default", actions.first().map_or("Show", |a| a.1));
    for (id, label) in actions.iter().skip(1) {
        note.action(id, label);
    }
    if let Some(icon) = icon_file() {
        note.icon(&icon);
    }
    // An earlier one of this key is replaced in place; if it is gone the server makes a new one
    if let Some(id) = SHOWN.locked().get(key) {
        note.id(*id);
    }
    let Ok(handle) = note.show() else { return };
    SHOWN.locked().insert(key.to_string(), handle.id());
    handle.wait_for_action(|action| {
        // Closed without a click: "__closed"
        if action == "default" {
            act(actions.first().map_or("", |a| a.0));
        } else if !action.starts_with("__") {
            act(action);
        }
    });
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// The app's icon as a file next to the sockets: a notification names its icon by path, and
/// a CodeDeck started from source has none installed.
fn icon_file() -> Option<String> {
    let file = crate::hook::ensure_socket_dir().ok()?.join("codedeck.png");
    if !file.exists() {
        std::fs::write(&file, include_bytes!("../icons/128x128.png")).ok()?;
    }
    Some(file.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_default_to_asks_and_done_shown_both_ways() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s, Settings::default());
        assert!(s.asks && s.done && !s.git_failed && s.taskbar && s.desktop);
        // A file from a later version with fewer or more fields still reads
        let s: Settings = serde_json::from_str(r#"{"desktop":false,"newThing":1}"#).unwrap();
        assert!(!s.desktop && s.asks && s.quiet_until.is_none());
        assert_eq!(title("orbit-api", "● 2 asking"), "orbit-api ● 2 asking – CodeDeck");
        assert_eq!(title("orbit-api", ""), "orbit-api – CodeDeck");
    }

    fn wait(key: &str, asks: bool) -> Wait {
        Wait { key: key.into(), session: "s".into(), asks, title: "t".into(), short: "A".into(), text: None }
    }

    #[test]
    fn only_what_is_new_and_wanted_is_told() {
        let before: HashSet<String> = ["a:asks".to_string()].into();
        let now = vec![wait("a:asks", true), wait("b:asks", true), wait("c:done:5", false)];
        let keys = |w: Vec<Wait>| w.into_iter().map(|w| w.key).collect::<Vec<_>>();
        // The question that was there already is no news
        assert_eq!(keys(news(&before, now.clone(), &Settings::default())), ["b:asks", "c:done:5"]);
        // Finished turns not wanted: only the new question
        let quiet = Settings { done: false, ..Settings::default() };
        assert_eq!(keys(news(&before, now, &quiet)), ["b:asks"]);
    }
}
