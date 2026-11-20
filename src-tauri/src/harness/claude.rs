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

use crate::usage::{Usage, Window};
use super::{Attach, Background, Capabilities, Connection, Event, EventKind, Harness, Parked, Place, SessionInfo, Tmux};

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
            usage: true,
            desktop_profiles: true,
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

    fn connect_usage(&self, account: &str, on: bool) -> Result<(), String> {
        let dir = config_dirs()
            .into_iter()
            .find(|d| d.display().to_string() == account)
            .ok_or_else(|| format!("{account}: not a Claude Code configuration CodeDeck knows"))?;
        set_statusline(&dir, on)
    }

    fn translate_usage(&self, raw: &Value) -> Option<Usage> {
        let window = |w: &Value| Some(Window { used: w["used_percentage"].as_f64()?, resets_at: w["resets_at"].as_u64()? });
        let limits = &raw["rate_limits"];
        let (five_hour, seven_day) = (window(&limits["five_hour"]), window(&limits["seven_day"]));
        if five_hour.is_none() && seven_day.is_none() {
            return None;
        }
        Some(Usage { account: account_of(raw["transcript_path"].as_str()), five_hour, seven_day })
    }

    fn translate(&self, raw: &Value) -> Option<Event> {
        let name = raw["hook_event_name"].as_str()?;
        let kind = EVENTS.iter().find(|(event, ..)| *event == name)?.2;
        // "Waiting for your input", a minute after a turn: no question, the turn is simply over.
        // Not a safe net for a turn cut short: after a denied permission plus Esc neither `Stop` nor
        // this came (journal 2026-11-17, plan step 2.3c)
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
            detail: input["command"].as_str().map(detail_of),
            prompt: cut(&raw["prompt"], 300).map(|p| plain_prompt(&p)),
            message: cut(&raw["message"], 300),
            report: cut(&raw["last_assistant_message"], REPORT_MAX).filter(|_| kind == EventKind::TurnDone),
            log: cut(&raw["transcript_path"], usize::MAX),
            writes: if raw["tool_name"] == "Bash" { input["command"].as_str().map(shell_outputs).unwrap_or_default() } else { Vec::new() },
            // `startup`, `resume`, `clear`, `compact`: after clearing or compacting what it was
            // told is gone, so only a resumed session still has the rules
            resumed: kind == EventKind::SessionStarted && raw["source"] == "resume",
            // Only `Stop` says it; "waiting for your input" a minute later knows nothing of it
            background: (name == "Stop").then(|| running_tasks(raw)),
            task_ended: raw["prompt"].as_str().and_then(task_ended_by),
            account: raw["transcript_path"].as_str().and_then(account_from_log),
            place: None,
        })
    }

    /// Remote Control: while a session is connected, Claude Code (2.1.199 and later) gives its hooks
    /// the remote session's id, the same as in its claude.ai/code address. Gone when the connection
    /// is, so this also tells whether the session is reachable right now.
    /// A configuration with session logs under `projects/` is in use. Without, a folder whose name
    /// says copy, backup or cleanup, or that holds nothing but settings files, is taken for a
    /// backup; any other is a configuration not used yet. `~/.claude` is never a backup.
    fn account_kind(&self, dir: &Path) -> crate::harness::AccountKind {
        use crate::harness::AccountKind;
        let logs = std::fs::read_dir(dir.join("projects"))
            .into_iter()
            .flatten()
            .flatten()
            .any(|p| std::fs::read_dir(p.path()).into_iter().flatten().flatten().any(|f| f.path().extension().is_some_and(|e| e == "jsonl")));
        if logs {
            return AccountKind::Used;
        }
        let home = std::env::home_dir().unwrap_or_default();
        if dir == home.join(".claude") {
            return AccountKind::Unused;
        }
        let name = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        let named = ["backup", "bak", "cleanup", "copy", "old", "kopie"].iter().any(|w| name.contains(w));
        let only_settings = std::fs::read_dir(dir).into_iter().flatten().flatten().all(|e| e.file_name().to_string_lossy().starts_with("settings"));
        if named || only_settings { AccountKind::Backup } else { AccountKind::Unused }
    }

    /// Claude Desktop keeps its data in `~/.config/Claude`; a second profile is started with
    /// `--user-data-dir`, by habit as `~/.config/claude-desktop-<name>`.
    fn desktop_profiles(&self) -> Vec<String> {
        let config = std::env::home_dir().unwrap_or_default().join(".config");
        let mut found: Vec<String> = std::fs::read_dir(&config)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_lowercase();
                e.path().is_dir() && (name == "claude" || name.starts_with("claude-desktop"))
            })
            .map(|e| e.path().display().to_string())
            .collect();
        found.sort();
        found
    }

    /// `--user-data-dir` makes the app keep everything in a folder of its own, created on the first
    /// start; by habit `~/.config/claude-desktop-<name>`. A name already taken gets a number.
    fn new_desktop_profile(&self, name: &str) -> Option<(String, Vec<String>)> {
        let slug: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
        let slug = slug.trim_matches('-');
        let base = std::env::home_dir()?.join(".config");
        let stem = format!("claude-desktop-{}", if slug.is_empty() { "account" } else { slug });
        let dir = (1..)
            .map(|n| base.join(if n == 1 { stem.clone() } else { format!("{stem}-{n}") }))
            .find(|d| !d.exists())?
            .display()
            .to_string();
        let command = vec!["claude-desktop".to_string(), format!("--user-data-dir={dir}")];
        Some((dir, command))
    }

    /// `claude --session-id <id>` (or `--resume <id>`) with a name and Remote Control, so that the
    /// session is reachable from Claude Desktop, the browser and the phone at once (B2, B4). The
    /// account is the configuration folder (`CLAUDE_CONFIG_DIR`).
    fn launch(&self, launch: &crate::harness::Launch) -> Option<crate::harness::Launched> {
        let argv = [
            "claude",
            if launch.resume { "--resume" } else { "--session-id" },
            launch.id,
            "-n",
            launch.name,
            "--remote-control",
            launch.name,
        ];
        let env = launch.account.map(|dir| ("CLAUDE_CONFIG_DIR".to_string(), dir.to_string())).into_iter().collect();
        Some(crate::harness::Launched { argv: argv.iter().map(|a| a.to_string()).collect(), env })
    }

    /// Claude Desktop opens `claude://claude.ai/<path>` as that claude.ai page in the app: for a
    /// remote session exactly that session (tried 2026-11-17 on Linux, docs/SITZUNGEN.md B4). With
    /// two app profiles `claude://` belongs to one of them, so with a profile known for the
    /// account the app of that profile is started with the link; else the system's handler takes it.
    fn desktop_command(&self, remote: &str, profile: Option<&str>) -> Option<Vec<String>> {
        let link = format!("claude://claude.ai/{}", remote.strip_prefix("https://claude.ai/")?);
        Some(match profile {
            Some(dir) => vec!["claude-desktop".into(), format!("--user-data-dir={dir}"), link],
            None => vec!["xdg-open".into(), link],
        })
    }

    /// Background sessions (`/background`, `claude --bg`, Claude Code 2.1.32x) run in Claude Code's
    /// daemon: `CLAUDE_CODE_SESSION_KIND=bg`, and the job folder is named after the handle that
    /// `claude attach` takes (tried 2026-11-20 with 2.1.329).
    fn background_job(&self, var: &dyn Fn(&str) -> Option<String>) -> Option<String> {
        (var("CLAUDE_CODE_SESSION_KIND")? == "bg").then_some(())?;
        let dir = var("CLAUDE_JOB_DIR")?;
        Path::new(&dir).file_name()?.to_str().map(String::from)
    }

    fn parked(&self, project: &Path) -> Vec<Parked> {
        config_dirs().iter().flat_map(|dir| parked_in(dir, project)).collect()
    }

    /// `claude attach <handle>` in the session's account. Leaving with Ctrl+Z keeps it running.
    fn attach(&self, job: &str, account: Option<&str>) -> Option<crate::harness::Launched> {
        let env = account.map(|dir| ("CLAUDE_CONFIG_DIR".to_string(), dir.to_string())).into_iter().collect();
        Some(crate::harness::Launched { argv: vec!["claude".into(), "attach".into(), job.into()], env })
    }

    fn remote_link(&self, var: &dyn Fn(&str) -> Option<String>) -> Option<String> {
        let id = var("CLAUDE_CODE_BRIDGE_SESSION_ID")?;
        let plain = id.starts_with("session_") && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        plain.then(|| format!("https://claude.ai/code/{id}"))
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

    /// Claude Code keeps a file per running process in `<config>/sessions/<pid>.json` (seen with
    /// 2.1.327): the session's id, its folder, the process's start time, its tmux pane and its
    /// Remote Control session. A file of a process that is gone may stay behind; the start time
    /// lets [`crate::place::alive`] tell.
    fn running(&self, project: &Path) -> Vec<(String, Place)> {
        config_dirs()
            .iter()
            .flat_map(|dir| std::fs::read_dir(dir.join("sessions")).into_iter().flatten().flatten())
            .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
            .filter_map(|e| serde_json::from_slice::<Value>(&std::fs::read(e.path()).ok()?).ok())
            .filter_map(|v| running_entry(&v, project))
            .filter(|(_, place)| crate::place::alive(place) == Some(true))
            .collect()
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

    fn cut_short(&self, log: &Path, since: u64) -> bool {
        interrupted_after(log, since)
    }
}

/// How much of a log's end is looked at for an interruption: it is the last thing there.
const INTERRUPT_TAIL: u64 = 32 * 1024;

/// Whether the log ends in the user's interruption, written after `since`. Neither `Stop` nor
/// `idle_prompt` come then (journal 2026-11-17): after "no" to a permission and Esc, or Esc while
/// it works, the log is the only place that says the turn is over. The entry is a user message
/// reading `[Request interrupted by user]`, or `… for tool use]`.
fn interrupted_after(log: &Path, since: u64) -> bool {
    let Ok(mut file) = File::open(log) else { return false };
    let len = file.metadata().map_or(0, |m| m.len());
    if file.seek(SeekFrom::Start(len.saturating_sub(INTERRUPT_TAIL))).is_err() {
        return false;
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return false;
    }
    let text = String::from_utf8_lossy(&bytes);
    // Only the last entry that says anything about the turn counts: a prompt after it wins
    for line in text.lines().rev() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else { continue };
        if entry["type"] != "user" {
            continue;
        }
        let first = &entry["message"]["content"][0];
        let said = first["text"].as_str().or(entry["message"]["content"].as_str()).unwrap_or_default();
        // A tool's result is also a "user" entry; it is no interruption and no new prompt
        if first["type"] == "tool_result" {
            continue;
        }
        let at = entry["timestamp"].as_str().and_then(iso_ms).unwrap_or(0);
        return said.starts_with("[Request interrupted by user") && at > since;
    }
    false
}

