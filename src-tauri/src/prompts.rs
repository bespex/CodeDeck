//! Prepared prompts: named prompts the user writes over time in CodeDeck, without the risk of sending
//! them too early (in the tool, Enter sends). One Markdown file each in `.scratch/prompts/`, managed by
//! CodeDeck alone: the Workbench's scratch tile leaves the folder out, the Next prompt area lists it.
//! The file name is the prompt's name, so a prompt can also be opened in one's own editor.
//! Handing a prompt to a session is copy and paste for now (docs/PLAN.md, "Prompts vorbereiten").

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use gio::prelude::*;
use serde::Serialize;

use crate::project::Project;

/// The folder, project-relative.
pub const DIR: &str = ".scratch/prompts";
const EXT: &str = "md";
/// Longest name kept: a prompt is named, not described.
const NAME_CHARS: usize = 80;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    /// The file name without `.md`
    name: String,
    /// Project-relative
    path: String,
    size: u64,
    /// Unix milliseconds of the last change
    modified: u64,
}

fn folder(project: &Project) -> PathBuf {
    project.root.join(DIR)
}

/// The prepared prompts, last changed first, and the folder to watch: the prompts' own, else the
/// nearest one above it that is there, so that the folder's making is seen. A prompt laid into a new
/// `.scratch/prompts/` from outside (by a session, another program) did not show (user, 2026-11-23).
pub fn list(project: &Project) -> (Vec<Prompt>, Option<PathBuf>) {
    let dir = folder(project);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        let above = dir.ancestors().skip(1).take_while(|d| d.starts_with(&project.root)).find(|d| d.is_dir());
        return (Vec::new(), above.map(PathBuf::from));
    };
    let mut found: Vec<Prompt> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            // Links are not followed: they may point anywhere
            let meta = std::fs::symlink_metadata(&path).ok().filter(|m| m.is_file())?;
            if path.extension()? != EXT {
                return None;
            }
            let name = path.file_stem()?.to_str()?.to_string();
            let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64);
            Some(Prompt { path: format!("{DIR}/{name}.{EXT}"), name, size: meta.len(), modified })
        })
        .collect();
    found.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
    (found, Some(dir))
}

/// A name as it may become a file name: one plain name, no folder, not hidden.
fn checked(name: &str) -> Result<String, String> {
    let name = name.trim();
    let name = name.strip_suffix(".md").unwrap_or(name).trim();
    if name.is_empty() {
        return Err("give the prompt a name".into());
    }
    if name.starts_with('.') || name.contains(['/', '\\', '\0']) || name.chars().any(char::is_control) {
        return Err(format!("{name}: a name without / and not starting with a dot"));
    }
    Ok(name.chars().take(NAME_CHARS).collect::<String>().trim_end().to_string())
}

fn file(project: &Project, name: &str) -> Result<PathBuf, String> {
    Ok(folder(project).join(format!("{}.{EXT}", checked(name)?)))
}

/// A prompt's text.
pub fn read(project: &Project, name: &str) -> Result<String, String> {
    let path = file(project, name)?;
    std::fs::read_to_string(&path).map_err(|e| format!("{name}: {e}"))
}

/// Writes a prompt's text, whole or not at all: a crash while saving leaves the last version.
pub fn write(project: &Project, name: &str, text: &str) -> Result<(), String> {
    let path = file(project, name)?;
    std::fs::create_dir_all(folder(project)).map_err(|e| format!("{DIR}: {e}"))?;
    let temp = path.with_extension("md.saving");
    std::fs::write(&temp, text).map_err(|e| format!("{name}: {e}"))?;
    std::fs::rename(&temp, &path).map_err(|e| format!("{name}: {e}"))
}

/// The name itself if free, else the first free of "name 2", "name 3", …
fn free(project: &Project, name: &str) -> Result<String, String> {
    let name = checked(name)?;
    let taken = |n: &str| folder(project).join(format!("{n}.{EXT}")).symlink_metadata().is_ok();
    if !taken(&name) {
        return Ok(name);
    }
    (2..1000).map(|i| format!("{name} {i}")).find(|n| !taken(n)).ok_or_else(|| format!("{name}: too many of that name"))
}

