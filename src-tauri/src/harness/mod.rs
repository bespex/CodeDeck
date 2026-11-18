//! The seam between CodeDeck and the coding tools it watches. The core (bridge, trail, snapshots,
//! attachments, interface) knows no tool: it sees neutral [`Event`]s coming in and asks a
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
    /// At start: connections this installation made earlier but that point to a program that is
    /// gone or was renamed are moved to the running one. Returns the accounts that changed.
    fn follow_program(&self) -> Vec<String> {
        Vec::new()
    }
    /// A raw message of the tool as a neutral event; `None` for what CodeDeck does not use.
    fn translate(&self, raw: &Value) -> Option<Event>;
    /// What the tool states about the account's allowance, from the raw message its status line
    /// gets; `None` when it states nothing (no figures yet, an account without limits).
    fn translate_usage(&self, _raw: &Value) -> Option<crate::usage::Usage> {
        None
    }
    /// Puts CodeDeck on the tool's status line of one account, or takes it off again. A status
    /// line the user has stays in use, and comes back untouched when it is taken off.
    fn connect_usage(&self, _account: &str, _on: bool) -> Result<(), String> {
        Err("this tool states no usage".to_string())
    }
    /// What `codedeck hook` prints for the tool after the windows answered: how text handed
    /// over (with a prompt) or the start rules (with the start of a session) reach the session.
    fn reply(&self, event: &Event, handed: &[String]) -> Option<String>;
    /// Sessions of the last day in or around the project, from the tool's logs.
    fn past_sessions(&self, project: &Path) -> Vec<SessionInfo>;
    /// What one log says about its session.
    fn read_log(&self, log: &Path) -> Option<SessionInfo>;
    /// The user stopped the running turn after `since` (Unix milliseconds). A tool does not say
    /// so with an event, but its log may: without this a session stays "working" or "waiting"
    /// until the next prompt.
    fn cut_short(&self, _log: &Path, _since: u64) -> bool {
        false
    }
    /// The tool's own files (memory, settings, its logs): written outside the project, they are
    /// no finding.
    fn is_own_file(&self, _path: &Path) -> bool {
        false
    }
    /// Hosts of the tool's maker where sessions publish pages; a link there at the end of a turn
    /// is kept as a published page.
    fn page_hosts(&self) -> &'static [&'static str] {
        &[]
    }
    /// What a configuration folder of this tool is (step 3.2): in use (it has sessions), not used yet,
    /// or what looks like a backup copy of one, which may be deleted after asking.
    fn account_kind(&self, _dir: &Path) -> AccountKind {
        AccountKind::Used
    }
    /// The data folders of the tool's desktop app found on this computer, for choosing the one an
    /// account belongs to.
    fn desktop_profiles(&self) -> Vec<String> {
        Vec::new()
    }
    /// A new profile of the desktop app for an account called `name`: the folder it will use and
    /// the command that starts the app with it. The app creates the folder on its first start, so
    /// the user signs in there. `None`: the tool's app has no profiles (`Capabilities::desktop_profiles`).
    fn new_desktop_profile(&self, _name: &str) -> Option<(String, Vec<String>)> {
        None
    }
    /// How to start a session of this tool (docs/SITZUNGEN.md B2): the command and the environment
    /// it needs. `None`: CodeDeck cannot start sessions of this tool.
    fn launch(&self, _launch: &Launch) -> Option<Launched> {
        None
    }
    /// The command that shows a session in the tool's desktop app, from its remote link (see
    /// [`Self::remote_link`]); `profile` is the app's data folder for the session's account, if the
    /// user set one. `None`: the tool has no desktop app that can do this.
    fn desktop_command(&self, _remote: &str, _profile: Option<&str>) -> Option<Vec<String>> {
        None
    }
    /// A link that reaches the session from another device or the browser, read from the
    /// environment its hooks run in (`var` looks a variable up); `None` while there is none.
    fn remote_link(&self, _var: &dyn Fn(&str) -> Option<String>) -> Option<String> {
        None
    }
    /// The sessions of the project whose process runs right now, with where it runs, as far as the
    /// tool keeps a record of it. A log alone cannot tell a quiet running session from one whose
    /// window was closed; after a restart of CodeDeck this can, before the session says anything.
    fn running(&self, _project: &Path) -> Vec<(String, Place)> {
        Vec::new()
    }
}