/// What still runs when a turn ends: `Stop` lists it as `background_tasks`. Idle sessions
/// (`idle_prompt`) list none, they came after `Stop` already said it.
fn running_tasks(raw: &Value) -> Vec<Background> {
    raw["background_tasks"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|t| t["status"] == "running")
        .filter_map(|t| {
            let text = t["description"].as_str().or(t["command"].as_str()).unwrap_or_default();
            Some(Background {
                id: t["id"].as_str()?.to_string(),
                kind: t["type"].as_str().unwrap_or("task").to_string(),
                text: text.chars().take(120).collect(),
            })
        })
        .collect()
}

/// The prompt Claude Code makes when a background task ends names it: `<task-id>…</task-id>`.
fn task_ended_by(prompt: &str) -> Option<String> {
    let text = prompt.trim_start().strip_prefix("<task-notification>")?;
    let id = text.split("<task-id>").nth(1)?.split("</task-id>").next()?.trim();
    (!id.is_empty()).then(|| id.to_string())
}

/// The configuration folder a session's log lies in: `<folder>/projects/<project>/<session>.jsonl`.
fn account_from_log(log: &str) -> Option<String> {
    let path = Path::new(log);
    path.ancestors().find(|dir| dir.file_name().is_some_and(|n| n == "projects")).and_then(Path::parent).map(|d| d.display().to_string())
}

