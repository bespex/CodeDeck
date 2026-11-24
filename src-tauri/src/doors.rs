//! The ways into a session (docs/SITZUNGEN.md B4, "Türen"), as far as they need no tool: its
//! terminal. A session in tmux gets a terminal attached to its tmux session; one started by hand in
//! a terminal gets that terminal window brought to the front (X11 only). Which terminal program
//! opens is found once, see [`crate::terminal`]. The tool's own ways in
//! (a desktop app) come from its adapter, see [`crate::harness::Harness::desktop_command`].

use crate::harness::{Launched, Place};

/// Opens the session in a terminal: in the background through the tool (`attach`), attached to its
/// tmux session, or its own terminal window to
/// the front. Says why not when neither is possible.
pub fn terminal(place: &Place, attach: Option<Launched>) -> Result<(), String> {
    // In the background there is no terminal to find: the tool opens the session in a new one
    if let (Some(_), Some(attach)) = (&place.background, attach) {
        return in_new_terminal(&attach);
    }
    if let Some(tmux) = &place.tmux {
        // `=name` matches the session's name exactly; the pane id finds its session too
        let target = tmux.session.as_ref().map_or_else(|| tmux.pane.clone(), |name| format!("={name}"));
        // Straight to the tool's pane, wherever in the tmux session it is
        if !tmux.pane.is_empty() {
            // A pane that is gone still leaves its tmux session to attach to
            let _ = crate::tmux::show_pane(&tmux.pane);
        }
        // Shown in a terminal already: that one comes to the front, as the desktop app's window
        // does, instead of a second terminal on the same session (X11 only; elsewhere a new one)
        if crate::platform::get().x11 && crate::tmux::clients_of(&target).into_iter().any(raise_window_of) {
            return Ok(());
        }
        return crate::terminal::open(&["tmux", "attach-session", "-t", &target]);
    }
    let pid = place.pid.ok_or("CodeDeck does not know where this session runs")?;
    if !crate::platform::get().x11 {
        return Err("its terminal window cannot be brought to the front on this desktop (only under X11)".into());
    }
    if raise_window_of(pid) {
        Ok(())
    } else {
        Err("its terminal window could not be brought to the front (only possible under X11)".into())
    }
}

/// Brings the window that holds a process to the front: the first window whose process is the
/// process itself or one of its ancestors (the terminal emulator the shell runs in).
fn raise_window_of(pid: u32) -> bool {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask};
    let line = ancestors(pid);
    let raise = || -> Option<()> {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen)?.root;
        let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).ok()?.reply().ok().map(|r| r.atom);
        let (clients, pid_atom, active) = (atom("_NET_CLIENT_LIST")?, atom("_NET_WM_PID")?, atom("_NET_ACTIVE_WINDOW")?);
        let list = conn.get_property(false, root, clients, AtomEnum::WINDOW, 0, 4096).ok()?.reply().ok()?;
        let owner = |w: u32| {
            conn.get_property(false, w, pid_atom, AtomEnum::CARDINAL, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
                .and_then(|r| r.value32().and_then(|mut v| v.next()))
        };
        let windows: Vec<(u32, u32)> = list.value32()?.filter_map(|w| owner(w).map(|p| (w, p))).collect();
        // The nearest ancestor that has a window: the terminal, not something further up
        let window = line.iter().find_map(|p| windows.iter().find(|(_, owner)| owner == p).map(|(w, _)| *w))?;
        // As a pager asks (source 2): Cinnamon grants the focus then, see `window::obey`
        let event = ClientMessageEvent::new(32, window, active, [2, x11rb::CURRENT_TIME, 0, 0, 0]);
        conn.send_event(false, root, EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY, event).ok()?;
        conn.flush().ok()
    };
    raise().is_some()
}

/// The process and its ancestors, nearest first, up to init.
fn ancestors(pid: u32) -> Vec<u32> {
    let mut line = vec![pid];
    let mut at = pid;
    while let Some(parent) = parent_of(at) {
        if parent <= 1 || line.contains(&parent) {
            break;
        }
        line.push(parent);
        at = parent;
    }
    line
}

fn parent_of(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // After the command name in parentheses: state, then the parent
    stat.get(stat.rfind(')')? + 1..)?.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_its_own_ancestors() {
        let line = ancestors(std::process::id());
        assert_eq!(line[0], std::process::id());
        assert!(line.len() >= 2, "a test runs under something");
        assert_eq!(parent_of(std::process::id()), Some(line[1]));
    }
}

