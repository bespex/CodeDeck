//! Claude Code's session logs (`<config>/projects/<folder>/<session>.jsonl`), read to know
//! sessions that ran before CodeDeck or its hooks were there, and to give every session a title
//! and its model. The format is Claude Code's own and may change: unknown lines are skipped,
//! and nothing but these few facts is kept.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;

/// Only the end of a log is read: the latest prompt, title and writes are there.
const TAIL: u64 = 256 * 1024;
/// Logs not written to for this long are no longer of interest.
const RECENT: Duration = Duration::from_secs(24 * 3600);

/// What a log tells about its session.
#[derive(Debug, Default, PartialEq)]
pub struct Seen {
    pub id: String,
    pub cwd: Option<PathBuf>,
    /// Unix milliseconds of the latest entry
    pub last: u64,
    pub title: Option<String>,
    pub model: Option<String>,
    pub prompt: Option<String>,
    /// Absolute paths written with Edit/Write and the like, with the time, oldest first
    pub writes: Vec<(PathBuf, u64)>,
}

/// Claude Code's folder name for a working directory: every character other than a letter,
/// digit or `-` becomes `-`.
pub fn folder_name(dir: &Path) -> String {
    dir.to_string_lossy().chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }).collect()
}

/// Sessions of the last day whose working directory is the project, lies inside it, or contains
/// it, from every Claude Code configuration.
pub fn recent(root: &Path) -> Vec<Seen> {
    let ours = folder_name(root);
    let ancestors: Vec<String> = root.ancestors().skip(1).map(folder_name).collect();
    let mut found = Vec::new();
    for config in crate::hook::config_dirs() {
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
pub fn read(path: &Path) -> Option<Seen> {
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

fn parse<'a>(lines: impl Iterator<Item = &'a str>) -> Seen {
    let mut seen = Seen::default();
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
            "last-prompt" => seen.prompt = str_of("lastPrompt").or(seen.prompt.take()),
            "user" => {
                if let Some(text) = entry["message"]["content"].as_str() {
                    seen.prompt = Some(text.to_string());
                }
            }
            "assistant" => {
                let message = &entry["message"];
                if let Some(model) = message["model"].as_str() {
                    seen.model = Some(model.to_string());
                }
                for part in message["content"].as_array().into_iter().flatten() {
                    let writes = matches!(part["name"].as_str(), Some("Edit" | "MultiEdit" | "Write" | "NotebookEdit"));
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
        assert_eq!((s.title.as_deref(), s.model.as_deref(), s.prompt.as_deref()), (Some("Rate limiter fix"), Some("claude-opus-5-5"), Some("Fix the limiter")));
        assert_eq!(s.writes, vec![(PathBuf::from("/p/a.rs"), iso_ms("2026-11-13T10:00:05.000Z").unwrap())]);
        assert_eq!(s.last, iso_ms("2026-11-13T10:01:00.000Z").unwrap());
        assert_eq!(s.cwd.as_deref(), Some(Path::new("/p")));
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
