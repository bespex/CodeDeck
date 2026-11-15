//! The seam between CodeDeck and the coding tools it watches. The core (bridge, trail, snapshots,
//! hand-over, interface) knows no tool: it sees neutral [`Event`]s coming in and asks a
//! [`Harness`] for everything it does on its own. Each tool is one adapter in this folder,
//! compiled in; nothing outside an adapter names a tool, its files or its message fields.

mod claude;
#[cfg(test)]
pub mod fake;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One coding tool, as far as CodeDeck needs it.
pub trait Harness: Send + Sync {
    /// Stable name for the wire and for `codedeck hook --harness <id>`.
    fn id(&self) -> &'static str;
    /// The tool's name in texts, e.g. "Connecting adds hooks to …".
    fn name(&self) -> &'static str;
    /// Its name where space is short: buttons, the status bar.
    fn short_name(&self) -> &'static str;
    fn capabilities(&self) -> Capabilities;
    /// Whether the tool reports to CodeDeck, per account.
    fn connections(&self) -> Vec<Connection>;
    /// Makes the tool of one account report to CodeDeck, or stops that.
    fn connect(&self, account: &str, on: bool) -> Result<(), String>;
    /// A raw message of the tool as a neutral event; `None` for what CodeDeck does not use.
    fn translate(&self, raw: &Value) -> Option<Event>;
    /// What `codedeck hook` prints for the tool after the windows answered: how text handed
    /// over (with a prompt) or the start rules (with the start of a session) reach the session.
    fn reply(&self, event: &Event, handed: &[String]) -> Option<String>;
    /// Sessions of the last day in or around the project, from the tool's logs.
    fn past_sessions(&self, project: &Path) -> Vec<SessionInfo>;
    /// What one log says about its session.
    fn read_log(&self, log: &Path) -> Option<SessionInfo>;
}

/// What a tool, or one of its sessions, lets CodeDeck do. The interface offers only what is here.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// It reports each step as it happens, so working / waiting / done is known
    pub live_status: bool,
    /// It reports before it writes, so a snapshot can be taken first
    pub before_write: bool,
    pub handover: Handover,
    /// Text can be given to a session when it starts
    pub start_rules: bool,
    /// Its logs tell of sessions CodeDeck did not hear from
    pub past_sessions: bool,
    /// It tells how much of the account's allowance is used
    pub usage: bool,
}

impl Capabilities {
    /// For a session known from its log only (e.g. one whose tool sent no event): whatever
    /// needs the session to report is not possible with it.
    pub fn from_log_only(self) -> Self {
        Self { live_status: false, before_write: false, handover: Handover::None, start_rules: false, ..self }
    }
}

/// How text from CodeDeck gets into a session.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Handover {
    /// CodeDeck adds it to the next prompt
    WithNextPrompt,
    /// Only by copying and pasting
    #[allow(dead_code)] // no adapter of this kind yet, apart from the one in tests
    Clipboard,
    None,
}

/// What happened in a session.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    SessionStarted,
    PromptSubmitted,
    /// About to change files: `file` if it is one file, else anything in the project
    BeforeWrite,
    AfterWrite,
    /// For an answer or a permission; `message` says which
    Waiting,
    TurnDone,
    SessionEnded,
}

/// One event as `codedeck hook` sends it to the windows: only what CodeDeck uses, no file
/// contents, no tool output.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Event {
    /// [`Harness::id`] of the tool it comes from
    pub harness: String,
    pub session: String,
    pub kind: EventKind,
    pub cwd: Option<String>,
    /// The file written, absolute
    pub file: Option<String>,
    /// What writes, in the tool's own words; shown with the snapshot, never interpreted
    pub tool: Option<String>,
    pub prompt: Option<String>,
    pub message: Option<String>,
    /// With the end of a turn: what the assistant said last, kept with the turn
    #[serde(default)]
    pub report: Option<String>,
    /// The tool's log of the session
    pub log: Option<String>,
    /// With the start of a session: it goes on from before and still knows what it was told,
    /// so it needs no start rules again
    #[serde(default)]
    pub resumed: bool,
}

/// What a log tells about its session.
#[derive(Debug, Default, PartialEq)]
pub struct SessionInfo {
    pub id: String,
    pub cwd: Option<PathBuf>,
    /// Unix milliseconds of the latest entry
    pub last: u64,
    pub title: Option<String>,
    /// As it is shown
    pub model: Option<String>,
    pub prompt: Option<String>,
    /// Absolute paths the session wrote, with the time, oldest first
    pub writes: Vec<(PathBuf, u64)>,
    /// What the assistant said last since the latest prompt
    pub report: Option<String>,
}

/// Whether one account's tool reports to CodeDeck.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub harness: &'static str,
    /// The account's configuration directory
    pub dir: String,
    /// The file the connection is written into
    pub settings: String,
    pub installed: bool,
    /// It reports to another CodeDeck than this one (e.g. a development build)
    pub other: Option<String>,
    /// What the tool runs to report, for this CodeDeck
    pub command: String,
}

/// A tool as the interface needs it.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HarnessInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub short_name: &'static str,
    pub capabilities: Capabilities,
}

impl HarnessInfo {
    pub fn of(harness: &dyn Harness) -> Self {
        Self { id: harness.id(), name: harness.name(), short_name: harness.short_name(), capabilities: harness.capabilities() }
    }
}

/// Every tool CodeDeck supports; the first is the one it expects by default.
pub fn all() -> &'static [&'static dyn Harness] {
    &[&claude::Claude]
}

/// The tool of that id; without one, the default.
pub fn by_id(id: Option<&str>) -> Option<&'static dyn Harness> {
    match id {
        None => all().first().copied(),
        Some(id) => all().iter().copied().find(|h| h.id() == id),
    }
}
