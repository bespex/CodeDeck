//! The window's side of the bridge to coding assistants. Each window listens on a socket of its
//! own; `codedeck hook` (see [`crate::hook`]) sends it Claude Code's hook events. From them the
//! window knows the sessions working in its project, what they are doing and which files they
//! touched, takes a snapshot before a session's first write in a turn, and can hand a task to
//! the next prompt.

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::git::{Git, GitRun, Repo};
use crate::snapshot::Origin;
use crate::{Current, GIT_RAN};

/// Event sent when sessions or the hand-over changed; payload [`AssistantState`].
pub const ASSISTANT_CHANGED: &str = "assistant_changed";
/// Event sent after a snapshot was taken; no payload.
pub const SNAPSHOT_TAKEN: &str = "snapshot_taken";

/// Tools that write the file named in their input.
const WRITES: &[&str] = &["Edit", "MultiEdit", "Write", "NotebookEdit"];
/// Files remembered per session.
const TOUCHED_KEPT: usize = 200;
/// Sessions remembered; the ones heard of longest ago go first.
const SESSIONS_KEPT: usize = 20;

/// One hook event as `codedeck hook` sends it.
#[derive(Deserialize, Default)]
struct Event {
    session: String,
    event: String,
    cwd: Option<String>,
    tool: Option<String>,
    file: Option<String>,
    prompt: Option<String>,
    message: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: String,
    /// Where it runs: project-relative, or absolute when outside the project
    cwd: String,
    /// `working`, `waiting` (for an answer or a permission), `idle` (its turn is over), `ended`
    status: &'static str,
    /// Unix milliseconds
    started: u64,
    last: u64,
    /// The latest prompt, shortened
    prompt: Option<String>,
    prompts: u32,
    /// What it is waiting for
    message: Option<String>,
    /// Files it wrote, project-relative, newest first
    touched: Vec<Touch>,
    /// It received the hand-over with its latest prompt
    handed: bool,
}

#[derive(Serialize, Clone)]
pub struct Touch {
    path: String,
    at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Handover {
    /// Which part it is, e.g. `markers` or `focus`; each can be set and taken back on its own
    key: String,
    /// The text the assistant gets with the next prompt
    text: String,
    /// What it is, in a few words, for the interface
    label: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssistantState {
    /// A hook event arrived since this window started
    heard: bool,
    sessions: Vec<Session>,
    /// What waits for the next prompt, in the order it was handed over
    handovers: Vec<Handover>,
}

#[derive(Default)]
struct Inner {
    heard: bool,
    sessions: HashMap<String, Session>,
    /// Per session: the repositories (top-level paths) with a snapshot in the current turn
    turn: HashMap<String, HashSet<PathBuf>>,
    handovers: Vec<Handover>,
}

pub struct Bridge {
    inner: Mutex<Inner>,
    /// One snapshot at a time: two sessions writing at once must not race on one repository
    snapshotting: Mutex<()>,
    socket: PathBuf,
}

impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.socket);
    }
}

