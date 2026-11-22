//! The scratch folder (D9, D12, D23): one folder in the project, `.scratch/`, for what sessions make
//! that is not part of the project yet: drafts, mock-ups, throwaway scripts, test data. Sessions are
//! told to put such things there (start rule); the Workbench view shows it with size and age,
//! opens, moves a file into the project, and clears away into the trash.
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
pub const DIR: &str = ".scratch";
/// The line in the exclude file.
const EXCLUDE: &str = ".scratch/";
/// The folder's name before D23, replaced where CodeDeck wrote it.
const OLD: &str = ".scratch/";
/// More is a sign of something else than drafts (say, a build into the folder).
const LISTED: usize = 1000;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkFile {
    /// Project-relative, beginning with `.scratch/`
    path: String,
    size: u64,
    /// Unix milliseconds of the last change
    modified: u64,
}

impl Git {
    /// Makes git leave the scratch folder alone in the repository the project belongs to, once:
    /// the line goes into the local exclude file and into the log as the command that would do it.
    pub fn exclude_scratch(&self, report: Report, project: &Project) {
        let Some(repo) = self.repos(project).into_iter().find(|r| r.path.is_empty()) else { return };
        let Ok(out) = self.run(report, &repo, &["rev-parse", "--git-path", "info/exclude"]) else { return };
        let file = repo.top.join(String::from_utf8_lossy(&out).trim());
        let text = std::fs::read_to_string(&file).unwrap_or_default();
        if excluded(&text) {
            return;
        }
        // The line for the folder's old name goes: nothing is there to ignore any more
        let text = without_old(&text);
        let shown = file.strip_prefix(&repo.top).map_or_else(|_| file.display().to_string(), |p| p.display().to_string());
        self.note_change(report, &repo, &format!("echo '{EXCLUDE}' >> {shown}"), append(&file, &text));
    }
}

/// The exclude file already names the folder (as CodeDeck writes it, or as one would by hand).
fn excluded(text: &str) -> bool {
    text.lines().map(str::trim).any(|l| matches!(l, ".scratch/" | ".scratch" | "/.scratch/" | "/.scratch" | "**/.scratch/"))
}

/// The exclude file without the line CodeDeck wrote for the old name (and its comment above it).
fn without_old(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut kept = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let next_is_old = lines.get(i + 1).is_some_and(|n| n.trim() == OLD);
        if line.trim() == OLD || (next_is_old && line.starts_with("# Drafts and scratch files")) {
            continue;
        }
        kept.push(*line);
    }
    let mut out = kept.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

fn append(file: &Path, text: &str) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let gap = if text.is_empty() || text.ends_with('\n') { "" } else { "\n" };
    let line = format!("{text}{gap}# Drafts and scratch files of AI sessions, shown by CodeDeck\n{EXCLUDE}\n");
    std::fs::write(file, line).map_err(|e| format!("{}: {e}", file.display()))
}

/// Every file in the scratch folder, newest first, and the folders in it (to be watched).
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
                // Prepared prompts are CodeDeck's own and listed in the Next prompt area
                if !crate::prompts::is_own(project, &entry.path()) {
                    todo.push(entry.path());
                }
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

/// A scratch file whose content lies in the project as well: taken over by copying, not moving.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Twin {
    /// The scratch file, beginning with `.scratch/`
    scratch: String,
    /// The file in the project with the same name and the same bytes
    project: String,
}

/// Folders not looked into for twins: what tools build or fetch, never a place one copies a draft to.
const NOT_SEARCHED: &[&str] = &[".git", DIR, "node_modules", "target", "dist", "build", ".venv", "venv", "__pycache__", ".gradle", ".idea", ".cache"];
/// Files looked at at most, and the largest compared byte for byte: tidying up must stay quick.
const TWIN_FILES: usize = 20_000;
const TWIN_BYTES: u64 = 20 * 1024 * 1024;

/// The scratch files that lie in the project as well, same name and same bytes: what is left of a
/// draft that was copied in. A help for tidying up (docs/DATEISPALTE.md, part A); without git, so
/// it also sees files not added yet.
pub fn twins(project: &Project, files: &[WorkFile]) -> Vec<Twin> {
    use std::collections::HashMap;
    let mut wanted: HashMap<String, Vec<&WorkFile>> = HashMap::new();
    for f in files.iter().filter(|f| f.size <= TWIN_BYTES) {
        if let Some(name) = f.path.rsplit('/').next() {
            wanted.entry(name.to_string()).or_default().push(f);
        }
    }
    let mut found = Vec::new();
    if wanted.is_empty() {
        return found;
    }
    let mut seen = 0;
    let mut todo = vec![project.root.clone()];
    while let Some(dir) = todo.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else { continue };
            if meta.is_dir() {
                if !NOT_SEARCHED.contains(&name.as_str()) {
                    todo.push(entry.path());
                }
                continue;
            }
            seen += 1;
            if seen > TWIN_FILES {
                return found;
            }
            let Some(candidates) = wanted.get(&name) else { continue };
            let mut bytes: Option<Vec<u8>> = None;
            for f in candidates.iter().filter(|f| f.size == meta.len()) {
                let mine = bytes.get_or_insert_with(|| std::fs::read(entry.path()).unwrap_or_default());
                if std::fs::read(project.root.join(&f.path)).is_ok_and(|other| &other == mine) {
                    if let Some(path) = project.relative(&entry.path()) {
                        found.push(Twin { scratch: f.path.clone(), project: path });
                    }
                }
            }
        }
    }
    found
}