/// What a tool, or one of its sessions, lets CodeDeck do. The interface offers only what is here.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    /// It reports each step as it happens, so working / waiting / done is known
    pub live_status: bool,
    /// It reports before it writes, so a snapshot can be taken first
    pub before_write: bool,
    pub attach: Attach,
    /// Text can be given to a session when it starts
    pub start_rules: bool,
    /// Its logs tell of sessions CodeDeck did not hear from
    pub past_sessions: bool,
    /// It tells how much of the account's allowance is used
    pub usage: bool,
    /// Its desktop app keeps separate profiles, one can be started and made (see
    /// [`Harness::new_desktop_profile`]); without this CodeDeck does not offer profiles at all
    pub desktop_profiles: bool,
}

impl Capabilities {
    /// For a session known from its log only (e.g. one whose tool sent no event): whatever
    /// needs the session to report is not possible with it.
    pub fn from_log_only(self) -> Self {
        Self { live_status: false, before_write: false, attach: Attach::None, start_rules: false, ..self }
    }
}

/// How text from CodeDeck gets into a session.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Attach {
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
    /// Before a shell command: files it names as its output, absolute; a guess from its text,
    /// for files left outside the project
    #[serde(default)]
    pub writes: Vec<String>,
    /// With the start of a session: it goes on from before and still knows what it was told,
    /// so it needs no start rules again
    #[serde(default)]
    pub resumed: bool,
    /// With the end of a turn, when the tool says it: what still runs in the background (a shell,
    /// a helper, a monitor); empty if nothing does. The turn is over, but the session may start the
    /// next one by itself when one of them ends
    #[serde(default)]
    pub background: Option<Vec<Background>>,
    /// With a prompt the tool made itself: the background task whose end it announces
    #[serde(default)]
    pub task_ended: Option<String>,
    /// The tool's account the session runs in (for Claude Code its configuration folder), where
    /// the tool tells
    #[serde(default)]
    pub account: Option<String>,
    /// Where the session runs, as `codedeck hook` saw it from inside the tool's process tree; every
    /// message brings all of it. The adapter leaves it empty, the transport fills it in
    #[serde(default)]
    pub place: Option<Place>,
}

/// What a configuration folder is, see [`Harness::account_kind`].
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AccountKind {
    Used,
    Unused,
    Backup,
}

/// A session CodeDeck starts.
pub struct Launch<'a> {
    /// The session's id, chosen by CodeDeck (a UUID), or the one of the conversation to continue
    pub id: &'a str,
    /// Continue the conversation `id` instead of starting a new one under that id
    pub resume: bool,
    /// The name it shows under, also in the tool's other surfaces
    pub name: &'a str,
    /// The tool's account (for Claude Code its configuration folder); `None`: the default
    pub account: Option<&'a str>,
}

/// What starts it: the program and its arguments, and environment variables to set.
pub struct Launched {
    pub argv: Vec<String>,
    pub env: Vec<(String, String)>,
}

/// Where a session runs: what is needed to find it, to tell whether it is still alive, and to reach
/// it from elsewhere. Only observed, never acted on here.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Place {
    /// The tool's process
    pub pid: Option<u32>,
    /// When that process started, in clock ticks since boot: a later process with the same id is
    /// not it
    pub since: Option<u64>,
    pub tmux: Option<Tmux>,
    /// The id CodeDeck gave the session when it started it itself; `None` for any other start
    pub launched: Option<String>,
    /// A link that reaches the session from another device or the browser, while it is reachable
    /// there; `None` when the tool offers none or the connection is down
    pub remote: Option<String>,
}

/// The tmux pane a session runs in.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Tmux {
    /// Stable for the life of the pane, e.g. `%3`
    pub pane: String,
    /// The tmux session's name; asked only now and then, see [`crate::place::here`]
    pub session: Option<String>,
}

/// Something that goes on after the turn that started it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Background {
    pub id: String,
    /// In the tool's words: `shell`, `subagent`, `monitor`, …
    pub kind: String,
    /// What it is, shortened
    pub text: String,
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
    /// The link that reaches it from elsewhere, as the log noted it when Remote Control connected:
    /// known before the first prompt, unlike the hooks' (they say nothing until then)
    pub remote: Option<String>,
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
    /// CodeDeck sits on its status line and hears the usage from there
    pub usage: bool,
    /// The status line of the user's that stays in use alongside; `None`: there is none
    pub usage_keeps: Option<String>,
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
