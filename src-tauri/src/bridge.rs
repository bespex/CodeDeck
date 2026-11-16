//! The window's side of the bridge to coding assistants. Each window listens on a socket of its
//! own; `codeck hook` (see [`crate::hook`]) sends it the tools' events, already translated by
//! their adapters (see [`crate::harness`]). From them the window knows the sessions working in
//! its project, what they are doing and which files they touched, takes a snapshot before a
//! session's first write in a turn, and can hand a task to the next prompt. No tool is named
//! here: what a session can do is in its [`Capabilities`].

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::git::{Git, GitRun};
use crate::harness::{self, Capabilities, Event, EventKind, Harness, HarnessInfo, SessionInfo};
use crate::identity::{self, Identities, Listed};
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: String,
    /// The tool it runs in, see [`AssistantState::harnesses`]
    harness: &'static str,
    /// What is possible with this session: its tool's, less what needs it to report as long
    /// as it is known from its log only
    capabilities: Capabilities,
    /// Where it runs: project-relative, or absolute when outside the project
    cwd: String,
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
    /// Where its running turn began, per repository it was about to write in; empty between turns
    turn: Vec<TurnStart>,
    /// Files it wrote, project-relative, newest first
    touched: Vec<Touch>,
    /// What it got from CodeDeck, the newest first: attachments with a prompt, rules at its start
    received: Vec<Received>,
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
    /// An event arrived since this window started
    heard: bool,
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
    /// The session the attachments are meant for; `None`: whichever prompts first in the project
    target: Option<String>,
    /// The session the attachments were meant for until it ended or left the list; it now goes
    /// to any session, and the interface says so
    target_lost: Option<String>,
    /// The session that got the start rules last
    ruled: Option<Ruled>,
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
    sessions: HashMap<String, Session>,
    /// Per session: the repositories (top-level paths) with a snapshot in the current turn
    turn: HashMap<String, HashSet<PathBuf>>,
    attachments: Vec<Attachment>,
    delivered: Option<Delivery>,
    target: Option<String>,
    target_lost: Option<String>,
    ruled: Option<Ruled>,
    /// Sessions whose log was read since their turn ended
    looked_up: HashSet<String>,
    /// Colour, short name and title per session, of the project they were read for
    identities: Identities,
    project: Option<PathBuf>,
}

pub struct Bridge {
    inner: Mutex<Inner>,
    /// One snapshot at a time: two sessions writing at once must not race on one repository
    snapshotting: Mutex<()>,
    socket: PathBuf,
}

impl Drop for Bridge {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.socket);
    }
}

