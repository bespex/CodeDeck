//! Getting the user's attention when something happened that they want to know about: a session
//! asks, a turn is over, a git command failed. Which of these count and how they are shown is the
//! user's choice ([`Settings`], kept for the machine). The window decides when (it knows what is
//! new and whether it is looked at); this module shows it: the window's title, the taskbar, a
//! desktop notification whose click brings the window to the front.

use crate::Locked;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

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
        std::thread::spawn(move || desktop(&app, &label, &key, &summary, &body));
    }
}

fn desktop(app: &AppHandle, label: &str, key: &str, summary: &str, body: &str) {
    let mut note = notify_rust::Notification::new();
    note.appname("CodeDeck").summary(summary).body(body).action("default", "Show");
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
        // A click on the notification itself is the "default" action
        if action == "default" {
            // The way a shortcut does it: Cinnamon refuses the focus to a window that asks for
            // itself, and with one process for all windows another one may stay in front
            if let Some(window) = app.get_webview_window(label) {
                crate::window::obey(&window, crate::window::Request::Front);
            }
        }
    });
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// The app's icon as a file next to the sockets: a notification names its icon by path, and
/// a CodeDeck started from source has none installed.
fn icon_file() -> Option<String> {
    let file = crate::hook::ensure_socket_dir().ok()?.join("codeck.png");
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
        assert_eq!(title("● 2 waiting · ", "orbit-api"), "● 2 waiting · orbit-api – CodeDeck");
    }
}