/// Runs a tool's command in a new terminal window, through the user's login shell (started from
/// the desktop, CodeDeck's own PATH may lack the folder the tool is installed in).
fn in_new_terminal(launched: &Launched) -> Result<(), String> {
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let env = launched.env.iter().map(|(k, v)| format!("{k}={}", crate::tmux::word(v)));
    let argv = launched.argv.iter().map(|a| crate::tmux::word(a));
    let line = format!("exec env {}", env.chain(argv).collect::<Vec<_>>().join(" "));
    crate::terminal::open(&[&shell, "-lc", &line])
}

/// A way into a session (docs/SITZUNGEN-PRUEFUNG.md K2). The terminal ones say how it opens.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Door {
    /// Its tool's desktop app, through the session's remote link
    Desktop,
    /// A terminal attached to its tmux session, on its pane
    Tmux,
    /// A terminal in which its tool joins it in the background
    Attach,
    /// The terminal window it was started in by hand, to the front (X11)
    Window,
}

impl Door {
    pub fn is_terminal(self) -> bool {
        self != Door::Desktop
    }
}

/// What can be done to a session's process from CodeDeck.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    /// Continue the conversation (in tmux, or by joining it in the background)
    Continue,
    /// Same conversation, fresh process
    Restart,
    Stop,
}

/// Why an ended session offers no "Continue".
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoContinue {
    /// Its tool cannot start a conversation again (or join one in the background) from here
    NoTool,
    /// tmux is missing, where a continued session runs
    NoTmux,
    /// It lives on in the background, and no terminal program was found to join it
    NoTerminal,
}

/// Why a running session has no door: said on its card instead of a button that fails.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoDoor {
    /// It runs in tmux or in the background, but no terminal program was found
    NoTerminal,
    /// It runs in a terminal window of its own, which cannot be brought to the front here
    OwnTerminal,
}

/// What is offered for a session, decided once for the session card, the project list, the
/// account switch and the commands that carry it out.
#[derive(serde::Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ways {
    /// The ways in that work now, the default first (double click, the card's main button)
    pub doors: Vec<Door>,
    pub actions: Vec<Action>,
    pub no_door: Option<NoDoor>,
    /// Why an ended session cannot be continued: said on its card instead of a missing button
    pub no_continue: Option<NoContinue>,
}

/// What [`ways`] looks at.
pub struct Facts<'a> {
    pub place: Option<&'a Place>,
    pub status: &'a str,
    pub alive: Option<bool>,
    pub capabilities: crate::harness::Capabilities,
    /// It went on in the background as another session: continuing it here would split it again
    pub moved: bool,
}

/// Decides the ways for a session: tool (its capabilities) × computer (`platform`) × where it
/// runs × who started it. Only what works now.
pub fn ways(f: &Facts, platform: &crate::platform::Platform) -> Ways {
    let c = f.capabilities;
    let terminal = platform.terminal.is_some();
    let background = f.place.and_then(|p| p.background.as_ref()).is_some();
    // Its process is gone, or cannot be known to run (no live status, nothing says it runs)
    let over = f.status == "ended" || f.alive == Some(false) || (!c.live_status && f.alive != Some(true));
    let mut w = Ways::default();
    if over {
        let can = if background { c.background && terminal } else { c.launch && platform.tmux.is_some() };
        if can && !f.moved {
            w.actions.push(Action::Continue);
        } else if !f.moved {
            // (A moved one says where it went on, on its card)
            w.no_continue = Some(if background {
                if !c.background { NoContinue::NoTool } else { NoContinue::NoTerminal }
            } else if !c.launch {
                NoContinue::NoTool
            } else {
                NoContinue::NoTmux
            });
        }
        return w;
    }
    if f.moved {
        return w;
    }
    let Some(place) = f.place else { return w };
    if place.remote.is_some() && c.desktop {
        w.doors.push(Door::Desktop);
    }
    let in_tmux = place.tmux.is_some();
    let door = if background {
        (c.background && terminal).then_some(Door::Attach)
    } else if in_tmux {
        terminal.then_some(Door::Tmux)
    } else if place.pid.is_some() {
        platform.x11.then_some(Door::Window)
    } else {
        None
    };
    w.doors.extend(door);
    if door.is_none() {
        w.no_door = if background || in_tmux {
            (!terminal).then_some(NoDoor::NoTerminal)
        } else {
            place.pid.is_some().then_some(NoDoor::OwnTerminal)
        };
    }
    // Only what CodeDeck started: a tmux session the user made ends with all that runs in it (K3);
    // not while it works
    let ours = place.launched.is_some() && place.tmux.as_ref().is_some_and(|t| t.session.is_some());
    if ours && f.status != "working" {
        if c.launch && platform.tmux.is_some() {
            w.actions.push(Action::Restart);
        }
        w.actions.push(Action::Stop);
    }
    w
}

#[cfg(test)]
mod ways_tests {
    use super::*;
    use crate::harness::{Harness, Tmux};
    use crate::platform::Platform;

