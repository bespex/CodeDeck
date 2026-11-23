//! The one socket of the CodeDeck process (D25). `codedeck hook` sends the tools' events here, the
//! status line the usage, and a second `codedeck <folder>` the folder to open. Events go to every
//! window; each takes what concerns its project (see [`crate::bridge`]).
//!
//! The socket is named after the process, like before, so that `codedeck hook` finds every running
//! CodeDeck (an installed one and a development build side by side each get the events). Which
//! process a second start of the same program hands its folder to is in a small file named after
//! the program's path: a development build and the installed one do not open in each other.
//!
//! Dirq sends comments on lines here (Qiew `docs/ANNOTATE.md`, 4): only when CodeDeck started it
//! with `--annotate` and `CODEDECK_SOCKET` for a patch of the working tree. They become line
//! comments of the next prompt in the window of the project the patch belongs to.

use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::harness::Event;

/// A second start of this program asks the running one to open a folder.
#[derive(Serialize, Deserialize)]
struct Open {
    open: PathBuf,
}

/// `codedeck --toggle` asks the running one to come to the front, or go away when it is in front:
/// what a desktop binds to a key where programs cannot hold global shortcuts (Wayland, K5).
#[derive(Serialize, Deserialize)]
struct Toggle {
    toggle: bool,
}

/// The argument for it.
pub const TOGGLE: &str = "--toggle";

/// `codedeck` without a folder while one runs: it comes to the front, like a launcher's second click.
#[derive(Serialize, Deserialize)]
struct Front {
    front: bool,
}

pub struct Hub {
    socket: PathBuf,
    instance: Option<PathBuf>,
}

impl Hub {
    /// Opens the process's socket and answers on it from now on.
    pub fn start(app: AppHandle) -> std::io::Result<Self> {
        let dir = crate::hook::ensure_socket_dir()?;
        remove_stale(&dir);
        let socket = dir.join(format!("{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket)?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
        let instance = instance_file();
        if let Some(file) = &instance {
            let _ = std::fs::write(file, std::process::id().to_string());
        }
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let app = app.clone();
                // A snapshot may take a moment; other events need not wait for it
                std::thread::spawn(move || serve(&app, stream));
            }
        });
        Ok(Self { socket, instance })
    }

    /// Where the socket is: what Dirq is told in `CODEDECK_SOCKET`.
    pub fn socket(&self) -> &Path {
        &self.socket
    }

    /// Takes the socket away again; the state is not dropped on exit.
    pub fn close(&self) {
        let _ = std::fs::remove_file(&self.socket);
        // Only if it still names this process: a newer start may have taken over
        if let Some(file) = &self.instance {
            if std::fs::read_to_string(file).is_ok_and(|t| t.trim() == std::process::id().to_string()) {
                let _ = std::fs::remove_file(file);
            }
        }
    }
}

