//! Starting and stopping sessions in tmux (docs/SITZUNGEN.md B2, B6): their home when CodeDeck
//! starts them. A session runs detached in a tmux session of its own, keeps running when windows
//! close and can be reached from any terminal (`tmux attach`), with Remote Control also from the
//! desktop app, the browser and the phone. CodeDeck never types into a session: starting, stopping
//! and restarting go through tmux and the start command only.

use std::path::Path;
use std::process::Command;

use crate::harness::{Harness, Launch};

use crate::place::LAUNCHED;

/// A fresh session id: a random UUID from the kernel.
pub fn new_id() -> Result<String, String> {
    std::fs::read_to_string("/proc/sys/kernel/random/uuid").map(|s| s.trim().to_string()).map_err(|e| format!("no id: {e}"))
}

/// Starts a session of `harness` for the project in a new tmux session, detached. `resume`
/// continues that conversation; else a new one starts under a fresh id. Gives the session's id and
/// the tmux session's name.
pub fn start(root: &Path, harness: &dyn Harness, account: Option<&str>, resume: Option<&str>) -> Result<(String, String), String> {
    let project = root.file_name().map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned());
    let id = match resume {
        Some(id) => id.to_string(),
        None => new_id()?,
    };
    let launched = harness
        .launch(&Launch { id: &id, resume: resume.is_some(), name: &project, account })
        .ok_or("CodeDeck cannot start sessions of this tool")?;
    let name = free_name(&format!("codedeck-{}", safe(&project)));
    // Through the user's login shell: started from the desktop, CodeDeck's own PATH may lack the
    // folder the tool is installed in
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let line = format!("exec {}", launched.argv.iter().map(|a| crate::hook::quote(a)).collect::<Vec<_>>().join(" "));
    let mut command = Command::new("tmux");
    command.args(["new-session", "-d", "-s", &name, "-c"]).arg(root).args(["-e", &format!("{LAUNCHED}={id}")]);
    for (key, value) in &launched.env {
        command.args(["-e", &format!("{key}={value}")]);
    }
    command.args(["--", &shell, "-lc", &line]);
    run(&mut command)?;
    // Which session it is, kept with the tmux session: it outlives a restart of CodeDeck (B10)
    let _ = run(Command::new("tmux").args(["set-option", "-t", &format!("={name}"), "@codedeck", &id]));
    // And for which project, so that "does one run there?" can ask tmux itself
    let _ = run(Command::new("tmux").args(["set-option", "-t", &format!("={name}"), "@codedeck-project", &root.display().to_string()]));
    Ok((id, name))
}

/// Ends the tmux session a session runs in. The tool keeps its conversation; it can be continued.
pub fn stop(name: &str) -> Result<(), String> {
    run(Command::new("tmux").args(["kill-session", "-t", &format!("={name}")]))
}

/// The tmux sessions CodeDeck started for a project that still run, with the session id each carries. They count even before the
/// tool inside has reported: it may wait for a question (e.g. whether to trust the folder) and say
/// nothing until it is answered. Older ones without the project option are told by their name.
pub fn started_for(root: &Path) -> Vec<(String, String)> {
    let Ok(out) = Command::new("tmux").args(["list-sessions", "-F", "#{session_name}\t#{@codedeck}\t#{@codedeck-project}"]).output() else {
        return Vec::new();
    };
    let base = format!("codedeck-{}", safe(&root.file_name().map_or_else(|| "project".into(), |n| n.to_string_lossy().into_owned())));
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| {
            let mut f = line.split('\t');
            let (name, ours, project) = (f.next()?, f.next().unwrap_or(""), f.next().unwrap_or(""));
            let mine = if project.is_empty() {
                !ours.is_empty() && (name == base || name.strip_prefix(&format!("{base}-")).is_some_and(|n| n.chars().all(|c| c.is_ascii_digit())))
            } else {
                Path::new(project) == root
            };
            // The session id CodeDeck gave it: the tool reports under that id once it runs
            mine.then(|| (name.to_string(), ours.to_string()))
        })
        .collect()
}

/// Whether a tmux session of this name exists.
fn exists(name: &str) -> bool {
    Command::new("tmux").args(["has-session", "-t", &format!("={name}")]).output().is_ok_and(|o| o.status.success())
}

/// `base`, or `base-2`, `base-3` … when it is taken.
fn free_name(base: &str) -> String {
    (1..).map(|n| if n == 1 { base.to_string() } else { format!("{base}-{n}") }).find(|n| !exists(n)).unwrap_or_else(|| base.into())
}

/// A tmux session name may not hold `.` or `:`; spaces are awkward to type.
fn safe(name: &str) -> String {
    name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect()
}

fn run(command: &mut Command) -> Result<(), String> {
    let out = command.output().map_err(|e| format!("tmux: {e} (is tmux installed?)"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("tmux: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_safe_for_tmux_and_ids_are_uuids() {
        assert_eq!(safe("orbit.api v2"), "orbit-api-v2");
        let id = new_id().unwrap();
        assert_eq!(id.len(), 36);
        assert_eq!(id.matches('-').count(), 4);
    }
}
