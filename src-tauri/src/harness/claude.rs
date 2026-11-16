//! The adapter for Claude Code. Everything CodeDeck knows about it is here and nowhere else:
//!
//! - its hooks: which events CodeDeck subscribes to, the fields of their messages, and how they
//!   are put into (and taken out of) a configuration's `settings.json`;
//! - its configurations: `~/.claude`, `CLAUDE_CONFIG_DIR`, `~/.claude-*`;
//! - its session logs (`<config>/projects/<folder>/<session>.jsonl`), read to know sessions that
//!   ran before CodeDeck or its hooks were there, and to give every session a title and its
//!   model. The format is Claude Code's own and may change: unknown lines are skipped, and
//!   nothing but these few facts is kept.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Value, json};

use super::{Attach, Capabilities, Connection, Event, EventKind, Harness, SessionInfo};

pub struct Claude;

const ID: &str = "claude";

/// Tools that write the file named in their input.
const WRITE_TOOLS: &[&str] = &["Edit", "MultiEdit", "Write", "NotebookEdit"];

/// The hook events CodeDeck listens to, for which tools, and what they mean.
const EVENTS: &[(&str, Option<&str>, EventKind)] = &[
    ("SessionStart", None, EventKind::SessionStarted),
    ("UserPromptSubmit", None, EventKind::PromptSubmitted),
    // A shell command may change anything, so it counts as a write too
    ("PreToolUse", Some("Edit|MultiEdit|Write|NotebookEdit|Bash"), EventKind::BeforeWrite),
    ("PostToolUse", Some("Edit|MultiEdit|Write|NotebookEdit"), EventKind::AfterWrite),
    ("Notification", None, EventKind::Waiting),
    ("Stop", None, EventKind::TurnDone),
    ("SessionEnd", None, EventKind::SessionEnded),
];

/// Seconds Claude Code waits for the hook at most; a snapshot of a large tree takes a moment.
const HOOK_TIMEOUT: u64 = 30;
/// Only the end of a log is read: the latest prompt, title and writes are there.
const TAIL: u64 = 256 * 1024;
/// A turn's closing words are kept up to this many characters.
const REPORT_MAX: usize = 6000;
/// Logs not written to for this long are no longer of interest.
const RECENT: Duration = Duration::from_secs(24 * 3600);

