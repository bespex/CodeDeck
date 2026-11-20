//! The ways into a session (docs/SITZUNGEN.md B4, "Türen"), as far as they need no tool: its
//! terminal. A session in tmux gets a terminal attached to its tmux session; one started by hand in
//! a terminal gets that terminal window brought to the front (X11 only). The tool's own ways in
//! (a desktop app) come from its adapter, see [`crate::harness::Harness::desktop_command`].

use std::process::Command;

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
        let mut command = Command::new("x-terminal-emulator");
        command.args(["-e", "tmux", "attach-session", "-t", &target]);
        return crate::apps::detach(command).map_err(|e| format!("no terminal could be started: {e}"));
    }
    let pid = place.pid.ok_or("CodeDeck does not know where this session runs")?;
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
    let mut command = Command::new("x-terminal-emulator");
    command.args(["-e", &shell, "-lc", &line]);
    crate::apps::detach(command).map_err(|e| format!("no terminal could be started: {e}"))
}
