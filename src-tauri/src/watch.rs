//! File watching, kept small on purpose: only directories the file list has opened are watched,
//! each one non-recursively. A large `target` or `node_modules` costs nothing until it is opened.

use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::Current;

/// Event sent to the frontend after changes on disk.
pub const FS_CHANGED: &str = "fs_changed";

/// Event sent after changes inside a `.git` directory (index, HEAD, branches); no payload.
pub const GIT_CHANGED: &str = "git_changed";

/// Changes arriving within this window are sent as one event.
const QUIET: Duration = Duration::from_millis(150);

/// Payload of [`FS_CHANGED`]; all paths are project-relative.
#[derive(Serialize, Clone)]
struct FsChange {
    /// Directories whose listing may have changed
    dirs: BTreeSet<String>,
    /// The files and folders that were created, changed or removed
    paths: BTreeSet<String>,
}

pub struct Watch {
    watcher: Mutex<RecommendedWatcher>,
    watched: Mutex<HashSet<PathBuf>>,
}

impl Watch {
    pub fn start(app: AppHandle, current: Arc<Current>) -> notify::Result<Self> {
        let (tx, rx) = mpsc::channel::<Event>();
        let watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            if let Ok(event) = result {
                if !matches!(event.kind, EventKind::Access(_)) {
                    let _ = tx.send(event);
                }
            }
        })?;

        std::thread::spawn(move || {
            // Blocks until the first change, then gathers what follows closely
            while let Ok(first) = rx.recv() {
                // Read once per batch: after a switch, paths of the old project are outside the
                // new root and drop out here
                let project = current.get();
                let mut change = FsChange { dirs: BTreeSet::new(), paths: BTreeSet::new() };
                let mut git = false;
                let mut add = |event: Event| {
                    for path in &event.paths {
                        // Git's own files are no change to the tree, but to the repo state
                        if path.components().any(|c| c.as_os_str() == ".git") {
                            git = true;
                            continue;
                        }
                        let (Some(rel), Some(dir)) = (
                            project.relative(path),
                            path.parent().and_then(|p| project.relative(p)),
                        ) else {
                            continue;
                        };
                        change.paths.insert(rel);
                        change.dirs.insert(dir);
                    }
                };
                add(first);
                while let Ok(next) = rx.recv_timeout(QUIET) {
                    add(next);
                }
                if !change.paths.is_empty() {
                    let _ = app.emit(FS_CHANGED, change);
                }
                if git {
                    let _ = app.emit(GIT_CHANGED, ());
                }
            }
        });

        Ok(Self { watcher: Mutex::new(watcher), watched: Mutex::new(HashSet::new()) })
    }

    /// Start watching a directory; a no-op if it is watched already.
    pub fn add(&self, dir: &Path) {
        let mut watched = self.watched.lock().unwrap();
        if watched.contains(dir) {
            return;
        }
        // A failure (watch limit reached, directory just removed) only means no live updates
        if self.watcher.lock().unwrap().watch(dir, RecursiveMode::NonRecursive).is_ok() {
            watched.insert(dir.to_path_buf());
        }
    }

    /// Stop watching everything, for a switch to another project.
    pub fn clear(&self) {
        let mut watched = self.watched.lock().unwrap();
        let mut watcher = self.watcher.lock().unwrap();
        for dir in watched.drain() {
            let _ = watcher.unwatch(&dir);
        }
    }
}
