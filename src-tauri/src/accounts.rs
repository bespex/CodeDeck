//! Accounts (step 3.2): the coding tools' configurations found on this computer, with the name,
//! colour and desktop-app profile the user gives each. Kept in `~/.config/codedeck/accounts.json`.
//! A project names the account its sessions run with (`projects.rs`); a session tells the one it
//! runs in. Folders that look like backups can be moved to the trash, after asking.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::harness::{self, AccountKind};

const FILE: &str = "accounts.json";

/// Colours for accounts until the user picks one: one each, in the order they are found.
const COLORS: [&str; 6] = ["#7f95ff", "#4fc9bd", "#e391d0", "#c3cf6c", "#62b6ee", "#f0a060"];

/// What the user set for one account.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    dir: String,
    name: Option<String>,
    color: Option<String>,
    desktop_profile: Option<String>,
    /// Its mark: `{ kind: "icon" | "emoji" | "letter", value? }`, shown on a hexagon
    mark: Option<serde_json::Value>,
}

/// One account as the interface shows it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// The tool it belongs to
    pub harness: &'static str,
    /// Its configuration folder: what sessions and projects name it by
    pub dir: String,
    pub name: String,
    pub color: String,
    /// Its mark as chosen; `null`: its first letter (shown on a hexagon, projects have circles)
    pub mark: serde_json::Value,
    /// The desktop app's data folder for this account; `None`: the app's default
    pub desktop_profile: Option<String>,
    pub kind: AccountKind,
    /// CodeDeck hears its sessions
    pub connected: bool,
}

fn file() -> Option<PathBuf> {
    crate::config::file(FILE)
}

fn load() -> Vec<Stored> {
    file().and_then(|f| std::fs::read(f).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Every account of every tool, with what the user set.
pub fn list() -> Vec<Account> {
    let stored = load();
    // Profiles set before this list existed (machine setting `desktopProfiles`, 2026-11-17)
    let earlier = crate::config::machine_settings().get("desktopProfiles").and_then(|v| v.as_object().cloned()).unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let full = |p: &str| p.strip_prefix('~').map_or_else(|| p.to_string(), |rest| format!("{home}{rest}"));
    let mut all = Vec::new();
    for tool in harness::all() {
        for connection in tool.connections() {
            let set = stored.iter().find(|s| s.dir == connection.dir).cloned().unwrap_or_default();
            let index = all.len();
            let profile = set.desktop_profile.or_else(|| {
                earlier.iter().find(|(dir, _)| full(dir) == connection.dir).and_then(|(_, p)| p.as_str()).map(full)
            });
            all.push(Account {
                harness: tool.id(),
                name: set.name.unwrap_or_else(|| default_name(&connection.dir)),
                color: set.color.unwrap_or_else(|| COLORS[index % COLORS.len()].to_string()),
                mark: set.mark.unwrap_or(serde_json::Value::Null),
                desktop_profile: profile,
                kind: tool.account_kind(Path::new(&connection.dir)),
                connected: connection.installed,
                dir: connection.dir,
            });
        }
    }
    all
}

/// A folder's name without the leading dot: `~/.claude-private` is "claude-private".
fn default_name(dir: &str) -> String {
    Path::new(dir).file_name().map_or_else(|| dir.to_string(), |n| n.to_string_lossy().trim_start_matches('.').to_string())
}

/// Changes what the user set for an account: `name`, `color` or `desktopProfile` (a string, or
/// null for the default), or `mark` (an object, or null).
pub fn set(dir: &str, field: &str, value: serde_json::Value) -> Result<(), String> {
    let file = file().ok_or("no config directory")?;
    let mut stored = load();
    if !stored.iter().any(|s| s.dir == dir) {
        stored.push(Stored { dir: dir.to_string(), ..Default::default() });
    }
    let entry = stored.iter_mut().find(|s| s.dir == dir).ok_or("no such account")?;
    let text = value.as_str().map(str::trim).filter(|t| !t.is_empty()).map(String::from);
    match field {
        "name" => entry.name = text,
        "color" => entry.color = text,
        "desktopProfile" => entry.desktop_profile = text,
        "mark" => entry.mark = (!value.is_null()).then_some(value),
        _ => return Err(format!("{field}: no such field")),
    }
    crate::config::write(&file, &serde_json::to_vec_pretty(&stored).map_err(|e| e.to_string())?)
}

/// The desktop app's profile of the account a session runs in, if one is set.
pub fn desktop_profile(dir: &str) -> Option<String> {
    list().into_iter().find(|a| a.dir == dir).and_then(|a| a.desktop_profile)
}

/// Moves a folder that looks like a backup (or a configuration never used) to the trash. Never one
/// in use: its sessions and settings would be gone.
pub fn trash(dir: &str) -> Result<(), String> {
    let account = list().into_iter().find(|a| a.dir == dir).ok_or("no such account")?;
    if account.kind == AccountKind::Used {
        return Err("this configuration is in use: it is not deleted".into());
    }
    use gio::prelude::*;
    gio::File::for_path(dir).trash(None::<&gio::Cancellable>).map_err(|e| format!("{dir}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_an_account_after_its_folder() {
        assert_eq!(default_name("/home/me/.claude-private"), "claude-private");
        assert_eq!(default_name("/home/me/.claude"), "claude");
    }
}