    fn machine(tmux: bool, terminal: bool, x11: bool) -> Platform {
        Platform {
            git: Some("git version 2.43.0".into()),
            tmux: tmux.then(|| "tmux 3.4".into()),
            terminal: terminal.then(|| crate::terminal::Terminal::for_tests("xterm")),
            wayland: !x11,
            x11,
            desktop: String::new(),
            tray: true,
        }
    }

    fn caps() -> crate::harness::Capabilities {
        crate::harness::Capabilities { launch: true, background: true, desktop: true, ..crate::harness::fake::Fake.capabilities() }
    }

    fn facts<'a>(place: Option<&'a Place>, status: &'a str, alive: Option<bool>) -> Facts<'a> {
        Facts { place, status, alive, capabilities: caps(), moved: false }
    }

    fn tmux_place(ours: bool) -> Place {
        Place {
            pid: Some(10),
            tmux: Some(Tmux { pane: "%1".into(), session: Some("s".into()) }),
            launched: ours.then(|| "id".into()),
            ..Default::default()
        }
    }

    #[test]
    fn own_tmux_session_can_be_entered_restarted_and_stopped() {
        let place = Place { remote: Some("https://x".into()), ..tmux_place(true) };
        let w = ways(&facts(Some(&place), "idle", Some(true)), &machine(true, true, true));
        assert_eq!(w.doors, [Door::Desktop, Door::Tmux]);
        assert_eq!(w.actions, [Action::Restart, Action::Stop]);
        // Not while it works
        assert!(ways(&facts(Some(&place), "working", Some(true)), &machine(true, true, true)).actions.is_empty());
    }

    #[test]
    fn a_tmux_session_of_the_user_is_not_stopped() {
        let place = tmux_place(false);
        let w = ways(&facts(Some(&place), "idle", Some(true)), &machine(true, true, true));
        assert_eq!(w.doors, [Door::Tmux]);
        assert!(w.actions.is_empty());
    }

    #[test]
    fn without_terminal_no_terminal_door_and_why() {
        let place = tmux_place(true);
        let w = ways(&facts(Some(&place), "idle", Some(true)), &machine(true, false, true));
        assert!(w.doors.is_empty());
        assert_eq!(w.no_door, Some(NoDoor::NoTerminal));
    }

    #[test]
    fn own_terminal_window_only_under_x11() {
        let place = Place { pid: Some(10), ..Default::default() };
        assert_eq!(ways(&facts(Some(&place), "idle", Some(true)), &machine(true, true, true)).doors, [Door::Window]);
        let wayland = ways(&facts(Some(&place), "idle", Some(true)), &machine(true, true, false));
        assert!(wayland.doors.is_empty());
        assert_eq!(wayland.no_door, Some(NoDoor::OwnTerminal));
    }

    #[test]
    fn a_missing_continue_says_why() {
        let w = ways(&facts(None, "ended", None), &machine(false, true, true));
        assert_eq!((w.actions.is_empty(), w.no_continue), (true, Some(NoContinue::NoTmux)));
    }

    #[test]
    fn continue_needs_tmux_and_a_tool_that_starts() {
        assert_eq!(ways(&facts(None, "ended", None), &machine(true, true, true)).actions, [Action::Continue]);
        assert!(ways(&facts(None, "ended", None), &machine(false, true, true)).actions.is_empty());
        let fake = Facts { capabilities: crate::harness::fake::Fake.capabilities(), ..facts(None, "ended", None) };
        assert!(ways(&fake, &machine(true, true, true)).actions.is_empty());
        let moved = Facts { moved: true, ..facts(None, "ended", None) };
        assert!(ways(&moved, &machine(true, true, true)).actions.is_empty());
    }

    #[test]
    fn background_session_is_joined_in_a_terminal() {
        let place = Place { pid: Some(10), background: Some("job".into()), ..Default::default() };
        assert_eq!(ways(&facts(Some(&place), "waiting", Some(true)), &machine(true, true, false)).doors, [Door::Attach]);
        // Its process gone: continuing it means joining it again
        assert_eq!(ways(&facts(Some(&place), "idle", Some(false)), &machine(false, true, false)).actions, [Action::Continue]);
        assert!(ways(&facts(Some(&place), "idle", Some(false)), &machine(true, false, true)).actions.is_empty());
    }

    #[test]
    fn no_desktop_door_for_a_tool_without_desktop_app() {
        let place = Place { remote: Some("https://x".into()), ..tmux_place(true) };
        let f = Facts { capabilities: crate::harness::Capabilities { desktop: false, ..caps() }, ..facts(Some(&place), "idle", Some(true)) };
        assert_eq!(ways(&f, &machine(true, true, true)).doors, [Door::Tmux]);
    }
}
