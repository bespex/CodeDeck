//! Window placement and the global shortcuts. `set_compact` puts a window as a narrow column at the
//! right edge of its monitor: the overview of all projects (docs/UEBERSICHT.md) opens there. It was
//! the sidebar form of each project window (docs/SEITENLEISTE.md), replaced by the overview.

use crate::Locked;
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

/// The monitor CodeDeck starts on (user, 2026-11-18): the main screen unless the setting
/// `startMonitor` says `"last"`, where the window manager's choice stands.
pub fn start_monitor(app: &AppHandle) -> Option<tauri::Monitor> {
    let keep = crate::config::machine_settings().get("startMonitor").and_then(|v| v.as_str().map(String::from)).as_deref() == Some("last");
    if keep {
        None
    } else {
        app.primary_monitor().ok().flatten()
    }
}

/// Margin of a new project window to the screen's edges, in logical pixels.
const MARGIN: f64 = 25.0;

/// Puts a new project window into the space beside the start page: `MARGIN` from the work area's
/// right, top and bottom and from the start page on the left (or from the edge when it is not shown
/// on that monitor).
pub fn place_beside_overview(app: &AppHandle, window: &WebviewWindow) {
    let run = || -> tauri::Result<()> {
        let overview = app.get_webview_window(crate::windows::OVERVIEW).filter(|o| o.is_visible().unwrap_or(false));
        // The monitor of the overview, else the window's own
        let monitor = match overview.as_ref().map(|o| o.current_monitor()).transpose()?.flatten() {
            Some(m) => Some(m),
            None => match start_monitor(app) {
                Some(m) => Some(m),
                None => window.current_monitor()?,
            },
        };
        let Some(monitor) = monitor else { return Ok(()) };
        let area = *monitor.work_area();
        let scale = monitor.scale_factor();
        let margin = (MARGIN * scale).round() as i32;
        let top = area.position.y + margin;
        let right = area.position.x + area.size.width as i32 - margin;
        // The start page stands at the left edge: its width, frame included, is taken off. Its
        // position is not used, it may still be on its way there
        let left = match &overview {
            // and the same margin to it as to the screen's edges (user, 2026-11-17)
            Some(o) => area.position.x + o.outer_size()?.width as i32 + margin,
            None => area.position.x + margin,
        };
        let bottom = area.position.y + area.size.height as i32 - margin;
        // The size set is the inside, the position the outside: the frame counts
        let (inner, outer) = (window.inner_size()?, window.outer_size()?);
        let (frame_w, frame_h) = (outer.width.saturating_sub(inner.width), outer.height.saturating_sub(inner.height));
        let width = (right - left).max(400) as u32;
        let height = (bottom - top).max(300) as u32;
        place(window, left, top, width.saturating_sub(frame_w), height.saturating_sub(frame_h))?;
        Ok(())
    };
    if let Err(e) = run() {
        eprintln!("codedeck: placing the window: {e}");
    }
}