fn serve(app: &AppHandle, mut stream: UnixStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut text = String::new();
    if (&mut stream).take(256 * 1024).read_to_string(&mut text).is_err() {
        return;
    }
    let bridges = app.state::<crate::windows::Bridges>().all();
    if let Ok(Open { open }) = serde_json::from_str::<Open>(&text) {
        let reply = match crate::project::Project::open(&open).and_then(|p| crate::windows::open(app, p)) {
            Ok(_) => json!({ "opened": true }),
            Err(e) => json!({ "error": e }),
        };
        let _ = stream.write_all(reply.to_string().as_bytes());
        return;
    }
    let away = match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) if v["toggle"] == true => Some(true),
        Ok(v) if v["front"] == true => Some(false),
        _ => None,
    };
    if let Some(away) = away {
        // Showing a window waits for the main thread: not on the socket's
        let app = app.clone();
        std::thread::spawn(move || {
            let shown = if away { crate::windows::front_or_away(&app) } else { crate::windows::to_front(&app) };
            if let Err(e) = shown {
                eprintln!("codedeck: to the front: {e}");
            }
        });
        let _ = stream.write_all(json!({ "done": true }).to_string().as_bytes());
        return;
    }
    // A comment on a line, from Dirq: to the windows of the project its patch belongs to
    if let Ok(message) = serde_json::from_str::<DirqMessage>(&text) {
        if let Some((root, comment)) = dirq_comment(&message, &dirq_docs()) {
            for win in app.state::<crate::windows::Windows>().all().iter().filter(|w| w.current.get().root == root) {
                let _ = app.emit_to(win.label.as_str(), DIRQ_COMMENT, comment.clone());
            }
        }
        return;
    }
    // The usage a tool's status line states
    if let Ok(message) = serde_json::from_str::<crate::usage::Message>(&text) {
        bridges.iter().for_each(|b| b.take_usage(app, message.usage.clone()));
        return;
    }
    let Ok(event) = serde_json::from_str::<Event>(&text) else { return };
    // Every project at once: one taking a snapshot does not hold up the others
    let contexts: Vec<String> = std::thread::scope(|scope| {
        let asked: Vec<_> = bridges.iter().map(|b| scope.spawn(|| b.handle(app, &event))).collect();
        asked.into_iter().filter_map(|h| h.join().ok().flatten()).collect()
    });
    // Two windows on one project both give the start rules: once is enough
    let mut seen = std::collections::HashSet::new();
    let contexts: Vec<String> = contexts.into_iter().filter(|t| seen.insert(t.clone())).collect();
    let _ = stream.write_all(json!({ "contexts": contexts, "windows": bridges.len() }).to_string().as_bytes());
}

/// The event a window gets for a comment from Dirq.
pub const DIRQ_COMMENT: &str = "dirq_comment";

/// A message from Dirq (Qiew `docs/ANNOTATE.md`, 4). Unknown fields are ignored.
#[derive(Deserialize)]
struct DirqMessage {
    action: String,
    source: String,
    id: String,
    file: Option<String>,
    line: Option<u32>,
    code: Option<String>,
    text: Option<String>,
    session: Option<String>,
    /// The `--id` CodeDeck gave the patch: which project and repository it belongs to
    doc: Option<String>,
}

/// What a window gets: a comment to add (or to replace, same id) or to remove.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirqComment {
    pub id: String,
    /// `None`: remove it
    pub add: Option<DirqLine>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirqLine {
    /// Project-relative
    pub path: String,
    pub line: u32,
    pub code: String,
    pub text: String,
    pub session: Option<String>,
}

/// A patch CodeDeck showed in Dirq with `--annotate`: its id, the project root, the repository
/// (project-relative, "" for the project's own).
type DirqDoc = (String, PathBuf, String);

/// The patches shown in Dirq with `--annotate`, newest last; the same id names the newest.
static DIRQ_DOCS: Mutex<Vec<DirqDoc>> = Mutex::new(Vec::new());
const DIRQ_DOCS_KEPT: usize = 64;

/// Notes which project and repository a patch shown in Dirq belongs to, by the id it was given.
pub fn remember_dirq_doc(id: &str, root: &Path, repo: &str) {
    let mut docs = DIRQ_DOCS.lock().unwrap_or_else(|e| e.into_inner());
    docs.retain(|(known, ..)| known != id);
    docs.push((id.to_string(), root.to_path_buf(), repo.to_string()));
    let extra = docs.len().saturating_sub(DIRQ_DOCS_KEPT);
    docs.drain(..extra);
}