impl Harness for Claude {
    fn id(&self) -> &'static str {
        ID
    }

    fn name(&self) -> &'static str {
        "Claude Code"
    }

    fn short_name(&self) -> &'static str {
        "Claude"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            live_status: true,
            before_write: true,
            attach: Attach::WithNextPrompt,
            // What the `SessionStart` hook prints is added to the session's context
            start_rules: true,
            past_sessions: true,
            usage: false,
        }
    }

    fn connections(&self) -> Vec<Connection> {
        config_dirs().iter().map(|d| status_of(d)).collect()
    }

    fn follow_program(&self) -> Vec<String> {
        let Ok(current) = std::env::current_exe() else { return Vec::new() };
        config_dirs()
            .into_iter()
            .filter(|d| follow_program(d, &current).unwrap_or(false))
            .map(|d| d.display().to_string())
            .collect()
    }

    fn connect(&self, account: &str, on: bool) -> Result<(), String> {
        let dir = config_dirs()
            .into_iter()
            .find(|d| d.display().to_string() == account)
            .ok_or_else(|| format!("{account}: not a Claude Code configuration CodeDeck knows"))?;
        set_hooks(&dir, on)
    }

    fn translate(&self, raw: &Value) -> Option<Event> {
        let name = raw["hook_event_name"].as_str()?;
        let kind = EVENTS.iter().find(|(event, ..)| *event == name)?.2;
        // "Waiting for your input", a minute after a turn: no question, the turn is simply over.
        // It also comes when the turn was cut short (interrupted, usage limit) and `Stop` never did
        let kind = if raw["notification_type"] == "idle_prompt" { EventKind::TurnDone } else { kind };
        let input = &raw["tool_input"];
        let cut = |v: &Value, n: usize| v.as_str().map(|s| s.chars().take(n).collect::<String>());
        Some(Event {
            harness: ID.to_string(),
            session: raw["session_id"].as_str().unwrap_or_default().to_string(),
            kind,
            cwd: cut(&raw["cwd"], usize::MAX),
            file: cut(&input["file_path"], usize::MAX).or_else(|| cut(&input["notebook_path"], usize::MAX)),
            tool: cut(&raw["tool_name"], usize::MAX),
            prompt: cut(&raw["prompt"], 300).map(|p| plain_prompt(&p)),
            message: cut(&raw["message"], 300),
            report: cut(&raw["last_assistant_message"], REPORT_MAX).filter(|_| kind == EventKind::TurnDone),
            log: cut(&raw["transcript_path"], usize::MAX),
            writes: if raw["tool_name"] == "Bash" { input["command"].as_str().map(shell_outputs).unwrap_or_default() } else { Vec::new() },
            // `startup`, `resume`, `clear`, `compact`: after clearing or compacting what it was
            // told is gone, so only a resumed session still has the rules
            resumed: kind == EventKind::SessionStarted && raw["source"] == "resume",
        })
    }

    /// Claude Code adds what the `UserPromptSubmit` hook prints to that prompt, and what the
    /// `SessionStart` hook prints to the session's context. Other hooks must print nothing.
    fn reply(&self, event: &Event, handed: &[String]) -> Option<String> {
        let speaks = matches!(event.kind, EventKind::PromptSubmitted | EventKind::SessionStarted);
        (speaks && !handed.is_empty()).then(|| handed.join("\n\n"))
    }

    fn past_sessions(&self, project: &Path) -> Vec<SessionInfo> {
        recent(project)
    }

    /// Everything in a configuration (memory, settings, logs, to-dos) except its plans: a plan is
    /// written for the user to read and may be worth keeping in the project.
    fn is_own_file(&self, path: &Path) -> bool {
        config_dirs().iter().any(|dir| path.starts_with(dir) && !path.starts_with(dir.join("plans")))
    }

    fn page_hosts(&self) -> &'static [&'static str] {
        &["claude.ai"]
    }

    fn read_log(&self, log: &Path) -> Option<SessionInfo> {
        read(log)
    }
}

/// What the user asked, as a turn is named after it. Claude Code also hands notices of its own in
/// as a prompt (a background task finished: `<task-notification>…`); their raw markup would name the
/// turn and its snapshots, so they get a short name instead.
fn plain_prompt(prompt: &str) -> String {
    let text = prompt.trim_start();
    if text.starts_with("<task-notification>") {
        "Background task finished".to_string()
    } else if text.starts_with('<') && text.contains("</") && text.split_whitespace().next().is_some_and(|w| w.ends_with('>')) {
        "Notice from Claude Code".to_string()
    } else {
        prompt.to_string()
    }
}

/* ── Configurations and hooks ─────────────────────────────────────────────── */

/// Every Claude Code configuration on this machine: `~/.claude`, the one `CLAUDE_CONFIG_DIR`
/// points to, and other `~/.claude-*` folders that are one (with `projects/` or `settings.json`).
/// Several are common: one per account, each started with its own `CLAUDE_CONFIG_DIR`. A
/// CodeDeck started from the desktop menu does not see that variable, so all are looked for.
/// The files a shell command names as its output: after `>`, `>>` and `tee`, absolute or from
/// the home folder. Only a guess from the text; what does not appear on disk is never shown.
fn shell_outputs(command: &str) -> Vec<String> {
    let home = std::env::home_dir().unwrap_or_default();
    let words: Vec<&str> = command.split_whitespace().collect();
    let mut found = Vec::new();
    for (i, word) in words.iter().enumerate() {
        // `>file` and `> file`; `2>`, `&>` and `>&2` alike
        let target = if let Some(at) = word.find('>') {
            let after = word[at..].trim_start_matches('>');
            if after.is_empty() { words.get(i + 1).copied() } else { Some(after) }
        } else if *word == "tee" {
            words[i + 1..].iter().find(|w| !w.starts_with('-')).copied()
        } else {
            None
        };
        let Some(target) = target.map(|t| t.trim_matches(|c| c == '"' || c == '\'' || c == ';')) else { continue };
        let path = match target.strip_prefix("~/") {
            Some(rest) => home.join(rest),
            None if target.starts_with('/') => PathBuf::from(target),
            None => continue,
        };
        let path = path.to_string_lossy().into_owned();
        if !found.contains(&path) {
            found.push(path);
        }
    }
    found
}