/// A new, empty prompt; its name (made unique).
pub fn create(project: &Project, name: &str) -> Result<String, String> {
    let name = free(project, name)?;
    write(project, &name, "")?;
    Ok(name)
}

/// Gives a prompt another name; the new name. A name that is taken is refused, not overwritten.
pub fn rename(project: &Project, from: &str, to: &str) -> Result<String, String> {
    let source = file(project, from)?;
    let to = checked(to)?;
    let target = file(project, &to)?;
    if target == source {
        return Ok(to);
    }
    // Only the case changes: on a file system that ignores it the target "exists" as the source
    let same_file = to.to_lowercase() == checked(from)?.to_lowercase();
    if target.symlink_metadata().is_ok() && !same_file {
        return Err(format!("{to}: there is a prompt of that name"));
    }
    std::fs::rename(&source, &target).map_err(|e| format!("{from} → {to}: {e}"))?;
    Ok(to)
}

/// Moves a prompt to the trash, where it can still be brought back.
pub fn trash(project: &Project, name: &str) -> Result<(), String> {
    let path = file(project, name)?;
    gio::File::for_path(&path).trash(None::<&gio::Cancellable>).map_err(|e| format!("{name}: {e}"))
}

/// The folder is CodeDeck's own: the scratch folder's list leaves it out.
pub fn is_own(project: &Project, path: &Path) -> bool {
    path.starts_with(folder(project))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (Project, PathBuf) {
        let nanos = std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("codedeck-prompts-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let root = dir.canonicalize().unwrap();
        (Project { root: root.clone() }, root)
    }

    #[test]
    fn creates_writes_renames_and_lists() {
        let (p, root) = project();
        // No folder yet: the nearest one above is watched, so that its making is seen
        assert!(list(&p).0.is_empty());
        assert_eq!(list(&p).1.as_deref(), Some(root.as_path()));
        std::fs::create_dir(root.join(".scratch")).unwrap();
        assert_eq!(list(&p).1, Some(root.join(".scratch")));
        assert_eq!(create(&p, "Refactoring bridge").unwrap(), "Refactoring bridge");
        // A taken name gets a number; ".md" typed along is not doubled
        assert_eq!(create(&p, "Refactoring bridge.md").unwrap(), "Refactoring bridge 2");
        write(&p, "Refactoring bridge", "## Goal\n- split take_in\n").unwrap();
        assert_eq!(read(&p, "Refactoring bridge").unwrap(), "## Goal\n- split take_in\n");
        assert!(!root.join(DIR).join("Refactoring bridge.md.saving").exists());

        assert!(rename(&p, "Refactoring bridge 2", "Refactoring bridge").unwrap_err().contains("there is"));
        assert_eq!(rename(&p, "Refactoring bridge 2", "Tests").unwrap(), "Tests");
        assert_eq!(rename(&p, "Tests", "tests").unwrap(), "tests");
        // Other files in the folder are not prompts
        std::fs::write(root.join(DIR).join("notes.txt"), "x").unwrap();
        let mut names: Vec<String> = list(&p).0.into_iter().map(|f| f.name).collect();
        names.sort();
        assert_eq!(names, ["Refactoring bridge", "tests"]);
        assert!(is_own(&p, &root.join(DIR).join("tests.md")) && !is_own(&p, &root.join(".scratch/a.md")));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_names_that_leave_the_folder() {
        let (p, root) = project();
        for bad in ["", "  ", "../x", "a/b", ".hidden", "a\\b", "line\nbreak"] {
            assert!(create(&p, bad).is_err(), "{bad:?}");
        }
        assert!(read(&p, "../../etc/passwd").is_err());
        assert_eq!(checked(&"x".repeat(200)).unwrap().len(), NAME_CHARS);
        let _ = std::fs::remove_dir_all(&root);
    }
}
