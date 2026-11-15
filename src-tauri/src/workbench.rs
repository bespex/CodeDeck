//! The workbench (D9, D12): one folder in the project, `.workbench/`, for what sessions make that is
//! not part of the project yet: drafts, mock-ups, throwaway scripts, test data. Sessions are told
//! to put such things there (start rule); CodeDeck shows it with size and age, opens, moves a file
//! into the project, and clears away into the trash.
//!
//! Git leaves it alone through one line in the repository's local exclude file (never `.gitignore`,
//! which belongs to the project and is shared). Without a leading slash the line holds at any
//! depth, so also when the project is a folder inside its repository, and for every worktree,
//! since they share that file. Then the diffs, the marker scan and `git status` skip it by
//! themselves. Snapshots do not contain it and going back leaves it alone, so deleting goes to the
//! trash: nothing else would bring a draft back.

use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use gio::prelude::*;
use serde::Serialize;

use crate::git::{Git, Report};
use crate::project::Project;

/// The folder, project-relative.
pub const DIR: &str = ".workbench";
/// The line in the exclude file.
const EXCLUDE: &str = ".workbench/";
/// More is a sign of something else than drafts (say, a build into the folder).
const LISTED: usize = 1000;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkFile {
    /// Project-relative, beginning with `.workbench/`
    path: String,
    size: u64,
    /// Unix milliseconds of the last change
    modified: u64,
}

impl Git {
    /// Makes git leave the workbench alone in the repository the project belongs to, once: the
    /// line goes into the local exclude file and into the log as the command that would do it.
    pub fn exclude_workbench(&self, report: Report, project: &Project) {
        let Some(repo) = self.repos(project).into_iter().find(|r| r.path.is_empty()) else { return };
        let Ok(out) = self.run(report, &repo, &["rev-parse", "--git-path", "info/exclude"]) else { return };
        let file = repo.top.join(String::from_utf8_lossy(&out).trim());
        let text = std::fs::read_to_string(&file).unwrap_or_default();
        if excluded(&text) {
            return;
        }
        let shown = file.strip_prefix(&repo.top).map_or_else(|_| file.display().to_string(), |p| p.display().to_string());
        self.note_change(report, &repo, &format!("echo '{EXCLUDE}' >> {shown}"), append(&file, &text));
    }
}

/// The exclude file already names the folder (as CodeDeck writes it, or as one would by hand).
fn excluded(text: &str) -> bool {
    text.lines().map(str::trim).any(|l| matches!(l, ".workbench/" | ".workbench" | "/.workbench/" | "/.workbench" | "**/.workbench/"))
}

fn append(file: &Path, text: &str) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let gap = if text.is_empty() || text.ends_with('\n') { "" } else { "\n" };
    let line = format!("{text}{gap}# Drafts and scratch files of AI sessions, shown by CodeDeck\n{EXCLUDE}\n");
    std::fs::write(file, line).map_err(|e| format!("{}: {e}", file.display()))
}

/// Every file in the workbench, newest first, and the folders in it (to be watched).
pub fn list(project: &Project) -> (Vec<WorkFile>, Vec<PathBuf>) {
    let top = project.root.join(DIR);
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    let mut todo = vec![top.clone()];
    while let Some(dir) = todo.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        dirs.push(dir);
        for entry in entries.flatten() {
            // Links are not followed: they may point anywhere
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else { continue };
            if meta.is_dir() {
                todo.push(entry.path());
            } else if meta.is_file() && files.len() < LISTED {
                let Some(path) = project.relative(&entry.path()) else { continue };
                let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64);
                files.push(WorkFile { path, size: meta.len(), modified });
            }
        }
    }
    files.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.path.cmp(&b.path)));
    (files, dirs)
}

/// A path that must lie in the workbench, as it is on disk.
fn in_workbench(project: &Project, path: &str) -> Result<PathBuf, String> {
    let full = project.resolve(path)?;
    if full.starts_with(project.root.join(DIR)) && full != project.root.join(DIR) {
        Ok(full)
    } else {
        Err(format!("{path}: not in {DIR}/"))
    }
}

