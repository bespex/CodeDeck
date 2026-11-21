//! What the user marked in a project's file list (docs/DATEISPALTE.md): files and folders hidden
//! ("Ausblenden": shown faded or not at all, nothing to do with git's ignore) and those marked
//! important (their name stands out in a colour). Kept per project in
//! `~/.config/codedeck/files.json`, so it works for every folder opened, on the project list or not,
//! and never writes into the project itself.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// The marks of one project: project-relative paths.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileMarks {
    #[serde(default)]
    pub hidden: Vec<String>,
    /// Hidden by default and shown again by the user (e.g. the scratch folder)
    #[serde(default)]
    pub shown: Vec<String>,
    #[serde(default)]
    pub important: Vec<String>,
}

type All = BTreeMap<String, FileMarks>;

fn load_from(file: &Path) -> All {
    std::fs::read(file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// The marks of the project at `root`.
pub fn of(root: &Path) -> FileMarks {
    crate::config::file("files.json").map(|f| of_in(&f, root)).unwrap_or_default()
}

fn of_in(file: &Path, root: &Path) -> FileMarks {
    load_from(file).remove(&root.display().to_string()).unwrap_or_default()
}

/// Puts `path` into the list `kind` (`hidden`, `shown`, `important`) or takes it out; the marks
/// afterwards. Hiding a path takes it off `shown` and the other way round.
pub fn set(root: &Path, kind: &str, path: &str, on: bool) -> Result<FileMarks, String> {
    set_in(&crate::config::file("files.json").ok_or("no config directory")?, root, kind, path, on)
}

fn set_in(file: &Path, root: &Path, kind: &str, path: &str, on: bool) -> Result<FileMarks, String> {
    if path.starts_with('/') || path.split('/').any(|p| p == "..") {
        return Err(format!("{path}: not a path in the project"));
    }
    let mut all = load_from(file);
    let key = root.display().to_string();
    let marks = all.entry(key.clone()).or_default();
    let (list, other) = match kind {
        "hidden" => (&mut marks.hidden, Some(&mut marks.shown)),
        "shown" => (&mut marks.shown, Some(&mut marks.hidden)),
        "important" => (&mut marks.important, None),
        _ => return Err(format!("{kind}: no such mark")),
    };
    list.retain(|p| p != path);
    if on {
        list.push(path.to_string());
        list.sort();
    }
    if let Some(other) = other {
        other.retain(|p| p != path);
    }
    let result = marks.clone();
    if result == FileMarks::default() {
        all.remove(&key);
    }
    let bytes = serde_json::to_vec_pretty(&all).map_err(|e| e.to_string())?;
    crate::config::write(file, &bytes)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_marks_per_project_and_hiding_undoes_showing() {
        let file = std::env::temp_dir().join(format!("codedeck-files-{}.json", std::process::id()));
        let (a, b) = (Path::new("/p/a"), Path::new("/p/b"));
        set_in(&file, a, "shown", ".scratch", true).unwrap();
        set_in(&file, a, "important", "docs", true).unwrap();
        let marks = set_in(&file, a, "hidden", ".scratch", true).unwrap();
        assert_eq!(marks, FileMarks { hidden: vec![".scratch".into()], shown: vec![], important: vec!["docs".into()] });
        assert_eq!(of_in(&file, b), FileMarks::default());
        assert!(set_in(&file, a, "hidden", "../x", true).is_err());
        assert!(set_in(&file, a, "colour", "x", true).is_err());
        set_in(&file, a, "hidden", ".scratch", false).unwrap();
        set_in(&file, a, "important", "docs", false).unwrap();
        // Nothing left: the project goes from the file
        assert!(!std::fs::read_to_string(&file).unwrap().contains("/p/a"));
        let _ = std::fs::remove_file(&file);
    }
}