impl Bridge {
    /// Opens the window's socket and answers on it from now on.
    pub fn start(app: AppHandle) -> std::io::Result<Arc<Self>> {
        let dir = crate::hook::ensure_socket_dir()?;
        remove_stale(&dir);
        let socket = dir.join(format!("{}.sock", std::process::id()));
        let _ = std::fs::remove_file(&socket);
        let listener = UnixListener::bind(&socket)?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
        let bridge = Arc::new(Self { inner: Mutex::new(Inner::default()), snapshotting: Mutex::new(()), socket });

        bridge.load_recent(&app);
        let me = bridge.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let (me, app) = (me.clone(), app.clone());
                // A snapshot may take a moment; other sessions' events need not wait for it
                std::thread::spawn(move || me.serve(&app, stream));
            }
        });
        Ok(bridge)
    }

    pub fn socket(&self) -> &Path {
        &self.socket
    }

    pub fn state(&self) -> AssistantState {
        let inner = self.inner.lock().unwrap();
        let harnesses = harness::all().iter().map(|h| HarnessInfo::of(*h)).collect();
        AssistantState {
            heard: inner.heard,
            harnesses,
            sessions: inner.listed(),
            identities: inner.identity_list(),
            attachments: inner.attachments.clone(),
            preview: joined(&inner.attachments),
            delivered: inner.delivered.clone(),
            target: inner.target.clone(),
            target_lost: inner.target_lost.clone(),
            ruled: inner.ruled.clone(),
        }
    }

    /// A new project: what was known about the old one does not apply.
    pub fn clear(self: &Arc<Self>, app: &AppHandle) {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.sessions.clear();
            inner.turn.clear();
            inner.attachments.clear();
            inner.delivered = None;
            (inner.target, inner.target_lost, inner.ruled) = (None, None, None);
            inner.looked_up.clear();
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
        self.load_recent(app);
    }

    /// Sessions of the last day from the tools' logs, read in the background: the ones that
    /// ran before this window was there, or that never report.
    fn load_recent(self: &Arc<Self>, app: &AppHandle) {
        let (me, app) = (self.clone(), app.clone());
        std::thread::spawn(move || {
            let root = app.state::<Arc<Current>>().get().root.clone();
            let found: Vec<(&dyn Harness, SessionInfo)> = harness::all()
                .iter()
                .filter(|h| h.capabilities().past_sessions)
                .flat_map(|h| h.past_sessions(&root).into_iter().map(move |info| (*h, info)))
                .collect();
            {
                let mut found = found;
                // Oldest first, so that colours and letters follow the order the sessions came in
                found.sort_by_key(|(_, info)| info.last);
                let mut inner = me.inner.lock().unwrap();
                if app.state::<Arc<Current>>().get().root != root {
                    return; // the project changed meanwhile
                }
                inner.use_project(&root);
                for (harness, info) in found {
                    inner.take_log(harness, info, &root);
                }
                trim(&mut inner);
                inner.save_identities();
            }
            let _ = app.emit(ASSISTANT_CHANGED, me.state());
        });
    }

    /// One part of the text for the assistant with the next prompt in this project; `None`
    /// takes that part back. All parts go together with the next prompt.
    pub fn attach(&self, app: &AppHandle, key: String, part: Option<Part>) {
        {
            let mut inner = self.inner.lock().unwrap();
            // Something new is queued: the receipt of the last attachments has done its job
            if part.is_some() {
                inner.delivered = None;
            }
            set_part(&mut inner.attachments, key, part);
            // Nothing left to deliver: nothing to aim at either
            if inner.attachments.is_empty() {
                (inner.target, inner.target_lost) = (None, None);
            }
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    /// The session the attachments are meant for; `None`: whichever prompts first in the project.
    pub fn set_target(&self, app: &AppHandle, session: Option<String>) {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.target = session;
            inner.target_lost = None;
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    /// The user's title and short name for a session, kept for the project.
    pub fn rename(&self, app: &AppHandle, id: &str, title: Option<&str>, short: Option<&str>) {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.use_project(&app.state::<Arc<Current>>().get().root);
            inner.rename(id, title, short);
            inner.save_identities();
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    /// Takes a session off the list until it reports again.
    pub fn forget(&self, app: &AppHandle, id: &str) {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.use_project(&app.state::<Arc<Current>>().get().root);
            inner.forget(id);
            inner.save_identities();
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
    }

    fn serve(&self, app: &AppHandle, mut stream: UnixStream) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut text = String::new();
        if (&mut stream).take(256 * 1024).read_to_string(&mut text).is_err() {
            return;
        }
        let Ok(event) = serde_json::from_str::<Event>(&text) else { return };
        let context = self.handle(app, &event);
        let _ = stream.write_all(json!({ "context": context }).to_string().as_bytes());
    }

    /// Takes in one event; the text to hand to the assistant, if any.
    fn handle(&self, app: &AppHandle, e: &Event) -> Option<String> {
        let harness = harness::by_id(Some(&e.harness))?;
        let project = app.state::<Arc<Current>>().get();
        let root = &project.root;
        let repos = || app.state::<Git>().repos(&project).iter().map(|r| r.top.clone()).collect();
        let todo = {
            let mut inner = self.inner.lock().unwrap();
            inner.use_project(root);
            let todo = inner.take_in(e, harness, root, repos, now_ms());
            inner.save_identities();
            todo?
        };

        // The turn's last words: as reported, else from the log (a turn cut short reports none)
        let mut said = e.report.clone();
        if let Some(mut info) = todo.log.and_then(|p| harness.read_log(&p)) {
            said = said.or(info.report.take());
            let mut inner = self.inner.lock().unwrap();
            inner.apply(&e.session, info, root);
            inner.save_identities();
        }

        let git = app.state::<Git>();
        let report = |run: &GitRun| {
            let _ = app.emit(GIT_RAN, run);
        };
        if !todo.ends.is_empty() {
            let _one = self.snapshotting.lock().unwrap();
            let mut taken = false;
            for repo in git.repos(&project) {
                let Some(start) = todo.ends.iter().find(|s| s.top == repo.top) else { continue };
                let origin = Origin { from: Some(&start.hash), report: said.as_deref(), ..Origin::before(&todo.end_label, Some(&e.session), None) };
                taken |= matches!(git.end_turn(&report, &repo, &origin), Ok(Some(_)));
            }
            if taken {
                let _ = app.emit(SNAPSHOT_TAKEN, ());
            }
        }

        if !todo.snapshot_repos.is_empty() {
            let file = e.file.as_deref().map(Path::new);
            let tool = match (&e.tool, file) {
                (Some(t), Some(f)) => Some(format!("{t} {}", relative(root, f).unwrap_or_else(|| f.display().to_string()))),
                (Some(t), None) => Some(t.clone()),
                _ => None,
            };
            let _one = self.snapshotting.lock().unwrap();
            let mut taken = false;
            for repo in git.repos(&project).iter().filter(|r| todo.snapshot_repos.contains(&r.top)) {
                let origin = Origin::before(&todo.label, Some(&e.session), tool.as_deref());
                if let Ok(start) = git.take_snapshot(&report, repo, &origin) {
                    taken |= start.new;
                    let start = TurnStart { repo: repo.path.clone(), hash: start.hash, top: repo.top.clone() };
                    self.inner.lock().unwrap().turn_began(&e.session, start);
                }
            }
            if taken {
                let _ = app.emit(SNAPSHOT_TAKEN, ());
            }
        }
        let _ = app.emit(ASSISTANT_CHANGED, self.state());
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
            self.project = Some(root.to_path_buf());
        }
    }

    fn save_identities(&mut self) {
        if let Some(root) = &self.project {
            identity::save(root, &mut self.identities, now_ms());
        }
    }

    /// The sessions in the order they came in, the newest first: a session keeps its place.
    fn listed(&self) -> Vec<Session> {
        let mut sessions: Vec<Session> = self.sessions.values().cloned().collect();
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
    fn apply(&mut self, id: &str, seen: SessionInfo, root: &Path) {
        let Some(session) = self.sessions.get_mut(id) else { return };
        session.log_title = seen.title.or(session.log_title.take());
        self.identities.set_title(id, session.log_title.as_deref());
        if !session.renamed {
            session.title = session.log_title.clone();
        }
        session.model = seen.model.or(session.model.take());
        if session.prompt.is_none() {
            session.prompt = seen.prompt.as_deref().map(shorten);
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
        self.turn.remove(id);
        self.looked_up.remove(id);
        self.identities.hide(id, true);
        self.lose_target(id);
    }

    /// The session is gone: attachments meant for it go to any session now.
    fn lose_target(&mut self, id: &str) {
        if self.target.as_deref() == Some(id) {
            self.target = None;
            self.target_lost = Some(id.to_string());
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
        }
        session.last = now;
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
            }
            EventKind::BeforeWrite | EventKind::AfterWrite => {
                session.status = "working";
                session.message = None;
                session.turn_done = None;
                session.step = match (&e.tool, file.as_deref()) {
                    (Some(tool), Some(f)) => Some(format!("{tool} {}", relative(root, f).unwrap_or_else(|| f.display().to_string()))),
                    (Some(tool), None) => Some(tool.clone()),
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
                session.turn_done.get_or_insert(now);
            }
            EventKind::SessionEnded => {
                session.status = "ended";
                session.message = None;
            }
        }
        if e.kind == EventKind::SessionEnded {
            self.lose_target(&e.session);
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
            let meant = self.target.as_ref().is_none_or(|t| *t == e.session);
            if capabilities.attach == harness::Attach::WithNextPrompt && meant {
                let labels: Vec<String> = self.attachments.iter().map(|h| h.label.clone()).collect();
                let parts: Vec<Sent> = self.attachments.iter().map(|h| Sent { key: h.key.clone(), rev: h.rev }).collect();
                if let Some(text) = take_parts(&mut self.attachments) {
                    context = Some(text);
                    (self.target, self.target_lost) = (None, None);
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
            let wanted: Vec<PathBuf> = match file.as_deref() {
                Some(f) => repo_of(&repos, f).into_iter().collect(),
                // Without a file (a shell command) anything in the project may change
                None => repos,
            };
            let done = self.turn.entry(e.session.clone()).or_default();
            snapshot_repos = wanted.into_iter().filter(|top| done.insert(top.clone())).collect();
        }
        trim(self);
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
        }
        session.last = session.last.max(info.last);
        self.apply(&id, info, root);
    }
}

fn new_session(id: &str, harness: &dyn Harness) -> Session {
    Session {
        id: id.to_string(),
        harness: harness.id(),
        // Until it reports itself
        capabilities: harness.capabilities().from_log_only(),
        cwd: String::new(),
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
        turn: Vec::new(),
        touched: Vec::new(),
        received: Vec::new(),
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

/// Sockets of windows that were killed and could not remove theirs: `<pid>.sock` without a
/// process of that number.
fn remove_stale(dir: &Path) {
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        let pid = path.file_stem().and_then(|s| s.to_str()).and_then(|s| s.parse::<u32>().ok());
        if path.extension().is_some_and(|e| e == "sock") && pid.is_some_and(|p| !Path::new(&format!("/proc/{p}")).exists()) {
            let _ = std::fs::remove_file(&path);
        }
    }
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
        fn capabilities(&self) -> Capabilities {
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
            fn capabilities(&self) -> Capabilities { Capabilities { start_rules: false, ..Fake.capabilities() } }
            fn connections(&self) -> Vec<harness::Connection> { Vec::new() }
            fn connect(&self, a: &str, on: bool) -> Result<(), String> { Fake.connect(a, on) }
            fn translate(&self, raw: &serde_json::Value) -> Option<Event> { Fake.translate(raw) }
            fn reply(&self, _: &Event, _: &[String]) -> Option<String> { None }
            fn past_sessions(&self, _: &Path) -> Vec<SessionInfo> { Vec::new() }
            fn read_log(&self, _: &Path) -> Option<SessionInfo> { None }
        }
        assert_eq!(step(&mut inner, r#"{"who":"b2","did":"started","in":"/p"}"#, &Silent), None);
    }

    /// Attachments meant for one session wait for that one; when it ends, any session gets them.
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
        assert_eq!(step(&mut inner, r#"{"who":"a1","did":"asked","in":"/p","text":"Go"}"#).as_deref(), Some("again"));
        assert!(inner.target_lost.is_none());

        // Taken off the list: the same
        set_part(&mut inner.attachments, "notes".into(), Some(("third".into(), "1 line comment".into(), 1)));
        inner.target = Some("a1".into());
        inner.forget("a1");
        assert_eq!((inner.target.as_deref(), inner.target_lost.as_deref()), (None, Some("a1")));
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
