//! Files in `~/.config/codedeck/`, shared by all CodeDeck instances.
//!
//! Each write replaces the file in one rename, so no instance reads a half-written file.

use std::fs;
use std::path::{Path, PathBuf};

/// `~/.config/codedeck/<name>`, honouring `XDG_CONFIG_HOME`.
pub fn file(name: &str) -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(config.join("codedeck").join(name))
}

/// Replaces the file atomically; creates the directory if needed.
pub fn write(file: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = file.parent().ok_or("no config directory")?;
    let name = file.file_name().map_or_else(|| "config".into(), |n| n.to_string_lossy());
    let temp = dir.join(format!(".{name}.{}", std::process::id()));
    let written = fs::create_dir_all(dir).and_then(|_| fs::write(&temp, bytes)).and_then(|_| fs::rename(&temp, file));
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map_err(|e| format!("{}: {e}", file.display()))
}

/// Settings of this machine that every window shares (`settings.json`): one JSON object, each key
/// set on its own. The start of the settings store (docs/PROZESSMODELL.md, review B2).
pub fn machine_settings() -> serde_json::Map<String, serde_json::Value> {
    file("settings.json")
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

/// Sets one machine setting; `null` removes it. Read again first: another window may have written.
pub fn set_machine_setting(key: &str, value: serde_json::Value) -> Result<(), String> {
    let file = file("settings.json").ok_or("no config directory")?;
    let mut all = machine_settings();
    if value.is_null() {
        all.remove(key);
    } else {
        all.insert(key.to_string(), value);
    }
    let text = serde_json::to_vec_pretty(&all).map_err(|e| e.to_string())?;
    write(&file, &text)
}

/// How the window of a project is divided (`layouts.json`): one JSON object per project path, so
/// every window of that project opens the way the user left it.
pub fn layout(project: &str) -> serde_json::Value {
    layouts().get(project).cloned().unwrap_or(serde_json::Value::Null)
}

/// Stores the division of one project; read again first, another window may have written.
pub fn set_layout(project: &str, value: serde_json::Value) -> Result<(), String> {
    let file = file("layouts.json").ok_or("no config directory")?;
    let all = with_layout(layouts(), project, value);
    let text = serde_json::to_vec_pretty(&all).map_err(|e| e.to_string())?;
    write(&file, &text)
}

fn layouts() -> serde_json::Map<String, serde_json::Value> {
    file("layouts.json")
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default()
}

/// Only objects are kept: anything else (`null`) forgets the project, back to the default division.
fn with_layout(
    mut all: serde_json::Map<String, serde_json::Value>,
    project: &str,
    value: serde_json::Value,
) -> serde_json::Map<String, serde_json::Value> {
    if value.is_object() {
        all.insert(project.to_string(), value);
    } else {
        all.remove(project);
    }
    all
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_one_layout_per_project_and_forgets_on_null() {
        let all = with_layout(Default::default(), "/a", json!({ "files": 240 }));
        let all = with_layout(all, "/b", json!({ "files": 300, "right": 400 }));
        let all = with_layout(all, "/a", json!({ "files": 260 }));
        assert_eq!(all.get("/a"), Some(&json!({ "files": 260 })));
        assert_eq!(all.get("/b"), Some(&json!({ "files": 300, "right": 400 })));
        let all = with_layout(all, "/b", serde_json::Value::Null);
        assert!(!all.contains_key("/b"));
    }
}
