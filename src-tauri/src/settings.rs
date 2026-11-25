//! Windows of their own for what needs no project: the settings (`?view=settings`), and About and
//! the keyboard shortcuts when no project window is there to show them as a dialog (the start page
//! is too narrow). Every setting applies to this computer, none to a project, so the settings open
//! the same way from the start page, the tray and a project window (user, 2026-11-21: they used to
//! need a project window, and so did About and the shortcuts on the start page).

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "settings";

/// The areas of the settings, as the interface names them (`SettingsSection` in src/dialogs.ts).
const SECTIONS: &[&str] = &["general", "interface", "theme", "notifications", "files", "tools"];

/// The windows this module opens: label (also the `view` of the page), size, title in English and German.
const PANELS: &[(&str, f64, f64, &str, &str)] = &[
    (LABEL, 780.0, 560.0, "Settings", "Einstellungen"),
    ("about", 440.0, 560.0, "About CodeDeck", "Über CodeDeck"),
    ("shortcuts", 600.0, 640.0, "Keyboard shortcuts", "Tastenkürzel"),
];

/// Whether this window is one of them: beside the work like the welcome, not a project window.
pub fn is_panel(label: &str) -> bool {
    PANELS.iter().any(|(l, ..)| *l == label)
}

/// Opens the settings at `section` (default: the first), or brings them to the front there.
pub fn open(app: &AppHandle, section: Option<&str>) -> Result<(), String> {
    let section = section.filter(|s| SECTIONS.contains(s));
    if app.get_webview_window(LABEL).is_some() {
        if let Some(section) = section {
            let _ = app.emit_to(LABEL, "settings_section", section);
        }
    }
    open_panel(app, LABEL, &format!("&section={}", section.unwrap_or(SECTIONS[0])))
}

/// Opens one of the windows (`about`, `shortcuts`, `settings`), or brings it to the front.
pub fn open_panel(app: &AppHandle, label: &str, query: &str) -> Result<(), String> {
    let (label, width, height, en, de) = *PANELS.iter().find(|(l, ..)| *l == label).ok_or_else(|| format!("{label}: no such window"))?;
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        return window.set_focus().map_err(|e| e.to_string());
    }
    let title = format!("{} – CodeDeck", if crate::tray::german() { de } else { en });
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html?view={label}{query}").into()))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(width.min(520.0), 400.0)
        .center()
        .background_color(tauri::window::Color(2, 6, 23, 255))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
