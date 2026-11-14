//! Claude Code's side of the bridge. `codedeck hook` is what its hooks run: it reads the hook's
//! JSON from stdin, passes a small extract to every running CodeDeck window and waits for their
//! answers (a window takes a snapshot before the assistant writes, so it must be done before the
//! hook returns). It never fails and never prints anything, except text a window hands over for
//! the next prompt, which Claude Code then adds to that prompt.
//!
//! Also here: putting these hooks into Claude Code's settings and taking them out again.

use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use serde_json::{Value, json};

/// The events CodeDeck listens to, and for which tools.
const EVENTS: &[(&str, Option<&str>)] = &[
    ("SessionStart", None),
    ("UserPromptSubmit", None),
    ("PreToolUse", Some("Edit|MultiEdit|Write|NotebookEdit|Bash")),
    ("PostToolUse", Some("Edit|MultiEdit|Write|NotebookEdit")),
    ("Notification", None),
    ("Stop", None),
    ("SessionEnd", None),
];

/// Seconds Claude Code waits for the hook at most; a snapshot of a large tree takes a moment.
const HOOK_TIMEOUT: u64 = 30;
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

/// `codedeck hook`: forwards the hook event on stdin. Always exits successfully.
pub fn forward() -> i32 {
    let mut input = String::new();
    if std::io::stdin().take(INPUT_LIMIT).read_to_string(&mut input).is_err() {
        return 0;
    }
    let Ok(hook) = serde_json::from_str::<Value>(&input) else { return 0 };
    let event = extract(&hook);
    let line = event.to_string();
    let prompt_event = event["event"] == "UserPromptSubmit";

    let mut handed = Vec::new();
    let Ok(entries) = std::fs::read_dir(socket_dir()) else { return 0 };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "sock") {
            continue;
        }
        match UnixStream::connect(&path) {
            Ok(stream) => {
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
    if prompt_event && !handed.is_empty() {
        print!("{}", handed.join("\n\n"));
    }
    0
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

/// Only what CodeDeck uses: no file contents, no tool output.
fn extract(hook: &Value) -> Value {
    let input = &hook["tool_input"];
    let file = input["file_path"].as_str().or_else(|| input["notebook_path"].as_str());
    let cut = |v: &Value, n: usize| v.as_str().map(|s| s.chars().take(n).collect::<String>());
    json!({
        "session": hook["session_id"].as_str().unwrap_or_default(),
        "event": hook["hook_event_name"].as_str().unwrap_or_default(),
        "cwd": hook["cwd"].as_str(),
        "tool": hook["tool_name"].as_str(),
        "file": file,
        "prompt": cut(&hook["prompt"], 300),
        "transcript": hook["transcript_path"].as_str(),
        "message": cut(&hook["message"], 300),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookSetup {
    /// The Claude Code configuration directory (`~/.claude`, or one chosen by `CLAUDE_CONFIG_DIR`)
    dir: String,
    /// Its settings file
    settings: String,
    /// CodeDeck's hooks are in it
    installed: bool,
    /// They run another CodeDeck than this one (e.g. a development build)
    other: Option<String>,
    /// What the hooks run, for this CodeDeck
    command: String,
}

/// Every Claude Code configuration on this machine: `~/.claude`, the one `CLAUDE_CONFIG_DIR`
/// points to, and other `~/.claude-*` folders that are one (with `projects/` or `settings.json`).
/// Several are common: one per account, each started with its own `CLAUDE_CONFIG_DIR`. A
/// CodeDeck started from the desktop menu does not see that variable, so all are looked for.
pub fn config_dirs() -> Vec<PathBuf> {
    let home = std::env::home_dir().unwrap_or_default();
    let is_config = |d: &std::path::Path| d.join("projects").is_dir() || d.join("settings.json").is_file();
    let mut dirs = vec![home.join(".claude")];
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR").filter(|d| !d.is_empty()) {
        dirs.push(PathBuf::from(dir));
    }
    let mut others: Vec<PathBuf> = std::fs::read_dir(&home)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with(".claude-")) && p.is_dir() && is_config(p))
        .collect();
    others.sort();
    dirs.extend(others);
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.canonicalize().unwrap_or_else(|_| d.clone())));
    dirs
}

fn our_command() -> String {
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_else(|_| "codedeck".into());
    let quoted = if exe.chars().all(|c| c.is_ascii_alphanumeric() || "/._-+".contains(c)) {
        exe
    } else {
        format!("'{}'", exe.replace('\'', r"'\''"))
    };
    format!("{quoted} hook")
}

/// A hook command CodeDeck put there, from this or another installation.
fn is_ours(command: &str) -> bool {
    command.trim_end().ends_with(" hook") && command.to_lowercase().contains("codedeck")
}

/// Whether CodeDeck's hooks are in the settings, for every Claude Code configuration.
pub fn status() -> Vec<HookSetup> {
    config_dirs().iter().map(|d| status_of(d)).collect()
}

