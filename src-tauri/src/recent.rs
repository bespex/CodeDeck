//! Recently opened projects, in `~/.config/codedeck/recent.json`.
//!
//! Several CodeDeck instances share this file. Each write reads it fresh, merges and replaces
//! it in one rename, so no instance overwrites a half-written file or another instance's entries.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const LIMIT: usize = 15;

#[derive(Serialize, Deserialize, Clone)]
struct Stored {
    path: PathBuf,
    /// Unix seconds of the last opening
    opened: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    name: String,
    path: String,
    /// For display, home shortened to `~`
    display: String,
}

fn file() -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(config.join("codedeck").join("recent.json"))
}

fn load(file: &Path) -> Vec<Stored> {
    fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

/// Puts a project at the top of the list. Failures only cost the entry.
pub fn remember(root: &Path) {
    let Some(file) = file() else { return };
    let opened = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let mut list = load(&file);
    list.retain(|entry| entry.path != root);
    list.insert(0, Stored { path: root.to_path_buf(), opened });
    list.truncate(LIMIT);

    let Some(dir) = file.parent() else { return };
    let temp = dir.join(format!(".recent.{}.json", std::process::id()));
    let written = fs::create_dir_all(dir)
        .and_then(|_| fs::write(&temp, serde_json::to_vec_pretty(&list).unwrap_or_default()))
        .and_then(|_| fs::rename(&temp, &file));
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
}

/// Recent projects that still exist, newest first, without the one given.
pub fn list(except: &Path) -> Vec<RecentProject> {
    let Some(file) = file() else { return Vec::new() };
    let home = std::env::var_os("HOME").map(PathBuf::from);
    load(&file)
        .into_iter()
        .filter(|entry| entry.path != except && entry.path.is_dir())
        .map(|entry| RecentProject {
            name: entry
                .path
                .file_name()
                .map_or_else(|| "/".into(), |n| n.to_string_lossy().into_owned()),
            display: match &home {
                Some(home) if entry.path.starts_with(home) => {
                    format!("~/{}", entry.path.strip_prefix(home).unwrap().display())
                }
                _ => entry.path.display().to_string(),
            },
            path: entry.path.display().to_string(),
        })
        .collect()
}