fn config_dirs() -> Vec<PathBuf> {
    let home = std::env::home_dir().unwrap_or_default();
    let is_config = |d: &Path| d.join("projects").is_dir() || d.join("settings.json").is_file();
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

/// A hook command CodeDeck put there, from this or another installation. The command was
/// `codedeck` until it became `codeck` (D24); hooks with either name are ours.
fn is_ours(command: &str) -> bool {
    let lower = command.to_lowercase();
    command.trim_end().ends_with(" hook") && (lower.contains("codedeck") || lower.contains("codeck"))
}

/// The program a hook command runs, without ` hook` and the quotes `hook::command` may add.
fn program_of(command: &str) -> PathBuf {
    let program = command.trim_end().strip_suffix(" hook").unwrap_or(command).trim();
    let unquoted = program
        .strip_prefix('\'')
        .and_then(|p| p.strip_suffix('\''))
        .map(|p| p.replace(r"'\''", "'"))
        .unwrap_or_else(|| program.to_string());
    PathBuf::from(unquoted)
}

/// Whether a hook of ours is left over from this installation, so it may follow along without
/// asking: its program is gone, or it is the old `codedeck` next to the running `codeck` (a
/// build folder or an install that kept the old file). Another installation that still exists
/// is not touched; the connection panel offers "Use this one" for that.
fn left_over(command: &str, current: &Path) -> bool {
    let old = program_of(command);
    if old == current {
        return false;
    }
    if !old.is_file() {
        return true;
    }
    old.parent() == current.parent() && old.file_name().is_some_and(|n| n == "codedeck")
}

/// Points this configuration's hooks at the running program if they are left over (see
/// [`left_over`]). Returns whether something changed.
fn follow_program(dir: &Path, current: &Path) -> Result<bool, String> {
    let settings = read_settings(&dir.join("settings.json"))?;
    let ours: Vec<String> = EVENTS.iter().flat_map(|(event, ..)| commands(&settings, event)).filter(|c| is_ours(c)).collect();
    if ours.is_empty() || !ours.iter().any(|c| program_of(c) != current) || !ours.iter().all(|c| program_of(c) == current || left_over(c, current)) {
        return Ok(false);
    }
    set_hooks(dir, true)?;
    Ok(true)
}

/// Whether CodeDeck's hooks are in the settings of one configuration.
fn status_of(dir: &Path) -> Connection {
    let path = dir.join("settings.json");
    let settings = read_settings(&path).unwrap_or(Value::Null);
    let command = crate::hook::command();
    let found: Vec<String> = EVENTS
        .iter()
        .flat_map(|(event, ..)| commands(&settings, event))
        .filter(|c| is_ours(c))
        .collect();
    Connection {
        harness: ID,
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

fn read_settings(path: &Path) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(json!({})),
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{}: not valid JSON ({e}); left alone", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// Puts CodeDeck's hooks into the settings of one configuration, or takes them out. Everything
/// else in the file stays as it is; the file as it was is kept next to it once.
fn set_hooks(dir: &Path, install: bool) -> Result<(), String> {
    let path = dir.join("settings.json");
    let before = std::fs::read_to_string(&path).ok();
    let mut settings = read_settings(&path)?;
    if !settings.is_object() {
        return Err(format!("{}: not a JSON object; left alone", path.display()));
    }
    change_hooks(&mut settings, install.then(crate::hook::command).as_deref());

    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())? + "\n";
    if before.as_deref() == Some(text.as_str()) {
        return Ok(());
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
    Ok(())
}

/// Removes every CodeDeck hook, then adds ours for `command` if given.
fn change_hooks(settings: &mut Value, command: Option<&str>) {
    let Some(root) = settings.as_object_mut() else { return };
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().expect("an object");
    for (event, matcher, _) in EVENTS {
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

/* ── Session logs ─────────────────────────────────────────────────────────── */

/// Claude Code's folder name for a working directory: every character other than a letter,
/// digit or `-` becomes `-`.
fn folder_name(dir: &Path) -> String {
    dir.to_string_lossy().chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }).collect()
}

/// Sessions of the last day whose working directory is the project, lies inside it, or contains
/// it, from every configuration.
fn recent(root: &Path) -> Vec<SessionInfo> {
    let ours = folder_name(root);
    let ancestors: Vec<String> = root.ancestors().skip(1).map(folder_name).collect();
    let mut found = Vec::new();
    for config in config_dirs() {
        for folder in std::fs::read_dir(config.join("projects")).into_iter().flatten().flatten() {
            let name = folder.file_name().to_string_lossy().into_owned();
            // A cheap first choice by name; the working directory in the log decides
            if !(name == ours || name.starts_with(&format!("{ours}-")) || ancestors.contains(&name)) {
                continue;
            }
            for log in std::fs::read_dir(folder.path()).into_iter().flatten().flatten() {
                let path = log.path();
                let fresh = log.metadata().and_then(|m| m.modified()).is_ok_and(|t| t.elapsed().is_ok_and(|e| e < RECENT));
                if path.extension().is_some_and(|e| e == "jsonl") && fresh {
                    if let Some(seen) = read(&path).filter(|s| s.cwd.as_deref().is_some_and(|c| c.starts_with(root) || root.starts_with(c))) {
                        found.push(seen);
                    }
                }
            }
        }
    }
    found
}

/// Reads the end of one log; `None` when it says nothing usable.
fn read(path: &Path) -> Option<SessionInfo> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(TAIL))).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    // After a cut the first line is a fragment
    let lines = text.lines().skip(usize::from(len > TAIL));
    let mut seen = parse(lines);
    if seen.id.is_empty() {
        seen.id = path.file_stem()?.to_string_lossy().into_owned();
    }
    (seen.last > 0).then_some(seen)
}

