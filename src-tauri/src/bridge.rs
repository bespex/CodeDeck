//! A project's side of the bridge to coding assistants. The process listens on one socket
//! ([`crate::hub`]); `codedeck hook` (see [`crate::hook`]) sends it the tools' events, already
//! translated by their adapters (see [`crate::harness`]), and the hub hands each to the bridge of
//! every project on my list, with a window or without (docs/UEBERSICHT.md). From them it knows the
//! sessions working in
//! its project, what they are doing and which files they touched, takes a snapshot before a
//! session's first write in a turn, and can hand a task to the next prompt. No tool is named
//! here: what a session can do is in its [`Capabilities`].

use crate::Locked;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::git::{Git, GitRun};
use crate::harness::{self, Capabilities, Event, EventKind, Harness, HarnessInfo, Parked, Place, SessionInfo};
use crate::findings::{self, Found, FoundView};
use crate::identity::{self, Identities, Listed};
use crate::journal::{self, Journal};
use crate::rules;
use crate::snapshot::Origin;
use crate::{Current, GIT_RAN};

/// Event sent when sessions or the attachments changed; payload [`AssistantState`].
pub const ASSISTANT_CHANGED: &str = "assistant_changed";
/// Event sent after a snapshot was taken; no payload.
pub const SNAPSHOT_TAKEN: &str = "snapshot_taken";

/// Files remembered per session.
const TOUCHED_KEPT: usize = 200;
/// Sessions remembered; the ones heard of longest ago go first.
const SESSIONS_KEPT: usize = 20;
/// A running turn kept for a window started later is given up after this long without news.
const OPEN_TURN_MS: u64 = 12 * 3600_000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: String,
    /// The tool it runs in, see [`AssistantState::harnesses`]
    harness: &'static str,
    /// What is possible with this session: its tool's, less what needs it to report as long
    /// as it is known from its log only
    capabilities: Capabilities,
    /// Where it runs now: project-relative, or absolute when outside the project. Follows a `cd`
    cwd: String,
    /// Where it was started, same form: the folder it belongs to, whatever it changes into later.
    /// From its start event; else the first folder heard of (a session found in a log)
    home: Option<String>,
    /// The tool's account it runs in (for Claude Code its configuration folder), if it told: the
    /// usage is the account's
    account: Option<String>,
    /// Index into the interface's session colours, the same wherever the session shows up
    color: u8,
    /// A letter or a few characters to tell it apart at a glance
    short: String,
    /// `working`, `waiting` (for an answer or a permission), `idle` (its turn is over), `ended`
    status: &'static str,
    /// Unix milliseconds: when CodeDeck first heard of it; the list is in this order
    started: u64,
    last: u64,
    /// The latest prompt, shortened
    prompt: Option<String>,
    prompts: u32,
    /// The title the user gave the session in CodeDeck, else the tool's, from its log
    title: Option<String>,
    /// The tool's title
    #[serde(skip)]
    log_title: Option<String>,
    /// The title is the user's
    renamed: bool,
    /// The model of its latest answer, from its log
    model: Option<String>,
    /// What it is waiting for
    message: Option<String>,
    /// What it is doing or did last, e.g. `Write docs/api.md`
    step: Option<String>,
    /// Unix milliseconds: when its latest turn ended, as it reported; `None` while it works
    /// and for a session that never reported
    turn_done: Option<u64>,
    /// The user saw its finished turn (went into it, opened the turn, put it aside): it waits no
    /// longer, though nothing happened since. Starts over with the next turn
    seen: bool,
    /// What it said at the end of its latest turn, shortened; `None` while it works
    report: Option<String>,
    /// The session it was split off from when that one was sent to the background
    continues: Option<String>,
    /// It was sent to the background: the session that goes on with its conversation there
    moved_to: Option<String>,
    /// Where its running turn began, per repository it was about to write in; empty between turns
    turn: Vec<TurnStart>,
    /// Files it wrote, project-relative, newest first
    touched: Vec<Touch>,
    /// What it got from CodeDeck, the newest first: attachments with a prompt, rules at its start
    received: Vec<Received>,
    /// Where it runs, as its latest message said; `None` for a session known from its log only
    place: Option<Place>,
    /// Its process still runs; `None` when that is not known (a session known from its log only).
    /// Worked out when the state is asked for, not kept
    alive: Option<bool>,
    /// It was started in a folder above the project (one that holds it): it may touch the project,
    /// but it is not the project's, and never waits for the user here. Worked out with the state
    above: bool,
    /// The ways into it and what can be done to its process, here and now (`doors`, `actions`,
    /// `noDoor`); worked out when the state is asked for, see [`crate::doors::ways`]
    #[serde(flatten)]
    ways: crate::doors::Ways,
}

/// Something a session got from CodeDeck.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Received {
    /// Unix milliseconds
    at: u64,
    /// What it was, as the parts were called
    labels: Vec<String>,
}

/// Deliveries remembered per session.
const RECEIVED_KEPT: usize = 10;

impl Session {
    /// Started in a folder above `root`: its home is outside the project and holds it.
    fn from_above(&self, root: &Path) -> bool {
        self.home.as_deref().is_some_and(|h| h.starts_with('/') && root != Path::new(h) && root.starts_with(h))
    }

    /// It waits for the user in the project at `root`: it asks, or its turn is over and not seen
    /// (`Some(true)` and `Some(false)`), as `waitsForYou` in the interface. One from above does not.
    fn waits_in(&self, root: &Path) -> Option<bool> {
        if !self.capabilities.live_status || self.from_above(root) {
            return None;
        }
        match (self.status, self.turn_done) {
            ("waiting", _) => Some(true),
            ("idle", Some(_)) if !self.seen => Some(false),
            _ => None,
        }
    }

    /// What can be offered for it now, by tool, computer, place and who started it.
    fn ways(&self) -> crate::doors::Ways {
        let alive = self.place.as_ref().and_then(crate::place::alive);
        let facts = crate::doors::Facts { place: self.place.as_ref(), status: self.status, alive, capabilities: self.capabilities, moved: self.moved_to.is_some() };
        crate::doors::ways(&facts, crate::platform::get())
    }

    fn got(&mut self, at: u64, labels: Vec<String>) {
        self.received.insert(0, Received { at, labels });
        self.received.truncate(RECEIVED_KEPT);
    }
}

/// The snapshot a turn began at in one repository.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TurnStart {
    /// Project-relative path of the repository
    repo: String,
    hash: String,
    #[serde(skip)]
    top: PathBuf,
}

/// A running turn as kept on disk for the next window on the project: a window restarted in the
/// middle of a turn (an update, a rebuild) goes on with it instead of starting a new one, which
/// would leave a snapshot without an end.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct OpenTurn {
    repo: String,
    hash: String,
    top: PathBuf,
    /// Unix milliseconds: when the session was last heard of
    at: u64,
}

/// Per project root, per session.
type OpenTurns = HashMap<String, HashMap<String, Vec<OpenTurn>>>;

#[derive(Serialize, Clone)]
pub struct Touch {
    path: String,
    at: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// Which part it is, e.g. `files`, `notes`, `changes`, `markers`; each can be set and removed on its own
    key: String,
    /// The text the assistant gets with the next prompt
    text: String,
    /// What it is, in a few words, for the interface
    label: String,
    /// The interface's count of its changes to this part: tells it which of its items went out
    /// when one is added while a prompt is being sent
    rev: u64,
}

/// A part as the interface sets it: text, label, revision.
pub type Part = (String, String, u64);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssistantState {
    /// ▶ can start a session of this project here: its tool starts sessions, and tmux is there
    can_start: bool,
    /// An event arrived since this window started
    heard: bool,
    /// How much of each account's allowance is used, as the tools last stated it
    usage: Vec<crate::usage::Seen>,
    /// The tools CodeDeck supports, the default one first
    harnesses: Vec<HarnessInfo>,
    sessions: Vec<Session>,
    /// Colour, short name and title of every session remembered for the project, also those no
    /// longer listed: their snapshots stay
    identities: Vec<IdentityInfo>,
    /// What waits for the next prompt, in the order it was attached
    attachments: Vec<Attachment>,
    /// Exactly the text the next prompt gets with it, built here and nowhere else
    preview: Option<String>,
    /// The attachments that went out last, until the next one is queued
    delivered: Option<Delivery>,
    /// The session the attachments are meant for; `None`: see `any` and `held`
    target: Option<String>,
    /// Chosen on purpose: whichever session prompts first in the project gets them
    any: bool,
    /// Attachments wait and reach no one: nothing is chosen and more than one session could
    /// take them. The interface asks who gets them
    held: bool,
    /// The session the attachments were meant for until it ended or left the list; nothing is
    /// chosen now, and the interface says so
    target_lost: Option<String>,
    /// The session that got the start rules last
    ruled: Option<Ruled>,
    /// Files the project's sessions left outside it, pages they published (2.2)
    found: FoundView,
}

/// A session got the start rules.
#[derive(Serialize, Clone)]
pub struct Ruled {
    session: String,
    /// Unix milliseconds
    at: u64,
}

/// Attachments a session took with its prompt.
#[derive(Serialize, Clone)]
pub struct Delivery {
    session: String,
    /// Unix milliseconds
    at: u64,
    /// What it was made of, as the parts were called
    labels: Vec<String>,
    /// Which parts went out, at which revision
    parts: Vec<Sent>,
}

/// One part that went out with a prompt.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Sent {
    key: String,
    rev: u64,
}

#[derive(Serialize, Clone)]
pub struct IdentityInfo {
    id: String,
    color: u8,
    short: String,
    title: Option<String>,
}

#[derive(Default)]
struct Inner {
    heard: bool,
    /// The tools' logs were read once: until then, what runs here is not known yet
    loaded: bool,
    sessions: HashMap<String, Session>,
    /// Per session: the repositories (top-level paths) with a snapshot in the current turn
    turn: HashMap<String, HashSet<PathBuf>>,
    attachments: Vec<Attachment>,
    delivered: Option<Delivery>,
    target: Option<String>,
    /// Whichever session prompts first gets the attachments, chosen on purpose
    any: bool,
    target_lost: Option<String>,
    ruled: Option<Ruled>,
    /// Sessions whose log was read since their turn ended
    looked_up: HashSet<String>,
    /// The log of each session that reported one, to see whether its turn was cut short
    logs: HashMap<String, PathBuf>,
    /// Colour, short name and title per session, of the project they were read for
    identities: Identities,
    project: Option<PathBuf>,
    /// Running turns an earlier window left, for sessions not heard of yet in this one
    resumable: HashMap<String, Vec<TurnStart>>,
    /// What was last written of the running turns, to write only changes
    open_saved: Option<HashMap<String, Vec<OpenTurn>>>,
    /// Files the project's sessions left outside it, pages they published
    found: Found,
    /// What the tools last stated about the accounts' allowance
    usage: crate::usage::Store,
}

