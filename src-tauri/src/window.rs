//! The two forms of the window (docs/SEITENLEISTE.md): the full window and the sidebar, which is
//! the right column alone. The full window's place and size are kept while the sidebar is shown,
//! so that it comes back as it was.

use std::sync::Mutex;

use tauri::{LogicalPosition, LogicalSize, WebviewWindow};

/// Smallest full window, as in `tauri.conf.json`.
const FULL_MIN: (f64, f64) = (1040.0, 600.0);
/// Smallest sidebar: the header bar and the four numbers of the next prompt still fit.
const SIDEBAR_MIN: (f64, f64) = (280.0, 400.0);
/// Width of the full window when none was kept (CodeDeck started as a sidebar).
const FULL_WIDTH: f64 = 1440.0;

struct Place {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    maximized: bool,
}

/// Where the full window was before it became a sidebar.
#[derive(Default)]
pub struct FullPlace(Mutex<Option<Place>>);

/// Makes the window a sidebar `width` wide, or the full window again. Gives the width it had
/// before, so that the frontend can keep the sidebar's width for next time.
pub fn set_compact(window: &WebviewWindow, kept: &FullPlace, on: bool, width: f64) -> tauri::Result<f64> {
    let scale = window.scale_factor()?;
    let size = window.inner_size()?.to_logical::<f64>(scale);
    let at = window.outer_position()?.to_logical::<f64>(scale);
    if on {
        let maximized = window.is_maximized()?;
        *kept.0.lock().unwrap() = Some(Place { x: at.x, y: at.y, width: size.width, height: size.height, maximized });
        if maximized {
            window.unmaximize()?;
        }
        window.set_min_size(Some(LogicalSize::new(SIDEBAR_MIN.0, SIDEBAR_MIN.1)))?;
        let width = width.clamp(SIDEBAR_MIN.0, size.width.max(SIDEBAR_MIN.0));
        window.set_size(LogicalSize::new(width, size.height))?;
        // The right column stays where it was: the window shrinks towards its right edge
        window.set_position(LogicalPosition::new(at.x + size.width - width, at.y))?;
    } else {
        let place = kept.0.lock().unwrap().take();
        let place = place.unwrap_or(Place {
            // Grows to the left, so that the sidebar's place becomes the right column
            x: (at.x + size.width - FULL_WIDTH).max(0.0),
            y: at.y,
            width: FULL_WIDTH,
            height: size.height.max(FULL_MIN.1),
            maximized: false,
        });
        window.set_size(LogicalSize::new(place.width, place.height))?;
        window.set_position(LogicalPosition::new(place.x, place.y))?;
        window.set_min_size(Some(LogicalSize::new(FULL_MIN.0, FULL_MIN.1)))?;
        if place.maximized {
            window.maximize()?;
        }
    }
    Ok(size.width)
}

// ── Global shortcuts ───────────────────────────────────────────────────────────
//
// Each CodeDeck window is a process of its own, and under X11 only one program can hold a key
// combination. So the first window holds both shortcuts and acts for all of them: it tells the
// others over their sockets what to do. The others try again now and then, so that one of them
// takes over when the holder is closed.
//
// Which window is in front and which was used last, every window writes on focus changes into
// two small files next to the sockets; the holder reads them when a shortcut is pressed.

use std::io::Write as _;
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

/// Shows CodeDeck, brings it to the front, or hides it when it is in front already.
const SHOW_HIDE: &str = "Ctrl+Alt+C";
/// Switches the window used last between sidebar and full window.
const SIDEBAR: &str = "Ctrl+Alt+L";
/// How often a window that holds no shortcut tries to take them over.
const RETRY: Duration = Duration::from_secs(15);
/// A window that lost the focus this short a time ago still counts as in front: pressing the
/// shortcut itself may take the focus away for a moment.
const FRONT_GRACE_MS: u64 = 700;

/// What one window asks another over its socket.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Request {
    Show,
    Hide,
    /// Show and take the focus
    Front,
    /// To the front, then switch between sidebar and full window
    ToggleCompact,
    /// A setting of this machine changed in another window: read them again
    SettingsChanged,
}

/// A message on a window's socket that is not an event of a coding tool.
#[derive(Serialize, Deserialize)]
pub struct Message {
    pub window: Request,
}

/// Where the global shortcuts stand, for the settings.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutStatus {
    pub keys: Vec<ShortcutInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutInfo {
    pub keys: &'static str,
    /// "showHide" or "sidebar"
    pub action: &'static str,
    /// "here": this window holds it · "otherWindow": another CodeDeck window does · "taken":
    /// another program holds it · "unsupported": the desktop has no global shortcuts (Wayland)
    pub state: &'static str,
}

#[derive(Default)]
pub struct Shortcuts(Mutex<ShortcutStatus>);

impl Shortcuts {
    pub fn get(&self) -> ShortcutStatus {
        self.0.lock().unwrap().clone()
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn front_file() -> PathBuf {
    crate::hook::socket_dir().join("front")
}

fn last_file() -> PathBuf {
    crate::hook::socket_dir().join("last-used")
}

fn alive(pid: u32) -> bool {
    std::path::Path::new(&format!("/proc/{pid}")).exists()
}

/// The other CodeDeck windows, by the process ids their sockets are named after.
fn other_windows() -> Vec<u32> {
    let me = std::process::id();
    std::fs::read_dir(crate::hook::socket_dir())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            (path.extension()? == "sock").then_some(())?;
            path.file_stem()?.to_str()?.parse::<u32>().ok()
        })
        .filter(|&pid| pid != me && alive(pid))
        .collect()
}

