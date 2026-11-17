//! Where a session runs, as `codedeck hook` sees it from inside the tool's process tree: the tool's
//! process, the tmux pane, whether CodeDeck started it, and (through the adapter) a link that
//! reaches it from elsewhere. Groundwork for starting and finding sessions (`docs/SITZUNGEN.md`):
//! nothing here starts, stops or changes anything.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::harness::{Harness, Place, Tmux};

/// What CodeDeck puts in the environment of a session it starts, with the id it gave it.
pub const LAUNCHED: &str = "CODEDECK_SESSION";

/// Shells a tool may run its hooks through: the tool is the first ancestor that is none of these.
const SHELLS: &[&str] = &["sh", "bash", "dash", "zsh", "fish", "ksh", "busybox"];

/// The place of the session whose hook this process is. `with_name` also asks tmux for the name of
/// its session: that costs a process, so only a few kinds of message do it (the pane identifies it
/// in between).
pub fn here(harness: &dyn Harness, with_name: bool) -> Place {
    let var = |key: &str| std::env::var(key).ok().filter(|v| !v.is_empty());
    let process = tool_process(Path::new("/proc"), std::process::id());
    // `TMUX_PANE` alone may be inherited from a shell that left tmux; `TMUX` says we are inside
    let tmux = var("TMUX").and(var("TMUX_PANE")).map(|pane| Tmux { session: if with_name { tmux_session(&pane) } else { None }, pane });
    Place {
        pid: process.map(|p| p.0),
        since: process.map(|p| p.1),
        tmux,
        launched: var(LAUNCHED),
        remote: harness.remote_link(&var),
    }
}

/// From `/proc/<pid>/stat`: the command name, the parent, the start time.
#[derive(Debug, PartialEq)]
struct Stat {
    comm: String,
    ppid: u32,
    start: u64,
}

fn stat(proc: &Path, pid: u32) -> Option<Stat> {
    parse_stat(&std::fs::read_to_string(proc.join(pid.to_string()).join("stat")).ok()?)
}

/// `pid (comm) state ppid … starttime …`: the name may hold spaces and parentheses, so the fields
/// are counted from its last `)`.
fn parse_stat(text: &str) -> Option<Stat> {
    let (open, close) = (text.find('(')?, text.rfind(')')?);
    let comm = text.get(open + 1..close)?.to_string();
    let rest: Vec<&str> = text.get(close + 1..)?.split_whitespace().collect();
    // Field 4 is the parent, field 22 the start time; `rest` begins with field 3
    Some(Stat { comm, ppid: rest.get(1)?.parse().ok()?, start: rest.get(19)?.parse().ok()? })
}

/// The tool's process and its start time: up from our parent, past the shells that ran us.
fn tool_process(proc: &Path, me: u32) -> Option<(u32, u64)> {
    let mut pid = stat(proc, me)?.ppid;
    for _ in 0..8 {
        let s = stat(proc, pid)?;
        if !SHELLS.contains(&s.comm.as_str()) {
            return Some((pid, s.start));
        }
        if s.ppid <= 1 {
            return None;
        }
        pid = s.ppid;
    }
    None
}

/// The name of the tmux session a pane is in. A hook must not hang: a server that does not answer
/// within a second gives no name.
fn tmux_session(pane: &str) -> Option<String> {
    let mut child = Command::new("tmux")
        .args(["display-message", "-p", "-t", pane, "#{session_name}"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let until = Instant::now() + Duration::from_secs(1);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < until => std::thread::sleep(Duration::from_millis(5)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let out = child.wait_with_output().ok().filter(|o| o.status.success())?;
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!name.is_empty()).then_some(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_stat_line_whatever_the_name() {
        let line = "4321 (my (odd) tool) S 77 4321 4321 0 -1 4194304 1 0 0 0 0 0 0 0 20 0 1 0 998877 0 0";
        assert_eq!(parse_stat(line), Some(Stat { comm: "my (odd) tool".into(), ppid: 77, start: 998877 }));
        assert_eq!(parse_stat("garbage"), None);
    }

    /// The hook runs as `tool → sh -c → codedeck`: the tool is found above the shell.
    #[test]
    fn finds_the_tool_above_the_shells() {
        let proc = std::env::temp_dir().join(format!("codedeck-proc-{}", std::process::id()));
        let put = |pid: u32, comm: &str, ppid: u32, start: u64| {
            let dir = proc.join(pid.to_string());
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("stat"), format!("{pid} ({comm}) S {ppid} 0 0 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 {start} 0 0")).unwrap();
        };
        put(30, "codedeck", 20, 3);
        put(20, "sh", 10, 2);
        put(10, "claude", 5, 1);
        put(5, "bash", 1, 0);
        assert_eq!(tool_process(&proc, 30), Some((10, 1)));
        // Only shells up to init: no tool to name
        put(40, "codedeck", 5, 4);
        assert_eq!(tool_process(&proc, 40), None);
        std::fs::remove_dir_all(&proc).unwrap();
    }
}
