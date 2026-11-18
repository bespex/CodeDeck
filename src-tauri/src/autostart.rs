//! CodeDeck at login (step 3.5, docs/SITZUNGEN.md A10, question 11): an entry in the desktop's
//! autostart folder (XDG, works under X11 and Wayland alike) that starts this program in the tray,
//! without a window. Its sessions are heard from the start, and today's list starts if the user
//! wants that ("at start"). The entry itself is the setting: it is there or not.

use std::path::{Path, PathBuf};

/// What the program is started with at login: no project window, the overview hidden in the tray.
pub const TRAY: &str = "--tray";

/// Whether CodeDeck starts at login, and with which program.
#[derive(serde::Serialize)]
pub struct State {
    pub on: bool,
    /// The program the entry starts; it may be another installation than this one (a build, a package)
    pub program: Option<String>,
    /// Whether that is this program
    pub this: bool,
}

fn entry_file() -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME").filter(|d| !d.is_empty()).map(PathBuf::from).or_else(|| std::env::home_dir().map(|h| h.join(".config")))?;
    Some(config.join("autostart").join("codedeck.desktop"))
}

pub fn state() -> State {
    let text = entry_file().and_then(|f| std::fs::read_to_string(f).ok());
    let on = text.as_deref().is_some_and(|t| !t.lines().any(|l| matches!(l.trim(), "Hidden=true" | "X-GNOME-Autostart-enabled=false")));
    let program = text.as_deref().and_then(program_of);
    let this = match (&program, std::env::current_exe()) {
        (Some(p), Ok(exe)) => Path::new(p) == exe,
        _ => false,
    };
    State { on, program, this }
}

/// Puts the entry there for this program, or takes it away.
pub fn set(on: bool) -> Result<(), String> {
    let file = entry_file().ok_or("no home folder")?;
    if !on {
        return match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("{}: {e}", file.display())),
            _ => Ok(()),
        };
    }
    let exe = std::env::current_exe().map_err(|e| format!("which program runs: {e}"))?;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    crate::config::write(&file, entry(&exe).as_bytes())
}

/// The desktop entry that starts `exe` in the tray.
fn entry(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=CodeDeck\nComment=Starts CodeDeck in the tray when you log in\nExec={} {TRAY}\nIcon=codedeck\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        quote(&exe.to_string_lossy())
    )
}

/// An argument of `Exec=` as the desktop entry specification wants it: in double quotes, with
/// `"`, `` ` ``, `$` and `\` escaped.
fn quote(arg: &str) -> String {
    let mut out = String::from("\"");
    for c in arg.chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

/// The program an entry's `Exec=` starts.
fn program_of(text: &str) -> Option<String> {
    let exec = text.lines().find_map(|l| l.trim().strip_prefix("Exec="))?.trim();
    if let Some(rest) = exec.strip_prefix('"') {
        let mut out = String::new();
        let mut chars = rest.chars();
        while let Some(c) = chars.next() {
            match c {
                '\\' => out.push(chars.next()?),
                '"' => return Some(out),
                _ => out.push(c),
            }
        }
        None
    } else {
        exec.split_whitespace().next().map(String::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_entry_starts_this_program_in_the_tray() {
        let text = entry(Path::new("/opt/my apps/code\"deck"));
        assert!(text.contains("Exec=\"/opt/my apps/code\\\"deck\" --tray\n"));
        assert_eq!(program_of(&text).as_deref(), Some("/opt/my apps/code\"deck"));
        assert_eq!(program_of("Exec=/usr/bin/codedeck --tray").as_deref(), Some("/usr/bin/codedeck"));
    }
}
