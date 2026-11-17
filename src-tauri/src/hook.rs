//! The tools' side of the bridge. `codeck hook [--harness <id>]` is what a coding tool runs to
//! report a step: it reads the tool's raw message from stdin, has the tool's adapter (see
//! [`crate::harness`]) translate it into a neutral event, passes that to every running CodeDeck
//! window and waits for their answers (a window takes a snapshot before the assistant writes, so
//! it must be done before the hook returns). It never fails and prints nothing but what the
//! adapter makes of the text the windows hand over.

use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

use serde_json::Value;

use crate::harness::{self, Event, EventKind};

/// How long the hook waits for one window's answer.
const ANSWER_WAIT: Duration = Duration::from_secs(20);
/// What is read from stdin at most: a `Write` carries the whole file.
const INPUT_LIMIT: u64 = 8 * 1024 * 1024;

/// Where the windows' sockets are: one per window, named after its process.
pub fn socket_dir() -> PathBuf {
    match std::env::var_os("XDG_RUNTIME_DIR") {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir).join("codedeck"),
        _ => std::env::temp_dir().join(format!("codedeck-{}", unsafe_uid())),
    }
}

/// The socket directory, created private to the user.
pub fn ensure_socket_dir() -> std::io::Result<PathBuf> {
    let dir = socket_dir();
    std::fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    Ok(dir)
}

fn unsafe_uid() -> String {
    // The owner of our own process directory is our user id; no libc needed for it
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata("/proc/self").map(|m| m.uid().to_string()).unwrap_or_else(|_| "user".into())
}

/// `codeck hook`: forwards the tool's message on stdin. `args` are the ones after `hook`:
/// `--harness <id>` names the tool, without it the default one reports. Always exits successfully.
pub fn forward(args: &[String]) -> i32 {
    let id = args.iter().position(|a| a == "--harness").map(|i| args.get(i + 1).map_or("", String::as_str));
    let Some(harness) = harness::by_id(id) else { return 0 };
    let mut input = String::new();
    if std::io::stdin().take(INPUT_LIMIT).read_to_string(&mut input).is_err() {
        return 0;
    }
    let Ok(raw) = serde_json::from_str::<Value>(&input) else { return 0 };
    record_raw(&input);
    let Some(mut event) = harness.translate(&raw) else { return 0 };
    // Where it runs: a tmux session's name only when a session starts or a turn begins or ends,
    // the pane stands for it in between
    let named = matches!(event.kind, EventKind::SessionStarted | EventKind::PromptSubmitted | EventKind::TurnDone);
    event.place = Some(crate::place::here(harness, named));
    let Ok(line) = serde_json::to_string(&event) else { return 0 };

    let mut handed = Vec::new();
    let mut windows = 0;
    let Ok(entries) = std::fs::read_dir(socket_dir()) else {
        trace(&event, "no socket directory");
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "sock") {
            continue;
        }
        match UnixStream::connect(&path) {
            Ok(stream) => {
                let (reached, texts) = ask(stream, &line);
                windows += reached;
                handed.extend(texts);
            }
            // A window that is gone left its socket behind
            Err(e) if matches!(e.kind(), std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::NotFound) => {
                let _ = std::fs::remove_file(&path);
            }
            Err(_) => {}
        }
    }
    // Two windows on one project both give the start rules: once is enough
    let mut seen = std::collections::HashSet::new();
    handed.retain(|t| seen.insert(t.clone()));
    trace(&event, &format!("{windows} window(s) reached, {} text(s) handed", handed.len()));
    if let Some(text) = harness.reply(&event, &handed) {
        print!("{text}");
    }
    0
}

/// One line per hook message in the private socket directory, so "does the hook run at all?" can be
/// answered from outside the tool (which may log nothing about its hooks). Names only, no content.
fn trace(event: &Event, outcome: &str) {
    let Ok(dir) = ensure_socket_dir() else { return };
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let path = dir.join("hook-trace.log");
    // Kept short: start over when it grows
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 64 * 1024) {
        let _ = std::fs::remove_file(&path);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let id: String = event.session.chars().take(8).collect();
        let _ = writeln!(file, "{now} {} {:?} {id} {outcome}", event.harness, event.kind);
    }
}

/// Debug aid for checking what a tool really sends: every raw message is appended as one line to
/// the file named by `CODEDECK_HOOK_LOG` in the environment of the session, or, for a session that
/// is already running (its environment cannot change), by the first line of
/// `~/.local/state/codedeck/hook-log` (honouring `XDG_STATE_HOME`). Off by default, because the raw
/// message holds more than CodeDeck keeps (file contents, commands).
fn record_raw(input: &str) {
    let path = std::env::var_os("CODEDECK_HOOK_LOG")
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            let state = std::env::var_os("XDG_STATE_HOME")
                .filter(|p| !p.is_empty())
                .map(PathBuf::from)
                .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state")))?;
            let text = std::fs::read_to_string(state.join("codedeck/hook-log")).ok()?;
            text.lines().next().map(str::trim).filter(|l| !l.is_empty()).map(PathBuf::from)
        });
    let Some(path) = path else { return };
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", input.replace('\n', " "));
    }
}

