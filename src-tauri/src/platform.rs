//! What this computer offers CodeDeck, found at the start and again on request ("Check again" in
//! the welcome, docs/SITZUNGEN-PRUEFUNG.md K1, "Rechner"): git, tmux, a terminal program, X11 or
//! Wayland, the desktop, global shortcuts, the tray.
//! The interface asks this instead of offering what fails on a click: without tmux no ▶, without
//! a terminal no terminal door, under Wayland no "window to the front".

use std::process::Command;
use std::sync::RwLock;

use serde::Serialize;

use crate::terminal::Terminal;

pub struct Platform {
    /// `git --version`, e.g. "git version 2.43.0"; `None` when git is not installed
    pub git: Option<String>,
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

/// What was found last. Each finding is leaked on purpose: callers keep a plain `&'static Platform`
/// across a check that runs again meanwhile, and a check runs again only when the user asks.
static FOUND: RwLock<Option<&'static Platform>> = RwLock::new(None);

/// What this computer offers, found on the first call.
pub fn get() -> &'static Platform {
    if let Some(found) = *FOUND.read().unwrap_or_else(|e| e.into_inner()) {
        return found;
    }
    let mut slot = FOUND.write().unwrap_or_else(|e| e.into_inner());
    *slot.get_or_insert_with(|| Box::leak(Box::new(detect())))
}

/// Looks again, e.g. after the user installed tmux while the welcome was open.
pub fn refresh() -> &'static Platform {
    let found: &'static Platform = Box::leak(Box::new(detect()));
    *FOUND.write().unwrap_or_else(|e| e.into_inner()) = Some(found);
    found
}

fn detect() -> Platform {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") || std::env::var_os("WAYLAND_DISPLAY").is_some();
    Platform {
        git: version_of("git", "--version"),
        tmux: version_of("tmux", "-V"),
        terminal: crate::terminal::detect(),
        wayland,
        x11: !wayland && std::env::var_os("DISPLAY").is_some(),
        desktop: std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default(),
        tray: tray_host(),
    }
}

/// What a program says about its version; `None` when it is not installed. git is asked here too,
/// outside `Git::run`: this asks the program, not a repository, and changes nothing.
fn version_of(program: &str, flag: &str) -> Option<String> {
    let out = Command::new(program).arg(flag).output().ok().filter(|o| o.status.success())?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Where a program is installed: on CodeDeck's `PATH`, else on the one of the user's login shell.
/// Started from the desktop, CodeDeck's own `PATH` may lack e.g. `~/.local/bin`, where tools that
/// are started through the login shell (`crate::tmux::start`) are found all the same.
pub fn find_program(name: &str) -> Option<String> {
    if let Some(dir) = std::env::var_os("PATH").and_then(|path| std::env::split_paths(&path).find(|dir| crate::terminal::on_path(&dir.join(name).to_string_lossy()))) {
        return Some(dir.join(name).display().to_string());
    }
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let out = Command::new(shell).args(["-lc", &format!("command -v {}", crate::tmux::word(name))]).output().ok().filter(|o| o.status.success())?;
    let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
    // `command -v` names an alias or a function as such: only a path counts
    found.starts_with('/').then_some(found)
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
    /// What a desktop binds to a key to bring CodeDeck to the front (`codedeck --toggle` with this
    /// program's path)
    pub toggle_command: String,
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
        toggle_command: format!(
            "{} {}",
            std::env::current_exe().map_or_else(|_| "codedeck".into(), |p| crate::tmux::word(&p.to_string_lossy())),
            crate::hub::TOGGLE
        ),
    }
}

/// Starting in tmux needs tmux: said in words instead of "No such file or directory".
pub fn need_tmux() -> Result<(), String> {
    match get().tmux {
        Some(_) => Ok(()),
        None => Err("tmux is not installed: CodeDeck starts and continues sessions in tmux".into()),
    }
}