/// The account a message belongs to: its log says, else the folder the tool was started with.
fn account_of(log: Option<&str>) -> String {
    log.and_then(account_from_log).unwrap_or_else(|| {
        std::env::var("CLAUDE_CONFIG_DIR")
            .ok()
            .filter(|d| !d.is_empty())
            .unwrap_or_else(|| std::env::home_dir().unwrap_or_default().join(".claude").display().to_string())
    })
}

/// What the user asked, as a turn is named after it. Claude Code also hands notices of its own in
/// as a prompt (a background task finished: `<task-notification>…`); their raw markup would name the
/// turn and its snapshots, so they get a short name instead.
/// A shell command as it is shown while the session asks to run it: its first line, shortened.
fn detail_of(command: &str) -> String {
    let first = command.trim().lines().next().unwrap_or_default();
    let mut shown: String = first.chars().take(200).collect();
    if shown.len() < first.len() || command.trim().lines().nth(1).is_some() {
        shown.push('…');
    }
    shown
}

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

/// One record of a running process (see [`Claude::running`]), if it is a session in `project`.
fn running_entry(v: &Value, project: &Path) -> Option<(String, Place)> {
    let id = v.get("sessionId")?.as_str()?.to_string();
    if !Path::new(v.get("cwd")?.as_str()?).starts_with(project) {
        return None;
    }
    let pid = u32::try_from(v.get("pid")?.as_u64()?).ok()?;
    let since = v.get("procStart").and_then(|s| s.as_str().and_then(|s| s.parse().ok()).or_else(|| s.as_u64()))?;
    // `session:@window.%pane`
    let tmux = v.get("tmux").and_then(Value::as_str).and_then(|t| {
        let (session, rest) = t.rsplit_once(':')?;
        let pane = rest.rsplit_once('.').map_or(rest, |(_, p)| p);
        Some(Tmux { pane: pane.to_string(), session: Some(session.to_string()) })
    });
    let bridge = v.get("bridgeSessionId").and_then(Value::as_str).map(String::from);
    let remote = Claude.remote_link(&|name| (name == "CLAUDE_CODE_BRIDGE_SESSION_ID").then(|| bridge.clone()).flatten());
    // A background session's process is the daemon's: `kind` says so, `jobId` is its handle
    let background = (v.get("kind").and_then(Value::as_str) == Some("bg")).then(|| v.get("jobId").and_then(Value::as_str).map(String::from)).flatten();
    Some((id, Place { pid: Some(pid), since: Some(since), tmux, launched: None, remote, background }))
}

