//! The two forms of the window (docs/SEITENLEISTE.md): the full window and the sidebar, which is
//! the right column alone. The full window's place and size are kept while the sidebar is shown,
//! so that it comes back as it was.

use std::sync::Mutex;

use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

/// Smallest sidebar: the header bar and the four numbers of the next prompt still fit. It is the
/// window's smallest size in both forms (`tauri.conf.json`): switching the smallest size together
/// with the size raced with the desktop, which still held the old one and kept the sidebar at the
/// full window's 1040 pixels.
const SIDEBAR_MIN: (f64, f64) = (280.0, 400.0);
/// Below this height the full window comes back at least this high.
const FULL_MIN_HEIGHT: f64 = 600.0;
/// Width of the full window when none was kept (CodeDeck started as a sidebar).
const FULL_WIDTH: f64 = 1440.0;

/// In physical pixels, as the desktop counts: with several monitors of different scale a logical
/// position is ambiguous.
#[derive(Clone, Copy, Debug)]
struct Place {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

/// Where the full window was before it became a sidebar, and what the last switch did (for the
/// diagnostics).
#[derive(Default)]
pub struct FullPlace {
    kept: Mutex<Option<Place>>,
    last: Mutex<String>,
}

impl FullPlace {
    pub fn last(&self) -> String {
        self.last.lock().unwrap().clone()
    }
}

/// Ends maximized or fullscreen; waits only for the state, not for the restored geometry, so that
/// the window is moved on while it shows at its old place as briefly as possible.
fn leave_full_screen(window: &WebviewWindow, fullscreen: bool, maximized: bool) -> tauri::Result<()> {
    if fullscreen {
        window.set_fullscreen(false)?;
    }
    if maximized {
        window.unmaximize()?;
    }
    for _ in 0..30 {
        if !window.is_maximized()? && !window.is_fullscreen()? {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    Ok(())
}

/// Waits (briefly) until the desktop took a change: `done` says when.
fn settle(mut done: impl FnMut() -> tauri::Result<bool>) -> tauri::Result<()> {
    for _ in 0..30 {
        if done()? {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    Ok(())
}

/// Puts the window at `x`, `y` with the inside `w` × `h`: first it shrinks where it gets smaller,
/// then it moves, then it grows. So it never reaches over the monitor's edge on the way, which
/// makes the desktop push it onto the next monitor, where it flickers. (Measured with three
/// monitors under Cinnamon: place and size set together, or one after the other in either order,
/// landed on the next monitor first; these three steps stay on the monitor, about a frame each.)
/// Then checks, and sets again what the desktop still moved. Says where it ended up.
fn place(window: &WebviewWindow, x: i32, y: i32, w: u32, h: u32) -> tauri::Result<String> {
    let now = window.inner_size()?;
    let resize = |w: u32, h: u32| -> tauri::Result<()> {
        window.set_size(PhysicalSize::new(w, h))?;
        settle(|| {
            let s = window.inner_size()?;
            Ok(s.width.abs_diff(w) <= 2 && s.height.abs_diff(h) <= 2)
        })
    };
    let (small_w, small_h) = (w.min(now.width), h.min(now.height));
    if (small_w, small_h) != (now.width, now.height) {
        resize(small_w, small_h)?;
    }
    window.set_position(PhysicalPosition::new(x, y))?;
    settle(|| {
        let at = window.outer_position()?;
        Ok((at.x - x).abs() <= 2 && (at.y - y).abs() <= 2)
    })?;
    if (small_w, small_h) != (w, h) {
        resize(w, h)?;
    }
    let mut tries = Vec::new();
    for _ in 0..4 {
        let (at, inside) = (window.outer_position()?, window.inner_size()?);
        tries.push(format!("{},{} {}x{}", at.x, at.y, inside.width, inside.height));
        if (at.x - x).abs() <= 2 && (at.y - y).abs() <= 2 && inside.width.abs_diff(w) <= 2 {
            break;
        }
        window.set_size(PhysicalSize::new(w, h))?;
        window.set_position(PhysicalPosition::new(x, y))?;
        std::thread::sleep(std::time::Duration::from_millis(60));
    }
    Ok(tries.join(" "))
}

/// Makes the window a sidebar `width` (logical pixels) wide, always at the right edge of the
/// monitor it is on and as high as the panels leave free; or the full window again, where it was. Gives the
/// logical width it had before, so that the frontend can keep the sidebar's width for next time.
/// Runs off the main thread: it waits for the desktop.
pub fn set_compact(window: &WebviewWindow, kept: &FullPlace, on: bool, width: f64) -> tauri::Result<f64> {
    let scale = window.scale_factor()?;
    let size = window.inner_size()?;
    let at = window.outer_position()?;
    let before = size.width as f64 / scale;
    // The monitor the window is on, without panels: the sidebar stays on it
    let monitor = window.current_monitor()?;
    let area = monitor.as_ref().map(|m| *m.work_area());
    let screen = monitor.as_ref().map(|m| (m.position().x, m.size().width as i32));
    let fit = |x: i32, w: u32| match screen {
        Some((left, span)) => x.clamp(left, (left + span - w as i32).max(left)),
        None => x,
    };
    let note;
    if on {
        let (maximized, fullscreen) = (window.is_maximized()?, window.is_fullscreen()?);
        let full = Place { x: at.x, y: at.y, width: size.width, height: size.height, maximized: maximized || fullscreen };
        *kept.kept.lock().unwrap() = Some(full);
        let w = ((width.max(SIDEBAR_MIN.0)) * scale).round() as u32;
        // Always at the right edge of the monitor, from top to bottom of what panels leave free.
        // The size set is the inside, the position the outside: the desktop's frame counts
        let target = |frame_w: u32, frame_h: u32| match area {
            Some(a) => (a.position.x + a.size.width as i32 - (w + frame_w) as i32, a.position.y, a.size.height.saturating_sub(frame_h)),
            None => (fit(full.x + full.width as i32 - w as i32, w), full.y, full.height),
        };
        if maximized || fullscreen {
            // Restored, the desktop puts the window where it was before maximizing; it is moved
            // on at once, without waiting, so that it shows there as briefly as possible.
            // (Measured: size and place given beforehand are not taken as the place to restore
            // to, and hiding it meanwhile showed it blank, then at the old place.)
            leave_full_screen(window, fullscreen, maximized)?;
        }
        // Measured now: a maximized window has no frame, the restored one has
        let (inner, outer) = (window.inner_size()?, window.outer_size()?);
        let (frame_w, frame_h) = (outer.width.saturating_sub(inner.width), outer.height.saturating_sub(inner.height));
        let (x, y, h) = target(frame_w, frame_h);
        let landed = place(window, x, y, w, h)?;
        note = format!(
            "sidebar: full {full:?} (fullscreen {fullscreen}), scale {scale}, monitor {screen:?}, work area {area:?}, frame {frame_w}x{frame_h} -> x {x}, y {y}, {w}x{h}; landed at {landed}"
        );
    } else {
        let place = kept.kept.lock().unwrap().take();
        let full_w = (FULL_WIDTH * scale).round() as u32;
        let place = place.unwrap_or(Place {
            // Grows to the left, so that the sidebar's place becomes the right column
            x: fit(at.x + size.width as i32 - full_w as i32, full_w),
            y: at.y,
            width: full_w,
            height: size.height.max((FULL_MIN_HEIGHT * scale) as u32),
            maximized: false,
        });
        let landed = self::place(window, place.x, place.y, place.width, place.height)?;
        if place.maximized {
            window.maximize()?;
        }
        note = format!("full: back to {place:?}, scale {scale}, work area {area:?}; landed at {landed}");
    }
    eprintln!("codeck: {note}");
    *kept.last.lock().unwrap() = note;
    Ok(before)
}

// ── Global shortcuts ───────────────────────────────────────────────────────────
//
// Each CodeDeck window is a process of its own, and under X11 only one program can hold a key
// combination. So the first window holds both shortcuts and acts for all of them: it tells the
// others over their sockets what to do. The others try again now and then, so that one of them
// takes over when the holder is closed.
//
// Which window was used last, every window writes on getting the focus into a small file next to
// the sockets; whether the shortcut hid CodeDeck is another one. The holder reads them.

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

/// Notes focus changes of this window: the one used last is the one a shortcut brings back. A
/// window that gets the focus is in sight, whoever showed it: the next press hides again.
pub fn focus_changed(focused: bool) {
    if focused {
        let _ = std::fs::write(last_file(), std::process::id().to_string());
        shown();
    }
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
            // Asked by the window itself, Cinnamon refuses the focus and only marks it in the
            // taskbar; asked as a pager (what a taskbar does on a click), it grants it
            std::thread::spawn(|| {
                std::thread::sleep(Duration::from_millis(50));
                activate_as_pager();
            });
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

/// Set while the shortcut has hidden CodeDeck: the next press brings it back.
fn hidden_file() -> PathBuf {
    crate::hook::socket_dir().join("hidden")
}

/// A window that starts is shown: CodeDeck is no longer hidden.
pub fn shown() {
    let _ = std::fs::remove_file(hidden_file());
}

/// Asks the window manager to activate this process's window the way a pager or taskbar does
/// (`_NET_ACTIVE_WINDOW` with source 2). X11 only; elsewhere nothing happens.
fn activate_as_pager() -> Option<()> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask};
    let (conn, screen) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen)?.root;
    let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).ok()?.reply().ok().map(|r| r.atom);
    let (clients, pid_atom, active) = (atom("_NET_CLIENT_LIST")?, atom("_NET_WM_PID")?, atom("_NET_ACTIVE_WINDOW")?);
    let list = conn.get_property(false, root, clients, AtomEnum::WINDOW, 0, 4096).ok()?.reply().ok()?;
    let me = std::process::id();
    let ours = list.value32()?.find(|&w| {
        conn.get_property(false, w, pid_atom, AtomEnum::CARDINAL, 0, 1)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().and_then(|mut v| v.next()))
            == Some(me)
    })?;
    let event = ClientMessageEvent::new(32, ours, active, [2, x11rb::CURRENT_TIME, 0, 0, 0]);
    conn.send_event(false, root, EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY, event).ok()?;
    conn.flush().ok()
}

/// A shortcut was pressed in the window that holds it.
fn pressed(app: &AppHandle, shortcut: &Shortcut) {
    let all: Vec<u32> = other_windows().into_iter().chain([std::process::id()]).collect();
    if shortcut.id() == parse(SIDEBAR).id() {
        return ask(app, last_used(), Request::ToggleCompact);
    }
    // Shown, a press hides it, hidden, a press brings it back. Not "in front": with several
    // monitors CodeDeck is often in sight without the focus, and bringing it "to the front" then
    // changed nothing one could see (user, 2026-11-16)
    if hidden_file().exists() {
        shown();
        let last = last_used();
        all.iter().filter(|&&pid| pid != last).for_each(|&pid| ask(app, pid, Request::Show));
        ask(app, last, Request::Front);
    } else {
        let _ = std::fs::write(hidden_file(), "");
        all.iter().for_each(|&pid| ask(app, pid, Request::Hide));
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