impl Bridge {
    /// Opens the window's socket and answers on it from now on.
    pub fn start(app: AppHandle) -> std::io::Result<Arc<Self>> {
        let dir = crate::hook::ensure_socket_dir()?;
        remove_stale(&dir);
        let socket = dir.join(format!("{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket)?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
        let bridge = Arc::new(Self { inner: Mutex::new(Inner::default()), snapshotting: Mutex::new(()), socket });

        let me = bridge.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let (me, app) = (me.clone(), app.clone());
                // A snapshot may take a moment; other sessions' events need not wait for it
                std::thread::spawn(move || me.serve(&app, stream));
            }
        });
        Ok(bridge)
    }

    pub fn socket(&self) -> &Path {
        &self.socket
    }

    pub fn state(&self) -> AssistantState {
        let inner = self.inner.lock().unwrap();
        let mut sessions: Vec<Session> = inner.sessions.values().cloned().collect();
        sessions.sort_by(|a, b| b.last.cmp(&a.last));
        AssistantState { heard: inner.heard, sessions, handovers: inner.handovers.clone() }
    }

    /// A new project: what was known about the old one does not apply.
    pub fn clear(&self, app: &AppHandle) {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.sessions.clear();
            inner.turn.clear();
            inner.handovers.clear();
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    /// One part of the text for the assistant with the next prompt in this project; `None`
    /// takes that part back. All parts go together with the next prompt.
    pub fn hand_over(&self, app: &AppHandle, key: String, part: Option<(String, String)>) {
        set_part(&mut self.inner.lock().unwrap().handovers, key, part);
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    fn serve(&self, app: &AppHandle, mut stream: UnixStream) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut text = String::new();
        if (&mut stream).take(256 * 1024).read_to_string(&mut text).is_err() {
            return;
        }
        let Ok(event) = serde_json::from_str::<Event>(&text) else { return };
        let context = self.handle(app, &event);
        let _ = stream.write_all(json!({ "context": context }).to_string().as_bytes());
    }

    /// Takes in one event; the text to hand to the assistant, if any.
    fn handle(&self, app: &AppHandle, e: &Event) -> Option<String> {
        if e.session.is_empty() {
            return None;
        }
        let project = app.state::<Arc<Current>>().get();
        let root = &project.root;
        let file = e.file.as_deref().map(PathBuf::from);
        let inside = |p: &Path| p.starts_with(root);
        let cwd = e.cwd.as_deref().map(PathBuf::from);
        let concerns = file.as_deref().is_some_and(inside)
            || cwd.as_deref().is_some_and(|c| inside(c) || root.starts_with(c));
        let now = now_ms();

        let mut context = None;
        let mut snapshot_repos: Vec<PathBuf> = Vec::new();
        let label;
        {
            let mut inner = self.inner.lock().unwrap();
            if !concerns && !inner.sessions.contains_key(&e.session) {
                return None;
            }
            inner.heard = true;
            let session = inner.sessions.entry(e.session.clone()).or_insert_with(|| Session {
                id: e.session.clone(),
                cwd: String::new(),
                status: "idle",
                started: now,
                last: now,
                prompt: None,
                prompts: 0,
                message: None,
                touched: Vec::new(),
                handed: false,
            });
            if let Some(c) = &cwd {
                session.cwd = relative(root, c).unwrap_or_else(|| c.display().to_string());
            }
            session.last = now;
            match e.event.as_str() {
                "SessionStart" => session.status = "idle",
                "UserPromptSubmit" => {
                    session.status = "working";
                    session.prompts += 1;
                    session.prompt = e.prompt.as_deref().map(shorten);
                    session.message = None;
                    session.handed = false;
                }
                "PreToolUse" | "PostToolUse" => {
                    session.status = "working";
                    session.message = None;
                }
                "Notification" => {
                    session.status = "waiting";
                    session.message = e.message.clone();
                }
                "Stop" => session.status = "idle",
                "SessionEnd" => session.status = "ended",
                _ => {}
            }
            if e.event == "PostToolUse" {
                if let Some(path) = file.as_deref().and_then(|f| relative(root, f)) {
                    session.touched.retain(|t| t.path != path);
                    session.touched.insert(0, Touch { path, at: now });
                    session.touched.truncate(TOUCHED_KEPT);
                }
            }
            label = match &session.prompt {
                Some(p) => format!("Before: {p}"),
                None => "Before the assistant's changes".to_string(),
            };
            if e.event == "UserPromptSubmit" {
                inner.turn.remove(&e.session);
                if let Some(text) = take_parts(&mut inner.handovers) {
                    context = Some(text);
                    if let Some(s) = inner.sessions.get_mut(&e.session) {
                        s.handed = true;
                    }
                }
            }
            if e.event == "PreToolUse" {
                let tool = e.tool.as_deref().unwrap_or_default();
                let repos = app.state::<Git>().repos(&project);
                let wanted: Vec<PathBuf> = if WRITES.contains(&tool) {
                    file.as_deref().and_then(|f| repo_of(&repos, f)).into_iter().collect()
                } else {
                    // A shell command may change anything in the project
                    repos.iter().map(|r| r.top.clone()).collect()
                };
                let done = inner.turn.entry(e.session.clone()).or_default();
                snapshot_repos = wanted.into_iter().filter(|top| done.insert(top.clone())).collect();
            }
            if inner.sessions.len() > SESSIONS_KEPT {
                if let Some(oldest) = inner.sessions.values().min_by_key(|s| s.last).map(|s| s.id.clone()) {
                    inner.sessions.remove(&oldest);
                    inner.turn.remove(&oldest);
                }
            }
        }

        if !snapshot_repos.is_empty() {
            let tool = match (&e.tool, &file) {
                (Some(t), Some(f)) => Some(format!("{t} {}", relative(root, f).unwrap_or_else(|| f.display().to_string()))),
                (Some(t), None) => Some(t.clone()),
                _ => None,
            };
            let git = app.state::<Git>();
            let report = |run: &GitRun| {
                let _ = app.emit(GIT_RAN, run);
            };
            let _one = self.snapshotting.lock().unwrap();
            let mut taken = false;
            for repo in git.repos(&project).iter().filter(|r| snapshot_repos.contains(&r.top)) {
                let origin = Origin { label: &label, session: Some(&e.session), tool: tool.as_deref(), back: false };
                taken |= matches!(git.take_snapshot(&report, repo, &origin), Ok(Some(_)));
            }
            if taken {
                let _ = app.emit(SNAPSHOT_TAKEN, ());
            }
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
        context
    }
}

/// Sets, replaces or (with `None`) removes one part of the hand-over.
fn set_part(list: &mut Vec<Handover>, key: String, part: Option<(String, String)>) {
    match (list.iter_mut().find(|h| h.key == key), part) {
        (Some(h), Some((text, label))) => (h.text, h.label) = (text, label),
        (None, Some((text, label))) => list.push(Handover { key, text, label }),
        (_, None) => list.retain(|h| h.key != key),
    }
}

/// All parts as one text for the prompt, in the order they were handed over; empties the list.
fn take_parts(list: &mut Vec<Handover>) -> Option<String> {
    (!list.is_empty()).then(|| std::mem::take(list).into_iter().map(|h| h.text).collect::<Vec<_>>().join("\n\n"))
}

/// Sockets of windows that were killed and could not remove theirs: `<pid>.sock` without a
/// process of that number.
fn remove_stale(dir: &Path) {
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        let pid = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u32>().ok());
        if path.extension().is_some_and(|e| e == "sock") && pid.is_some_and(|p| !Path::new(&format!("/proc/{p}")).exists()) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

/// The repository a file belongs to: the innermost one around it.
fn repo_of(repos: &[Repo], file: &Path) -> Option<PathBuf> {
    repos.iter().filter(|r| file.starts_with(&r.top)).max_by_key(|r| r.top.as_os_str().len()).map(|r| r.top.clone())
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root).ok().map(|p| p.to_string_lossy().into_owned())
}

fn shorten(text: &str) -> String {
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.chars().count() > 90 { format!("{}…", line.chars().take(89).collect::<String>()) } else { line }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hand_over_parts_go_together_once() {
        let mut list = Vec::new();
        let part = |t: &str| Some((t.to_string(), "label".to_string()));
        set_part(&mut list, "markers".into(), part("comments"));
        set_part(&mut list, "focus".into(), part("old focus"));
        set_part(&mut list, "focus".into(), part("focus"));
        assert_eq!(take_parts(&mut list).as_deref(), Some("comments\n\nfocus"));
        assert!(take_parts(&mut list).is_none());
        set_part(&mut list, "focus".into(), part("focus"));
        set_part(&mut list, "focus".into(), None);
        assert!(list.is_empty());
    }
}
