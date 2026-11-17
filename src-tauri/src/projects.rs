//! My projects (docs/UEBERSICHT.md, "Meine Projekte"): the projects one works on, in the order the
//! user keeps them, whether a window is open or not. The overview shows them; opening a project
//! window puts its project on the list. Kept in `~/.config/codedeck/projects.json`; later also the
//! star for today's list, the AI configuration and the mark of each project.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const FILE: &str = "projects.json";

/// One project on the list.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Listed {
    pub path: PathBuf,
    /// On today's list: ▶ starts its session (docs/SITZUNGEN.md A12)
    pub daily: bool,
    /// The AI configuration its sessions run with, e.g. `/home/me/.claude-private`
    pub account: Option<String>,
    /// Its mark: `{ kind: "icon" | "emoji" | "letter", value?, color? }` (docs/UEBERSICHT.md)
    pub mark: Option<serde_json::Value>,
}

fn file() -> Option<PathBuf> {
    crate::config::file(FILE)
}

/// The list, in its order; folders that are gone are left out (and stay in the file, a drive may
/// come back).
pub fn list() -> Vec<Listed> {
    file().map(|f| load(&f)).unwrap_or_default().into_iter().filter(|p| p.path.is_dir()).collect()
}

/// Puts a project at the end of the list; whether it was new.
pub fn add(root: &Path) -> bool {
    file().is_some_and(|f| add_in(&f, root))
}

/// Takes a project off the list. Nothing on disk changes; its sessions go on.
pub fn remove(root: &Path) -> Result<(), String> {
    remove_in(&file().ok_or("no config directory")?, root)
}

fn load(file: &Path) -> Vec<Listed> {
    std::fs::read(file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(file: &Path, list: &[Listed]) -> Result<(), String> {
    crate::config::write(file, &serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?)
}

fn add_in(file: &Path, root: &Path) -> bool {
    let mut list = load(file);
    if list.iter().any(|p| p.path == root) {
        return false;
    }
    list.push(Listed { path: root.to_path_buf(), ..Default::default() });
    save(file, &list).is_ok()
}

/// Changes one field of a project on the list: `daily` (bool), `account` (string or null),
/// `mark` (object or null).
pub fn set(root: &Path, field: &str, value: serde_json::Value) -> Result<(), String> {
    set_in(&file().ok_or("no config directory")?, root, field, value)
}

fn set_in(file: &Path, root: &Path, field: &str, value: serde_json::Value) -> Result<(), String> {
    let mut list = load(file);
    let project = list.iter_mut().find(|p| p.path == root).ok_or("not one of my projects")?;
    match field {
        "daily" => project.daily = value.as_bool().unwrap_or(false),
        "account" => project.account = value.as_str().map(String::from),
        "mark" => project.mark = (!value.is_null()).then_some(value),
        _ => return Err(format!("{field}: no such field")),
    }
    save(file, &list)
}

fn remove_in(file: &Path, root: &Path) -> Result<(), String> {
    let mut list = load(file);
    list.retain(|p| p.path != root);
    save(file, &list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_order_and_adds_once() {
        let dir = std::env::temp_dir().join(format!("codedeck-projects-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("projects.json");
        let (a, b) = (PathBuf::from("/p/a"), PathBuf::from("/p/b"));
        assert!(add_in(&file, &a));
        assert!(add_in(&file, &b));
        assert!(!add_in(&file, &a), "already there");
        assert_eq!(load(&file).iter().map(|p| p.path.clone()).collect::<Vec<_>>(), [a.clone(), b.clone()]);
        set_in(&file, &b, "daily", serde_json::json!(true)).unwrap();
        set_in(&file, &b, "account", serde_json::json!("/h/.claude-private")).unwrap();
        assert!(set_in(&file, &PathBuf::from("/p/x"), "daily", serde_json::json!(true)).is_err());
        remove_in(&file, &a).unwrap();
        assert_eq!(load(&file), [Listed { path: b, daily: true, account: Some("/h/.claude-private".into()), mark: None }]);
        // An older file without the new fields still reads
        std::fs::write(&file, r#"[{"path":"/p/c"}]"#).unwrap();
        assert_eq!(load(&file)[0].path, PathBuf::from("/p/c"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