/// Makes the window a sidebar `width` (logical pixels) wide, always at the left edge of the
/// monitor it is on and as high as the panels leave free; or the full window again, where it was. Gives the
/// logical width it had before, so that the frontend can keep the sidebar's width for next time.
/// Runs off the main thread: it waits for the desktop.
pub fn set_compact(window: &WebviewWindow, kept: &FullPlace, on: bool, width: f64, monitor: Option<tauri::Monitor>) -> tauri::Result<f64> {
    let scale = window.scale_factor()?;
    let size = window.inner_size()?;
    let at = window.outer_position()?;
    let before = size.width as f64 / scale;
    // The monitor the window is on, without panels: the sidebar stays on it
    // (`monitor`: where the user wants it to start, see `start_monitor`; else the one it is on)
    let monitor = match monitor {
        Some(m) => Some(m),
        None => window.current_monitor()?,
    };
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
        *kept.kept.locked() = Some(full);
        let w = ((width.max(SIDEBAR_MIN.0)) * scale).round() as u32;
        // Always at the left edge of the monitor, from top to bottom of what panels leave free: the
        // start page is the project list, which stands at the left in a project window too (user,
        // 2026-11-19; it was at the right edge as the overview). The size set is the inside, the
        // position the outside: the desktop's frame counts
        let target = |_frame_w: u32, frame_h: u32| match area {
            Some(a) => (a.position.x, a.position.y, a.size.height.saturating_sub(frame_h)),
            None => (fit(full.x, w), full.y, full.height),
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
        let place = kept.kept.locked().take();
        let full_w = (FULL_WIDTH * scale).round() as u32;
        let place = place.unwrap_or(Place {
            // Grows to the right, so that the sidebar's place becomes the left column
            x: fit(at.x, full_w),
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
    eprintln!("codedeck: {note}");
    *kept.last.locked() = note;
    Ok(before)
}

// ── Global shortcuts ───────────────────────────────────────────────────────────
//
// The process holds both shortcuts for all its windows (D25). Which window was used last it knows
// from their focus events; whether a press hid CodeDeck it keeps itself.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

/// Shows CodeDeck, brings it to the front, or hides it when it is in front already.
const SHOW_HIDE: &str = "Ctrl+Alt+C";
/// Brings CodeDeck to the front, or away when it is in front: the project window used last, without
/// one the start page.
const SIDEBAR: &str = "Ctrl+Alt+L";
/// How often the process tries again to hold a shortcut another program holds.
const RETRY: Duration = Duration::from_secs(15);

/// What a shortcut asks of one window.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Request {
    Show,
    Hide,
    /// Show and take the focus
    Front,
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
    /// "here": CodeDeck holds it · "taken": another program holds it · "unsupported": the desktop
    /// has no global shortcuts (Wayland)
    pub state: &'static str,
}

#[derive(Default)]
pub struct Shortcuts {
    status: Mutex<ShortcutStatus>,
    /// The window used last: the one a shortcut brings back
    last: Mutex<Option<String>>,
    /// Set while a press has hidden CodeDeck: the next one brings it back
    hidden: AtomicBool,
    /// When each window last lost the focus: a click on the tray icon takes it a moment before the
    /// click arrives, and the window counts as in front still (`in_front`)
    lost: Mutex<std::collections::HashMap<String, std::time::Instant>>,
}

impl Shortcuts {
    pub fn get(&self) -> ShortcutStatus {
        self.status.locked().clone()
    }
}

/// Notes focus changes: the window used last is the one a shortcut brings back. A window that gets
/// the focus is in sight, whoever showed it: the next press hides again.
pub fn focus_changed(app: &AppHandle, label: &str, focused: bool) {
    if !focused {
        app.state::<Shortcuts>().lost.locked().insert(label.to_string(), std::time::Instant::now());
    }
    if focused {
        let shortcuts = app.state::<Shortcuts>();
        *shortcuts.last.locked() = Some(label.to_string());
        shortcuts.hidden.store(false, Ordering::Relaxed);
    }
}

/// Whether a window is in front: it has the focus, or had it a moment ago (the tray icon, the panel
/// of the desktop, takes it just before its click arrives).
pub fn in_front(app: &AppHandle, window: &WebviewWindow) -> bool {
    if !window.is_visible().unwrap_or(false) {
        return false;
    }
    window.is_focused().unwrap_or(false)
        || app.state::<Shortcuts>().lost.locked().get(window.label()).is_some_and(|at| at.elapsed() < Duration::from_millis(700))
}

/// A window that opens is shown: CodeDeck is no longer hidden.
pub fn shown(app: &AppHandle) {
    app.state::<Shortcuts>().hidden.store(false, Ordering::Relaxed);
}

/// The label of the project window used last, if it is still there.
pub fn last_label(app: &AppHandle) -> Option<String> {
    app.state::<Shortcuts>().last.locked().clone().filter(|l| l != crate::windows::OVERVIEW && app.get_webview_window(l).is_some())
}

/// The window used last; any window when that one is gone.
fn last_used(app: &AppHandle) -> Option<WebviewWindow> {
    let last = app.state::<Shortcuts>().last.locked().clone();
    last.and_then(|l| app.get_webview_window(&l)).or_else(|| app.webview_windows().into_values().next())
}

/// Where each window was when it was hidden. Shown again, X11 window managers sometimes place a
/// window somewhere else (seen: about 50 pixels to the right, the frame's width); it goes back here.
static HIDDEN_AT: std::sync::LazyLock<Mutex<std::collections::HashMap<String, PhysicalPosition<i32>>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

fn hide(window: &WebviewWindow) {
    if let Ok(at) = window.outer_position() {
        HIDDEN_AT.locked().insert(window.label().to_string(), at);
    }
    let _ = window.hide();
}

/// Shows a window, at the place it had when it was hidden.
fn show(window: &WebviewWindow) {
    let was_hidden = !window.is_visible().unwrap_or(true);
    let _ = window.show();
    let _ = window.unminimize();
    let at = HIDDEN_AT.locked().remove(window.label());
    if let (true, Some(at)) = (was_hidden, at) {
        let _ = window.set_position(at);
        // The window manager may place it once more right after mapping it: set it again then
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(80));
            if window.outer_position().is_ok_and(|now| now != at) {
                let _ = window.set_position(at);
            }
        });
    }
}