fn parse<'a>(lines: impl Iterator<Item = &'a str>) -> SessionInfo {
    let mut seen = SessionInfo::default();
    // A name the user gave the session in Claude Code goes before the generated one
    let mut custom = None;
    for line in lines {
        let Ok(entry) = serde_json::from_str::<Value>(line) else { continue };
        let str_of = |key: &str| entry[key].as_str().map(String::from);
        if let Some(id) = str_of("sessionId") {
            seen.id = id;
        }
        let at = entry["timestamp"].as_str().and_then(iso_ms);
        if let Some(at) = at {
            seen.last = seen.last.max(at);
        }
        if let Some(cwd) = str_of("cwd") {
            seen.cwd = Some(PathBuf::from(cwd));
        }
        match entry["type"].as_str().unwrap_or_default() {
            "ai-title" => seen.title = str_of("aiTitle").or(seen.title.take()),
            "custom-title" => custom = str_of("customTitle").or(custom.take()),
            "last-prompt" => seen.prompt = str_of("lastPrompt").map(|p| plain_prompt(&p)).or(seen.prompt.take()),
            "user" => {
                if let Some(text) = entry["message"]["content"].as_str() {
                    seen.prompt = Some(plain_prompt(text));
                    // A new turn: what was said before belongs to the last one
                    seen.report = None;
                }
            }
            "assistant" => {
                let message = &entry["message"];
                if let Some(model) = message["model"].as_str() {
                    // Every model id starts with the vendor's name; shown without it
                    seen.model = Some(model.strip_prefix("claude-").unwrap_or(model).to_string());
                }
                for part in message["content"].as_array().into_iter().flatten() {
                    // The main thread's words only, not those of a helper it started
                    if part["type"] == "text" && entry["isSidechain"] != true {
                        if let Some(text) = part["text"].as_str().filter(|t| !t.trim().is_empty()) {
                            seen.report = Some(text.chars().take(REPORT_MAX).collect());
                        }
                    }
                    let writes = part["name"].as_str().is_some_and(|n| WRITE_TOOLS.contains(&n));
                    let file = part["input"]["file_path"].as_str().or_else(|| part["input"]["notebook_path"].as_str());
                    if part["type"] == "tool_use" && writes {
                        if let Some(file) = file {
                            seen.writes.push((PathBuf::from(file), at.unwrap_or(seen.last)));
                        }
                    }
                }
            }
            _ => {}
        }
    }
    seen.title = custom.or(seen.title);
    seen
}

