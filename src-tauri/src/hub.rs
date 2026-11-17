//! The one socket of the CodeDeck process (D25). `codedeck hook` sends the tools' events here, the
//! status line the usage, and a second `codedeck <folder>` the folder to open. Events go to every
//! window; each takes what concerns its project (see [`crate::bridge`]).
//!
//! The socket is named after the process, like before, so that `codedeck hook` finds every running
//! CodeDeck (an installed one and a development build side by side each get the events). Which
//! process a second start of the same program hands its folder to is in a small file named after
//! the program's path: a development build and the installed one do not open in each other.

use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::harness::Event;
use crate::windows::Windows;

/// A second start of this program asks the running one to open a folder.
#[derive(Serialize, Deserialize)]
struct Open {
    open: PathBuf,
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
    let windows = app.state::<Windows>().all();
    if let Ok(Open { open }) = serde_json::from_str::<Open>(&text) {
        let reply = match crate::project::Project::open(&open).and_then(|p| crate::windows::open(app, p)) {
            Ok(_) => json!({ "opened": true }),
            Err(e) => json!({ "error": e }),
        };
        let _ = stream.write_all(reply.to_string().as_bytes());
        return;
    }
    // The usage a tool's status line states
    if let Ok(message) = serde_json::from_str::<crate::usage::Message>(&text) {
        windows.iter().for_each(|w| w.bridge.take_usage(app, message.usage.clone()));
        return;
    }
    let Ok(event) = serde_json::from_str::<Event>(&text) else { return };
    // Every window at once: one taking a snapshot does not hold up the others
    let contexts: Vec<String> = std::thread::scope(|scope| {
        let asked: Vec<_> = windows.iter().map(|w| scope.spawn(|| w.bridge.handle(app, &event))).collect();
        asked.into_iter().filter_map(|h| h.join().ok().flatten()).collect()
    });
    // Two windows on one project both give the start rules: once is enough
    let mut seen = std::collections::HashSet::new();
    let contexts: Vec<String> = contexts.into_iter().filter(|t| seen.insert(t.clone())).collect();
    let _ = stream.write_all(json!({ "contexts": contexts, "windows": windows.len() }).to_string().as_bytes());
}

/// Hands the folder to a CodeDeck already running from this same program; whether one took it.
pub fn hand_over(folder: &Path) -> bool {
    let Some(file) = instance_file() else { return false };
    let Some(pid) = std::fs::read_to_string(&file).ok().and_then(|t| t.trim().parse::<u32>().ok()) else { return false };
    if !Path::new(&format!("/proc/{pid}")).exists() {
        return false;
    }
    let socket = crate::hook::socket_dir().join(format!("{pid}.sock"));
    let Ok(mut stream) = UnixStream::connect(&socket) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let line = serde_json::to_string(&Open { open: folder.to_path_buf() }).unwrap_or_default();
    if stream.write_all(line.as_bytes()).is_err() || stream.shutdown(std::net::Shutdown::Write).is_err() {
        return false;
    }
    let mut answer = String::new();
    let _ = stream.read_to_string(&mut answer);
    let answer: serde_json::Value = serde_json::from_str(&answer).unwrap_or_default();
    if let Some(error) = answer["error"].as_str() {
        eprintln!("codedeck: {error}");
    }
    answer["opened"].as_bool().unwrap_or(false)
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
