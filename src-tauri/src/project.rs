//! The open project: one directory. All paths that cross the IPC boundary are relative to its
//! root and use `/` as separator; nothing outside the root can be read.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Never listed and never counted: Git's own bookkeeping.
const HIDDEN: &[&str] = &[".git"];

/// Upper bound for walking a folder when estimating its size.
const STATS_FILE_LIMIT: u32 = 5000;

pub struct Project {
    pub root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    name: String,
    /// Absolute path of the root
    path: String,
    /// For display, with the home directory shortened to `~`
    root: String,
    /// The display path cut into its folders, each with the absolute path it stands for
    crumbs: Vec<Crumb>,
}

#[derive(Serialize)]
pub struct Crumb {
    label: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(Serialize, Default)]
pub struct PathStats {
    files: u32,
    bytes: u64,
    /// The walk stopped at the file limit; the numbers are a lower bound
    truncated: bool,
}

impl Project {
    /// The directory given as first argument, else the current directory.
    pub fn from_args() -> Result<Self, String> {
        match std::env::args_os().nth(1) {
            Some(arg) => Self::open(Path::new(&arg)),
            None => Self::open(&default_dir()?),
        }
    }

    /// The given directory as project; a relative path counts from the current directory.
    pub fn open(dir: &Path) -> Result<Self, String> {
        let root = dir
            .canonicalize()
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        if !root.is_dir() {
            return Err(format!("{}: not a directory", root.display()));
        }
        Ok(Self { root })
    }

    /// Absolute path for a project-relative one; fails if it leads out of the project.
    pub fn resolve(&self, relative: &str) -> Result<PathBuf, String> {
        let path = self
            .root
            .join(relative)
            .canonicalize()
            .map_err(|e| format!("{relative}: {e}"))?;
        if path.starts_with(&self.root) {
            Ok(path)
        } else {
            Err(format!("{relative}: outside the project"))
        }
    }

    /// Project-relative form of an absolute path, `""` for the root itself.
    pub fn relative(&self, path: &Path) -> Option<String> {
        let rest = path.strip_prefix(&self.root).ok()?;
        Some(
            rest.components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/"),
        )
    }

    pub fn info(&self) -> ProjectInfo {
        let name = self
            .root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "/".into());
        // Below the home directory the path starts at `~`, everything else at `/`
        let home = std::env::var_os("HOME").map(PathBuf::from).filter(|h| self.root.starts_with(h));
        let base = home.clone().unwrap_or_else(|| PathBuf::from("/"));
        let mut crumbs = vec![Crumb {
            label: if home.is_some() { "~".into() } else { "/".into() },
            path: base.display().to_string(),
        }];
        let mut path = base.clone();
        for part in self.root.strip_prefix(&base).unwrap_or(Path::new("")).components() {
            path.push(part);
            crumbs.push(Crumb {
                label: part.as_os_str().to_string_lossy().into_owned(),
                path: path.display().to_string(),
            });
        }
        let root = match &home {
            Some(home) if &self.root == home => "~".into(),
            Some(home) => format!("~/{}", self.root.strip_prefix(home).unwrap().display()),
            None => self.root.display().to_string(),
        };
        ProjectInfo {
            name,
            path: self.root.display().to_string(),
            root,
            crumbs,
        }
    }

    /// One level of the tree: folders first, then files, each sorted without regard to case.
    pub fn read_dir(&self, relative: &str) -> Result<Vec<Entry>, String> {
        let dir = self.resolve(relative)?;
        let mut entries: Vec<Entry> = fs::read_dir(&dir)
            .map_err(|e| format!("{relative}: {e}"))?
            .flatten()
            .filter_map(|item| {
                let name = item.file_name().to_string_lossy().into_owned();
                if HIDDEN.contains(&name.as_str()) {
                    return None;
                }
                // Follows symlinks; a dangling link is listed as an empty file
                let meta = fs::metadata(item.path()).ok();
                let is_dir = meta.as_ref().is_some_and(|m| m.is_dir());
                Some(Entry {
                    path: if relative.is_empty() { name.clone() } else { format!("{relative}/{name}") },
                    name,
                    is_dir,
                    size: meta.filter(|_| !is_dir).map_or(0, |m| m.len()),
                })
            })
            .collect();
        entries.sort_by_cached_key(|e| (!e.is_dir, e.name.to_lowercase()));
        Ok(entries)
    }

    /// File count and total size below a path, for the context's token estimate.
    pub fn stats(&self, relative: &str) -> Result<PathStats, String> {
        let mut stats = PathStats::default();
        let mut pending = vec![self.resolve(relative)?];
        while let Some(path) = pending.pop() {
            // symlink_metadata: links are not followed, so the walk cannot loop or leave the project
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            if meta.is_file() {
                if stats.files == STATS_FILE_LIMIT {
                    stats.truncated = true;
                    break;
                }
                stats.files += 1;
                stats.bytes += meta.len();
            } else if meta.is_dir() {
                let Ok(children) = fs::read_dir(&path) else { continue };
                pending.extend(
                    children
                        .flatten()
                        .filter(|c| !HIDDEN.iter().any(|h| c.file_name() == *h))
                        .map(|c| c.path()),
                );
            }
        }
        Ok(stats)
    }
}

fn default_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    // `tauri dev` starts the binary inside src-tauri; open the repository instead.
    #[cfg(debug_assertions)]
    if cwd.ends_with("src-tauri") {
        if let Some(parent) = cwd.parent() {
            return Ok(parent.to_path_buf());
        }
    }
    Ok(cwd)
}
