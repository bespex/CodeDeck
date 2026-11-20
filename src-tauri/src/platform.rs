//! What this computer offers CodeDeck, found once at the start (docs/SITZUNGEN-PRUEFUNG.md K1,
//! "Rechner"): tmux, a terminal program, X11 or Wayland, the desktop, global shortcuts, the tray.
//! The interface asks this instead of offering what fails on a click: without tmux no ▶, without
//! a terminal no terminal door, under Wayland no "window to the front".

use std::process::Command;
use std::sync::OnceLock;

use serde::Serialize;

use crate::terminal::Terminal;

pub struct Platform {
    /// `tmux -V`, e.g. "tmux 3.4"; `None` when tmux is not installed
    pub tmux: Option<String>,
    pub terminal: Option<Terminal>,
    pub wayland: bool,
    /// An X server CodeDeck can talk to (also XWayland): windows of other programs can be found
    pub x11: bool,
    /// `$XDG_CURRENT_DESKTOP`, e.g. "X-Cinnamon", "KDE", "ubuntu:GNOME"
    pub desktop: String,
    /// A tray host runs (StatusNotifierWatcher on the session bus); GNOME needs an extension
    pub tray: bool,
}

static FOUND: OnceLock<Platform> = OnceLock::new();

/// What this computer offers, found on the first call.
pub fn get() -> &'static Platform {
    FOUND.get_or_init(detect)
}

fn detect() -> Platform {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some();
    Platform {
        tmux: tmux_version(),
        terminal: crate::terminal::detect(),
        wayland,
        x11: !wayland && std::env::var_os("DISPLAY").is_some(),
        desktop: std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default(),
        tray: tray_host(),
    }
}

fn tmux_version() -> Option<String> {
    let out = Command::new("tmux").arg("-V").output().ok().filter(|o| o.status.success())?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Whether a tray host listens: without one the tray icon is not seen, but nothing fails either.
fn tray_host() -> bool {
    use gio::glib::prelude::*;
    let has_owner = || -> Option<bool> {
        let bus = gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE).ok()?;
        let reply = bus
            .call_sync(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                "org.freedesktop.DBus",
                "NameHasOwner",
                Some(&("org.kde.StatusNotifierWatcher",).to_variant()),
                None,
                gio::DBusCallFlags::NONE,
                1000,
                gio::Cancellable::NONE,
            )
            .ok()?;
        reply.get::<(bool,)>().map(|(b,)| b)
    };
    has_owner().unwrap_or(false)
}

/// What the interface needs to know, in its words: what can be offered.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Abilities {
    /// tmux version; `None`: sessions cannot be started or continued from CodeDeck
    pub tmux: Option<String>,
    /// The terminal program's name; `None`: no terminal door
    pub terminal: Option<String>,
    /// A session started by hand in a terminal can have its window brought to the front (X11)
    pub raise_windows: bool,
    /// Global shortcuts can be held (not under Wayland)
    pub global_shortcuts: bool,
    /// Windows can be placed (not under Wayland: the compositor decides)
    pub place_windows: bool,
    pub wayland: bool,
    pub desktop: String,
    pub tray: bool,
}

pub fn abilities() -> Abilities {
    let p = get();
    Abilities {
        tmux: p.tmux.clone(),
        terminal: p.terminal.as_ref().map(Terminal::name),
        raise_windows: p.x11,
        global_shortcuts: !p.wayland,
        place_windows: !p.wayland,
        wayland: p.wayland,
        desktop: p.desktop.clone(),
        tray: p.tray,
    }
}

/// Starting in tmux needs tmux: said in words instead of "No such file or directory".
pub fn need_tmux() -> Result<(), String> {
    match get().tmux {
        Some(_) => Ok(()),
        None => Err("tmux is not installed: CodeDeck starts and continues sessions in tmux".into()),
    }
}