/// Notes focus changes of this window: who is in front, who was used last.
pub fn focus_changed(focused: bool) {
    let me = std::process::id();
    if focused {
        let _ = std::fs::write(front_file(), format!("{me} 0"));
        let _ = std::fs::write(last_file(), me.to_string());
    } else if read_front().is_some_and(|(pid, _)| pid == me) {
        let _ = std::fs::write(front_file(), format!("{me} {}", now_ms()));
    }
}

/// The window in front and since when it has no focus any more (0: it has).
fn read_front() -> Option<(u32, u64)> {
    let text = std::fs::read_to_string(front_file()).ok()?;
    let mut parts = text.split_whitespace();
    Some((parts.next()?.parse().ok()?, parts.next()?.parse().ok()?))
}

/// The CodeDeck window in front right now, if any.
fn in_front() -> Option<u32> {
    let (pid, left) = read_front()?;
    (alive(pid) && (left == 0 || now_ms().saturating_sub(left) < FRONT_GRACE_MS)).then_some(pid)
}

/// The window used last; this one when no other is known.
fn last_used() -> u32 {
    std::fs::read_to_string(last_file())
        .ok()
        .and_then(|t| t.trim().parse().ok())
        .filter(|&pid| alive(pid))
        .unwrap_or_else(std::process::id)
}

/// Asks the window of process `pid` for something; this window does it at once.
fn ask(app: &AppHandle, pid: u32, request: Request) {
    if pid == std::process::id() {
        return obey(app, request);
    }
    let socket = crate::hook::socket_dir().join(format!("{pid}.sock"));
    std::thread::spawn(move || {
        let Ok(mut stream) = UnixStream::connect(&socket) else { return };
        let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
        let message = serde_json::to_string(&Message { window: request }).unwrap_or_default();
        let _ = stream.write_all(message.as_bytes());
        let _ = stream.shutdown(std::net::Shutdown::Write);
    });
}

/// Does what another window (or this one's shortcut) asks.
pub fn obey(app: &AppHandle, request: Request) {
    let Some(window) = app.get_webview_window("main") else { return };
    match request {
        Request::SettingsChanged => {
            let _ = app.emit("settings_changed", ());
        }
        Request::Hide => {
            let _ = window.hide();
        }
        Request::Show => {
            let _ = window.show();
            let _ = window.unminimize();
        }
        Request::Front | Request::ToggleCompact => {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            if request == Request::ToggleCompact {
                let _ = app.emit("window_request", "toggleCompact");
            }
        }
    }
}

/// Tells every other CodeDeck window that a setting of this machine changed.
pub fn settings_changed(app: &AppHandle) {
    other_windows().into_iter().for_each(|pid| ask(app, pid, Request::SettingsChanged));
}

/// A shortcut was pressed in the window that holds it.
fn pressed(app: &AppHandle, shortcut: &Shortcut) {
    let all: Vec<u32> = other_windows().into_iter().chain([std::process::id()]).collect();
    if shortcut.id() == parse(SIDEBAR).id() {
        return ask(app, last_used(), Request::ToggleCompact);
    }
    // One press always brings CodeDeck here, a second one sends it away
    if in_front().is_some() {
        all.iter().for_each(|&pid| ask(app, pid, Request::Hide));
    } else {
        let last = last_used();
        all.iter().filter(|&&pid| pid != last).for_each(|&pid| ask(app, pid, Request::Show));
        ask(app, last, Request::Front);
    }
}

fn parse(keys: &str) -> Shortcut {
    keys.parse().expect("a valid shortcut")
}

/// The plugin, with the handler for both shortcuts.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                pressed(app, shortcut);
            }
        })
        .build()
}

/// Tries to hold both shortcuts, now and again later while another window holds them.
/// Runs in its own thread: registering waits for the main thread.
pub fn claim_shortcuts(app: AppHandle) {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland");
    std::thread::spawn(move || loop {
        let mut keys = Vec::new();
        for (keys_text, action) in [(SHOW_HIDE, "showHide"), (SIDEBAR, "sidebar")] {
            let shortcut = parse(keys_text);
            let manager = app.global_shortcut();
            let state = if wayland {
                "unsupported"
            } else if manager.is_registered(shortcut) || manager.register(shortcut).is_ok() {
                "here"
            } else if other_windows().is_empty() {
                "taken"
            } else {
                "otherWindow"
            };
            keys.push(ShortcutInfo { keys: keys_text, action, state });
        }
        let settled = keys.iter().all(|k| k.state == "here" || k.state == "unsupported");
        let changed = {
            let kept = app.state::<Shortcuts>();
            let mut kept = kept.0.lock().unwrap();
            let changed = kept.keys.iter().map(|k| k.state).ne(keys.iter().map(|k| k.state));
            kept.keys = keys;
            changed
        };
        if changed {
            let _ = app.emit("shortcuts_changed", ());
        }
        if settled {
            return;
        }
        std::thread::sleep(RETRY);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_message_is_told_apart_from_a_tool_event() {
        let m: Message = serde_json::from_str(r#"{"window":"toggleCompact"}"#).unwrap();
        assert_eq!(m.window, Request::ToggleCompact);
        assert!(serde_json::from_str::<Message>(r#"{"who":"x","did":"started","in":"/q"}"#).is_err());
    }
}
