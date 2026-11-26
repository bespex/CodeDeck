//! The small handgrips on files and folders of the file list (docs/DATEISPALTE.md): rename in
//! place, a new file or folder, moved into another folder, into the trash. Never deleted for good, never outside the project,
//! never in `.git`. Git sees the outcome like any other change of the working folder.

use std::path::PathBuf;

use crate::project::Project;

/// A name for a file or folder: one part of a path, nothing that climbs or hides in `.git`.
fn name_ok(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err(format!("“{name}” is not a name for a file or folder"));
    }
    if name == ".git" {
        return Err(".git belongs to git".into());
    }
    Ok(())
}

/// A path of the project to change: inside it, not the project itself, not in `.git`.
fn changeable(project: &Project, path: &str) -> Result<PathBuf, String> {
    let full = project.resolve(path)?;
    if full == project.root {
        return Err("that is the project itself".into());
    }
    if full.strip_prefix(&project.root).is_ok_and(|rest| rest.components().next().is_some_and(|c| c.as_os_str() == ".git")) {
        return Err(format!("{path}: belongs to git"));
    }
    Ok(full)
}

/// Gives a file or folder a new name in the same folder; its new project-relative path.
pub fn rename(project: &Project, path: &str, name: &str) -> Result<String, String> {
    name_ok(name)?;
    let full = changeable(project, path)?;
    let target = full.parent().ok_or("no folder")?.join(name);
    if target.exists() {
        return Err(format!("{name}: there is one of that name already"));
    }
    std::fs::rename(&full, &target).map_err(|e| format!("{path}: {e}"))?;
    project.relative(&target).ok_or_else(|| "outside the project".into())
}

/// Makes an empty file or folder `name` in the folder `dir` (`""`: the project's top); its path.
pub fn create(project: &Project, dir: &str, name: &str, folder: bool) -> Result<String, String> {
    name_ok(name)?;
    let parent = if dir.is_empty() { project.root.clone() } else { changeable(project, dir)? };
    if !parent.is_dir() {
        return Err(format!("{dir}: not a folder"));
    }
    let target = parent.join(name);
    if target.exists() {
        return Err(format!("{name}: there is one of that name already"));
    }
    let made = if folder { std::fs::create_dir(&target) } else { std::fs::OpenOptions::new().write(true).create_new(true).open(&target).map(|_| ()) };
    made.map_err(|e| format!("{name}: {e}"))?;
    project.relative(&target).ok_or_else(|| "outside the project".into())
}

/// Moves files and folders into the folder `dir` (`""`: the project's top), keeping their names;
/// their new paths. Everything is checked before the first one moves, so a refusal moves nothing.
pub fn move_into(project: &Project, paths: &[String], dir: &str) -> Result<Vec<String>, String> {
    let target = if dir.is_empty() { project.root.clone() } else { changeable(project, dir)? };
    if !target.is_dir() {
        return Err(format!("{dir}: not a folder"));
    }
    let mut moves = Vec::new();
    for path in paths {
        let full = changeable(project, path)?;
        // A folder cannot go into itself or into one of its own folders
        if target.starts_with(&full) {
            return Err(format!("{path}: cannot go into itself"));
        }
        let name = full.file_name().ok_or("no name")?;
        let to = target.join(name);
        if to == full {
            continue;
        }
        if to.exists() || moves.iter().any(|(_, t)| t == &to) {
            return Err(format!("{}: there is one of that name already", name.to_string_lossy()));
        }
        moves.push((full, to));
    }
    let mut moved = Vec::new();
    for (from, to) in moves {
        std::fs::rename(&from, &to).map_err(|e| format!("{}: {e}", from.display()))?;
        moved.push(project.relative(&to).ok_or("outside the project")?);
    }
    Ok(moved)
}

/// Moves files and folders of the project to the trash, where they can still be brought back.
pub fn trash(project: &Project, paths: &[String]) -> Result<(), String> {
    use gio::prelude::*;
    for path in paths {
        let full = changeable(project, path)?;
        gio::File::for_path(&full).trash(None::<&gio::Cancellable>).map_err(|e| format!("{path}: {e}"))?;
    }
    Ok(())
}

