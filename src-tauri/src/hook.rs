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

use crate::harness::{self, Event};

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
    let Some(event) = harness.translate(&raw) else { return 0 };
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
                windows += 1;
                if let Some(text) = ask(stream, &line) {
                    handed.push(text);
                }
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

/// Debug aid for checking what a tool really sends: with `CODEDECK_HOOK_LOG=<file>` in the
/// environment of the session, every raw message is appended there as one line. Off by default,
/// because the raw message holds more than CodeDeck keeps (file contents, commands).
fn record_raw(input: &str) {
    let Some(path) = std::env::var_os("CODEDECK_HOOK_LOG").filter(|p| !p.is_empty()) else { return };
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", input.replace('\n', " "));
    }
}

/// Sends the event, waits for the answer; the text handed over, if any.
fn ask(mut stream: UnixStream, line: &str) -> Option<String> {
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
    stream.set_read_timeout(Some(ANSWER_WAIT)).ok()?;
    stream.write_all(line.as_bytes()).ok()?;
    stream.shutdown(std::net::Shutdown::Write).ok()?;
    let mut answer = String::new();
    stream.take(1024 * 1024).read_to_string(&mut answer).ok()?;
    let answer: Value = serde_json::from_str(&answer).ok()?;
    answer["context"].as_str().filter(|t| !t.trim().is_empty()).map(String::from)
}

/// What a tool runs to report to this CodeDeck: the default tool's adapter translates.
pub fn command() -> String {
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_else(|_| "codeck".into());
    let quoted = if exe.chars().all(|c| c.is_ascii_alphanumeric() || "/._-+".contains(c)) {
        exe
    } else {
        format!("'{}'", exe.replace('\'', r"'\''"))
    };
    format!("{quoted} hook")
}
