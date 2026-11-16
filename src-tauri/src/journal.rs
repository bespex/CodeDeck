//! What happened in a project, one line per event, kept for a week: the material for the
//! timeline in Activity and the notices (step 2.3) and for finding out afterwards what went wrong.
//!
//! One file per project, `~/.local/state/codedeck/journal/<project path>.jsonl` (honouring
//! `XDG_STATE_HOME`). A window writes what concerns its project: the neutral events of the
//! coding tools, and when it opened. Old lines go when a window first writes in a project.

use std::collections::HashSet;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::harness::Event;

/// Lines older than this go.
const KEPT_MS: u64 = 7 * 24 * 3600_000;
/// Prompts and messages are kept this short: enough to recognise them on a timeline.
const TEXT_MAX: usize = 160;

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    /// Unix milliseconds
    pub at: u64,
    /// The event's kind (`prompt_submitted`, …), or `opened`: a window opened the project
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub harness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub session: Option<String>,
    /// Project-relative where it lies in the project, else absolute
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub text: Option<String>,
}

impl Line {
    pub fn of(e: &Event, root: &Path, at: u64) -> Self {
        let file = e.file.as_deref().map(|f| Path::new(f).strip_prefix(root).map_or_else(|_| f.to_string(), |p| p.to_string_lossy().into_owned()));
        let kind = serde_json::to_value(e.kind).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
        let text = e.prompt.as_deref().or(e.message.as_deref()).map(|t| t.chars().take(TEXT_MAX).collect());
        Line { at, kind, harness: Some(e.harness.clone()), session: Some(e.session.clone()), file, tool: e.tool.clone(), text }
    }

    pub fn opened(at: u64) -> Self {
        Line { at, kind: "opened".into(), harness: None, session: None, file: None, tool: None, text: None }
    }
}

/// The journal of every project, for this process.
#[derive(Default)]
pub struct Journal {
    /// Projects whose old lines this process already let go
    pruned: Mutex<HashSet<PathBuf>>,
}

impl Journal {
    pub fn write(&self, root: &Path, line: &Line, now: u64) {
        let Some(file) = file_for(root) else { return };
        if self.pruned.lock().unwrap().insert(root.to_path_buf()) {
            prune(&file, now);
        }
        let Ok(text) = serde_json::to_string(line) else { return };
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // A lost line only costs a dot on a timeline
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&file) {
            let _ = writeln!(f, "{text}");
        }
    }
}

/// Where the journal of the project at `root` is.
pub fn file_for(root: &Path) -> Option<PathBuf> {
    let state = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/state")))?;
    let name: String = root.to_string_lossy().chars().map(|c| if c.is_alphanumeric() || c == '.' || c == '_' { c } else { '-' }).collect();
    Some(state.join("codedeck/journal").join(format!("{name}.jsonl")))
}

/// Lets lines older than a week go.
fn prune(file: &Path, now: u64) {
    let Ok(text) = std::fs::read_to_string(file) else { return };
    let at = |line: &str| serde_json::from_str::<Value>(line).ok().and_then(|v| v["at"].as_u64()).unwrap_or(0);
    let kept: Vec<&str> = text.lines().filter(|l| at(l) + KEPT_MS > now).collect();
    if kept.len() == text.lines().count() {
        return;
    }
    let mut out = kept.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    let _ = crate::config::write(file, out.as_bytes());
}

/// The journal's lines since `since` (Unix milliseconds), oldest first.
pub fn read(root: &Path, since: u64) -> Vec<Line> {
    let Some(text) = file_for(root).and_then(|f| std::fs::read_to_string(f).ok()) else { return Vec::new() };
    text.lines().filter_map(|l| serde_json::from_str::<Line>(l).ok()).filter(|l| l.at >= since).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::{fake::Fake, Harness};

    #[test]
    fn writes_events_and_lets_old_lines_go() {
        let state = std::env::temp_dir().join(format!("codedeck-journal-{}", std::process::id()));
        // Only this test sets it; the journal reads it each time
        unsafe { std::env::set_var("XDG_STATE_HOME", &state) };
        let root = Path::new("/p/orbit");
        let file = file_for(root).unwrap();
        assert!(file.ends_with("codedeck/journal/-p-orbit.jsonl"));
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "{\"at\":1,\"kind\":\"opened\"}\n").unwrap();

        let journal = Journal::default();
        let now = KEPT_MS + 100;
        let raw = serde_json::json!({"who":"a1","did":"wrote","in":"/p/orbit","path":"/p/orbit/src/a.rs","with":"Edit"});
        journal.write(root, &Line::of(&Fake.translate(&raw).unwrap(), root, now), now);
        journal.write(root, &Line::opened(now + 1), now + 1);

        let lines = read(root, 0);
        assert_eq!(lines.len(), 2, "the old line went");
        assert_eq!((lines[0].kind.as_str(), lines[0].file.as_deref(), lines[0].tool.as_deref()), ("after_write", Some("src/a.rs"), Some("Edit")));
        assert_eq!(lines[1].kind, "opened");
        assert_eq!(read(root, now + 1).len(), 1);
        std::fs::remove_dir_all(&state).unwrap();
    }
}
