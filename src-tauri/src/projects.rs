//! My projects (docs/UEBERSICHT.md, "Meine Projekte"): the projects one works on, in the order the
//! user keeps them, whether a window is open or not. The overview shows them; opening a project
//! window puts its project on the list. Kept in `~/.config/codedeck/projects.json`; later also the
//! star for today's list, the AI configuration and the mark of each project.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const FILE: &str = "projects.json";

/// One project on the list.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Listed {
    pub path: PathBuf,
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
    list.push(Listed { path: root.to_path_buf() });
    save(file, &list).is_ok()
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
        remove_in(&file, &a).unwrap();
        assert_eq!(load(&file), [Listed { path: b }]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
