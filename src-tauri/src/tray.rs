//! The tray icon: where one looks for the overview once it is closed, and where one sees that a
//! session waits while no CodeDeck window is in sight. A StatusNotifierItem over D-Bus through ksni,
//! as in Maillet: unlike libappindicator it reports the left click, so a click shows or hides the
//! overview and the menu sits on the right click. Works under Wayland as under X11, on every desktop
//! with a tray host (GNOME needs the AppIndicator extension), and needs no C library.

use std::sync::Mutex;

use ksni::menu::StandardItem;
use ksni::{Icon, MenuItem, ToolTip, TrayMethods};
use tauri::{AppHandle, Manager};

use crate::Locked;

/// A finished turn counts as waiting until the user saw it, but no longer than this: by then its
/// session is under "Earlier" (as `DONE_SHOWN_MS` in `attention.ts`)
const DONE_SHOWN_MS: u64 = 6 * 3600_000;

/// What the tray shows; it is told again only when this changes.
#[derive(Clone, PartialEq, Default)]
struct Shown {
    overview_visible: bool,
    asks: usize,
    done: usize,
    german: bool,
}

/// The icon in the tray: its state and the app icon in two sizes (ARGB, as the protocol wants).
struct CodeDeckTray {
    app: AppHandle,
    shown: Shown,
    icons: Vec<(u32, Vec<u8>)>,
}

#[derive(Default)]
pub struct Tray {
    shown: Mutex<Option<Shown>>,
    handle: Mutex<Option<ksni::Handle<CodeDeckTray>>>,
}

/// Puts the icon into the tray. Without a D-Bus session there is none, and CodeDeck goes on without
/// it; a tray host that starts later (the panel after login) picks the icon up then.
pub fn start(app: &AppHandle) {
    app.manage(Tray::default());
    let icons = [&include_bytes!("../icons/32x32.png")[..], &include_bytes!("../icons/128x128.png")[..]]
        .iter()
        .filter_map(|bytes| tauri::image::Image::from_bytes(bytes).ok())
        .map(|img| (img.width(), img.rgba().to_vec()))
        .collect();
    let tray = CodeDeckTray { app: app.clone(), shown: Shown::default(), icons };
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let app = handle;
        match tray.assume_sni_available(true).spawn().await {
            Ok(handle) => {
                *app.state::<Tray>().handle.locked() = Some(handle);
                refresh(&app);
            }
            Err(e) => eprintln!("codedeck: no tray icon ({e})"),
        }
    });
    // A finished turn stops counting after a while without any event: look again now and then
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(60));
        refresh(&app);
    });
}

/// Shows what is the case now: whether the overview is visible, what waits, in which language.
pub fn refresh(app: &AppHandle) {
    let Some(state) = app.try_state::<Tray>() else { return };
    let Some(handle) = state.handle.locked().clone() else { return };
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    // A session is heard by its project and by every project above it: each counts once
    let (mut asks, mut done) = (std::collections::HashSet::new(), std::collections::HashSet::new());
    for (a, d) in app.state::<crate::windows::Bridges>().all().iter().map(|b| b.waiting(now, DONE_SHOWN_MS)) {
        asks.extend(a);
        done.extend(d);
    }
    let done = done.difference(&asks).count();
    let asks = asks.len();
    let overview_visible = app.get_webview_window(crate::windows::OVERVIEW).is_some_and(|w| w.is_visible().unwrap_or(false));
    let shown = Shown { overview_visible, asks, done, german: german() };
    {
        let mut last = state.shown.locked();
        if last.as_ref() == Some(&shown) {
            return;
        }
        *last = Some(shown.clone());
    }
    tauri::async_runtime::spawn(async move {
        handle.update(move |t: &mut CodeDeckTray| t.shown = shown).await;
    });
}

impl ksni::Tray for CodeDeckTray {
    fn id(&self) -> String {
        "codedeck".into()
    }

    fn title(&self) -> String {
        "CodeDeck".into()
    }

    fn icon_pixmap(&self) -> Vec<Icon> {
        self.icons
            .iter()
            .map(|(size, rgba)| {
                let mut rgba = rgba.clone();
                crate::icon::mark_waiting(&mut rgba, *size as i32, self.shown.asks, self.shown.done > 0);
                Icon { width: *size as i32, height: *size as i32, data: rgba_to_argb(&rgba) }
            })
            .collect()
    }