/// Sends the event to one CodeDeck process, waits for the answer: how many windows it has, and
/// the texts they handed over.
fn ask(mut stream: UnixStream, line: &str) -> (usize, Vec<String>) {
    let mut asked = || -> Option<Value> {
        stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
        stream.set_read_timeout(Some(ANSWER_WAIT)).ok()?;
        stream.write_all(line.as_bytes()).ok()?;
        stream.shutdown(std::net::Shutdown::Write).ok()?;
        let mut answer = String::new();
        (&stream).take(1024 * 1024).read_to_string(&mut answer).ok()?;
        serde_json::from_str(&answer).ok()
    };
    let Some(answer) = asked() else { return (1, Vec::new()) };
    let texts = answer["contexts"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|t| !t.trim().is_empty())
        .map(String::from)
        .collect();
    (answer["windows"].as_u64().map_or(1, |n| n as usize), texts)
}

/// This program as a shell command line starts it.
pub fn program() -> String {
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_else(|_| "codeck".into());
    if exe.chars().all(|c| c.is_ascii_alphanumeric() || "/._-+".contains(c)) { exe } else { quote(&exe) }
}

/// An argument as one token of a shell command line.
pub fn quote(arg: &str) -> String {
    format!("'{}'", arg.replace('\'', r"'\''"))
}

/// What a tool runs to report to this CodeDeck: the default tool's adapter translates.
pub fn command() -> String {
    format!("{} hook", program())
}

/// What a tool runs as its status line so that CodeDeck hears the usage: `then` is the user's own
/// status line, which keeps showing what it showed.
pub fn statusline_command(then: Option<&str>) -> String {
    match then {
        Some(then) => format!("{} statusline --then {}", program(), quote(then)),
        None => format!("{} statusline", program()),
    }
}

/// `codeck statusline [--then <command>] [--harness <id>]`: what a tool runs as its status line. It
/// hands the usage in what it is given to every window, then lets the user's own status line (`--then`)
/// do what it did, with the same input and as if it had been called directly. Without one it prints
/// the figures itself, so that the line is not empty. Never fails: a status line that goes blank
/// is what a user notices.
pub fn statusline(args: &[String]) -> i32 {
    let after = |flag: &str| args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1));
    let mut input = String::new();
    let _ = std::io::stdin().take(1024 * 1024).read_to_string(&mut input);
    let usage = harness::by_id(after("--harness").map(String::as_str))
        .zip(serde_json::from_str::<Value>(&input).ok())
        .and_then(|(harness, raw)| harness.translate_usage(&raw));
    if let Some(usage) = &usage {
        if let Ok(line) = serde_json::to_string(&crate::usage::Message { usage: usage.clone() }) {
            broadcast(&line);
        }
    }
    match after("--then") {
        Some(command) => chain(command, &input),
        None => {
            if let Some(usage) = usage {
                let part = |label: &str, w: &Option<crate::usage::Window>| w.as_ref().map(|w| format!("{label} {:.0}%", w.used));
                let parts: Vec<String> = [part("5h", &usage.five_hour), part("wk", &usage.seven_day)].into_iter().flatten().collect();
                print!("{}", parts.join(" · "));
            }
            0
        }
    }
}

/// Runs the user's own status line with what this one was given, and passes on what it printed.
fn chain(command: &str, input: &str) -> i32 {
    let child = std::process::Command::new("sh").arg("-c").arg(command).stdin(std::process::Stdio::piped()).spawn();
    let Ok(mut child) = child else { return 1 };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    child.wait().ok().and_then(|s| s.code()).unwrap_or(1)
}

/// Sends one line to every window without waiting for an answer.
fn broadcast(line: &str) {
    let Ok(entries) = std::fs::read_dir(socket_dir()) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "sock") {
            continue;
        }
        match UnixStream::connect(&path) {
            Ok(mut stream) => {
                let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                let _ = stream.write_all(line.as_bytes());
                let _ = stream.shutdown(std::net::Shutdown::Write);
            }
            Err(e) if matches!(e.kind(), std::io::ErrorKind::ConnectionRefused | std::io::ErrorKind::NotFound) => {
                let _ = std::fs::remove_file(&path);
            }
            Err(_) => {}
        }
    }
}
