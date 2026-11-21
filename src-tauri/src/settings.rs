//! The settings in a window of their own (`?view=settings`). Every setting applies to this computer,
//! none to a project, so they open the same way from the start page, the tray and a project window,
//! with or without a project open (user, 2026-11-21: they used to need a project window).

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "settings";

/// The areas of the settings, as the interface names them (`SettingsSection` in src/dialogs.ts).
const SECTIONS: &[&str] = &["general", "interface", "notifications", "tools"];

/// Opens the settings at `section` (default: the first), or brings them to the front there.
pub fn open(app: &AppHandle, section: Option<&str>) -> Result<(), String> {
    let section = section.filter(|s| SECTIONS.contains(s));
    if let Some(window) = app.get_webview_window(LABEL) {
        if let Some(section) = section {
            let _ = app.emit_to(LABEL, "settings_section", section);
        }
        let _ = window.unminimize();
        return window.set_focus().map_err(|e| e.to_string());
    }
    let url = format!("index.html?view=settings&section={}", section.unwrap_or(SECTIONS[0]));
    let title = if crate::tray::german() { "Einstellungen – CodeDeck" } else { "Settings – CodeDeck" };
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(780.0, 560.0)
        .min_inner_size(520.0, 400.0)
        .center()
        .background_color(tauri::window::Color(2, 6, 23, 255))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