/// Moves files of the workbench to the trash, where they can still be brought back.
pub fn trash(project: &Project, paths: &[String]) -> Result<(), String> {
    for path in paths {
        let full = in_workbench(project, path)?;
        gio::File::for_path(&full).trash(None::<&gio::Cancellable>).map_err(|e| format!("{path}: {e}"))?;
    }
    Ok(())
}

/// Moves a file of the workbench into the project, to `to` (project-relative, not taken yet,
/// outside the workbench); folders on the way are made. The new path.
pub fn move_into(project: &Project, from: &str, to: &str) -> Result<String, String> {
    let source = in_workbench(project, from)?;
    let target = project.root.join(checked(to)?);
    if target.starts_with(project.root.join(DIR)) {
        return Err(format!("{to}: that is the workbench itself"));
    }
    if target.symlink_metadata().is_ok() {
        return Err(format!("{to}: already there"));
    }
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        // A folder on the way that is a link could lead out of the project
        let real = dir.canonicalize().map_err(|e| e.to_string())?;
        if !real.starts_with(&project.root) {
            return Err(format!("{to}: outside the project"));
        }
    }
    std::fs::rename(&source, &target).map_err(|e| format!("{from} → {to}: {e}"))?;
    Ok(project.relative(&target).unwrap_or_else(|| to.to_string()))
}

/// A project-relative path without tricks: no root, no `..`, not empty.
fn checked(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path.trim().trim_start_matches("./"));
    let plain = p.components().all(|c| matches!(c, Component::Normal(_)));
    if path.trim().is_empty() || !plain {
        return Err(format!("{path}: give a path inside the project, like docs/notes.md"));
    }
    Ok(p.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (Project, PathBuf) {
        let dir = std::env::temp_dir().join(format!("codedeck-workbench-{}-{}", std::process::id(), rand_part()));
        std::fs::create_dir_all(dir.join(DIR).join("sub")).unwrap();
        let root = dir.canonicalize().unwrap();
        (Project { root: root.clone() }, root)
    }

    fn rand_part() -> u128 {
        std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    }

    #[test]
    fn knows_the_exclude_line_and_adds_it_once() {
        assert!(excluded("# x\n.workbench/\n") && excluded("/.workbench") && !excluded("workbench/\n.work"));
        let (_p, root) = project();
        let file = root.join("info/exclude");
        append(&file, "").unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(excluded(&text) && text.ends_with(".workbench/\n"));
        append(&file, "*.log").unwrap();
        assert!(std::fs::read_to_string(&file).unwrap().starts_with("*.log\n# Drafts"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_moves_and_guards_the_paths() {
        let (p, root) = project();
        std::fs::write(root.join(".workbench/a.md"), "draft").unwrap();
        std::fs::write(root.join(".workbench/sub/b.csv"), "1,2").unwrap();
        let (files, dirs) = list(&p);
        let mut paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, [".workbench/a.md", ".workbench/sub/b.csv"]);
        assert_eq!(dirs.len(), 2);

        assert_eq!(move_into(&p, ".workbench/a.md", "docs/a.md").unwrap(), "docs/a.md");
        assert!(root.join("docs/a.md").is_file() && !root.join(".workbench/a.md").exists());
        // Taken, outside, into the workbench, not from it
        std::fs::write(root.join(".workbench/c.md"), "x").unwrap();
        assert!(move_into(&p, ".workbench/c.md", "docs/a.md").unwrap_err().contains("already"));
        assert!(move_into(&p, ".workbench/c.md", "../c.md").is_err());
        assert!(move_into(&p, ".workbench/c.md", "/tmp/c.md").is_err());
        assert!(move_into(&p, ".workbench/c.md", ".workbench/d.md").is_err());
        assert!(move_into(&p, "docs/a.md", "a.md").unwrap_err().contains("not in"));
        assert!(trash(&p, &["docs/a.md".to_string()]).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }
}
