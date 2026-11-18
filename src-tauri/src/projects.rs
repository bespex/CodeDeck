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

/// The folders right inside `dir` that can be projects: no hidden ones (`.git`, `.cache`), sorted
/// by name, so they are taken into the list in the order one reads them.
pub fn subfolders(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let mut found: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    found.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
    Ok(found)
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

/// Puts the list in the order the user dragged it into. Projects `order` does not name (a folder
/// that is gone for now, so the overview never showed it) keep their order after the others.
pub fn reorder(order: &[PathBuf]) -> Result<(), String> {
    reorder_in(&file().ok_or("no config directory")?, order)
}

/// How the list can be sorted, once; from then on it is an order like any dragged one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SortBy {
    /// By path: the groups (the folders projects lie in) by name, in each the projects by name
    Name,
    /// By the name of the AI configuration, then by path; projects without one come last
    Account,
    /// Today's list to the top; everything else keeps its order
    Daily,
}

impl SortBy {
    pub fn of(word: &str) -> Option<SortBy> {
        match word {
            "name" => Some(SortBy::Name),
            "account" => Some(SortBy::Account),
            "daily" => Some(SortBy::Daily),
            _ => None,
        }
    }
}

/// Sorts the list once; `account_name` names an AI configuration by its folder.
pub fn sort(by: SortBy, account_name: &dyn Fn(&str) -> Option<String>) -> Result<(), String> {
    sort_in(&file().ok_or("no config directory")?, by, account_name)
}

fn reorder_in(file: &Path, order: &[PathBuf]) -> Result<(), String> {
    let mut list = load(file);
    let rank = |p: &Listed| order.iter().position(|o| *o == p.path).unwrap_or(usize::MAX);
    // Stable: the projects not named stay in their order
    list.sort_by_key(rank);
    save(file, &list)
}

fn sort_in(file: &Path, by: SortBy, account_name: &dyn Fn(&str) -> Option<String>) -> Result<(), String> {
    let mut list = load(file);
    // The path, not the folder's name: the overview groups projects by the folder they lie in, so the
    // groups come in the order of their names too, each with its projects by name
    let name = |p: &Listed| p.path.to_string_lossy().to_lowercase();
    let by_name = |a: &Listed, b: &Listed| name(a).cmp(&name(b)).then_with(|| a.path.cmp(&b.path));
    // `None` sorts first: without a configuration last, hence the flag in front
    let account = |p: &Listed| {
        let named = p.account.as_deref().map(|dir| account_name(dir).unwrap_or_else(|| dir.to_string()).to_lowercase());
        (named.is_none(), named)
    };
    match by {
        SortBy::Name => list.sort_by(by_name),
        SortBy::Account => list.sort_by(|a, b| account(a).cmp(&account(b)).then_with(|| by_name(a, b))),
        // Stable: within both groups the order stays
        SortBy::Daily => list.sort_by_key(|p| !p.daily),
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

    #[test]
    fn every_visible_folder_inside_can_be_a_project() {
        let dir = std::env::temp_dir().join(format!("codedeck-subfolders-{}", std::process::id()));
        for d in ["beta", "Alpha", ".hidden", "gamma/inner"] {
            std::fs::create_dir_all(dir.join(d)).unwrap();
        }
        std::fs::write(dir.join("notes.txt"), "a file, no project").unwrap();
        let names: Vec<String> = subfolders(&dir).unwrap().iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(names, ["Alpha", "beta", "gamma"], "only the first level, no hidden folder, no file");
        assert!(subfolders(&dir.join("missing")).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn takes_a_dragged_order_and_sorts_three_ways() {
        let dir = std::env::temp_dir().join(format!("codedeck-projects-order-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("projects.json");
        let paths = |file: &Path| load(file).iter().map(|p| p.path.display().to_string()).collect::<Vec<_>>();
        for p in ["/p/Zeta", "/p/alpha", "/q/alpha", "/p/gone", "/p/Mid"] {
            add_in(&file, Path::new(p));
        }
        set_in(&file, Path::new("/p/Mid"), "daily", serde_json::json!(true)).unwrap();
        // "/p/gone" is not shown, so not named: it goes after the others
        reorder_in(&file, &["/p/Mid", "/p/Zeta", "/q/alpha", "/p/alpha"].map(PathBuf::from)).unwrap();
        assert_eq!(paths(&file), ["/p/Mid", "/p/Zeta", "/q/alpha", "/p/alpha", "/p/gone"]);
        assert!(load(&file)[0].daily, "a project keeps its settings when it moves");
        let none = |_: &str| None;
        // By path: the folder first ("/p" before "/q"), then the name, case aside
        sort_in(&file, SortBy::Name, &none).unwrap();
        assert_eq!(paths(&file), ["/p/alpha", "/p/gone", "/p/Mid", "/p/Zeta", "/q/alpha"]);
        // Today's list to the top, the rest as it was
        set_in(&file, Path::new("/p/Zeta"), "daily", serde_json::json!(true)).unwrap();
        sort_in(&file, SortBy::Daily, &none).unwrap();
        assert_eq!(paths(&file), ["/p/Mid", "/p/Zeta", "/p/alpha", "/p/gone", "/q/alpha"]);
        // By the configuration's name ("Work" after "Private"), then by path; without one last
        set_in(&file, Path::new("/p/Zeta"), "account", serde_json::json!("/h/.claude-private")).unwrap();
        set_in(&file, Path::new("/q/alpha"), "account", serde_json::json!("/h/.claude")).unwrap();
        set_in(&file, Path::new("/p/gone"), "account", serde_json::json!("/h/.claude-private")).unwrap();
        let named = |dir: &str| Some(if dir.ends_with("private") { "Private" } else { "Work" }.to_string());
        sort_in(&file, SortBy::Account, &named).unwrap();
        assert_eq!(paths(&file), ["/p/gone", "/p/Zeta", "/q/alpha", "/p/alpha", "/p/Mid"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