/// How often the logs of sessions that work or wait are looked at for a stopped turn.
const CUT_SHORT_EVERY: Duration = Duration::from_secs(3);

pub struct Bridge {
    inner: Mutex<Inner>,
    /// One snapshot at a time: two sessions writing at once must not race on one repository
    snapshotting: Mutex<()>,
    /// The window showing this project, if one does: its events go there
    label: Mutex<Option<String>>,
    /// The project, fixed for the bridge's life, and git for it
    current: Arc<Current>,
    git: Arc<Git>,
    /// What happened in the project, kept for a week
    journal: Journal,
}

impl Bridge {
    /// The bridge of one project; it hears from the hub from now on, window or not.
    pub fn new(app: &AppHandle, current: Arc<Current>) -> Arc<Self> {
        let mut inner = Inner::default();
        inner.usage = crate::usage::Store::load();
        let git = Arc::new(Git::new());
        let bridge = Arc::new(Self { inner: Mutex::new(inner), snapshotting: Mutex::new(()), label: Mutex::new(None), current, git, journal: Journal::default() });
        bridge.journal.write(&bridge.current.get().root, &journal::Line::opened(now_ms()), now_ms());
        // From now on every session that asks or finishes a turn is news; there is none yet
        crate::attention::observe(app, &bridge.current.get().root, Vec::new());
        bridge.load_recent(app);
        // Holds the bridge only weakly: when its window is gone, the loop ends
        let (watcher, watching) = (Arc::downgrade(&bridge), app.clone());
        std::thread::spawn(move || {
            for tick in 0u64.. {
                std::thread::sleep(CUT_SHORT_EVERY);
                let Some(bridge) = watcher.upgrade() else { return };
                bridge.end_cut_short(&watching);
                // What the tool records of its background sessions: a question asked, a session
                // split off. Its files change rarely, a look now and then is enough
                if tick % 2 == 1 {
                    bridge.look_at_parked(&watching);
                }
            }
        });
        bridge
    }

    /// The project's git, with the log of the commands run for it.
    pub fn git(&self) -> Arc<Git> {
        self.git.clone()
    }