fn dirq_docs() -> Vec<DirqDoc> {
    DIRQ_DOCS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

const MAX_COMMENT: usize = 10_000;
const MAX_CODE: usize = 200;

/// A relative path that stays inside where it is joined to.
fn inside(path: &str) -> bool {
    !path.is_empty() && !path.contains('\0') && Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
}

/// The comment and the project it is for; `None` for what is not a well-formed comment of a patch
/// CodeDeck showed: an unknown action or document, a path outside the repository, no text.
fn dirq_comment(m: &DirqMessage, docs: &[DirqDoc]) -> Option<(PathBuf, DirqComment)> {
    if m.source != "dirq" || !(8..=64).contains(&m.id.len()) || !m.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return None;
    }
    let (_, root, repo) = docs.iter().rev().find(|(id, ..)| Some(id) == m.doc.as_ref())?;
    let add = match m.action.as_str() {
        "line_comment_remove" => None,
        "line_comment" => {
            let file = m.file.as_deref().filter(|f| inside(f))?;
            let text: String = m.text.as_deref().map(str::trim).filter(|t| !t.is_empty())?.chars().take(MAX_COMMENT).collect();
            let line = m.line.filter(|l| *l > 0)?;
            Some(DirqLine {
                path: if repo.is_empty() { file.to_string() } else { format!("{repo}/{file}") },
                line,
                code: m.code.as_deref().unwrap_or("").chars().take(MAX_CODE).collect(),
                text,
                session: m.session.clone().filter(|s| !s.is_empty()),
            })
        }
        _ => return None,
    };
    Some((root.clone(), DirqComment { id: m.id.clone(), add }))
}

/// Whether a CodeDeck runs already from this same program and listens.
pub fn running() -> bool {
    let Some(pid) = instance_file().and_then(|f| std::fs::read_to_string(f).ok()).and_then(|t| t.trim().parse::<u32>().ok()) else { return false };
    Path::new(&format!("/proc/{pid}")).exists() && UnixStream::connect(crate::hook::socket_dir().join(format!("{pid}.sock"))).is_ok()
}

/// Hands the folder to a CodeDeck already running from this same program; whether one took it.
pub fn hand_over(folder: &Path) -> bool {
    let line = serde_json::to_string(&Open { open: folder.to_path_buf() }).unwrap_or_default();
    ask_running(&line).is_some_and(|answer| answer["opened"].as_bool().unwrap_or(false))
}

/// Asks a CodeDeck already running from this same program to come to the front or go away;
/// whether one runs.
pub fn toggle() -> bool {
    let line = serde_json::to_string(&Toggle { toggle: true }).unwrap_or_default();
    ask_running(&line).is_some()
}

/// Asks a CodeDeck already running from this same program to come to the front; whether one runs.
pub fn to_front() -> bool {
    let line = serde_json::to_string(&Front { front: true }).unwrap_or_default();
    ask_running(&line).is_some()
}

/// Sends one message to the CodeDeck running from this program; its answer, `None` without one.
fn ask_running(line: &str) -> Option<serde_json::Value> {
    let file = instance_file()?;
    let pid = std::fs::read_to_string(&file).ok().and_then(|t| t.trim().parse::<u32>().ok())?;
    if !Path::new(&format!("/proc/{pid}")).exists() {
        return None;
    }
    let socket = crate::hook::socket_dir().join(format!("{pid}.sock"));
    let mut stream = UnixStream::connect(&socket).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    if stream.write_all(line.as_bytes()).is_err() || stream.shutdown(std::net::Shutdown::Write).is_err() {
        return None;
    }
    let mut answer = String::new();
    let _ = stream.read_to_string(&mut answer);
    let answer: serde_json::Value = serde_json::from_str(&answer).unwrap_or_default();
    if let Some(error) = answer["error"].as_str() {
        eprintln!("codedeck: {error}");
    }
    Some(answer)
}

/// Where the running process of this program notes itself: one file per program path.
fn instance_file() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name: String = exe.to_string_lossy().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    Some(crate::hook::socket_dir().join(format!("instance{name}")))
}