/// `2026-11-13T14:48:56.098Z` to Unix milliseconds; only that form (UTC), as Claude Code writes.
fn iso_ms(text: &str) -> Option<u64> {
    let b = text.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[10] != b'T' || !text.ends_with('Z') {
        return None;
    }
    let num = |r: std::ops::Range<usize>| text.get(r)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, min, s) = (num(11..13)?, num(14..16)?, num(17..19)?);
    let ms = if b.get(19) == Some(&b'.') { num(20..23).unwrap_or(0) } else { 0 };
    // Days since 1970-01-01 for a date in the proleptic Gregorian calendar
    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * m + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    u64::try_from(((days * 24 + h) * 60 + min) * 60 + s).ok().map(|secs| secs * 1000 + ms as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Raw hook messages as Claude Code 2.1 sent them in the field test of step 1.1, rebuilt from
    /// its notes (the recording itself was not kept): the fields named there, with made-up values.
    const RECORDED: &[&str] = &[
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"SessionStart","source":"startup","model":"claude-haiku-5-5"}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"UserPromptSubmit","prompt":"Add a note to the readme"}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/p/README.md","content":"secret text"}}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"PostToolUse","tool_name":"Write","tool_input":{"file_path":"/p/README.md","content":"secret text"},"tool_response":{"type":"create","filePath":"/p/README.md"}}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"touch /tmp/x","description":"Create a file"}}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"Notification","notification_type":"permission_prompt","message":"Claude needs your permission to use Bash"}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"Stop","stop_hook_active":false,"last_assistant_message":"Done."}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"SessionEnd","reason":"prompt_input_exit"}"#,
        r#"{"session_id":"3f9c2a71","cwd":"/p","hook_event_name":"PreCompact","trigger":"auto"}"#,
        r#"{"session_id":"3f9c2a71","transcript_path":"/c/projects/-p/3f9c2a71.jsonl","cwd":"/p","permission_mode":"default","hook_event_name":"Notification","notification_type":"idle_prompt","message":"Claude is waiting for your input"}"#,
    ];

    #[test]
    fn guesses_the_files_a_shell_command_writes() {
        let home = std::env::home_dir().unwrap_or_default().to_string_lossy().into_owned();
        let out = shell_outputs("cat > /tmp/plan.md <<'EOF' && echo ok 2>/dev/null >&2 | tee -a ~/notes.txt; echo x >>rel.txt");
        assert_eq!(out, ["/tmp/plan.md".to_string(), "/dev/null".to_string(), format!("{home}/notes.txt")]);
    }

    #[test]
    fn translates_recorded_hook_messages() {
        let events: Vec<Option<Event>> = RECORDED.iter().map(|raw| Claude.translate(&serde_json::from_str(raw).unwrap())).collect();
        let kinds: Vec<Option<EventKind>> = events.iter().map(|e| e.as_ref().map(|e| e.kind)).collect();
        use EventKind::*;
        assert_eq!(
            kinds,
            [SessionStarted, PromptSubmitted, BeforeWrite, AfterWrite, BeforeWrite, Waiting, TurnDone, SessionEnded]
                .map(Some)
                .into_iter()
                .chain([None]) // an event CodeDeck does not subscribe to
                .chain([Some(TurnDone)]) // waiting for the next prompt is the end of a turn, not a question
                .collect::<Vec<_>>()
        );
        let event = |i: usize| events[i].clone().unwrap();
        assert!(events.iter().flatten().all(|e| e.harness == "claude" && e.session == "3f9c2a71" && e.cwd.as_deref() == Some("/p")));
        assert_eq!(event(0).log.as_deref(), Some("/c/projects/-p/3f9c2a71.jsonl"));
        assert_eq!(event(1).prompt.as_deref(), Some("Add a note to the readme"));
        assert_eq!((event(2).tool.as_deref(), event(2).file.as_deref()), (Some("Write"), Some("/p/README.md")));
        // A shell command names no file: it may change anything
        assert_eq!((event(4).tool.as_deref(), event(4).file), (Some("Bash"), None));
        assert_eq!(event(5).message.as_deref(), Some("Claude needs your permission to use Bash"));
        // No file contents and no commands leave the hook; of the answers only the turn's last words
        let sent = serde_json::to_string(&events).unwrap();
        assert!(!sent.contains("secret") && !sent.contains("touch"));
        assert_eq!((event(6).report.as_deref(), event(5).report), (Some("Done."), None));
    }

    #[test]
    fn speaks_only_with_a_prompt_and_at_the_start() {
        let event = |i: usize| Claude.translate(&serde_json::from_str(RECORDED[i]).unwrap()).unwrap();
        let handed = ["focus".to_string(), "comments".to_string()];
        assert_eq!(Claude.reply(&event(1), &handed).as_deref(), Some("focus\n\ncomments"));
        assert_eq!(Claude.reply(&event(1), &[]), None);
        // The start rules, printed by `SessionStart`
        assert_eq!(Claude.reply(&event(0), &handed[..1]).as_deref(), Some("focus"));
        assert!(!event(0).resumed);
        for i in 2..RECORDED.len() - 2 {
            assert_eq!(Claude.reply(&event(i), &handed), None, "{}", RECORDED[i]);
        }
        let resumed = RECORDED[0].replace("startup", "resume");
        assert!(Claude.translate(&serde_json::from_str(&resumed).unwrap()).unwrap().resumed);
        let cleared = RECORDED[0].replace("startup", "clear");
        assert!(!Claude.translate(&serde_json::from_str(&cleared).unwrap()).unwrap().resumed);
    }

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

    /// In a configuration of its own: never the real `~/.claude/settings.json`.
    #[test]
    fn connects_and_disconnects_a_configuration() {
        let dir = std::env::temp_dir().join(format!("codedeck-claude-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let settings = dir.join("settings.json");
        std::fs::write(&settings, "{\n  \"model\": \"opus\"\n}\n").unwrap();

        assert!(!status_of(&dir).installed);
        set_hooks(&dir, true).unwrap();
        let status = status_of(&dir);
        assert!(status.installed && status.other.is_none() && status.harness == "claude");
        assert_eq!(std::fs::read_to_string(dir.join("settings.json.before-codedeck")).unwrap(), "{\n  \"model\": \"opus\"\n}\n");
        set_hooks(&dir, false).unwrap();
        assert!(!status_of(&dir).installed);
        assert_eq!(std::fs::read_to_string(&settings).unwrap(), "{\n  \"model\": \"opus\"\n}\n");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn knows_both_command_names_and_what_is_left_over() {
        assert!(is_ours("/usr/bin/codedeck hook") && is_ours("/usr/bin/codeck hook") && is_ours("'/a b/codeck' hook"));
        assert!(!is_ours("/usr/bin/codeck") && !is_ours("notify-send hook"));
        assert_eq!(program_of("'/a b/it'\\''s/codeck' hook"), PathBuf::from("/a b/it's/codeck"));

        let tmp = std::env::temp_dir().join(format!("codedeck-left-over-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        for dir in ["bin", "other"] {
            std::fs::create_dir_all(tmp.join(dir)).unwrap();
        }
        let current = tmp.join("bin/codeck");
        for file in ["bin/codeck", "bin/codedeck", "other/codeck"] {
            std::fs::write(tmp.join(file), "").unwrap();
        }
        let hook = |p: &str| format!("{} hook", tmp.join(p).display());
        assert!(!left_over(&hook("bin/codeck"), &current), "the running program");
        assert!(left_over(&hook("bin/codedeck"), &current), "the old name next to it");
        assert!(left_over(&hook("gone/codedeck"), &current), "a program that is gone");
        assert!(!left_over(&hook("other/codeck"), &current), "another installation");
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// In a configuration of its own: never the real `~/.claude/settings.json`.
    #[test]
    fn hooks_follow_the_program_only_when_left_over() {
        let tmp = std::env::temp_dir().join(format!("codedeck-follow-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("other")).unwrap();
        let current = std::env::current_exe().unwrap();
        let with = |command: &str| {
            let mut s = json!({ "model": "opus" });
            change_hooks(&mut s, Some(command));
            std::fs::write(tmp.join("settings.json"), serde_json::to_string_pretty(&s).unwrap()).unwrap();
        };
        let now = || commands(&read_settings(&tmp.join("settings.json")).unwrap(), "Stop");

        // The old command, its program gone: moved to the running one
        with("/nowhere/codedeck hook");
        assert!(follow_program(&tmp, &current).unwrap());
        assert_eq!(now(), [crate::hook::command()]);
        // Already there: nothing to do
        assert!(!follow_program(&tmp, &current).unwrap());
        // Another installation that exists: left to the user
        let other = tmp.join("other/codeck");
        std::fs::write(&other, "").unwrap();
        with(&format!("{} hook", other.display()));
        assert!(!follow_program(&tmp, &current).unwrap());
        assert_eq!(now(), [format!("{} hook", other.display())]);
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn names_turns_after_what_was_asked_not_after_notices() {
        assert_eq!(plain_prompt("Fix the <b> tag in index.html"), "Fix the <b> tag in index.html");
        assert_eq!(plain_prompt("<task-notification> <task-id>b1</task-id> …"), "Background task finished");
        assert_eq!(plain_prompt("<system-reminder>x</system-reminder>"), "Notice from Claude Code");
    }

    #[test]
    fn names_folders_like_claude_code() {
        assert_eq!(folder_name(Path::new("/home/a/projects/be-spex/CodeDeck")), "-home-a-projects-be-spex-CodeDeck");
        assert_eq!(folder_name(Path::new("/home/a/.cache/x_y.z")), "-home-a--cache-x-y-z");
    }

    #[test]
    fn reads_dates() {
        assert_eq!(iso_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(iso_ms("2026-11-13T14:48:56.098Z"), Some(1_794_581_336_098));
        assert_eq!(iso_ms("2024-02-29T12:00:00Z"), Some(1_709_208_000_000));
        assert_eq!(iso_ms("yesterday"), None);
    }

    #[test]
    fn takes_title_model_prompt_and_writes() {
        let log = [
            r#"{"type":"user","sessionId":"s1","cwd":"/p","timestamp":"2026-11-13T10:00:00.000Z","message":{"role":"user","content":"Fix the limiter"}}"#,
            r#"not json"#,
            r#"{"type":"assistant","sessionId":"s1","cwd":"/p","timestamp":"2026-11-13T10:00:05.000Z","message":{"model":"claude-opus-5-5","content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Edit","input":{"file_path":"/p/a.rs","old_string":"x"}},{"type":"tool_use","name":"Read","input":{"file_path":"/p/b.rs"}}]}}"#,
            r#"{"type":"ai-title","sessionId":"s1","aiTitle":"Rate limiter fix"}"#,
            r#"{"type":"user","sessionId":"s1","cwd":"/p","timestamp":"2026-11-13T10:01:00.000Z","message":{"role":"user","content":[{"type":"tool_result","content":"done"}]}}"#,
        ];
        let s = parse(log.into_iter());
        assert_eq!(s.id, "s1");
        assert_eq!((s.title.as_deref(), s.model.as_deref(), s.prompt.as_deref()), (Some("Rate limiter fix"), Some("opus-5-5"), Some("Fix the limiter")));
        assert_eq!(s.writes, vec![(PathBuf::from("/p/a.rs"), iso_ms("2026-11-13T10:00:05.000Z").unwrap())]);
        assert_eq!(s.last, iso_ms("2026-11-13T10:01:00.000Z").unwrap());
        assert_eq!(s.cwd.as_deref(), Some(Path::new("/p")));
        // What it said last in this turn; a new prompt starts over
        assert_eq!(s.report.as_deref(), Some("ok"));
        let asked_again = [log[2], log[0]];
        assert_eq!(parse(asked_again.into_iter()).report, None);

        // Named by the user: that name wins, wherever the generated title stands
        let named = [r#"{"type":"custom-title","customTitle":"Limiter","sessionId":"s1"}"#, log[3]];
        assert_eq!(parse(named.into_iter()).title.as_deref(), Some("Limiter"));
    }

    /// Against the real logs of this machine: `cargo test real_logs -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_logs() {
        let root = std::env::var("CODEDECK_ROOT").unwrap_or_else(|_| env!("CARGO_MANIFEST_DIR").to_string() + "/..");
        for s in recent(&PathBuf::from(root).canonicalize().unwrap()) {
            println!("{} {:?} {:?} {:?} writes={} last={}", &s.id[..8], s.title, s.model, s.cwd, s.writes.len(), s.last);
        }
    }
}