/// Folders not walked when listing the project for the search: what tools build or fetch.
const NOT_LISTED: &[&str] = &[".git", "node_modules", "target", "dist", "build", ".venv", "venv", "__pycache__", ".gradle", ".idea", ".cache"];
/// At most this many files: the search must answer at once.
const LISTED_FILES: usize = 50_000;

/// Every file of the project, project-relative, for the search over the whole project (the tree's
/// filter only sees opened folders). Without git, so new files are found too; the scratch folder
/// is in (it can be hidden like anything else).
pub fn all_files(project: &Project) -> Vec<String> {
    let mut found = Vec::new();
    let mut todo = vec![project.root.clone()];
    while let Some(dir) = todo.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else { continue };
            if meta.is_dir() {
                if !NOT_LISTED.contains(&name.as_str()) {
                    todo.push(entry.path());
                }
            } else if let Some(path) = project.relative(&entry.path()) {
                found.push(path);
                if found.len() >= LISTED_FILES {
                    return found;
                }
            }
        }
    }
    found.sort();
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (Project, PathBuf) {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("codedeck-fileops-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(dir.join(".git")).unwrap();
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(dir.join("src/a.rs"), "a").unwrap();
        let root = dir.canonicalize().unwrap();
        (Project { root: root.clone() }, root)
    }

    #[test]
    fn renames_and_creates_inside_the_project_only() {
        let (p, root) = project();
        assert_eq!(rename(&p, "src/a.rs", "b.rs").unwrap(), "src/b.rs");
        assert!(root.join("src/b.rs").is_file() && !root.join("src/a.rs").exists());
        assert!(rename(&p, "src/b.rs", "../b.rs").is_err());
        assert!(rename(&p, "src/b.rs", ".git").is_err());
        assert!(rename(&p, ".git", "git").is_err());
        assert!(rename(&p, "", "x").is_err());
        assert_eq!(create(&p, "src", "new.rs", false).unwrap(), "src/new.rs");
        assert_eq!(create(&p, "", "docs", true).unwrap(), "docs");
        assert!(root.join("docs").is_dir());
        assert!(create(&p, "src", "new.rs", false).unwrap_err().contains("already"));
        assert!(rename(&p, "src/new.rs", "b.rs").unwrap_err().contains("already"));
        assert!(trash(&p, &[".git".into()]).is_err());
        assert!(trash(&p, &["../x".into()]).is_err());
        std::fs::create_dir_all(root.join("node_modules/x")).unwrap();
        std::fs::write(root.join("node_modules/x/i.js"), "").unwrap();
        std::fs::write(root.join(".git/HEAD"), "").unwrap();
        assert_eq!(all_files(&p), ["src/b.rs", "src/new.rs"]);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn moves_into_a_folder_of_the_project_or_nothing() {
        let (p, root) = project();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("src/b.rs"), "b").unwrap();
        assert_eq!(move_into(&p, &["src/b.rs".into()], "docs").unwrap(), vec!["docs/b.rs".to_string()]);
        assert!(root.join("docs/b.rs").is_file() && !root.join("src/b.rs").exists());
        assert_eq!(move_into(&p, &["docs".into()], "").unwrap(), Vec::<String>::new());
        assert!(move_into(&p, &["docs".into()], "docs").unwrap_err().contains("itself"));
        assert!(move_into(&p, &["src".into()], "src/a.rs").unwrap_err().contains("not a folder"));
        std::fs::write(root.join("b.rs"), "").unwrap();
        assert!(move_into(&p, &["src/a.rs".into(), "docs/b.rs".into()], "").unwrap_err().contains("already"));
        assert!(root.join("src/a.rs").is_file(), "a refusal moves nothing");
        assert!(move_into(&p, &[".git".into()], "src").is_err());
        assert!(move_into(&p, &["src/a.rs".into()], ".git").is_err());
        assert!(move_into(&p, &["../x".into()], "src").is_err());
        assert_eq!(move_into(&p, &["src/a.rs".into(), "docs/b.rs".into()], "src").unwrap(), vec!["src/b.rs".to_string()]);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
