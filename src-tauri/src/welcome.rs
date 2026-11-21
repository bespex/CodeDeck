//! The welcome at the start: what CodeDeck looked for on this computer, how much each matters and
//! what it does for CodeDeck. It has a window of its own (`?view=welcome`): the start page is too
//! narrow for it, and at the very first start there may be no project window. It shows at every
//! start with a window until the user turns it off, and again when something essential that was
//! there then has gone missing. Its second page explains the project list. The help on the project
//! window (`window_help_due`) shows in the first project window of a start, also until turned off.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::platform::Platform;

/// The window's label.
pub const LABEL: &str = "welcome";

/// The machine setting: `{ "off": true, "essentials": [ids found when it was turned off] }`.
const SETTING: &str = "welcome";

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Found,
    Missing,
    /// There, but CodeDeck can do less with it (Wayland)
    Limited,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Urgency {
    /// Without it CodeDeck does not do its job
    Essential,
    /// Without it some of CodeDeck is missing
    Helpful,
    /// It makes things nicer
    NiceToHave,
}

/// One thing CodeDeck looked for. The interface writes what it does for CodeDeck from `kind`, in
/// the language of the interface; a coding tool's name and page come from its adapter.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// Unique: "tool:<id>", "git", "tmux", "terminal", "windows", "tray", or a viewer's program
    pub id: String,
    /// "tool", "git", "tmux", "terminal", "windows", "tray", "viewer"
    pub kind: &'static str,
    pub name: String,
    pub url: Option<String>,
    pub status: Status,
    /// What was found: a version, a program, the window system
    pub detail: Option<String>,
    pub urgency: Urgency,
    /// The command that installs it, where it is known (Debian family)
    pub install: Option<String>,
}

/// The viewers of be spex (Qiew) CodeDeck hands files to: name, program.
const VIEWERS: &[(&str, &str)] = &[
    ("Marq", "marq"),
    ("Dirq", "dirq"),
    ("Hyqe", "hyqe"),
    ("Jayq", "jayq"),
    ("Xaq", "xaq"),
    ("Cusq", "cusq"),
    ("Maiqe", "maiqe"),
    ("Trisq", "trisq"),
];

/// Everything CodeDeck looks for, in the order shown: essential first.
pub fn checks(platform: &Platform) -> Vec<Check> {
    let apt = crate::terminal::on_path("apt-get");
    let install = |package: &str| apt.then(|| format!("sudo apt install {package}"));
    let found = |yes: bool| if yes { Status::Found } else { Status::Missing };
    let mut all: Vec<Check> = crate::harness::all()
        .iter()
        .map(|h| {
            let path = h.installed();
            Check {
                id: format!("tool:{}", h.id()),
                kind: "tool",
                name: h.name().to_string(),
                url: h.homepage().map(String::from),
                status: found(path.is_some()),
                detail: None,
                urgency: Urgency::Essential,
                install: None,
            }
        })
        .collect();
    all.push(Check {
        id: "git".into(),
        kind: "git",
        name: "git".into(),
        url: Some("https://git-scm.com".into()),
        status: found(platform.git.is_some()),
        detail: platform.git.as_deref().map(|v| v.trim_start_matches("git version ").to_string()),
        urgency: Urgency::Essential,
        install: platform.git.is_none().then(|| install("git")).flatten(),
    });
    all.push(Check {
        id: "tmux".into(),
        kind: "tmux",
        name: "tmux".into(),
        url: Some("https://github.com/tmux/tmux/wiki".into()),
        status: found(platform.tmux.is_some()),
        detail: platform.tmux.as_deref().map(|v| v.trim_start_matches("tmux ").to_string()),
        urgency: Urgency::Essential,
        install: platform.tmux.is_none().then(|| install("tmux")).flatten(),
    });
    all.push(Check {
        id: "terminal".into(),
        kind: "terminal",
        name: "Terminal".into(),
        url: None,
        status: found(platform.terminal.is_some()),
        detail: platform.terminal.as_ref().map(|t| t.name()),
        urgency: Urgency::Helpful,
        install: None,
    });
    all.push(Check {
        id: "windows".into(),
        kind: "windows",
        name: "X11 / Wayland".into(),
        url: None,
        status: if platform.x11 { Status::Found } else { Status::Limited },
        detail: Some(if platform.wayland { "Wayland" } else if platform.x11 { "X11" } else { "?" }.into()),
        urgency: Urgency::Helpful,
        install: None,
    });
    all.push(Check {
        id: "tray".into(),
        kind: "tray",
        name: "Tray".into(),
        url: None,
        status: found(platform.tray),
        detail: None,
        urgency: Urgency::Helpful,
        install: None,
    });
    for (name, program) in VIEWERS {
        let here = crate::platform::find_program(program).is_some();
        all.push(Check {
            id: (*program).into(),
            kind: "viewer",
            name: (*name).into(),
            url: Some(format!("https://bespex.github.io/{program}/")),
            status: found(here),
            detail: None,
            urgency: Urgency::NiceToHave,
            install: None,
        });
    }
    all
}