/// Sockets of processes that are gone.
fn remove_stale(dir: &Path) {
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        let pid = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u32>().ok());
        if path.extension().is_some_and(|e| e == "sock") && pid.is_some_and(|p| !Path::new(&format!("/proc/{p}")).exists()) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(json: &str) -> DirqMessage {
        serde_json::from_str(json).unwrap()
    }

    fn docs() -> Vec<DirqDoc> {
        vec![
            ("Uncommitted changes · app".into(), PathBuf::from("/work/app"), String::new()),
            ("Turn 3 · lib".into(), PathBuf::from("/work/app"), "libs/core".into()),
        ]
    }

    #[test]
    fn a_comment_from_dirq_goes_to_its_project_with_a_project_path() {
        let m = message(r#"{"v":1,"action":"line_comment","source":"dirq","id":"d4f1a2b3","file":"src/limit.rs","line":42,"code":"(gelöschte Zeile) let max = 10;","text":"Why?","session":"s-7","doc":"Turn 3 · lib","later":"ignored"}"#);
        let (root, c) = dirq_comment(&m, &docs()).unwrap();
        assert_eq!(root, PathBuf::from("/work/app"));
        assert_eq!(
            c,
            DirqComment {
                id: "d4f1a2b3".into(),
                add: Some(DirqLine { path: "libs/core/src/limit.rs".into(), line: 42, code: "(gelöschte Zeile) let max = 10;".into(), text: "Why?".into(), session: Some("s-7".into()) }),
            }
        );
        let m = message(r#"{"v":1,"action":"line_comment","source":"dirq","id":"d4f1a2b3","file":"a.rs","line":1,"text":"x","doc":"Uncommitted changes · app"}"#);
        assert_eq!(dirq_comment(&m, &docs()).unwrap().1.add.unwrap().path, "a.rs");
    }

    #[test]
    fn removing_names_only_the_id() {
        let m = message(r#"{"v":1,"action":"line_comment_remove","source":"dirq","id":"d4f1a2b3","doc":"Turn 3 · lib"}"#);
        assert_eq!(dirq_comment(&m, &docs()).unwrap().1, DirqComment { id: "d4f1a2b3".into(), add: None });
    }

    #[test]
    fn what_is_not_a_comment_of_a_known_patch_is_dropped() {
        let ok = r#""source":"dirq","id":"d4f1a2b3","line":3,"text":"x","doc":"Turn 3 · lib""#;
        for wrong in [
            format!(r#"{{"action":"line_comment","file":"../etc/passwd",{ok}}}"#),
            format!(r#"{{"action":"line_comment","file":"/etc/passwd",{ok}}}"#),
            format!(r#"{{"action":"line_comment","file":"",{ok}}}"#),
            format!(r#"{{"action":"revert_hunk","file":"a.rs",{ok}}}"#),
            r#"{"action":"line_comment","file":"a.rs","source":"dirq","id":"d4f1a2b3","line":3,"text":"x","doc":"someone else's"}"#.to_string(),
            r#"{"action":"line_comment","file":"a.rs","source":"dirq","id":"d4f1a2b3","line":3,"text":"x"}"#.to_string(),
            r#"{"action":"line_comment","file":"a.rs","source":"dirq","id":"d4f1a2b3","line":0,"text":"x","doc":"Turn 3 · lib"}"#.to_string(),
            r#"{"action":"line_comment","file":"a.rs","source":"dirq","id":"d4f1a2b3","line":3,"text":"  ","doc":"Turn 3 · lib"}"#.to_string(),
            r#"{"action":"line_comment","file":"a.rs","source":"dirq","id":"short","line":3,"text":"x","doc":"Turn 3 · lib"}"#.to_string(),
            r#"{"action":"line_comment","file":"a.rs","source":"marq","id":"d4f1a2b3","line":3,"text":"x","doc":"Turn 3 · lib"}"#.to_string(),
        ] {
            assert!(dirq_comment(&message(&wrong), &docs()).is_none(), "{wrong}");
        }
    }

    #[test]
    fn long_texts_are_cut_and_the_newest_patch_of_an_id_counts() {
        let long = "ä".repeat(MAX_COMMENT + 10);
        let m = message(&format!(r#"{{"action":"line_comment","source":"dirq","id":"d4f1a2b3","file":"a.rs","line":3,"text":"{long}","doc":"x"}}"#));
        let mut list = docs();
        list.push(("x".into(), PathBuf::from("/old"), String::new()));
        list.push(("x".into(), PathBuf::from("/new"), String::new()));
        let (root, c) = dirq_comment(&m, &list).unwrap();
        assert_eq!(root, PathBuf::from("/new"));
        assert_eq!(c.add.unwrap().text.chars().count(), MAX_COMMENT);
    }
}
