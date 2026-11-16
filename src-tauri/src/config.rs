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