/// Does what a shortcut asks of one window.
pub fn obey(window: &WebviewWindow, request: Request) {
    match request {
        Request::Hide => hide(window),
        Request::Show => show(window),
        Request::Front => {
            show(window);
            let _ = window.set_focus();
            // Asked by the window itself, Cinnamon refuses the focus and only marks it in the
            // taskbar; asked as a pager (what a taskbar does on a click), it grants it
            let title = window.title().unwrap_or_default();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                activate_as_pager(&title);
            });
        }
    }
}

/// Tells every window that a setting of this machine changed.
pub fn settings_changed(app: &AppHandle) {
    let _ = app.emit("settings_changed", ());
    // The language may have changed: the overview's title and the tray speak it too
    if let Some(overview) = app.get_webview_window(crate::windows::OVERVIEW) {
        let _ = overview.set_title(&crate::tray::overview_title());
    }
    crate::tray::refresh(app);
}

/// Asks the window manager to activate the window of this process with this title the way a pager
/// or taskbar does (`_NET_ACTIVE_WINDOW` with source 2). X11 only; elsewhere nothing happens.
fn activate_as_pager(title: &str) -> Option<()> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask};
    let (conn, screen) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen)?.root;
    let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).ok()?.reply().ok().map(|r| r.atom);
    let (clients, pid_atom, active) = (atom("_NET_CLIENT_LIST")?, atom("_NET_WM_PID")?, atom("_NET_ACTIVE_WINDOW")?);
    let (name_atom, utf8) = (atom("_NET_WM_NAME")?, atom("UTF8_STRING")?);
    let list = conn.get_property(false, root, clients, AtomEnum::WINDOW, 0, 4096).ok()?.reply().ok()?;
    let me = std::process::id();
    let mine: Vec<u32> = list
        .value32()?
        .filter(|&w| {
            conn.get_property(false, w, pid_atom, AtomEnum::CARDINAL, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
                .and_then(|r| r.value32().and_then(|mut v| v.next()))
                == Some(me)
        })
        .collect();
    // Several windows of this process: the one with the title; one alone needs no title
    let ours = mine.iter().copied().find(|&w| {
        conn.get_property(false, w, name_atom, utf8, 0, 1024)
            .ok()
            .and_then(|c| c.reply().ok())
            .is_some_and(|r| r.value == title.as_bytes())
    });
    let ours = ours.or_else(|| (mine.len() == 1).then(|| mine[0]))?;
    let event = ClientMessageEvent::new(32, ours, active, [2, x11rb::CURRENT_TIME, 0, 0, 0]);
    conn.send_event(false, root, EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY, event).ok()?;
    conn.flush().ok()
}

/// A shortcut was pressed.
fn pressed(app: &AppHandle, shortcut: &Shortcut) {
    let Some(last) = last_used(app) else { return };
    // CodeDeck to the front from anywhere, or away when it is in front (docs/PLAN.md "Projektliste im
    // Fenster statt Übersicht", step d)
    if shortcut.id() == parse(SIDEBAR).id() {
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = crate::windows::front_or_away(&app) {
                eprintln!("codedeck: to the front: {e}");
            }
        });
        return;
    }
    // Shown, a press hides it, hidden, a press brings it back. Not "in front": with several
    // monitors CodeDeck is often in sight without the focus, and bringing it "to the front" then
    // changed nothing one could see (user, 2026-11-16)
    let shortcuts = app.state::<Shortcuts>();
    let all = app.webview_windows();
    if shortcuts.hidden.swap(false, Ordering::Relaxed) {
        all.values().filter(|w| w.label() != last.label()).for_each(|w| obey(w, Request::Show));
        obey(&last, Request::Front);
    } else {
        shortcuts.hidden.store(true, Ordering::Relaxed);
        all.values().for_each(|w| obey(w, Request::Hide));
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

/// Tries to hold both shortcuts, now and again later while another program holds them.
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
            } else {
                "taken"
            };
            keys.push(ShortcutInfo { keys: keys_text, action, state });
        }
        let settled = keys.iter().all(|k| k.state == "here" || k.state == "unsupported");
        let changed = {
            let kept = app.state::<Shortcuts>();
            let mut kept = kept.status.locked();
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
