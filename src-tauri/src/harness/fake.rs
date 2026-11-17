//! A tool that does not exist, for tests: it proves that the core needs nothing of a real one.
//! Its messages look unlike any real tool's on purpose (`who`, `did`, `in`, `path`, `text`).

use std::path::Path;

use serde_json::Value;

use super::{Attach, Capabilities, Connection, Event, EventKind, Harness, SessionInfo};

pub struct Fake;

impl Harness for Fake {
    fn id(&self) -> &'static str {
        "fake"
    }

    fn name(&self) -> &'static str {
        "Fake Tool"
    }

    fn short_name(&self) -> &'static str {
        "Fake"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities { live_status: true, before_write: true, attach: Attach::Clipboard, start_rules: true, past_sessions: true, usage: false, desktop_profiles: false }
    }

    fn connections(&self) -> Vec<Connection> {
        Vec::new()
    }

    fn connect(&self, account: &str, _on: bool) -> Result<(), String> {
        Err(format!("{account}: nothing to connect"))
    }

    fn translate(&self, raw: &Value) -> Option<Event> {
        let kind = match raw["did"].as_str()? {
            "started" => EventKind::SessionStarted,
            "asked" => EventKind::PromptSubmitted,
            "will-write" => EventKind::BeforeWrite,
            "wrote" => EventKind::AfterWrite,
            "asks" => EventKind::Waiting,
            "done" => EventKind::TurnDone,
            "left" => EventKind::SessionEnded,
            _ => return None,
        };
        let text = |key: &str| raw[key].as_str().map(String::from);
        let asked = kind == EventKind::PromptSubmitted;
        Some(Event {
            harness: self.id().to_string(),
            session: text("who")?,
            kind,
            cwd: text("in"),
            file: text("path"),
            tool: text("with"),
            prompt: text("text").filter(|_| asked),
            message: text("text").filter(|_| !asked),
            report: text("said"),
            log: None,
            writes: raw["out"].as_array().into_iter().flatten().filter_map(|v| v.as_str().map(String::from)).collect(),
            resumed: raw["again"] == true,
            background: raw["tasks"].as_array().map(|ids| {
                ids.iter().filter_map(|v| v.as_str()).map(|id| super::Background { id: id.into(), kind: "shell".into(), text: id.into() }).collect()
            }),
            task_ended: text("ended"),
            account: text("account"),
            place: None,
        })
    }

    fn reply(&self, _event: &Event, _handed: &[String]) -> Option<String> {
        None
    }

    /// One session that worked in the project's `docs` folder before.
    fn past_sessions(&self, project: &Path) -> Vec<SessionInfo> {
        vec![SessionInfo {
            id: "old".to_string(),
            cwd: Some(project.join("docs")),
            last: 2,
            title: Some("Earlier work".to_string()),
            model: Some("fake-1".to_string()),
            prompt: Some("Write notes".to_string()),
            writes: vec![(project.join("docs/notes.md"), 1)],
            report: None,
            remote: None,
        }]
    }

    fn read_log(&self, _log: &Path) -> Option<SessionInfo> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Messages as the made-up tool sends them.
    #[test]
    fn translates_its_own_messages() {
        let raw = [
            r#"{"who":"a1","did":"asked","in":"/p","text":"Tidy up"}"#,
            r#"{"who":"a1","did":"will-write","in":"/p","path":"/p/a.rs","with":"patch"}"#,
            r#"{"who":"a1","did":"asks","in":"/p","text":"May I?"}"#,
            r#"{"who":"a1","did":"thinks","in":"/p"}"#,
        ];
        let events: Vec<Option<Event>> = raw.iter().map(|r| Fake.translate(&serde_json::from_str(r).unwrap())).collect();
        assert_eq!(events[0].as_ref().map(|e| (e.kind, e.prompt.as_deref(), e.message.as_deref())), Some((EventKind::PromptSubmitted, Some("Tidy up"), None)));
        assert_eq!(events[1].as_ref().map(|e| (e.kind, e.file.as_deref(), e.tool.as_deref())), Some((EventKind::BeforeWrite, Some("/p/a.rs"), Some("patch"))));
        assert_eq!(events[2].as_ref().map(|e| (e.kind, e.message.as_deref())), Some((EventKind::Waiting, Some("May I?"))));
        assert!(events[3].is_none());
        assert_eq!(Fake.reply(events[0].as_ref().unwrap(), &["text".to_string()]), None);
    }
}