/// The essentials that are there: kept when the welcome is turned off, to bring it back when one
/// of them goes missing.
fn essentials_found(checks: &[Check]) -> Vec<String> {
    checks.iter().filter(|c| c.urgency == Urgency::Essential && c.status == Status::Found).map(|c| c.id.clone()).collect()
}

/// Whether the welcome shows at this start, from the stored setting and what is there now.
fn due(setting: Option<&Value>, checks: &[Check]) -> bool {
    if setting.and_then(|s| s["off"].as_bool()) != Some(true) {
        return true;
    }
    let now = essentials_found(checks);
    let then = setting.and_then(|s| s["essentials"].as_array()).cloned().unwrap_or_default();
    then.iter().filter_map(Value::as_str).any(|id| !now.iter().any(|n| n == id))
}

/// Whether the welcome is shown at the start: what the checkbox in it shows.
pub fn shown_at_start() -> bool {
    crate::config::machine_settings().get(SETTING).and_then(|s| s["off"].as_bool()) != Some(true)
}

/// The user closed the welcome: `off` turns it off for the next starts.
pub fn done(off: bool) -> Result<(), String> {
    let value = if off { json!({ "off": true, "essentials": essentials_found(&checks(crate::platform::get())) }) } else { Value::Null };
    crate::config::set_machine_setting(SETTING, value)
}

/// Opens the welcome, or brings it to the front.
pub fn open(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        return window.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?view=welcome".into()))
        .title("CodeDeck")
        .inner_size(660.0, 800.0)
        .min_inner_size(480.0, 400.0)
        .center()
        .background_color(tauri::window::Color(2, 6, 23, 255))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Gives the welcome the size its page needs (logical pixels), never more than the screen has, and
/// centres it again: the page on the project list is wider and as high as its text (user, 2026-11-21).
pub fn fit(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(LABEL) else { return Ok(()) };
    let (mut width, mut height) = (width.max(480.0), height.max(400.0));
    if let Ok(Some(monitor)) = window.current_monitor() {
        let room = monitor.size().to_logical::<f64>(monitor.scale_factor());
        width = width.min(room.width - 40.0);
        height = height.min(room.height - 80.0);
    }
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())
}

/// At a start with a window: opens the welcome when it is due. Off the main thread: looking for the
/// programs asks the login shell.
pub fn at_start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if due(crate::config::machine_settings().get(SETTING), &checks(crate::platform::get())) {
            if let Err(e) = open(&app) {
                eprintln!("codedeck: welcome: {e}");
            }
        }
    });
}

/// The machine setting that turns the help on the project window off (`false`).
const WINDOW_HELP: &str = "windowHelp";

static WINDOW_HELP_GIVEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Whether the window asking shows the help on the project window now: once per start of CodeDeck,
/// in the first project window the user sees, until the user turns it off.
pub fn window_help_due(visible: bool) -> bool {
    if !visible || crate::config::machine_settings().get(WINDOW_HELP).and_then(Value::as_bool) == Some(false) {
        return false;
    }
    !WINDOW_HELP_GIVEN.swap(true, std::sync::atomic::Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(id: &str, urgency: Urgency, status: Status) -> Check {
        Check { id: id.into(), kind: "git", name: id.into(), url: None, status, detail: None, urgency, install: None }
    }

    #[test]
    fn shows_until_turned_off() {
        let all = [check("git", Urgency::Essential, Status::Found)];
        assert!(due(None, &all));
        assert!(due(Some(&json!({ "off": false })), &all));
        assert!(!due(Some(&json!({ "off": true, "essentials": ["git"] })), &all));
    }

    #[test]
    fn comes_back_when_an_essential_went_missing() {
        let setting = json!({ "off": true, "essentials": ["git", "tmux"] });
        let now = [check("git", Urgency::Essential, Status::Found), check("tmux", Urgency::Essential, Status::Missing)];
        assert!(due(Some(&setting), &now));
    }

    #[test]
    fn something_missing_already_then_does_not_bring_it_back() {
        // tmux was missing when the user turned it off: they know
        let setting = json!({ "off": true, "essentials": ["git"] });
        let now = [check("git", Urgency::Essential, Status::Found), check("tmux", Urgency::Essential, Status::Missing), check("marq", Urgency::NiceToHave, Status::Missing)];
        assert!(!due(Some(&setting), &now));
    }
}