/// The background sessions of one configuration for a project, from the daemon's own records:
/// `jobs/<handle>/state.json` (kept after its process is gone; `state` is `working`, `blocked` with
/// the question in `needs`, `done` …) and, while the daemon runs, `daemon/roster.json`, whose
/// `dispatch.launch` names the conversation a `/background` split off from. Neither is a documented
/// format (2.1.329): what is missing is simply not known.
fn parked_in(dir: &Path, project: &Path) -> Vec<Parked> {
    let read = |p: PathBuf| std::fs::read(p).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    let roster = read(dir.join("daemon/roster.json"));
    let origin = |job: &str| -> Option<String> {
        let launch = &roster.as_ref()?["workers"][job]["dispatch"]["launch"];
        (launch["mode"] == "resume" && launch["fork"] == true).then_some(())?;
        // An id, or the path of its log
        let from = launch["sessionId"].as_str()?;
        Path::new(from).file_stem()?.to_str().map(String::from)
    };
    std::fs::read_dir(dir.join("jobs"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let job = entry.file_name().to_str()?.to_string();
            let state = read(entry.path().join("state.json"))?;
            Path::new(state["cwd"].as_str()?).starts_with(project).then_some(())?;
            // Finished for good: nothing to come back to
            (state["state"] != "done").then_some(())?;
            let question = (state["state"] == "blocked").then(|| state["needs"].as_str().map(|q| q.chars().take(300).collect())).flatten();
            Some(Parked { id: state["sessionId"].as_str()?.to_string(), continues: origin(&job), job, question })
        })
        .collect()
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
/// `codedeck`, then `codeck` (D24), now `codedeck` again (D26); hooks with either name are ours.
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
/// asking: its program is gone, or it is the program under its other name next to the running one
/// (`codeck` beside `codedeck`: a build folder or an install that kept the old file or the alias). Another installation that still exists
/// is not touched; the connection panel offers "Use this one" for that.
fn left_over(command: &str, current: &Path) -> bool {
    left_over_program(program_of(command), current)
}

fn left_over_program(old: PathBuf, current: &Path) -> bool {
    if old == current {
        return false;
    }
    if !old.is_file() {
        return true;
    }
    let names = ["codedeck", "codeck"];
    old.parent() == current.parent()
        && old.file_name() != current.file_name()
        && old.file_name().and_then(|n| n.to_str()).is_some_and(|n| names.contains(&n))
}

/// Points this configuration's hooks at the running program if they are left over (see
/// [`left_over`]). Returns whether something changed.
fn follow_program(dir: &Path, current: &Path) -> Result<bool, String> {
    let settings = read_settings(&dir.join("settings.json"))?;
    let mut changed = false;
    let ours: Vec<String> = EVENTS.iter().flat_map(|(event, ..)| commands(&settings, event)).filter(|c| is_ours(c)).collect();
    if !ours.is_empty() && ours.iter().any(|c| program_of(c) != current) && ours.iter().all(|c| program_of(c) == current || left_over(c, current)) {
        set_hooks(dir, true)?;
        changed = true;
    }
    // The status line of ours too: if its program is gone the user's status line would go blank
    if let Some((program, _)) = settings["statusLine"]["command"].as_str().and_then(split_status) {
        if program != current && left_over_program(program, current) {
            set_statusline(dir, true)?;
            changed = true;
        }
    }
    Ok(changed)
}

/// Whether CodeDeck's hooks are in the settings of one configuration.
fn status_of(dir: &Path) -> Connection {
    let path = dir.join("settings.json");
    let settings = read_settings(&path).unwrap_or(Value::Null);
    let command = crate::hook::command();
    let status_command = settings["statusLine"]["command"].as_str();
    let status = status_command.and_then(split_status);
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
        usage: status.is_some(),
        usage_keeps: match &status {
            Some((_, then)) => then.clone(),
            None => status_command.map(String::from).filter(|c| !c.trim().is_empty()),
        },
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
    save_settings(dir, before, &settings)
}

/// Writes the settings of a configuration, unless nothing changed: the file as it was is kept
/// next to it once, and the new one replaces it in one go.
fn save_settings(dir: &Path, before: Option<String>, settings: &Value) -> Result<(), String> {
    let path = dir.join("settings.json");
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())? + "\n";
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

/// The words of a command line CodeDeck wrote: bare, or in single quotes with `'\''` for a quote.
/// Anything else (double quotes, escapes) is not ours to read: `None`.
fn words_of(command: &str) -> Option<Vec<String>> {
    let mut words = Vec::new();
    let mut chars = command.trim().chars().peekable();
    while chars.peek().is_some() {
        let mut word = String::new();
        loop {
            match chars.peek() {
                None | Some(' ') => break,
                Some('\'') => {
                    chars.next();
                    loop {
                        match chars.next()? {
                            '\'' if chars.peek() == Some(&'\\') => {
                                // `'\''`: a quote inside
                                chars.next();
                                if chars.next()? != '\'' || chars.next()? != '\'' {
                                    return None;
                                }
                                word.push('\'');
                            }
                            '\'' => break,
                            c => word.push(c),
                        }
                    }
                }
                Some('"' | '\\') => return None,
                Some(_) => word.push(chars.next()?),
            }
        }
        words.push(word);
        while chars.peek() == Some(&' ') {
            chars.next();
        }
    }
    Some(words)
}

/// A status line command of ours (`<program> statusline [--then '<the user's>']`): the program, and
/// the user's own status line that goes on running behind it. `None` for any other command.
fn split_status(command: &str) -> Option<(PathBuf, Option<String>)> {
    let words = words_of(command)?;
    let program = words.first()?;
    let lower = program.to_lowercase();
    if words.get(1).map(String::as_str) != Some("statusline") || !(lower.contains("codedeck") || lower.contains("codeck")) {
        return None;
    }
    let then = match words.get(2).map(String::as_str) {
        Some("--then") => Some(words.get(3)?.clone()),
        Some(_) => return None,
        None => None,
    };
    Some((PathBuf::from(program), then))
}

/// Puts CodeDeck on the status line of one configuration, or takes it off. A status line the user
/// has is kept inside CodeDeck's command (`--then`) and runs as before; taking CodeDeck off puts it
/// back as it was, or removes the entry if there was none. Everything else in the file stays.
fn set_statusline(dir: &Path, on: bool) -> Result<(), String> {
    let path = dir.join("settings.json");
    let before = std::fs::read_to_string(&path).ok();
    let mut settings = read_settings(&path)?;
    let Some(root) = settings.as_object_mut() else {
        return Err(format!("{}: not a JSON object; left alone", path.display()));
    };
    let current = root.get("statusLine").cloned().unwrap_or(Value::Null);
    if !current.is_null() && !current.is_object() {
        return Err(format!("{}: statusLine is not an object; left alone", path.display()));
    }
    let own = current["command"].as_str().and_then(split_status);
    let mut entry = current.as_object().cloned().unwrap_or_default();
    if on {
        let then = match &own {
            Some((_, then)) => then.clone(),
            None => current["command"].as_str().map(String::from).filter(|c| !c.trim().is_empty()),
        };
        entry.insert("type".into(), json!("command"));
        entry.insert("command".into(), json!(crate::hook::statusline_command(then.as_deref())));
        root.insert("statusLine".into(), Value::Object(entry));
    } else {
        match own {
            // The user's own comes back, with whatever else was in the entry (padding, interval)
            Some((_, Some(then))) => {
                entry.insert("command".into(), json!(then));
                root.insert("statusLine".into(), Value::Object(entry));
            }
            Some((_, None)) => {
                root.remove("statusLine");
            }
            None => return Ok(()),
        }
    }
    save_settings(dir, before, &settings)
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
            // Written when Remote Control connects, before any prompt; the latest one counts
            "system" if entry["subtype"] == "bridge_status" => {
                if let Some(url) = str_of("url").filter(|u| u.starts_with("https://claude.ai/code/session_")) {
                    seen.remote = Some(url);
                }
            }
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

    #[test]
    fn knows_a_session_in_the_background_by_its_environment_and_its_process_file() {
        let env = |pairs: &'static [(&'static str, &'static str)]| move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| v.to_string());
        let bg = env(&[("CLAUDE_CODE_SESSION_KIND", "bg"), ("CLAUDE_JOB_DIR", "/c/jobs/1e4f9035")]);
        assert_eq!(Claude.background_job(&bg).as_deref(), Some("1e4f9035"));
        assert_eq!(Claude.background_job(&env(&[("CLAUDE_JOB_DIR", "/c/jobs/1e4f9035")])), None);
        let v: Value = serde_json::from_str(r#"{"pid":71763,"sessionId":"1e4f9035-e7c9","cwd":"/p","procStart":"318088","kind":"bg","jobId":"1e4f9035"}"#).unwrap();
        assert_eq!(running_entry(&v, Path::new("/p")).unwrap().1.background.as_deref(), Some("1e4f9035"));
        let attach = Claude.attach("1e4f9035", Some("/c")).unwrap();
        assert_eq!((attach.argv.join(" "), attach.env), ("claude attach 1e4f9035".to_string(), vec![("CLAUDE_CONFIG_DIR".to_string(), "/c".to_string())]));
    }

    #[test]
    fn reads_the_daemons_records_of_background_sessions() {
        let dir = std::env::temp_dir().join(format!("codedeck-parked-{}", std::process::id()));
        let job = |name: &str, state: &str| {
            std::fs::create_dir_all(dir.join("jobs").join(name)).unwrap();
            std::fs::write(dir.join("jobs").join(name).join("state.json"), state).unwrap();
        };
        job("75de7af3", r#"{"state":"blocked","needs":"Commit now?","sessionId":"75de7af3-24b3","cwd":"/p"}"#);
        job("aaaa0001", r#"{"state":"done","sessionId":"aaaa0001-x","cwd":"/p"}"#);
        job("bbbb0002", r#"{"state":"working","sessionId":"bbbb0002-x","cwd":"/elsewhere"}"#);
        std::fs::create_dir_all(dir.join("daemon")).unwrap();
        std::fs::write(
            dir.join("daemon/roster.json"),
            r#"{"workers":{"75de7af3":{"dispatch":{"launch":{"mode":"resume","fork":true,"sessionId":"/c/projects/-p/ae1ea525-63c9.jsonl"}}}}}"#,
        )
        .unwrap();
        let found = parked_in(&dir, Path::new("/p"));
        assert_eq!(
            found,
            [Parked { id: "75de7af3-24b3".into(), job: "75de7af3".into(), question: Some("Commit now?".into()), continues: Some("ae1ea525-63c9".into()) }]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_running_process_tells_its_session_and_where_it_runs() {
        let v: Value = serde_json::from_str(
            r#"{"pid":9296,"sessionId":"041868a4","cwd":"/p/sub","procStart":"11438","tmux":"codedeck-p:@0.%3","bridgeSessionId":"session_01Ab"}"#,
        )
        .unwrap();
        let (id, place) = running_entry(&v, Path::new("/p")).unwrap();
        assert_eq!(id, "041868a4");
        assert_eq!((place.pid, place.since), (Some(9296), Some(11438)));
        assert_eq!(place.tmux, Some(Tmux { pane: "%3".into(), session: Some("codedeck-p".into()) }));
        assert_eq!(place.remote.as_deref(), Some("https://claude.ai/code/session_01Ab"));
        // Another project's session is none of this one's
        assert!(running_entry(&v, Path::new("/q")).is_none());
        let plain: Value = serde_json::from_str(r#"{"pid":1,"sessionId":"a","cwd":"/p","procStart":"5"}"#).unwrap();
        let (_, place) = running_entry(&plain, Path::new("/p")).unwrap();
        assert_eq!((place.tmux, place.remote), (None, None));
    }

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
    fn reads_the_remote_link_while_connected() {
        let env = |value: Option<&'static str>| move |key: &str| (key == "CLAUDE_CODE_BRIDGE_SESSION_ID").then_some(value).flatten().map(String::from);
        assert_eq!(Claude.remote_link(&env(Some("session_01AbC9"))).as_deref(), Some("https://claude.ai/code/session_01AbC9"));
        assert_eq!(Claude.remote_link(&env(None)), None);
        // Only what looks like an id goes into a link
        assert_eq!(Claude.remote_link(&env(Some("session_x/../y"))), None);
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
        // A shell command leaves the hook shortened, for the permission it may ask (shown, never kept
        // in the journal); no file contents, and of the answers only the turn's last words
        assert_eq!(event(4).detail.as_deref(), Some("touch /tmp/x"));
        let sent = serde_json::to_string(&events).unwrap();
        assert!(!sent.contains("secret") && sent.matches("touch").count() == 1);
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
        let current = tmp.join("bin/codedeck");
        for file in ["bin/codedeck", "bin/codeck", "other/codedeck"] {
            std::fs::write(tmp.join(file), "").unwrap();
        }
        let hook = |p: &str| format!("{} hook", tmp.join(p).display());
        assert!(!left_over(&hook("bin/codedeck"), &current), "the running program");
        assert!(left_over(&hook("bin/codeck"), &current), "the old name next to it");
        assert!(left_over(&hook("gone/codeck"), &current), "a program that is gone");
        assert!(!left_over(&hook("other/codedeck"), &current), "another installation");
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
        with("/nowhere/codeck hook");
        assert!(follow_program(&tmp, &current).unwrap());
        assert_eq!(now(), [crate::hook::command()]);
        // Already there: nothing to do
        assert!(!follow_program(&tmp, &current).unwrap());
        // Another installation that exists: left to the user
        let other = tmp.join("other/codedeck");
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

        // The Remote Control link, from the line written when it connected (before any prompt)
        let connected = [r#"{"type":"system","subtype":"bridge_status","content":"/remote-control is active","url":"https://claude.ai/code/session_01Abc","sessionId":"s1"}"#];
        assert_eq!(parse(connected.into_iter()).remote.as_deref(), Some("https://claude.ai/code/session_01Abc"));
        assert_eq!(parse(log.into_iter()).remote, None);
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

    #[test]
    fn sees_a_turn_the_user_stopped() {
        let file = std::env::temp_dir().join(format!("codedeck-interrupt-{}.jsonl", std::process::id()));
        let write = |lines: &[&str]| std::fs::write(&file, lines.join("\n")).unwrap();
        let at = |t: &str| iso_ms(t).unwrap();
        let ask = r#"{"type":"user","timestamp":"2026-11-17T07:46:30.000Z","message":{"role":"user","content":"touch x"}}"#;
        let tool = r#"{"type":"assistant","timestamp":"2026-11-17T07:46:32.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","input":{}}]}}"#;
        let cut = r#"{"type":"user","timestamp":"2026-11-17T07:47:10.917Z","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]}}"#;
        let plain = r#"{"type":"user","timestamp":"2026-11-17T07:47:10.917Z","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}"#;
        let result = r#"{"type":"user","timestamp":"2026-11-17T07:47:11.000Z","message":{"role":"user","content":[{"type":"tool_result","content":"The user doesn't want to proceed"}]}}"#;
        let next = r#"{"type":"user","timestamp":"2026-11-17T07:48:00.000Z","message":{"role":"user","content":"go on"}}"#;
        let before = at("2026-11-17T07:46:32.000Z");

        // Nothing stopped yet: it is still asking
        write(&[ask, tool]);
        assert!(!interrupted_after(&file, before));
        // Stopped after the last thing CodeDeck heard, with or without a tool; a result after it changes nothing
        write(&[ask, tool, cut]);
        assert!(interrupted_after(&file, before));
        write(&[ask, tool, plain, result]);
        assert!(interrupted_after(&file, before));
        // A stop CodeDeck heard of already (the session said something since) does not count again
        assert!(!interrupted_after(&file, at("2026-11-17T07:47:30.000Z")));
        // A prompt after it: the session works again
        write(&[ask, tool, cut, next]);
        assert!(!interrupted_after(&file, before));
        // No log, no answer
        let _ = std::fs::remove_file(&file);
        assert!(!interrupted_after(&file, before));
    }

    #[test]
    fn knows_what_still_runs_when_a_turn_ends() {
        let stop = json!({
            "session_id": "s1", "hook_event_name": "Stop", "last_assistant_message": "Started the build.",
            "background_tasks": [
                { "id": "bw7r", "type": "shell", "status": "running", "description": "Build the deb", "command": "npx tauri build" },
                { "id": "old1", "type": "shell", "status": "completed", "description": "Earlier" },
            ],
        });
        let end = Claude.translate(&stop).unwrap();
        assert_eq!(end.kind, EventKind::TurnDone);
        let tasks = end.background.unwrap();
        assert_eq!((tasks.len(), tasks[0].id.as_str(), tasks[0].kind.as_str(), tasks[0].text.as_str()), (1, "bw7r", "shell", "Build the deb"));
        // A Stop with nothing running says so; "waiting for your input" says nothing about it
        assert_eq!(Claude.translate(&json!({ "session_id": "s1", "hook_event_name": "Stop" })).unwrap().background, Some(Vec::new()));
        let idle = json!({ "session_id": "s1", "hook_event_name": "Notification", "notification_type": "idle_prompt" });
        assert_eq!(Claude.translate(&idle).unwrap().background, None);
        // The prompt Claude Code makes when a task ends names it
        let notice = json!({ "session_id": "s1", "hook_event_name": "UserPromptSubmit", "prompt": "<task-notification>\n<task-id>bw7r</task-id>\n<status>completed</status>" });
        assert_eq!(Claude.translate(&notice).unwrap().task_ended.as_deref(), Some("bw7r"));
        let typed = json!({ "session_id": "s1", "hook_event_name": "UserPromptSubmit", "prompt": "what is <task-id>?" });
        assert_eq!(Claude.translate(&typed).unwrap().task_ended, None);
    }

    #[test]
    fn reads_the_usage_a_status_line_gets() {
        let raw = json!({
            "session_id": "s1", "transcript_path": "/home/u/.claude-private/projects/-p/s1.jsonl",
            "rate_limits": { "five_hour": { "used_percentage": 23.5, "resets_at": 1738425600 }, "seven_day": { "used_percentage": 41.2, "resets_at": 1738857600 } },
        });
        let usage = Claude.translate_usage(&raw).unwrap();
        assert_eq!(usage.account, "/home/u/.claude-private");
        assert_eq!((usage.five_hour.unwrap().used, usage.seven_day.unwrap().resets_at), (23.5, 1738857600));
        // One limit may be absent; none at all (no subscription, no answer yet) is no usage
        let one = json!({ "transcript_path": "/h/.claude/projects/-p/s.jsonl", "rate_limits": { "seven_day": { "used_percentage": 3, "resets_at": 5 } } });
        assert!(Claude.translate_usage(&one).unwrap().five_hour.is_none());
        assert!(Claude.translate_usage(&json!({ "session_id": "s1" })).is_none());
        // The account of a session comes with its events, from the folder its log lies in
        let stop = json!({ "session_id": "s1", "hook_event_name": "Stop", "transcript_path": "/h/.claude-work/projects/-p/s1.jsonl" });
        assert_eq!(Claude.translate(&stop).unwrap().account.as_deref(), Some("/h/.claude-work"));
    }

    #[test]
    fn puts_codedeck_on_the_status_line_and_back() {
        let tmp = std::env::temp_dir().join(format!("codedeck-statusline-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let file = tmp.join("settings.json");
        let read = || serde_json::from_str::<Value>(&std::fs::read_to_string(&file).unwrap()).unwrap();

        // The user's own status line (with an apostrophe in it, and other keys) is kept and comes back
        let own = "bash ~/.claude/line.sh 'it'\''s'";
        std::fs::write(&file, json!({ "model": "opus", "statusLine": { "type": "command", "command": own, "padding": 2 } }).to_string()).unwrap();
        set_statusline(&tmp, true).unwrap();
        let command = read()["statusLine"]["command"].as_str().unwrap().to_string();
        assert!(command.contains(" statusline --then "), "{command}");
        assert_eq!(split_status(&command).unwrap().1.as_deref(), Some(own));
        assert_eq!((read()["model"].clone(), read()["statusLine"]["padding"].clone()), (json!("opus"), json!(2)));
        let connection = status_of(&tmp);
        assert_eq!((connection.usage, connection.usage_keeps.as_deref()), (true, Some(own)));
        // Again: nothing piles up
        set_statusline(&tmp, true).unwrap();
        assert_eq!(read()["statusLine"]["command"], json!(command));
        set_statusline(&tmp, false).unwrap();
        assert_eq!(read()["statusLine"], json!({ "type": "command", "command": own, "padding": 2 }));
        assert!(!status_of(&tmp).usage);
        assert_eq!(status_of(&tmp).usage_keeps.as_deref(), Some(own), "the user's one shows as the one that stays");

        // Without one: CodeDeck's own, and taking it off removes the entry
        std::fs::write(&file, json!({ "model": "opus" }).to_string()).unwrap();
        set_statusline(&tmp, true).unwrap();
        assert!(split_status(read()["statusLine"]["command"].as_str().unwrap()).unwrap().1.is_none());
        set_statusline(&tmp, false).unwrap();
        assert_eq!(read(), json!({ "model": "opus" }));
        // Taking off what is not ours leaves it alone
        std::fs::write(&file, json!({ "statusLine": { "type": "command", "command": own } }).to_string()).unwrap();
        set_statusline(&tmp, false).unwrap();
        assert_eq!(read()["statusLine"]["command"], json!(own));
        // Not ours: a command that only mentions it
        assert!(split_status("echo codeck statusline").is_none());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