    fn tool_tip(&self) -> ToolTip {
        let (s, de) = (&self.shown, self.shown.german);
        let title = match (s.asks, s.done, de) {
            (0, 0, _) => "CodeDeck".to_string(),
            (0, d, true) => format!("CodeDeck – {d} fertig"),
            (0, d, false) => format!("CodeDeck – {d} done"),
            (a, 0, true) => format!("CodeDeck – {a} fragt"),
            (a, 0, false) => format!("CodeDeck – {a} asking"),
            (a, d, true) => format!("CodeDeck – {a} fragt · {d} fertig"),
            (a, d, false) => format!("CodeDeck – {a} asking · {d} done"),
        };
        let description = if de { "Klick: CodeDeck nach vorn, oder weg, wenn es vorn ist" } else { "Click: CodeDeck to the front, or away when it is in front" };
        ToolTip { title, description: description.into(), ..Default::default() }
    }

    fn activate(&mut self, _x: i32, _y: i32) {
        toggle(&self.app);
    }

    fn menu(&self) -> Vec<MenuItem<Self>> {
        let s = &self.shown;
        let text = |en: &str, de: &str| if s.german { de.to_string() } else { en.to_string() };
        let mut items: Vec<MenuItem<Self>> = vec![StandardItem { label: text("Show CodeDeck", "CodeDeck zeigen"), activate: Box::new(|t: &mut Self| show(&t.app)), ..Default::default() }.into()];
        let waiting = s.asks + s.done;
        if waiting > 0 {
            let label = match (s.asks, s.german) {
                (0, true) => format!("Wartet auf dich ({waiting})"),
                (0, false) => format!("Waiting for you ({waiting})"),
                (asks, true) => format!("Wartet auf dich ({waiting}, {asks} fragt)"),
                (asks, false) => format!("Waiting for you ({waiting}, {asks} asking)"),
            };
            items.push(StandardItem { label, activate: Box::new(|t: &mut Self| show(&t.app)), ..Default::default() }.into());
        }
        items.push(MenuItem::Separator);
        // The settings need no project, so they are here too, for a CodeDeck without a window in sight
        items.push(StandardItem {
            label: text("Settings…", "Einstellungen…"),
            activate: Box::new(|t: &mut Self| {
                if let Err(e) = crate::settings::open(&t.app, None) {
                    eprintln!("codedeck: settings: {e}");
                }
            }),
            ..Default::default()
        }
        .into());
        items.push(StandardItem { label: text("Quit CodeDeck", "CodeDeck beenden"), activate: Box::new(|t: &mut Self| t.app.exit(0)), ..Default::default() }.into());
        items
    }
}

/// Pixels as ARGB32 in network byte order, as StatusNotifierItem expects.
fn rgba_to_argb(rgba: &[u8]) -> Vec<u8> {
    rgba.chunks_exact(4).flat_map(|p| [p[3], p[0], p[1], p[2]]).collect()
}

/// The interface's language as the machine settings have it (`language`), else the system's. The
/// tray has no web view to ask, and its few words are not worth a dictionary of their own.
pub fn german() -> bool {
    match crate::config::machine_settings().get("language").and_then(|v| v.as_str()) {
        Some(lang) => lang == "de",
        None => std::env::var("LANG").or_else(|_| std::env::var("LANGUAGE")).is_ok_and(|l| l.starts_with("de")),
    }
}

/// The overview's title, in the interface's language.
pub fn overview_title() -> String {
    if german() { "CodeDeck – Übersicht" } else { "CodeDeck – Overview" }.to_string()
}

/// Building or showing the overview waits for the main thread: not on the tray's thread.
fn toggle(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = crate::windows::front_or_away(&app);
        refresh(&app);
    });
}

/// CodeDeck to the front, never away (the menu's items): the project window used last, else the start page.
fn show(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        use crate::window::{obey, Request};
        let window = crate::window::last_label(&app)
            .and_then(|l| app.get_webview_window(&l))
            .or_else(|| app.state::<crate::windows::Windows>().all().iter().find_map(|w| app.get_webview_window(&w.label)));
        match window {
            Some(w) => obey(&w, Request::Front),
            None => match app.get_webview_window(crate::windows::OVERVIEW) {
                Some(start) if start.is_visible().unwrap_or(false) => obey(&start, Request::Front),
                _ => {
                    let _ = crate::windows::toggle_overview(&app);
                }
            },
        }
        refresh(&app);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixels_go_out_as_argb() {
        assert_eq!(rgba_to_argb(&[1, 2, 3, 4, 5, 6, 7, 8]), vec![4, 1, 2, 3, 8, 5, 6, 7]);
    }
}