fn status_of(dir: &std::path::Path) -> HookSetup {
    let path = dir.join("settings.json");
    let settings = read_settings(&path).unwrap_or(Value::Null);
    let command = our_command();
    let found: Vec<String> = EVENTS
        .iter()
        .flat_map(|(event, _)| commands(&settings, event))
        .filter(|c| is_ours(c))
        .collect();
    HookSetup {
        dir: dir.display().to_string(),
        settings: path.display().to_string(),
        installed: !found.is_empty(),
        other: found.iter().find(|c| **c != command).cloned(),
        command,
    }
}

fn commands(settings: &Value, event: &str) -> Vec<String> {
    settings["hooks"][event]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|group| group["hooks"].as_array().into_iter().flatten())
        .filter_map(|h| h["command"].as_str().map(String::from))
        .collect()
}

fn read_settings(path: &PathBuf) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(json!({})),
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{}: not valid JSON ({e}); left alone", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// Puts CodeDeck's hooks into the settings of one Claude Code configuration (one of
/// [`config_dirs`]), or takes them out. Everything else in the file stays as it is; the file as
/// it was is kept next to it once.
pub fn set(dir: &str, install: bool) -> Result<Vec<HookSetup>, String> {
    let dir = config_dirs()
        .into_iter()
        .find(|d| d.display().to_string() == dir)
        .ok_or_else(|| format!("{dir}: not a Claude Code configuration CodeDeck knows"))?;
    let path = dir.join("settings.json");
    let before = std::fs::read_to_string(&path).ok();
    let mut settings = read_settings(&path)?;
    if !settings.is_object() {
        return Err(format!("{}: not a JSON object; left alone", path.display()));
    }
    change_hooks(&mut settings, install.then(our_command).as_deref());

    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())? + "\n";
    if before.as_deref() == Some(text.as_str()) {
        return Ok(status());
    }
    // Only an existing configuration: a new folder would be one Claude Code never reads
    if !dir.is_dir() {
        return Err(format!("{}: no such folder", dir.display()));
    }
    if let Some(before) = &before {
        let backup = path.with_extension("json.before-codedeck");
        if !backup.exists() {
            std::fs::write(&backup, before).map_err(|e| format!("{}: {e}", backup.display()))?;
        }
    }
    let tmp = path.with_extension("json.codedeck-tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(status())
}

/// Removes every CodeDeck hook, then adds ours for `command` if given.
fn change_hooks(settings: &mut Value, command: Option<&str>) {
    let Some(root) = settings.as_object_mut() else { return };
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().expect("an object");
    for (event, matcher) in EVENTS {
        let groups = hooks.entry(*event).or_insert_with(|| json!([]));
        if let Some(list) = groups.as_array_mut() {
            for group in list.iter_mut() {
                if let Some(inner) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                    inner.retain(|h| !h["command"].as_str().is_some_and(is_ours));
                }
            }
            list.retain(|g| g["hooks"].as_array().is_none_or(|h| !h.is_empty()));
            if let Some(command) = command {
                let hook = json!({ "type": "command", "command": command, "timeout": HOOK_TIMEOUT });
                list.push(match matcher {
                    Some(m) => json!({ "matcher": m, "hooks": [hook] }),
                    None => json!({ "hooks": [hook] }),
                });
            }
        }
        if groups.as_array().is_some_and(Vec::is_empty) {
            hooks.remove(*event);
        }
    }
    if hooks.is_empty() {
        root.remove("hooks");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_and_removes_only_its_own_hooks() {
        let mut s = json!({
            "model": "opus",
            "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "notify-send done" }] }] }
        });
        change_hooks(&mut s, Some("/usr/bin/codedeck hook"));
        assert_eq!(commands(&s, "Stop"), ["notify-send done", "/usr/bin/codedeck hook"]);
        assert_eq!(s["hooks"]["PreToolUse"][0]["matcher"], "Edit|MultiEdit|Write|NotebookEdit|Bash");
        // Again, from another build: replaced, not doubled
        change_hooks(&mut s, Some("/shared/cargo-target/debug/codedeck hook"));
        assert_eq!(commands(&s, "Stop"), ["notify-send done", "/shared/cargo-target/debug/codedeck hook"]);
        change_hooks(&mut s, None);
        assert_eq!(s, json!({ "model": "opus", "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "notify-send done" }] }] } }));
        let mut empty = json!({});
        change_hooks(&mut empty, Some("codedeck hook"));
        change_hooks(&mut empty, None);
        assert_eq!(empty, json!({}));
    }

    #[test]
    fn extracts_no_contents() {
        let hook = json!({
            "session_id": "s1", "hook_event_name": "PreToolUse", "cwd": "/p",
            "tool_name": "Write", "tool_input": { "file_path": "/p/a.rs", "content": "secret" }
        });
        let e = extract(&hook);
        assert_eq!((e["file"].as_str(), e["tool"].as_str()), (Some("/p/a.rs"), Some("Write")));
        assert!(!e.to_string().contains("secret"));
    }
}