    /// The window that shows the project from now on, or none; it gets the state at once.
    pub fn show_in(&self, app: &AppHandle, label: Option<String>) {
        *self.label.locked() = label;
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// Sends the project's window, if it has one, an event about the project.
    fn tell<S: Serialize + Clone>(&self, app: &AppHandle, event: &str, payload: S) {
        if let Some(label) = self.label.locked().clone() {
            let _ = app.emit_to(label.as_str(), event, payload);
        }
        // The overview shows every project's sessions
        if event == ASSISTANT_CHANGED {
            crate::windows::overview_changed(app);
            // Told here, for every project of the process, not by the window that shows one of them:
            // a session in a project no window shows right now asks just as well
            crate::attention::observe(app, &self.current.get().root, self.waits());
        }
    }

    /// A turn the user stopped says nothing to the hooks (no `Stop`, no `idle_prompt`), so the
    /// session would stay "working" or "waiting" for good. The tool's log does say it: for the
    /// sessions in such a state it is looked at now and then, and a stopped turn ends like any other.
    fn look_at_parked(&self, app: &AppHandle) {
        let changed = {
            let mut inner = self.inner.locked();
            if !inner.loaded {
                return;
            }
            inner.take_parked(&self.current.get().root)
        };
        if changed {
            self.tell(app, ASSISTANT_CHANGED, self.state());
        }
    }

    fn end_cut_short(&self, app: &AppHandle) {
        let open: Vec<(String, &'static str, PathBuf, u64)> = {
            let inner = self.inner.locked();
            inner
                .sessions
                .values()
                .filter(|s| matches!(s.status, "working" | "waiting"))
                .filter_map(|s| Some((s.id.clone(), s.harness, inner.logs.get(&s.id)?.clone(), s.last)))
                .collect()
        };
        for (session, harness, log, last) in open {
            let Some(tool) = harness::by_id(Some(harness)) else { continue };
            if !tool.cut_short(&log, last) {
                continue;
            }
            let end = Event {
                harness: harness.to_string(),
                session,
                kind: EventKind::TurnDone,
                cwd: None,
                file: None,
                tool: None,
                detail: None,
                prompt: None,
                message: None,
                report: None,
                log: Some(log.display().to_string()),
                writes: Vec::new(),
                resumed: false,
                background: None,
                task_ended: None,
                account: None,
                place: None,
            };
            self.handle(app, &end);
        }
    }

    /// The sessions that wait for the user, as `needsYou` in the interface sees them: one that asks,
    /// or one whose turn is over. Only sessions that report count; of one known from its log nothing
    /// is known but that it was there.
    pub fn waits(&self) -> Vec<crate::attention::Wait> {
        let root = self.current.get().root.clone();
        let inner = self.inner.locked();
        inner
            .sessions
            .values()
            .filter_map(|s| {
                let asks = s.waits_in(&root)?;
                Some(crate::attention::Wait {
                    // A new key is a new reason to tell: each question once, each finished turn once
                    key: if asks { format!("{}:asks", s.id) } else { format!("{}:done:{}", s.id, s.turn_done.unwrap_or(0)) },
                    session: s.id.clone(),
                    asks,
                    title: s.title.clone().unwrap_or_else(|| format!("Session {}", s.id.chars().take(8).collect::<String>())),
                    short: s.short.clone(),
                    text: if asks { s.message.clone() } else { s.prompt.clone() },
                })
            })
            .collect()
    }

    pub fn state(&self) -> AssistantState {
        let inner = self.inner.locked();
        let harnesses = harness::all().iter().map(|h| HarnessInfo::of(*h)).collect();
        let root = self.current.get().root.clone();
        let mut sessions = inner.listed();
        for s in &mut sessions {
            s.above = s.from_above(&root);
        }
        AssistantState {
            can_start: crate::projects::can_start(&self.current.get().root),
            heard: inner.heard,
            usage: inner.usage.list(),
            harnesses,
            sessions,
            identities: inner.identity_list(),
            attachments: inner.attachments.clone(),
            preview: joined(&inner.attachments),
            delivered: inner.delivered.clone(),
            target: inner.target.clone(),
            any: inner.any,
            held: !inner.attachments.is_empty() && inner.target.is_none() && !inner.any && inner.receivers().len() > 1,
            target_lost: inner.target_lost.clone(),
            ruled: inner.ruled.clone(),
            found: inner.found.view(),
        }
    }

    /// Sessions of the last day from the tools' logs, read in the background: the ones that
    /// ran before this window was there, or that never report.
    fn load_recent(self: &Arc<Self>, app: &AppHandle) {
        let (me, app) = (self.clone(), app.clone());
        std::thread::spawn(move || {
            let root = me.current.get().root.clone();
            let found: Vec<(&dyn Harness, SessionInfo)> = harness::all()
                .iter()
                .filter(|h| h.capabilities().past_sessions)
                .flat_map(|h| h.past_sessions(&root).into_iter().map(move |info| (*h, info)))
                .collect();
            {
                let mut found = found;
                // Oldest first, so that colours and letters follow the order the sessions came in
                found.sort_by_key(|(_, info)| info.last);
                let mut inner = me.inner.locked();
                if me.current.get().root != root {
                    return; // the project changed meanwhile
                }
                inner.use_project(&root);
                for (harness, info) in found {
                    inner.take_log(harness, info, &root);
                }
                // Which of them run right now: a quiet session that runs must count as running
                // (today's list must not start its conversation a second time)
                for harness in harness::all() {
                    for (id, mut place) in harness.running(&root) {
                        // Started by CodeDeck? Its process says so, long before its next report
                        if let Some(pid) = place.pid.filter(|_| place.launched.is_none() && place.background.is_none()) {
                            place.launched = crate::place::launched_by(pid);
                        }
                        if let Some(session) = inner.sessions.get_mut(&id) {
                            session.place = Some(moved_to(session.place.take(), &place));
                        }
                    }
                }
                inner.take_parked(&root);
                trim(&mut inner);
                inner.loaded = true;
                inner.save_identities();
            }
            me.tell(&app, ASSISTANT_CHANGED, me.state());
        });
    }

    /// One part of the text for the assistant with the next prompt in this project; `None`
    /// takes that part back. All parts go together with the next prompt.
    pub fn attach(&self, app: &AppHandle, key: String, part: Option<Part>) {
        {
            let mut inner = self.inner.locked();
            // Something new is queued: the receipt of the last attachments has done its job
            if part.is_some() {
                inner.delivered = None;
            }
            set_part(&mut inner.attachments, key, part);
            // Nothing left to deliver: nothing to aim at either
            if inner.attachments.is_empty() {
                inner.unaim();
            }
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// The session the attachments are meant for; with `None`, `any` says whether whichever
    /// prompts first gets them, or nothing is chosen.
    pub fn set_target(&self, app: &AppHandle, session: Option<String>, any: bool) {
        {
            let mut inner = self.inner.locked();
            inner.any = any && session.is_none();
            inner.target = session;
            inner.target_lost = None;
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// Tells the windows the sessions again: what the computer offers changed, so do their doors.
    pub fn notify(&self, app: &AppHandle) {
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// The user's title and short name for a session, kept for the project.
    pub fn rename(&self, app: &AppHandle, id: &str, title: Option<&str>, short: Option<&str>) {
        {
            let mut inner = self.inner.locked();
            inner.use_project(&self.current.get().root);
            inner.rename(id, title, short);
            inner.save_identities();
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// Copies a file a session left outside into the scratch folder; its project-relative path.
    pub fn fetch_outside(&self, app: &AppHandle, path: &str) -> Result<String, String> {
        let copy = {
            let project = self.current.get();
            let mut inner = self.inner.locked();
            inner.use_project(&project.root);
            let copy = inner.found.fetch(&project, path);
            inner.save_found();
            copy
        };
        self.tell(app, ASSISTANT_CHANGED, self.state());
        copy
    }

    /// Whether `path` is a file the project's sessions left outside it.
    pub fn is_found(&self, path: &str) -> bool {
        self.inner.locked().found.has_file(path)
    }

    /// Forgets a file left outside or a published page (by its path or address).
    pub fn forget_found(&self, app: &AppHandle, key: &str) {
        {
            let mut inner = self.inner.locked();
            inner.use_project(&self.current.get().root);
            inner.found.forget(key);
            inner.save_found();
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// The user saw a session's finished turn: it no longer waits for them (until its next turn).
    pub fn seen(&self, app: &AppHandle, id: &str) {
        let changed = {
            let mut inner = self.inner.locked();
            match inner.sessions.get_mut(id) {
                Some(s) if s.turn_done.is_some() && !s.seen => {
                    s.seen = true;
                    true
                }
                _ => false,
            }
        };
        if changed {
            self.tell(app, ASSISTANT_CHANGED, self.state());
        }
    }

    /// What is needed to continue one session: its tool and account; `Err` while it still runs,
    /// where a second process would only stand beside the first.
    pub fn resume_info(&self, id: &str) -> Result<(&'static str, Option<String>), String> {
        let inner = self.inner.locked();
        let s = inner.sessions.get(id).ok_or("this session is not known (any more)")?;
        if s.status != "ended" && s.place.as_ref().and_then(crate::place::alive) == Some(true) {
            return Err("it still runs: go into it instead".into());
        }
        Ok((s.harness, s.account.clone()))
    }

    /// Takes a session off the list until it reports again.
    pub fn forget(&self, app: &AppHandle, id: &str) {
        {
            let mut inner = self.inner.locked();
            inner.use_project(&self.current.get().root);
            inner.forget(id);
            inner.save_identities();
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
    }

    /// Before starting a session in the project: whether one runs there already (its process
    /// lives, or it worked within minutes where that is not known), and the conversation to
    /// continue: the latest one that did not end, if any.
    pub fn start_info(&self) -> (bool, Option<String>) {
        let inner = self.inner.locked();
        let now = now_ms();
        let alive = |s: &Session| s.place.as_ref().and_then(crate::place::alive);
        let running = inner.sessions.values().any(|s| {
            s.status != "ended" && alive(s).unwrap_or_else(|| matches!(s.status, "working" | "waiting") && now.saturating_sub(s.last) < 5 * 60_000)
        });
        let resume = inner.sessions.values().filter(|s| s.status != "ended" && alive(s) != Some(true)).max_by_key(|s| s.last).map(|s| s.id.clone());
        (running, resume)
    }

    /// Reads a session's log again and takes in what it says (its name, its Remote Control link);
    /// the window hears of it. Whether the link is known now; `None` when there is no log.
    pub fn refresh_from_log(&self, app: &AppHandle, id: &str) -> Option<bool> {
        let (log, harness) = {
            let inner = self.inner.locked();
            let session = inner.sessions.get(id)?;
            (inner.logs.get(id)?.clone(), harness::by_id(Some(session.harness))?)
        };
        let info = harness.read_log(&log)?;
        let root = self.current.get().root.clone();
        let known = {
            let mut inner = self.inner.locked();
            inner.apply(id, info, harness, &root);
            inner.save_identities();
            inner.sessions.get(id).and_then(|s| s.place.as_ref()).is_some_and(|p| p.remote.is_some())
        };
        self.tell(app, ASSISTANT_CHANGED, self.state());
        Some(known)
    }

    /// Looks for a session's Remote Control link in its log where the hooks have not told it yet
    /// (a fresh session says nothing until its first prompt).
    pub fn discover_remote(&self, app: &AppHandle, id: &str) {
        let known = self.inner.locked().sessions.get(id).and_then(|s| s.place.as_ref()).is_some_and(|p| p.remote.is_some());
        if !known {
            self.refresh_from_log(app, id);
        }
    }

    /// Whether a session with this id is known (it reported, or its log was read).
    /// Waits until the tools' logs were read once, at most `max`.
    pub fn wait_loaded(&self, max: std::time::Duration) {
        let until = std::time::Instant::now() + max;
        while !self.inner.locked().loaded && std::time::Instant::now() < until {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    pub fn knows(&self, id: &str) -> bool {
        self.inner.locked().sessions.contains_key(id)
    }

    /// Whether a session was heard of at or after `since` (Unix ms). A conversation continued in
    /// tmux keeps its id, so being known says nothing about the new process: until that one
    /// reports, the card is the old one.
    pub fn heard_since(&self, id: &str, since: u64) -> bool {
        self.inner.locked().sessions.get(id).is_some_and(|s| s.last >= since)
    }

    /// How many sessions ask something and how many finished a turn in the last `done_for` ms, as
    /// the overview counts them under "Waits for you" (without the turns put aside there).
    /// The ids of the sessions that ask something and of those that finished a turn in the last
    /// `done_for` ms, as the overview shows them under "Waits for you" (without the turns put aside
    /// there). Ids, not numbers: a session in a subfolder is heard by the project above too, and
    /// counts once.
    pub fn waiting(&self, now: u64, done_for: u64) -> (Vec<String>, Vec<String>) {
        let root = self.current.get().root.clone();
        let inner = self.inner.locked();
        let (mut asks, mut done) = (Vec::new(), Vec::new());
        for s in inner.sessions.values() {
            match s.waits_in(&root) {
                Some(true) => asks.push(s.id.clone()),
                Some(false) if s.turn_done.is_some_and(|at| now.saturating_sub(at) < done_for) => done.push(s.id.clone()),
                _ => {}
            }
        }
        (asks, done)
    }

    /// What is needed to go into a session: its tool, its account, where it runs.
    /// What can be done with a session now: the commands go by this, as the interface does.
    pub fn ways_of(&self, id: &str) -> Option<crate::doors::Ways> {
        self.inner.locked().sessions.get(id).map(Session::ways)
    }

    pub fn session_place(&self, id: &str) -> Option<(&'static str, Option<String>, Option<Place>)> {
        let inner = self.inner.locked();
        inner.sessions.get(id).map(|s| (s.harness, s.account.clone(), s.place.clone()))
    }

    /// The usage a tool's status line stated; the window hears of it when it changed anything.
    pub fn take_usage(&self, app: &AppHandle, usage: crate::usage::Usage) {
        let changed = self.inner.locked().usage.take(usage, now_ms());
        if changed {
            self.tell(app, ASSISTANT_CHANGED, self.state());
        }
    }

    /// Takes in one event; the text to hand to the assistant, if any.
    pub fn handle(&self, app: &AppHandle, e: &Event) -> Option<String> {
        let harness = harness::by_id(Some(&e.harness))?;
        // A session just started says nothing more until its first prompt, but its log soon has
        // its name and, once Remote Control connects, its link: read it again a little later
        if e.kind == EventKind::SessionStarted {
            let (app, root, id) = (app.clone(), self.current.get().root.clone(), e.session.clone());
            std::thread::spawn(move || {
                for wait in [4, 12, 30] {
                    std::thread::sleep(std::time::Duration::from_secs(wait));
                    let bridge = crate::windows::bridge_for(&app, &root);
                    if bridge.refresh_from_log(&app, &id).is_some_and(|remote| remote) {
                        break;
                    }
                }
            });
        }
        let project = self.current.get();
        let root = &project.root;
        // A repository inside another project that hears its sessions is that project's to save:
        // saved by every project above it too, each turn left two or three snapshots (user, 2026-11-23)
        let inner_roots: Vec<PathBuf> = app.state::<crate::windows::Bridges>().roots().into_iter().filter(|r| r != root && r.starts_with(root)).collect();
        let repos = || self.git.repos(&project).iter().map(|r| r.top.clone()).filter(|top| !inner_roots.iter().any(|r| top.starts_with(r))).collect();
        let todo = {
            let mut inner = self.inner.locked();
            inner.use_project(root);
            let todo = inner.take_in(e, harness, root, repos, now_ms());
            inner.save_identities();
            inner.save_open_turns();
            todo?
        };
        // Only what concerns this project: `take_in` said so
        self.journal.write(root, &journal::Line::of(e, root, now_ms()), now_ms());

        // The turn's last words: as reported, else from the log (a turn cut short reports none)
        let mut said = e.report.clone();
        if let Some(mut info) = todo.log.and_then(|p| harness.read_log(&p)) {
            said = said.or(info.report.take());
            let mut inner = self.inner.locked();
            inner.apply(&e.session, info, harness, root);
            inner.save_identities();
        }
        // Kept with the session: what a finished turn shows in the list
        if let (EventKind::TurnDone, Some(text)) = (e.kind, &said) {
            if let Some(session) = self.inner.locked().sessions.get_mut(&e.session) {
                session.report = Some(report_shown(text));
            }
        }
        // The start rules ask for the link of a page published elsewhere at the end of the turn
        if let (EventKind::TurnDone, Some(text)) = (e.kind, &said) {
            let mut inner = self.inner.locked();
            inner.found.said(text, &e.session, now_ms(), harness.page_hosts());
        }
        self.inner.locked().save_found();

        let git = &self.git;
        let report = |run: &GitRun| self.tell(app, GIT_RAN, run.clone());
        if !todo.ends.is_empty() {
            let _one = self.snapshotting.locked();
            let mut taken = false;
            for repo in git.repos(&project) {
                let Some(start) = todo.ends.iter().find(|s| s.top == repo.top) else { continue };
                let origin = Origin { from: Some(&start.hash), report: said.as_deref(), ..Origin::before(&todo.end_label, Some(&e.session), None) };
                taken |= matches!(git.end_turn(&report, &repo, &origin), Ok(Some(_)));
            }
            if taken {
                self.tell(app, SNAPSHOT_TAKEN, ());
            }
        }

        if !todo.snapshot_repos.is_empty() {
            let file = e.file.as_deref().map(Path::new);
            let tool = match (&e.tool, file) {
                (Some(t), Some(f)) => Some(format!("{t} {}", relative(root, f).unwrap_or_else(|| f.display().to_string()))),
                (Some(t), None) => Some(t.clone()),
                _ => None,
            };
            let _one = self.snapshotting.locked();
            let mut taken = false;
            for repo in git.repos(&project).iter().filter(|r| todo.snapshot_repos.contains(&r.top)) {
                let origin = Origin::before(&todo.label, Some(&e.session), tool.as_deref());
                if let Ok(start) = git.take_snapshot(&report, repo, &origin) {
                    taken |= start.new;
                    let start = TurnStart { repo: repo.path.clone(), hash: start.hash, top: repo.top.clone() };
                    let mut inner = self.inner.locked();
                    inner.turn_began(&e.session, start);
                    inner.save_open_turns();
                }
            }
            if taken {
                self.tell(app, SNAPSHOT_TAKEN, ());
            }
        }
        self.tell(app, ASSISTANT_CHANGED, self.state());
        todo.context
    }
}

/// What the window has to do after an event was taken in.
struct Todo {
    /// Text for the session's prompt
    context: Option<String>,
    /// Repositories (top-level paths) to take a snapshot of before the write goes on
    snapshot_repos: Vec<PathBuf>,
    /// What the snapshot is called
    label: String,
    /// The turn that is over: where it began, per repository, to take its closing snapshot
    ends: Vec<TurnStart>,
    end_label: String,
    /// The session's log, to be read for title and model
    log: Option<PathBuf>,
}

impl Inner {
    /// Reads the identities kept for the project, unless they are the ones at hand.
    fn use_project(&mut self, root: &Path) {
        if self.project.as_deref() != Some(root) {
            self.identities = identity::load(root);
            self.found = findings::load(root);
            self.project = Some(root.to_path_buf());
            let open = open_turns_file().map(|f| load_open(&f, root, now_ms())).unwrap_or_default();
            self.resume(open);
        }
    }

    /// Running turns an earlier window left: a session takes its own back when it shows up.
    fn resume(&mut self, open: HashMap<String, Vec<OpenTurn>>) {
        self.open_saved = Some(open.clone());
        self.resumable = open
            .into_iter()
            .map(|(id, turns)| (id, turns.into_iter().map(|t| TurnStart { repo: t.repo, hash: t.hash, top: t.top }).collect()))
            .collect();
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.take_back(&id);
        }
    }

    /// The session goes on with the turn an earlier window left for it, unless it has one.
    fn take_back(&mut self, id: &str) {
        let Some(starts) = self.resumable.remove(id) else { return };
        let Some(session) = self.sessions.get_mut(id) else { return };
        if session.turn.is_empty() {
            self.turn.insert(id.to_string(), starts.iter().map(|s| s.top.clone()).collect());
            session.turn = starts;
        }
    }

    /// The running turns as they are kept for the next window; those not taken back yet stay.
    fn open_turns(&self) -> HashMap<String, Vec<OpenTurn>> {
        let mut open: HashMap<String, Vec<OpenTurn>> = self
            .resumable
            .iter()
            .map(|(id, starts)| {
                let at = self.open_saved.as_ref().and_then(|o| o.get(id)).and_then(|t| t.first()).map_or(0, |t| t.at);
                (id.clone(), starts.iter().map(|s| OpenTurn { repo: s.repo.clone(), hash: s.hash.clone(), top: s.top.clone(), at }).collect())
            })
            .collect();
        for s in self.sessions.values().filter(|s| !s.turn.is_empty()) {
            let turns = s.turn.iter().map(|t| OpenTurn { repo: t.repo.clone(), hash: t.hash.clone(), top: t.top.clone(), at: s.last });
            open.insert(s.id.clone(), turns.collect());
        }
        open
    }

    /// Writes the running turns down for the next window, if they changed.
    fn save_open_turns(&mut self) {
        let Some(root) = self.project.clone() else { return };
        let open = self.open_turns();
        if self.open_saved.as_ref() == Some(&open) {
            return;
        }
        if let Some(file) = open_turns_file() {
            // A failed write only costs going on with a turn after a restart
            let _ = save_open(&file, &root, &open, now_ms());
        }
        self.open_saved = Some(open);
    }

    fn save_found(&mut self) {
        if let Some(root) = &self.project {
            findings::save(root, &mut self.found, now_ms());
        }
    }

    /// A file a session wrote outside the project, unless it is somewhere that is no finding.
    fn wrote_outside(&mut self, harness: &dyn Harness, root: &Path, file: &Path, session: &str, at: u64) {
        if findings::left_outside(root, file) && !harness.is_own_file(file) {
            self.found.wrote(file, session, at);
        }
    }

    fn save_identities(&mut self) {
        if let Some(root) = &self.project {
            identity::save(root, &mut self.identities, now_ms());
        }
    }

    /// The sessions in the order they came in, the newest first: a session keeps its place.
    /// Takes in what the tools record of the project's background sessions (see
    /// [`Harness::parked`]): which session is one, where it came from, the question it waits for.
    /// Whether anything changed.
    fn take_parked(&mut self, root: &Path) -> bool {
        // In a fixed order: a map's own order may differ between two looks
        let look = |sessions: &HashMap<String, Session>| {
            let mut all: Vec<_> = sessions.values().map(|s| (&s.id, &s.status, &s.message, &s.place, &s.continues, &s.moved_to)).collect();
            all.sort_by(|a, b| a.0.cmp(b.0));
            serde_json::to_string(&all).unwrap_or_default()
        };
        let before = look(&self.sessions);
        for harness in harness::all() {
            for parked in harness.parked(root) {
                apply_parked(&mut self.sessions, parked);
            }
        }
        before != look(&self.sessions)
    }

    fn listed(&self) -> Vec<Session> {
        // A background session nobody asked anything yet is one the tool keeps ready (a spare of
        // Claude Code's daemon): nothing to show until it gets its first prompt
        let spare = |s: &Session| s.place.as_ref().is_some_and(|p| p.background.is_some()) && s.prompts == 0 && s.status != "working";
        let mut sessions: Vec<Session> = self.sessions.values().filter(|s| !spare(s)).cloned().collect();
        for s in &mut sessions {
            s.alive = s.place.as_ref().and_then(crate::place::alive);
            s.ways = s.ways();
        }
        sessions.sort_by(|a, b| b.started.cmp(&a.started).then_with(|| a.id.cmp(&b.id)));
        sessions
    }

    fn identity_list(&self) -> Vec<IdentityInfo> {
        let mut list: Vec<IdentityInfo> = self
            .identities
            .all()
            .map(|(id, i)| IdentityInfo { id: id.clone(), color: i.color, short: i.short.clone(), title: i.shown_title() })
            .collect();
        list.sort_by(|a, b| a.id.cmp(&b.id));
        list
    }

    /// The session of that id; a new one gets its identity: the one kept for it, else a colour
    /// and a letter that tell it apart from the sessions listed.
    fn session(&mut self, id: &str, now: u64, harness: &dyn Harness) -> &mut Session {
        if !self.sessions.contains_key(id) {
            let listed: Vec<Listed> =
                self.sessions.values().map(|s| Listed { color: s.color, short: &s.short, active: s.status != "ended" }).collect();
            let identity = self.identities.of(id, now, &listed);
            let mut session = new_session(id, harness);
            (session.renamed, session.title) = (identity.name.is_some(), identity.shown_title());
            (session.color, session.short, session.started, session.last) = (identity.color, identity.short, identity.first, now);
            self.sessions.insert(id.to_string(), session);
            self.take_back(id);
        }
        self.identities.touch(id, now);
        self.sessions.get_mut(id).expect("just put there")
    }

    /// The session's running turn began at this snapshot in one repository.
    fn turn_began(&mut self, id: &str, start: TurnStart) {
        if let Some(session) = self.sessions.get_mut(id) {
            session.turn.retain(|s| s.top != start.top);
            session.turn.push(start);
        }
    }

    /// Takes in what a session's log says: title, model, and writes that were not reported.
    fn apply(&mut self, id: &str, seen: SessionInfo, harness: &dyn Harness, root: &Path) {
        for (file, at) in &seen.writes {
            if self.sessions.contains_key(id) {
                self.wrote_outside(harness, root, file, id, *at);
            }
        }
        let Some(session) = self.sessions.get_mut(id) else { return };
        session.log_title = seen.title.or(session.log_title.take());
        self.identities.set_title(id, session.log_title.as_deref());
        if !session.renamed {
            session.title = session.log_title.clone();
        }
        session.model = seen.model.or(session.model.take());
        // The hooks give the link only from the first prompt on; the log has it at once
        if let Some(remote) = seen.remote {
            let place = session.place.get_or_insert_with(Place::default);
            if place.remote.is_none() {
                place.remote = Some(remote);
            }
        }
        if session.prompt.is_none() {
            session.prompt = seen.prompt.as_deref().map(shorten);
        }
        // Of a session known from its log: how its last turn ended, to tell which one to continue
        if session.report.is_none() && session.status != "working" {
            session.report = seen.report.as_deref().map(report_shown);
        }
        for (file, at) in seen.writes {
            if let Some(path) = relative(root, &file) {
                if !session.touched.iter().any(|t| t.path == path) {
                    session.touched.push(Touch { path, at });
                }
            }
        }
        session.touched.sort_by(|a, b| b.at.cmp(&a.at));
        session.touched.truncate(TOUCHED_KEPT);
    }

    /// Takes a session off the list. Its colour and name stay with its snapshots, and it is
    /// back as soon as it reports again.
    fn forget(&mut self, id: &str) {
        self.sessions.remove(id);
        self.resumable.remove(id);
        self.turn.remove(id);
        self.looked_up.remove(id);
        self.identities.hide(id, true);
        self.lose_target(id);
    }

    /// The session is gone: nothing is chosen now. With one session left that one gets the
    /// attachments; with more they wait until the user says who (not the first to prompt).
    fn lose_target(&mut self, id: &str) {
        if self.target.as_deref() == Some(id) {
            self.target = None;
            self.target_lost = Some(id.to_string());
        }
    }

    /// Nothing aimed at any more: after the attachments went out, or when none are left.
    fn unaim(&mut self) {
        (self.target, self.any, self.target_lost) = (None, false, None);
    }

    /// Sessions that could take the attachments: running, and their tool adds them to the prompt.
    fn receivers(&self) -> Vec<&str> {
        self.sessions
            .values()
            .filter(|s| s.status != "ended" && s.capabilities.attach == harness::Attach::WithNextPrompt)
            .filter(|s| s.place.as_ref().and_then(crate::place::alive) != Some(false))
            .map(|s| s.id.as_str())
            .collect()
    }

    /// Whether this session's prompt takes the attachments: the one chosen, anyone when chosen
    /// so, and without a choice only when it is the one session that could. With more, which
    /// one prompts first would be chance.
    fn meant_for(&self, id: &str) -> bool {
        match &self.target {
            Some(t) => t == id,
            None => self.any || self.receivers().iter().all(|r| *r == id),
        }
    }

    /// The user's title and short name for a listed session.
    fn rename(&mut self, id: &str, title: Option<&str>, short: Option<&str>) {
        let Some(session) = self.sessions.get_mut(id) else { return };
        let Some(identity) = self.identities.rename(id, title, short) else { return };
        session.short = identity.short.clone();
        session.renamed = identity.name.is_some();
        session.title = identity.name.clone().or_else(|| session.log_title.clone());
    }

    /// Takes in one event of a session of `harness`; `None` when it does not concern the
    /// project at `root`. `repos` gives the top-level paths of the project's repositories.
    /// Free of the window and of git, so that it can be tested with any adapter.
    fn take_in(&mut self, e: &Event, harness: &dyn Harness, root: &Path, repos: impl FnOnce() -> Vec<PathBuf>, now: u64) -> Option<Todo> {
        if e.session.is_empty() {
            return None;
        }
        let file = e.file.as_deref().map(PathBuf::from);
        let inside = |p: &Path| p.starts_with(root);
        let cwd = e.cwd.as_deref().map(PathBuf::from);
        let concerns = file.as_deref().is_some_and(inside)
            || cwd.as_deref().is_some_and(|c| inside(c) || root.starts_with(c));
        if !concerns && !self.sessions.contains_key(&e.session) {
            return None;
        }
        self.heard = true;
        let capabilities = harness.capabilities();
        let session = self.session(&e.session, now, harness);
        // It reports: from now on everything its tool can do is possible with it
        session.capabilities = capabilities;
        self.identities.hide(&e.session, false);
        let session = self.sessions.get_mut(&e.session).expect("just looked up");
        if let Some(c) = &cwd {
            session.cwd = relative(root, c).unwrap_or_else(|| c.display().to_string());
            // Only the start event is sure to come from the folder it started in
            if session.home.is_none() || e.kind == EventKind::SessionStarted {
                session.home = Some(session.cwd.clone());
            }
        }
        session.last = now;
        if e.account.is_some() {
            session.account = e.account.clone();
        }
        if let Some(place) = &e.place {
            session.place = Some(moved_to(session.place.take(), place));
        }
        // Another session reports from the process this one ran in: it is not there any more (after
        // `/clear`, or sent to the background, the terminal goes on with a new conversation)
        let process = e.place.as_ref().and_then(|p| Some((p.pid?, p.since?)));
        if let Some(process) = process {
            for other in self.sessions.values_mut().filter(|o| o.id != e.session && o.status != "ended") {
                if other.place.as_ref().and_then(|p| Some((p.pid?, p.since?))) == Some(process) {
                    other.status = "ended";
                    other.message = None;
                }
            }
        }
        let session = self.sessions.get_mut(&e.session).expect("just looked up");
        // A turn is over when the session says so, or when the next prompt comes without that
        let over = matches!(e.kind, EventKind::TurnDone | EventKind::PromptSubmitted);
        let ends = if over { std::mem::take(&mut session.turn) } else { Vec::new() };
        let end_label = match &session.prompt {
            Some(p) => format!("After: {p}"),
            None => "After the assistant's changes".to_string(),
        };
        match e.kind {
            EventKind::SessionStarted => session.status = "idle",
            EventKind::PromptSubmitted => {
                session.status = "working";
                session.prompts += 1;
                session.prompt = e.prompt.as_deref().map(shorten);
                session.message = None;
                session.step = None;
                session.turn_done = None;
                session.report = None;
            }
            EventKind::BeforeWrite | EventKind::AfterWrite => {
                session.status = "working";
                session.message = None;
                session.turn_done = None;
                session.step = match (&e.tool, file.as_deref()) {
                    (Some(tool), Some(f)) => Some(format!("{tool} {}", relative(root, f).unwrap_or_else(|| f.display().to_string()))),
                    // A shell command says what it runs: that is what a permission asks about
                    (Some(tool), None) => Some(match &e.detail {
                        Some(detail) => format!("{tool} {detail}"),
                        None => tool.clone(),
                    }),
                    _ => session.step.take(),
                };
            }
            EventKind::Waiting => {
                session.status = "waiting";
                session.message = e.message.clone();
            }
            // Not every write is followed by an "after" (a shell command is not), so after an
            // allowed command nothing else clears the permission question: the end of the turn must
            EventKind::TurnDone => {
                session.status = "idle";
                session.message = None;
                // Said twice (the end of the turn, then "waiting for your input"): the first counts
                if session.turn_done.is_none() {
                    session.turn_done = Some(now);
                    session.seen = false;
                }
            }
            EventKind::SessionEnded => {
                session.status = "ended";
                session.message = None;
            }
        }
        if e.kind == EventKind::SessionEnded {
            self.lose_target(&e.session);
        }
        // Files left outside the project: written ones, and what a shell command names as its output
        let outside: Vec<PathBuf> = match e.kind {
            EventKind::AfterWrite => file.iter().cloned().collect(),
            EventKind::BeforeWrite => e.writes.iter().map(PathBuf::from).collect(),
            _ => Vec::new(),
        };
        for f in &outside {
            self.wrote_outside(harness, root, f, &e.session, now);
        }
        let session = self.sessions.get_mut(&e.session).expect("just looked up");
        if e.kind == EventKind::AfterWrite {
            if let Some(path) = file.as_deref().and_then(|f| relative(root, f)) {
                session.touched.retain(|t| t.path != path);
                session.touched.insert(0, Touch { path, at: now });
                session.touched.truncate(TOUCHED_KEPT);
            }
        }
        let label = match &session.prompt {
            Some(p) => format!("Before: {p}"),
            None => "Before the assistant's changes".to_string(),
        };
        let mut context = None;
        if over {
            self.turn.remove(&e.session);
        }
        // A fresh session (not one resumed with what it knew) gets the rules, if its tool can take them
        if e.kind == EventKind::SessionStarted && capabilities.start_rules && !e.resumed {
            context = Some(rules::START_RULES.to_string());
            self.ruled = Some(Ruled { session: e.session.clone(), at: now });
            if let Some(s) = self.sessions.get_mut(&e.session) {
                s.got(now, vec!["Start rules".to_string()]);
            }
        }
        if e.kind == EventKind::PromptSubmitted {
            // Only a tool that adds the text to the prompt takes it, and only the session it is
            // meant for; otherwise it keeps waiting
            let meant = self.meant_for(&e.session);
            if capabilities.attach == harness::Attach::WithNextPrompt && meant {
                let labels: Vec<String> = self.attachments.iter().map(|h| h.label.clone()).collect();
                let parts: Vec<Sent> = self.attachments.iter().map(|h| Sent { key: h.key.clone(), rev: h.rev }).collect();
                if let Some(text) = take_parts(&mut self.attachments) {
                    context = Some(text);
                    self.unaim();
                    if let Some(s) = self.sessions.get_mut(&e.session) {
                        s.got(now, labels.clone());
                    }
                    self.delivered = Some(Delivery { session: e.session.clone(), at: now, labels, parts });
                }
            }
        }
        let mut snapshot_repos = Vec::new();
        if e.kind == EventKind::BeforeWrite {
            let repos = repos();
            // Without a file (a shell command): the repository the session works in. Every
            // repository below the project was too many: a project above many repositories (the home
            // folder) saved all of them for each command (user, 2026-11-23). Working above every
            // repository, a command saves none; the files it writes with the tools still count
            let wanted: Option<PathBuf> = match (file.as_deref(), cwd.as_deref()) {
                (Some(f), _) => repo_of(&repos, f),
                (None, Some(c)) => repo_of(&repos, c),
                (None, None) => None,
            };
            let done = self.turn.entry(e.session.clone()).or_default();
            snapshot_repos = wanted.into_iter().filter(|top| done.insert(top.clone())).collect();
        }
        trim(self);
        if let Some(path) = &e.log {
            self.logs.insert(e.session.clone(), PathBuf::from(path));
        }
        // The log has the title and model: read it for a new session and after each turn
        if e.kind == EventKind::TurnDone {
            self.looked_up.remove(&e.session);
        }
        let mut log = None;
        if let Some(path) = e.log.as_deref().filter(|_| !self.looked_up.contains(&e.session)) {
            self.looked_up.insert(e.session.clone());
            log = Some(PathBuf::from(path));
        }
        Some(Todo { context, snapshot_repos, label, ends, end_label, log })
    }

    /// Takes in a session found in a tool's logs. If nothing was heard from it, it stays one
    /// known from its log only.
    fn take_log(&mut self, harness: &dyn Harness, info: SessionInfo, root: &Path) {
        // Taken off the list by the user: it stays away until it reports again
        if self.identities.get(&info.id).is_some_and(|i| i.hidden) {
            return;
        }
        self.looked_up.insert(info.id.clone());
        let id = info.id.clone();
        let session = self.session(&id, info.last, harness);
        if let Some(c) = &info.cwd {
            if session.cwd.is_empty() {
                session.cwd = relative(root, c).unwrap_or_else(|| c.display().to_string());
            }
            if session.home.is_none() {
                session.home = Some(relative(root, c).unwrap_or_else(|| c.display().to_string()));
            }
        }
        session.last = session.last.max(info.last);
        self.apply(&id, info, harness, root);
    }
}

/// The place a message reports, taking the place known before into account: not every message asks
/// tmux for the session's name, and the same pane is the same tmux session.
fn moved_to(before: Option<Place>, now: &Place) -> Place {
    let mut place = now.clone();
    if let (Some(new), Some(old)) = (place.tmux.as_mut(), before.and_then(|p| p.tmux)) {
        if new.session.is_none() && new.pane == old.pane {
            new.session = old.session;
        }
    }
    place
}

/// One background session as the tool records it, taken into the sessions CodeDeck knows.
fn apply_parked(sessions: &mut HashMap<String, Session>, parked: Parked) {
    let Some(session) = sessions.get_mut(&parked.id) else { return };
    let place = session.place.get_or_insert_with(Place::default);
    if place.background.is_none() {
        place.background = Some(parked.job);
    }
    if parked.continues.is_some() {
        session.continues = parked.continues.clone();
    }
    // Its turn ended with a question (the tool tells it apart from a turn that is simply done):
    // it waits for an answer as much as one that asks for a permission
    if let Some(question) = parked.question {
        if session.capabilities.live_status && session.status == "idle" && session.turn_done.is_some() {
            session.status = "waiting";
            session.message = Some(question);
        }
    }
    if let Some(origin) = parked.continues.and_then(|o| sessions.get_mut(&o)) {
        origin.moved_to = Some(parked.id);
    }
}

fn new_session(id: &str, harness: &dyn Harness) -> Session {
    Session {
        id: id.to_string(),
        harness: harness.id(),
        // Until it reports itself
        capabilities: harness.capabilities().from_log_only(),
        cwd: String::new(),
        home: None,
        account: None,
        color: 0,
        short: String::new(),
        status: "idle",
        started: 0,
        last: 0,
        prompt: None,
        prompts: 0,
        title: None,
        log_title: None,
        renamed: false,
        model: None,
        message: None,
        step: None,
        turn_done: None,
        seen: false,
        report: None,
        continues: None,
        moved_to: None,
        turn: Vec::new(),
        touched: Vec::new(),
        received: Vec::new(),
        place: None,
        alive: None,
        above: false,
        ways: Default::default(),
    }
}

/// Forgets the sessions heard of longest ago beyond [`SESSIONS_KEPT`].
fn trim(inner: &mut Inner) {
    while inner.sessions.len() > SESSIONS_KEPT {
        let Some(oldest) = inner.sessions.values().min_by_key(|s| s.last).map(|s| s.id.clone()) else { break };
        inner.sessions.remove(&oldest);
        inner.turn.remove(&oldest);
        inner.looked_up.remove(&oldest);
        inner.lose_target(&oldest);
    }
}

/// Sets, replaces or (with `None`) removes one part of the attachments.
fn set_part(list: &mut Vec<Attachment>, key: String, part: Option<Part>) {
    match (list.iter_mut().find(|h| h.key == key), part) {
        (Some(h), Some((text, label, rev))) => (h.text, h.label, h.rev) = (text, label, rev),
        (None, Some((text, label, rev))) => list.push(Attachment { key, text, label, rev }),
        (_, None) => list.retain(|h| h.key != key),
    }
}

/// All parts as one text for the prompt, in the order they were attached.
fn joined(list: &[Attachment]) -> Option<String> {
    (!list.is_empty()).then(|| list.iter().map(|h| h.text.as_str()).collect::<Vec<_>>().join("\n\n"))
}

/// The text for the prompt; empties the list.
fn take_parts(list: &mut Vec<Attachment>) -> Option<String> {
    let text = joined(list);
    list.clear();
    text
}

/// The repository a file belongs to: the innermost one around it.
fn repo_of(repos: &[PathBuf], file: &Path) -> Option<PathBuf> {
    repos.iter().filter(|top| file.starts_with(top)).max_by_key(|top| top.as_os_str().len()).cloned()
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(root).ok().map(|p| p.to_string_lossy().into_owned())
}

fn shorten(text: &str) -> String {
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.chars().count() > 90 { format!("{}…", line.chars().take(89).collect::<String>()) } else { line }
}

/// A turn's last words as the list shows them: plain text on one line (no headings, emphasis or
/// code marks, which only take room in three short lines), long enough to fill them.
fn report_shown(text: &str) -> String {
    let plain: String = text
        .lines()
        .map(|l| l.trim_start_matches(|c: char| c == '#' || c == '>' || c.is_whitespace()))
        .map(|l| l.strip_prefix("- ").or_else(|| l.strip_prefix("* ")).unwrap_or(l))
        .filter(|l| !l.starts_with("```") && !l.starts_with("---") && !l.starts_with('|'))
        .collect::<Vec<_>>()
        .join(" ")
        .replace("**", "")
        .replace('`', "");
    let line = plain.split_whitespace().collect::<Vec<_>>().join(" ");
    if line.chars().count() > 400 { format!("{}…", line.chars().take(399).collect::<String>()) } else { line }
}

/// Where running turns are kept between windows: next to the sockets, so a restart of the
/// machine (which ends every turn anyway) forgets them.
fn open_turns_file() -> Option<PathBuf> {
    crate::hook::ensure_socket_dir().ok().map(|d| d.join("turns.json"))
}

fn read_open(file: &Path) -> OpenTurns {
    std::fs::read(file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// The running turns kept for the project, without those not heard of for too long.
fn load_open(file: &Path, root: &Path, now: u64) -> HashMap<String, Vec<OpenTurn>> {
    let mut open = read_open(file).remove(root.to_string_lossy().as_ref()).unwrap_or_default();
    open.retain(|_, turns| turns.iter().any(|t| t.at + OPEN_TURN_MS > now));
    open
}

fn save_open(file: &Path, root: &Path, open: &HashMap<String, Vec<OpenTurn>>, now: u64) -> std::io::Result<()> {
    // Read again: windows of other projects keep theirs in the same file
    let mut all = read_open(file);
    all.insert(root.to_string_lossy().into_owned(), open.clone());
    for project in all.values_mut() {
        project.retain(|_, turns| turns.iter().any(|t| t.at + OPEN_TURN_MS > now));
    }
    all.retain(|_, project| !project.is_empty());
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(&all)?)?;
    std::fs::rename(&tmp, file)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::Attach as Way;
    use crate::harness::fake::Fake;

    /// The core without any real tool: sessions come from the test adapter's logs and from its
    /// raw messages, and what the window is told to do follows its capabilities.
    #[test]
    fn notes_files_a_session_of_the_project_leaves_outside_it() {
        let tmp = std::env::temp_dir().join(format!("codedeck-outside-{}", std::process::id()));
        let root = tmp.join("p");
        std::fs::create_dir_all(&root).unwrap();
        let (draft, shell) = (tmp.join("draft.md"), tmp.join("out.txt"));
        std::fs::write(&draft, "draft").unwrap();
        let mut inner = Inner::default();
        let mut step = |raw: String, now: u64| {
            let event = Fake.translate(&serde_json::from_str(&raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, &root, Vec::new, now);
        };
        let (r, d, o) = (root.display(), draft.display(), shell.display());
        step(format!(r#"{{"who":"a1","did":"asked","in":"{r}","text":"Plan it"}}"#), 10);
        step(format!(r#"{{"who":"a1","did":"wrote","in":"{r}","path":"{d}","with":"Write"}}"#), 20);
        // A shell command's output counts once it is there
        step(format!(r#"{{"who":"a1","did":"will-write","in":"{r}","with":"Bash","out":["{o}"]}}"#), 30);
        // Another project's session: none of ours
        step(format!(r#"{{"who":"x9","did":"wrote","in":"/elsewhere","path":"{d}","with":"Write"}}"#), 40);
        let listed = |inner: &Inner| inner.found.view().outside.iter().map(|f| (f.found.path.clone(), f.found.session.clone())).collect::<Vec<_>>();
        assert_eq!(listed(&inner), [(d.to_string(), "a1".to_string())]);
        std::fs::write(&shell, "x").unwrap();
        assert_eq!(listed(&inner).len(), 2);
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    /// Where a session runs comes with each message: the tmux name survives messages that did not
    /// ask for it, and a remote link that is gone is gone (the connection dropped).
    #[test]
    fn a_finished_turn_waits_until_seen_and_a_permission_says_what_it_runs() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let mut step = |inner: &mut Inner, raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, Vec::new, now);
        };
        step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Test it"}"#, 10);
        step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","with":"Bash","detail":"cargo test --all"}"#, 20);
        step(&mut inner, r#"{"who":"a1","did":"asks","in":"/p","text":"May I?"}"#, 30);
        assert_eq!(inner.sessions["a1"].step.as_deref(), Some("Bash cargo test --all"));
        step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 40);
        inner.sessions.get_mut("a1").unwrap().seen = true;
        // Said again a minute later: still the same turn, still seen
        step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 100);
        assert_eq!((inner.sessions["a1"].turn_done, inner.sessions["a1"].seen), (Some(40), true));
        // The next turn waits again
        step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"More"}"#, 200);
        step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 210);
        assert_eq!((inner.sessions["a1"].turn_done, inner.sessions["a1"].seen), (Some(210), false));
    }

    #[test]
    fn a_session_sent_to_the_background_goes_on_there_and_its_terminal_with_another() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let mut step = |inner: &mut Inner, raw: &str, place: Place, now: u64| {
            let mut event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            event.place = Some(place);
            inner.take_in(&event, &Fake, root, Vec::new, now);
        };
        let terminal = Place { pid: Some(10), since: Some(1), ..Default::default() };
        let daemon = |pid| Place { pid: Some(pid), since: Some(2), background: Some(format!("job{pid}")), ..Default::default() };
        step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Port it"}"#, terminal.clone(), 10);
        // `/background`: the conversation goes on in the daemon under a new id, a spare waits beside
        // it, and the terminal goes on with a fresh conversation
        step(&mut inner, r#"{"who":"c3","did":"started","in":"/p"}"#, daemon(20), 20);
        step(&mut inner, r#"{"who":"d4","did":"started","in":"/p"}"#, daemon(21), 21);
        step(&mut inner, r#"{"who":"c3","did":"asked","in":"/p","text":"Port it"}"#, daemon(20), 22);
        step(&mut inner, r#"{"who":"b2","did":"started","in":"/p"}"#, terminal, 30);
        assert_eq!(inner.sessions["a1"].status, "ended");
        let listed: Vec<String> = inner.listed().into_iter().map(|s| s.id).collect();
        assert!(listed.contains(&"c3".to_string()) && !listed.contains(&"d4".to_string()), "the spare is not listed: {listed:?}");
        // What the daemon records: where it came from, and the question it ended its turn with
        step(&mut inner, r#"{"who":"c3","did":"done","in":"/p"}"#, daemon(20), 40);
        apply_parked(&mut inner.sessions, Parked { id: "c3".into(), job: "job20".into(), question: Some("Commit now?".into()), continues: Some("a1".into()) });
        let (c3, a1) = (&inner.sessions["c3"], &inner.sessions["a1"]);
        assert_eq!((c3.status, c3.message.as_deref(), c3.continues.as_deref()), ("waiting", Some("Commit now?"), Some("a1")));
        assert_eq!(a1.moved_to.as_deref(), Some("c3"));
    }

    #[test]
    fn a_report_is_shown_as_one_plain_line() {
        assert_eq!(report_shown("## Done\n\n- **Fixed** the `limit`\n```rust\nx\n```"), "Done Fixed the limit x");
    }

    #[test]
    fn keeps_where_a_session_runs() {
        use crate::harness::Tmux;
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let mut step = |raw: &str, place: Place, now: u64| {
            let mut event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            event.place = Some(place);
            inner.take_in(&event, &Fake, root, Vec::new, now);
            inner.sessions["a1"].place.clone().unwrap()
        };
        let pane = |session: Option<&str>| Some(Tmux { pane: "%3".into(), session: session.map(String::from) });
        let link = Some("https://example.test/s1".to_string());
        let first = Place { pid: Some(10), since: Some(1), tmux: pane(Some("codedeck-p-A")), launched: None, remote: link.clone(), background: None };
        assert_eq!(step(r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#, first.clone(), 10), first);
        let later = step(r#"{"who":"a1","did":"wrote","in":"/p","path":"/p/a","with":"Write"}"#, Place { tmux: pane(None), remote: None, ..first.clone() }, 20);
        assert_eq!(later.tmux, pane(Some("codedeck-p-A")));
        assert_eq!(later.remote, None);
        // Another pane is another tmux session: its name is not known yet
        let moved = step(r#"{"who":"a1","did":"done","in":"/p"}"#, Place { tmux: Some(Tmux { pane: "%9".into(), session: None }), ..first }, 30);
        assert_eq!(moved.tmux.unwrap().session, None);
    }

    #[test]
    fn a_session_keeps_the_folder_it_started_in() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let mut hear = |raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, Vec::new, now);
        };
        // It starts in a project below, then changes into another folder: its place follows, its home does not
        hear(r#"{"who":"a1","did":"asked","in":"/p/sub","text":"Go"}"#, 10);
        hear(r#"{"who":"a1","did":"wrote","in":"/p/other","path":"/p/other/a","with":"Write"}"#, 20);
        let s = &inner.sessions["a1"];
        assert_eq!((s.cwd.as_str(), s.home.as_deref()), ("other", Some("sub")));
    }

    #[test]
    fn knows_sessions_of_a_tool_that_is_not_claude() {
        let root = Path::new("/p");
        let repos = || vec![PathBuf::from("/p"), PathBuf::from("/p/sub")];
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, repos, now)
        };

        // From the log only: known, but nothing that needs it to report is possible
        for info in Fake.past_sessions(root) {
            inner.take_log(&Fake, info, root);
        }
        let old = &inner.sessions["old"];
        assert_eq!((old.harness, old.status, old.title.as_deref(), old.cwd.as_str()), ("fake", "idle", Some("Earlier work"), "docs"));
        assert_eq!(old.touched.iter().map(|t| t.path.as_str()).collect::<Vec<_>>(), ["docs/notes.md"]);
        assert!(!old.capabilities.live_status && !old.capabilities.before_write && old.capabilities.past_sessions);
        assert_eq!(old.capabilities.attach, Way::None);
        assert!(!inner.heard);

        // Elsewhere: not this project's session
        assert!(step(&mut inner, r#"{"who":"x9","did":"asked","in":"/elsewhere","text":"hi"}"#, 5).is_none());

        set_part(&mut inner.attachments, "focus".into(), Some(("look here".into(), "1 item".into(), 1)));
        let asked = step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Tidy   the\nsub module"}"#, 10).unwrap();
        // This tool cannot take text with a prompt: the attachments keep waiting
        assert!(asked.context.is_none());

        let first = step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","path":"/p/sub/a.rs","with":"patch"}"#, 20).unwrap();
        assert_eq!((first.snapshot_repos, first.label.as_str()), (vec![PathBuf::from("/p/sub")], "Before: Tidy the sub module"));
        step(&mut inner, r#"{"who":"a1","did":"wrote","in":"/p","path":"/p/sub/a.rs","with":"patch"}"#, 30).unwrap();
        // The same repository again in this turn: no second snapshot; a command: the rest
        let again = step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","path":"/p/sub/b.rs","with":"patch"}"#, 40).unwrap();
        assert!(again.snapshot_repos.is_empty());
        let command = step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","with":"shell"}"#, 50).unwrap();
        assert_eq!(command.snapshot_repos, [PathBuf::from("/p")]);
        step(&mut inner, r#"{"who":"a1","did":"asks","in":"/p","text":"May I?"}"#, 60).unwrap();
        assert_eq!((inner.sessions["a1"].status, inner.sessions["a1"].message.as_deref()), ("waiting", Some("May I?")));
        // What the window does after the snapshots: it notes where the turn began
        let start = TurnStart { repo: "sub".into(), hash: "abc1234".into(), top: PathBuf::from("/p/sub") };
        inner.turn_began("a1", start.clone());
        let done = step(&mut inner, r#"{"who":"a1","did":"done","in":"/p","said":"Tidied."}"#, 70).unwrap();
        // The turn is over: its closing snapshot is due, once
        assert_eq!((done.ends, done.end_label.as_str()), (vec![start], "After: Tidy the sub module"));
        assert!(inner.sessions["a1"].turn.is_empty());
        assert!(step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 70).unwrap().ends.is_empty());
        // The session from the log speaks up: now it is a live one
        step(&mut inner, r#"{"who":"old","did":"asked","in":"/p/docs","text":"More"}"#, 80).unwrap();

        let a1 = &inner.sessions["a1"];
        assert_eq!((a1.harness, a1.status, a1.prompts, a1.message.as_deref(), a1.last), ("fake", "idle", 1, None, 70));
        assert_eq!(a1.touched.iter().map(|t| (t.path.as_str(), t.at)).collect::<Vec<_>>(), [("sub/a.rs", 30)]);
        assert_eq!(a1.capabilities, Fake.capabilities());
        let old = &inner.sessions["old"];
        assert!(old.capabilities.live_status && old.status == "working" && old.title.as_deref() == Some("Earlier work"));
        assert!(inner.heard && inner.attachments.len() == 1 && inner.sessions.len() == 2);
    }

    /// A shell command saves the repository the session works in, not every one in the project;
    /// working above all of them, it saves none.
    #[test]
    fn a_command_saves_the_repository_it_runs_in() {
        let root = Path::new("/p");
        let repos = || vec![PathBuf::from("/p/a"), PathBuf::from("/p/b"), PathBuf::from("/p/b/inner")];
        let mut inner = Inner::default();
        let mut step = |raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, repos, now).unwrap()
        };
        step(r#"{"who":"a1","did":"asked","in":"/p/b/inner/src","text":"Go"}"#, 10);
        assert_eq!(step(r#"{"who":"a1","did":"will-write","in":"/p/b/inner/src","with":"shell"}"#, 20).snapshot_repos, [PathBuf::from("/p/b/inner")]);
        step(r#"{"who":"a2","did":"asked","in":"/p","text":"Go"}"#, 30);
        assert!(step(r#"{"who":"a2","did":"will-write","in":"/p","with":"shell"}"#, 40).snapshot_repos.is_empty());
        // Its files still count
        assert_eq!(step(r#"{"who":"a2","did":"will-write","in":"/p","path":"/p/a/x.rs","with":"patch"}"#, 50).snapshot_repos, [PathBuf::from("/p/a")]);
    }

    /// A window restarted in the middle of a turn (an update, a rebuild) goes on with it: no
    /// second "before" snapshot, and the end comes where the turn began.
    #[test]
    fn a_restarted_window_goes_on_with_the_running_turn() {
        let root = Path::new("/p");
        let repos = || vec![PathBuf::from("/p")];
        let step = |inner: &mut Inner, raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, repos, now)
        };
        let start = TurnStart { repo: String::new(), hash: "abc1234".into(), top: PathBuf::from("/p") };

        // The first window: a turn begins, and what is kept for the next window says so
        let mut first = Inner::default();
        step(&mut first, r#"{"who":"a1","did":"asked","in":"/p","text":"Rename it"}"#, 10).unwrap();
        assert_eq!(step(&mut first, r#"{"who":"a1","did":"will-write","in":"/p","with":"shell"}"#, 20).unwrap().snapshot_repos.len(), 1);
        first.turn_began("a1", start.clone());
        let kept = first.open_turns();
        assert_eq!(kept["a1"], [OpenTurn { repo: String::new(), hash: "abc1234".into(), top: PathBuf::from("/p"), at: 20 }]);

        // Kept on disk for the project, read back; another project's turns stay apart, old ones go
        let file = std::env::temp_dir().join(format!("codedeck-open-turns-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&file);
        save_open(&file, root, &kept, 30).unwrap();
        let mut other = HashMap::new();
        other.insert("b2".to_string(), vec![OpenTurn { repo: String::new(), hash: "def".into(), top: PathBuf::from("/q"), at: 30 }]);
        save_open(&file, Path::new("/q"), &other, 30).unwrap();
        let read = load_open(&file, root, 40);
        assert_eq!(read, kept);
        assert!(load_open(&file, root, 20 + OPEN_TURN_MS).is_empty(), "given up after a long silence");
        std::fs::remove_file(&file).unwrap();

        // The next window: the session shows up again and is in the same turn
        let mut next = Inner::default();
        next.resume(read);
        let write = step(&mut next, r#"{"who":"a1","did":"will-write","in":"/p","with":"shell"}"#, 50).unwrap();
        assert!(write.snapshot_repos.is_empty(), "no second snapshot for the same turn");
        let done = step(&mut next, r#"{"who":"a1","did":"done","in":"/p","said":"Renamed."}"#, 60).unwrap();
        assert_eq!(done.ends, [start]);
        assert!(next.open_turns().is_empty(), "nothing left to keep once the turn is over");
    }

    /// The fake tool, but one that takes text with a prompt.
    struct Prompting;
    impl Harness for Prompting {
        fn id(&self) -> &'static str {
            "prompting"
        }
        fn name(&self) -> &'static str {
            Fake.name()
        }
        fn short_name(&self) -> &'static str {
            Fake.short_name()
        }
        fn declared(&self) -> Capabilities {
            Capabilities { attach: Way::WithNextPrompt, ..Fake.capabilities() }
        }
        fn connections(&self) -> Vec<harness::Connection> {
            Vec::new()
        }
        fn connect(&self, account: &str, on: bool) -> Result<(), String> {
            Fake.connect(account, on)
        }
        fn translate(&self, raw: &serde_json::Value) -> Option<Event> {
            Fake.translate(raw)
        }
        fn reply(&self, _event: &Event, handed: &[String]) -> Option<String> {
            Some(handed.join("\n"))
        }
        fn past_sessions(&self, project: &Path) -> Vec<SessionInfo> {
            Fake.past_sessions(project)
        }
        fn read_log(&self, log: &Path) -> Option<SessionInfo> {
            Fake.read_log(log)
        }
    }

    /// What the right column lives on: the step a session is at, when its turn ended, and
    /// which session took the attachments.
    #[test]
    fn tells_the_step_the_end_of_a_turn_and_the_delivery() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Prompting, root, Vec::new, now).unwrap()
        };
        set_part(&mut inner.attachments, "markers".into(), Some(("do this".into(), "2 comments".into(), 1)));
        set_part(&mut inner.attachments, "focus".into(), Some(("look here".into(), "1 item".into(), 1)));

        let asked = step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go on"}"#, 10);
        assert_eq!(asked.context.as_deref(), Some("do this\n\nlook here"));
        let delivered = inner.delivered.clone().unwrap();
        assert_eq!(delivered.parts.iter().map(|p| p.key.as_str()).collect::<Vec<_>>(), ["markers", "focus"]);
        assert_eq!((delivered.session.as_str(), delivered.at, delivered.labels), ("a1", 10, vec!["2 comments".to_string(), "1 item".to_string()]));
        assert!(inner.attachments.is_empty() && inner.sessions["a1"].received.len() == 1);

        step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","path":"/p/docs/api.md","with":"patch"}"#, 20);
        assert_eq!((inner.sessions["a1"].step.as_deref(), inner.sessions["a1"].turn_done), (Some("patch docs/api.md"), None));
        step(&mut inner, r#"{"who":"a1","did":"will-write","in":"/p","with":"shell"}"#, 30);
        assert_eq!(inner.sessions["a1"].step.as_deref(), Some("shell"));
        step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 40);
        // The end of the turn said once more a minute later: it is still the turn that ended at 40
        step(&mut inner, r#"{"who":"a1","did":"done","in":"/p"}"#, 100);
        let a1 = &inner.sessions["a1"];
        assert_eq!((a1.status, a1.turn_done, a1.step.as_deref()), ("idle", Some(40), Some("shell")));

        // Taken off the list: not read from the log again, but back with its next step, as it was
        inner.take_log(&Prompting, Fake.past_sessions(root).remove(0), root);
        let old = (inner.sessions["old"].color, inner.sessions["old"].short.clone());
        inner.forget("old");
        inner.take_log(&Prompting, Fake.past_sessions(root).remove(0), root);
        assert!(!inner.sessions.contains_key("old") && inner.identity_list().iter().any(|i| i.id == "old"));
        step(&mut inner, r#"{"who":"old","did":"asked","in":"/p/docs","text":"Back"}"#, 105);
        assert_eq!((inner.sessions["old"].color, inner.sessions["old"].short.clone()), old);
        inner.sessions.remove("old");
        inner.take_log(&Prompting, Fake.past_sessions(root).remove(0), root);
        assert!(inner.sessions.contains_key("old"));
        // The next prompt: a new turn, nothing to deliver, the receipt stays
        let next = step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"More"}"#, 110);
        assert!(next.context.is_none() && inner.sessions["a1"].turn_done.is_none() && inner.sessions["a1"].received.len() == 1);
        assert!(inner.delivered.is_some());
    }

    /// Colour and letter are given once, the list keeps its order whoever works, and the
    /// user's title goes before the tool's until it is taken back.
    #[test]
    fn sessions_keep_their_identity_and_their_place() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str, now: u64| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Fake, root, Vec::new, now).unwrap();
        };
        for info in Fake.past_sessions(root) {
            inner.take_log(&Fake, info, root);
        }
        step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"One"}"#, 10);
        step(&mut inner, r#"{"who":"b2","did":"asked","in":"/p","text":"Two"}"#, 20);
        let order = |inner: &Inner| inner.listed().iter().map(|s| (s.id.clone(), s.short.clone(), s.color)).collect::<Vec<_>>();
        let before = order(&inner);
        assert_eq!(before, [("b2".to_string(), "C".to_string(), 2), ("a1".to_string(), "B".to_string(), 1), ("old".to_string(), "A".to_string(), 0)]);
        // The oldest works again: nothing moves
        step(&mut inner, r#"{"who":"old","did":"asked","in":"/p","text":"Again"}"#, 30);
        assert_eq!(order(&inner), before);

        inner.rename("old", Some("My notes"), Some("Doc"));
        let old = &inner.sessions["old"];
        assert_eq!((old.title.as_deref(), old.short.as_str(), old.renamed), (Some("My notes"), "Doc", true));
        assert_eq!(inner.identity_list()[2].title.as_deref(), Some("My notes"));
        inner.rename("old", None, None);
        let old = &inner.sessions["old"];
        assert_eq!((old.title.as_deref(), old.short.as_str(), old.renamed), (Some("Earlier work"), "Doc", false));

        // Forgotten from the list and back: the same colour and letter
        inner.sessions.remove("a1");
        step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Back"}"#, 40);
        assert_eq!(order(&inner), before.iter().map(|(id, s, c)| (id.clone(), if id == "old" { "Doc".into() } else { s.clone() }, *c)).collect::<Vec<_>>());
    }

    /// A fresh session gets the start rules, a resumed one not; a tool without them gets none.
    #[test]
    fn gives_the_start_rules_to_fresh_sessions() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str, harness: &dyn Harness| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, harness, root, Vec::new, 5).unwrap().context
        };
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"started","in":"/p"}"#, &Prompting).as_deref(), Some(rules::START_RULES));
        assert_eq!(inner.ruled.as_ref().map(|r| r.session.as_str()), Some("a1"));
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"started","in":"/p","again":true}"#, &Prompting), None);
        // Elsewhere: not ours to rule
        let event = Fake.translate(&serde_json::from_str(r#"{"who":"x","did":"started","in":"/q"}"#).unwrap()).unwrap();
        assert!(inner.take_in(&event, &Prompting, root, Vec::new, 5).is_none());
        struct Silent;
        impl Harness for Silent {
            fn id(&self) -> &'static str { "silent" }
            fn name(&self) -> &'static str { "Silent" }
            fn short_name(&self) -> &'static str { "Silent" }
            fn declared(&self) -> Capabilities { Capabilities { start_rules: false, ..Fake.capabilities() } }
            fn connections(&self) -> Vec<harness::Connection> { Vec::new() }
            fn connect(&self, a: &str, on: bool) -> Result<(), String> { Fake.connect(a, on) }
            fn translate(&self, raw: &serde_json::Value) -> Option<Event> { Fake.translate(raw) }
            fn reply(&self, _: &Event, _: &[String]) -> Option<String> { None }
            fn past_sessions(&self, _: &Path) -> Vec<SessionInfo> { Vec::new() }
            fn read_log(&self, _: &Path) -> Option<SessionInfo> { None }
        }
        assert_eq!(step(&mut inner, r#"{"who":"b2","did":"started","in":"/p"}"#, &Silent), None);
    }

    /// Attachments meant for one session wait for that one; when it ends, the one left gets them.
    #[test]
    fn hands_over_to_the_session_it_is_meant_for() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Prompting, root, Vec::new, 5).unwrap().context
        };
        step(&mut inner, r#"{"who":"a1","did":"started","in":"/p"}"#);
        step(&mut inner, r#"{"who":"b2","did":"started","in":"/p"}"#);
        set_part(&mut inner.attachments, "notes".into(), Some(("look at line 3".into(), "1 line comment".into(), 1)));
        inner.target = Some("b2".into());
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#), None);
        assert_eq!(step(&mut inner, r#"{"who":"b2","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("look at line 3"));
        assert!(inner.target.is_none() && inner.delivered.as_ref().is_some_and(|d| d.session == "b2"));
        // Each session remembers what it got: b2 the rules, then the comment; a1 only the rules
        let got = |id: &str| inner.sessions[id].received.iter().map(|r| r.labels.join(", ")).collect::<Vec<_>>();
        assert_eq!(got("b2"), ["1 line comment", "Start rules"]);
        assert_eq!(got("a1"), ["Start rules"]);

        set_part(&mut inner.attachments, "notes".into(), Some(("again".into(), "1 line comment".into(), 1)));
        inner.target = Some("b2".into());
        step(&mut inner, r#"{"who":"b2","did":"left","in":"/p"}"#);
        assert_eq!((inner.target.as_deref(), inner.target_lost.as_deref()), (None, Some("b2")));
        // a1 is the only one left that could take it
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("again"));
        assert!(inner.target_lost.is_none());

        // Taken off the list: the same
        set_part(&mut inner.attachments, "notes".into(), Some(("third".into(), "1 line comment".into(), 1)));
        inner.target = Some("a1".into());
        inner.forget("a1");
        assert_eq!((inner.target.as_deref(), inner.target_lost.as_deref()), (None, Some("a1")));
    }

    /// Without a choice the attachments go out only where that is no chance: with one session
    /// that could take them. With two they wait, until one is chosen or "any session" is.
    #[test]
    fn waits_when_several_could_take_it() {
        let root = Path::new("/p");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Prompting, root, Vec::new, 5).unwrap().context
        };
        step(&mut inner, r#"{"who":"a1","did":"started","in":"/p"}"#);
        set_part(&mut inner.attachments, "notes".into(), Some(("one".into(), "1 line comment".into(), 1)));
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("one"));

        step(&mut inner, r#"{"who":"b2","did":"started","in":"/p"}"#);
        set_part(&mut inner.attachments, "notes".into(), Some(("two".into(), "1 line comment".into(), 1)));
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#), None);
        assert_eq!(step(&mut inner, r#"{"who":"b2","did":"asked","in":"/p","text":"Go"}"#), None);
        assert_eq!(inner.attachments.len(), 1);

        // "Any session", chosen on purpose: the first to prompt; afterwards nothing is chosen again
        inner.any = true;
        assert_eq!(step(&mut inner, r#"{"who":"b2","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("two"));
        assert!(!inner.any && inner.target.is_none());

        // An ended session does not count: the one left gets it
        step(&mut inner, r#"{"who":"b2","did":"left","in":"/p"}"#);
        set_part(&mut inner.attachments, "notes".into(), Some(("three".into(), "1 line comment".into(), 1)));
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("three"));
    }

    #[test]
    fn a_session_from_above_never_waits_one_from_below_does() {
        // The project /p/sub hears both: one started in /p above it, one in its own subfolder
        let root = Path::new("/p/sub");
        let mut inner = Inner::default();
        let step = |inner: &mut Inner, raw: &str| {
            let event = Fake.translate(&serde_json::from_str(raw).unwrap()).unwrap();
            inner.take_in(&event, &Prompting, root, Vec::new, 5);
        };
        step(&mut inner, r#"{"who":"up","did":"started","in":"/p"}"#);
        step(&mut inner, r#"{"who":"up","did":"asks","in":"/p","text":"May I?"}"#);
        step(&mut inner, r#"{"who":"in","did":"started","in":"/p/sub/x"}"#);
        step(&mut inner, r#"{"who":"in","did":"asks","in":"/p/sub/x","text":"May I?"}"#);
        let up = &inner.sessions["up"];
        assert!(up.from_above(root) && up.waits_in(root).is_none());
        let below = &inner.sessions["in"];
        assert!(!below.from_above(root) && below.waits_in(root) == Some(true));
        // Its own folder is not above it
        assert!(!below.from_above(Path::new("/p/sub/x")));
    }

    #[test]
    fn attachments_go_together_once() {
        let mut list = Vec::new();
        let part = |t: &str| Some((t.to_string(), "label".to_string(), 1));
        set_part(&mut list, "markers".into(), part("comments"));
        set_part(&mut list, "focus".into(), part("old focus"));
        set_part(&mut list, "focus".into(), part("focus"));
        assert_eq!(take_parts(&mut list).as_deref(), Some("comments\n\nfocus"));
        assert!(take_parts(&mut list).is_none());
        set_part(&mut list, "focus".into(), part("focus"));
        set_part(&mut list, "focus".into(), None);
        assert!(list.is_empty());
    }
}