/// A path that must lie in the scratch folder, as it is on disk.
fn in_scratch(project: &Project, path: &str) -> Result<PathBuf, String> {
    let full = project.resolve(path)?;
    if full.starts_with(project.root.join(DIR)) && full != project.root.join(DIR) {
        Ok(full)
    } else {
        Err(format!("{path}: not in {DIR}/"))
    }
}

/// Moves files of the scratch folder to the trash, where they can still be brought back.
pub fn trash(project: &Project, paths: &[String]) -> Result<(), String> {
    for path in paths {
        let full = in_scratch(project, path)?;
        gio::File::for_path(&full).trash(None::<&gio::Cancellable>).map_err(|e| format!("{path}: {e}"))?;
    }
    Ok(())
}

/// Moves a file of the scratch folder into the project, to `to` (project-relative, not taken yet,
/// outside the scratch folder); folders on the way are made. The new path.
pub fn move_into(project: &Project, from: &str, to: &str) -> Result<String, String> {
    let source = in_scratch(project, from)?;
    let target = project.root.join(checked(to)?);
    if target.starts_with(project.root.join(DIR)) {
        return Err(format!("{to}: that is the scratch folder itself"));
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
        let dir = std::env::temp_dir().join(format!("codedeck-scratch-{}-{}", std::process::id(), rand_part()));
        std::fs::create_dir_all(dir.join(DIR).join("sub")).unwrap();
        let root = dir.canonicalize().unwrap();
        (Project { root: root.clone() }, root)
    }

    fn rand_part() -> u128 {
        std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    }

    #[test]
    fn knows_the_exclude_line_and_adds_it_once() {
        assert!(excluded("# x\n.scratch/\n") && excluded("/.scratch") && !excluded("scratch/\n.scr"));
        // The old name's line, with CodeDeck's comment, goes; other lines stay
        let old = "*.log\n# Drafts and scratch files of AI sessions, shown by CodeDeck\n.scratch/\nbuild/\n";
        assert_eq!(without_old(old), "*.log\nbuild/\n");
        assert_eq!(without_old("*.log\n"), "*.log\n");
        let (_p, root) = project();
        let file = root.join("info/exclude");
        append(&file, "").unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(excluded(&text) && text.ends_with(".scratch/\n"));
        append(&file, "*.log").unwrap();
        assert!(std::fs::read_to_string(&file).unwrap().starts_with("*.log\n# Drafts"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn lists_moves_and_guards_the_paths() {
        let (p, root) = project();
        std::fs::write(root.join(".scratch/a.md"), "draft").unwrap();
        std::fs::write(root.join(".scratch/sub/b.csv"), "1,2").unwrap();
        // Prepared prompts are not listed here
        std::fs::create_dir_all(root.join(crate::prompts::DIR)).unwrap();
        std::fs::write(root.join(crate::prompts::DIR).join("p.md"), "x").unwrap();
        let (files, dirs) = list(&p);
        let mut paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, [".scratch/a.md", ".scratch/sub/b.csv"]);
        assert_eq!(dirs.len(), 2);

        assert_eq!(move_into(&p, ".scratch/a.md", "docs/a.md").unwrap(), "docs/a.md");
        assert!(root.join("docs/a.md").is_file() && !root.join(".scratch/a.md").exists());
        // Taken, outside, into the scratch folder, not from it
        std::fs::write(root.join(".scratch/c.md"), "x").unwrap();
        assert!(move_into(&p, ".scratch/c.md", "docs/a.md").unwrap_err().contains("already"));
        assert!(move_into(&p, ".scratch/c.md", "../c.md").is_err());
        assert!(move_into(&p, ".scratch/c.md", "/tmp/c.md").is_err());
        assert!(move_into(&p, ".scratch/c.md", ".scratch/d.md").is_err());
        assert!(move_into(&p, "docs/a.md", "a.md").unwrap_err().contains("not in"));
        assert!(trash(&p, &["docs/a.md".to_string()]).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn finds_scratch_files_that_lie_in_the_project_too() {
        let (p, root) = project();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::write(root.join(".scratch/plan.md"), "the plan").unwrap();
        std::fs::write(root.join(".scratch/sub/other.md"), "draft").unwrap();
        std::fs::write(root.join(".scratch/data.csv"), "1,2").unwrap();
        // Copied in unchanged; changed after copying; same bytes in a folder not searched
        std::fs::write(root.join("docs/plan.md"), "the plan").unwrap();
        std::fs::write(root.join("docs/other.md"), "draft, edited").unwrap();
        std::fs::write(root.join("node_modules/data.csv"), "1,2").unwrap();
        let (files, _) = list(&p);
        assert_eq!(twins(&p, &files), vec![Twin { scratch: ".scratch/plan.md".into(), project: "docs/plan.md".into() }]);
        let _ = std::fs::remove_dir_all(&root);
    }
}
