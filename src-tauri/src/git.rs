//! Git, always through the `git` command line: the user's configuration, hooks and credentials
//! apply, and every command that runs is reported to the frontend, so it can be shown.
//!
//! A project may hold any number of repositories: the one it lies in (if any) and those found
//! in folders below it. Paths that cross the IPC boundary are project-relative, as everywhere.

use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::project::Project;

/// Called after every git command, from whichever thread ran it.
pub type Report<'a> = &'a (dyn Fn(&GitRun) + Sync);

/// How deep below the project root repositories are searched for.
const SEARCH_DEPTH: usize = 3;

/// Folders never searched for repositories: build output and dependencies, large and never repos
/// of their own. Hidden folders are skipped as well.
const SKIP: &[&str] = &["node_modules", "target", "dist", "build", "vendor", "venv", "__pycache__"];

/// Git subcommands the frontend may run as actions. Everything else is refused, and the ones
/// that remove something are held to their narrow use, see [`allowed`].
const ACTIONS: &[&str] = &["add", "commit", "pull", "push", "fetch", "restore", "rm", "clean", "rebase", "remote"];

/// How many commands the log keeps.
const LOG_LIMIT: usize = 300;
/// Output kept per command in the log; longer output is cut.
const OUTPUT_KEPT: usize = 16 * 1024;

/// One repository of the project.
#[derive(Clone)]
pub(crate) struct Repo {
    /// Its top-level directory
    pub top: PathBuf,
    /// Project-relative path of `top`; `""` when the project root is the repo or lies inside it
    pub path: String,
    /// When the project root lies inside the repo: the root's path within it, else `""`
    pub prefix: String,
    /// A linked worktree: the folder name of the repository it belongs to
    worktree_of: Option<String>,
}

impl Repo {
    fn new(top: PathBuf, path: String, prefix: String) -> Self {
        let worktree_of = worktree_of(&top);
        Self { top, path, prefix, worktree_of }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRun {
    /// Counts up from 1 in this process
    id: u64,
    /// Name of the repository the command ran in
    repo: String,
    /// As one would type it in that directory
    command: String,
    ok: bool,
    /// Exit code; `None` when git could not be started or was killed
    code: Option<i32>,
    ms: u64,
    /// Unix milliseconds
    at: u64,
    /// It changed something (an action: add, commit, push…), not only read
    changes: bool,
    /// What it printed, stdout then stderr, cut at [`OUTPUT_KEPT`]
    output: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    /// Project-relative; `""` for the repo the whole project belongs to
    path: String,
    name: String,
    /// The project root lies inside this repo, below its top level
    outer: bool,
    /// Then: the root's path within the repo, else `""`
    prefix: String,
    /// A linked worktree: the folder name of the repository it belongs to
    worktree_of: Option<String>,
    branch: Option<String>,
    /// The commit checked out; `None` before the first commit
    head: Option<String>,
    upstream: Option<String>,
    /// Names of the remotes; empty when there is nowhere to push or fetch from
    remotes: Vec<String>,
    ahead: u32,
    pub(crate) behind: u32,
    pub(crate) files: Vec<FileStatus>,
    /// The status command failed; the rest is empty then
    error: Option<String>,
}

/// Outcome of an action: what git printed, both streams.
#[derive(Serialize)]
pub struct ActionResult {
    pub(crate) ok: bool,
    pub(crate) output: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    /// Project-relative; `""` when the whole opened folder is untracked
    pub(crate) path: String,
    /// `M` modified, `A` added, `D` deleted, `R` renamed, `U` conflict, `?` untracked
    pub(crate) state: &'static str,
    /// Part of the change is in the index
    pub(crate) staged: bool,
    /// An untracked folder: everything below it is untracked too
    dir: bool,
}

pub struct Git {
    /// Repositories found for the root they were searched from
    repos: Mutex<Option<(PathBuf, Vec<Repo>)>>,
    /// Commands that changed something, and the many that only read, kept apart: the status
    /// rounds every few seconds must not push the actions out of the log
    changes: Mutex<VecDeque<GitRun>>,
    reads: Mutex<VecDeque<GitRun>>,
    count: std::sync::atomic::AtomicU64,
}

impl Git {
    pub fn new() -> Self {
        Self {
            repos: Mutex::new(None),
            changes: Mutex::new(VecDeque::new()),
            reads: Mutex::new(VecDeque::new()),
            count: std::sync::atomic::AtomicU64::new(0),
        }
    }

    /// The commands run so far, oldest first.
    pub fn log(&self) -> Vec<GitRun> {
        let mut all: Vec<GitRun> = self.changes.lock().unwrap().iter().cloned().collect();
        all.extend(self.reads.lock().unwrap().iter().cloned());
        all.sort_by_key(|r| r.id);
        all
    }

    /// Status of every repository in the project. `rescan` searches the folders again.
    /// Also returns the `.git` directories, which are worth watching.
    pub fn status(&self, report: Report, project: &Project, rescan: bool) -> (Vec<RepoStatus>, Vec<PathBuf>) {
        let repos = {
            let mut cache = self.repos.lock().unwrap();
            match cache.as_ref() {
                Some((root, repos)) if !rescan && *root == project.root => repos.clone(),
                _ => {
                    let repos = discover(&project.root);
                    *cache = Some((project.root.clone(), repos.clone()));
                    repos
                }
            }
        };
        let git_dirs = repos.iter().map(|r| r.top.join(".git")).filter(|d| d.is_dir()).collect();
        // In parallel: with many repos the slowest one decides, not their sum
        let statuses = std::thread::scope(|scope| {
            let handles: Vec<_> =
                repos.iter().map(|repo| scope.spawn(|| self.repo_status(report, repo))).collect();
            handles.into_iter().filter_map(|h| h.join().ok()).collect()
        });
        (statuses, git_dirs)
    }

    /// Runs exactly the given git arguments in a repository of the project (by its
    /// project-relative path), as long as the subcommand is one of the [`ACTIONS`].
    pub fn action(&self, report: Report, project: &Project, repo: &str, args: &[String]) -> ActionResult {
        let refuse = |output: String| ActionResult { ok: false, output };
        if !allowed(args) {
            return refuse(format!("{}: not available as an action", args.join(" ")));
        }
        let Some(found) = self.find(project, repo) else { return refuse(format!("{repo}: no repository here")) };
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let (ok, stdout, stderr) = self.execute(report, &found, &args);
        let output = [stdout, stderr].map(|b| String::from_utf8_lossy(&b).trim_end().to_string());
        ActionResult { ok, output: output.into_iter().filter(|o| !o.is_empty()).collect::<Vec<_>>().join("\n") }
    }

    /// A repository of the project by its project-relative path, as found by the last search.
    pub(crate) fn find(&self, project: &Project, repo: &str) -> Option<Repo> {
        let cache = self.repos.lock().unwrap();
        let (root, repos) = cache.as_ref()?;
        (*root == project.root).then(|| repos.iter().find(|r| r.path == repo).cloned()).flatten()
    }

    fn repo_status(&self, report: Report, repo: &Repo) -> RepoStatus {
        let mut status = RepoStatus {
            path: repo.path.clone(),
            name: name_of(&repo.top),
            outer: !repo.prefix.is_empty(),
            prefix: repo.prefix.clone(),
            worktree_of: repo.worktree_of.clone(),
            branch: None,
            head: None,
            upstream: None,
            remotes: Vec::new(),
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            error: None,
        };
        if let (true, out, _) = self.execute_logged(report, repo, &["remote"], &[], Logged::OnFailure) {
            status.remotes = String::from_utf8_lossy(&out).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect();
        }
        // The status is read every few seconds: only a failure is worth a line in the log
        match self.execute_logged(report, repo, &["status", "--porcelain=v2", "--branch", "-z"], &[], Logged::OnFailure) {
            (true, out, _) => parse_status(&out, repo, &mut status),
            (false, _, err) => status.error = Some(String::from_utf8_lossy(&err).trim().to_string()),
        }
        status
    }

    /// Runs one git command for reading; its output, or git's error message.
    pub(crate) fn run(&self, report: Report, repo: &Repo, args: &[&str]) -> Result<Vec<u8>, String> {
        match self.execute(report, repo, args) {
            (true, stdout, _) => Ok(stdout),
            (false, _, stderr) => Err(String::from_utf8_lossy(&stderr).trim().to_string()),
        }
    }

    /// Runs one git command in a repository and reports it: success, stdout, stderr.
    pub(crate) fn execute(&self, report: Report, repo: &Repo, args: &[&str]) -> (bool, Vec<u8>, Vec<u8>) {
        self.execute_with(report, repo, args, &[])
    }

    /// Like `run`, with extra environment variables; they are shown in front of the command.
    pub(crate) fn run_with(&self, report: Report, repo: &Repo, args: &[&str], env: &[(&str, &str)]) -> Result<Vec<u8>, String> {
        match self.execute_with(report, repo, args, env) {
            (true, stdout, _) => Ok(stdout),
            (false, _, stderr) => Err(String::from_utf8_lossy(&stderr).trim().to_string()),
        }
    }

    fn execute_with(&self, report: Report, repo: &Repo, args: &[&str], env: &[(&str, &str)]) -> (bool, Vec<u8>, Vec<u8>) {
        self.execute_logged(report, repo, args, env, Logged::Always)
    }

    fn execute_logged(
        &self,
        report: Report,
        repo: &Repo,
        args: &[&str],
        env: &[(&str, &str)],
        logged: Logged,
    ) -> (bool, Vec<u8>, Vec<u8>) {
        let started = Instant::now();
        let output = Command::new("git")
            .args(args)
            .envs(env.iter().copied())
            .current_dir(&repo.top)
            // Reading must not take the index lock: an assistant may be committing right now
            .env("GIT_OPTIONAL_LOCKS", "0")
            // Nobody can answer a prompt or edit a message here: never wait for one
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", "true")
            // Messages in English like the rest of the interface, and the same for everyone
            .env("LC_ALL", "C.UTF-8")
            .stdin(std::process::Stdio::null())
            .output();
        let ok = output.as_ref().is_ok_and(|o| o.status.success());
        if ok && logged == Logged::OnFailure {
            return match output {
                Ok(o) => (true, o.stdout, o.stderr),
                Err(_) => unreachable!("ok implies output"),
            };
        }
        let sub = args.iter().find(|a| !a.starts_with('-') && !a.contains('=')).copied().unwrap_or_default();
        let run = GitRun {
            id: self.count.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1,
            repo: name_of(&repo.top),
            command: env
                .iter()
                .map(|(k, v)| format!("{k}={} ", quote(v)))
                .chain(std::iter::once(format!("git {}", args.iter().map(|a| quote(a)).collect::<Vec<_>>().join(" "))))
                .collect(),
            ok,
            code: output.as_ref().ok().and_then(|o| o.status.code()),
            ms: started.elapsed().as_millis() as u64,
            at: SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64),
            // A scratch index (own environment) changes nothing real
            changes: env.is_empty() && ACTIONS.contains(&sub),
            output: match &output {
                Ok(o) => log_output(env.is_empty() && ACTIONS.contains(&sub), &o.stdout, &o.stderr),
                Err(e) => format!("git: {e}"),
            },
        };
        {
            let mut log = if run.changes { self.changes.lock() } else { self.reads.lock() }.unwrap();
            if log.len() == LOG_LIMIT {
                log.pop_front();
            }
            log.push_back(run.clone());
        }
        report(&run);
        match output {
            Ok(o) => (ok, o.stdout, o.stderr),
            Err(e) => (false, Vec::new(), format!("git: {e}").into_bytes()),
        }
    }
}

/// Whether a command goes into the log (and to the status bar).
#[derive(PartialEq, Clone, Copy)]
enum Logged {
    Always,
    /// Routine reads that run all the time, like the status round: only when they fail
    OnFailure,
}

/// Lines of an action's output kept in the log; the rest is counted.
const LINES_KEPT: usize = 12;

/// What goes into the log of a command's output: the essentials, not the data.
///
/// A reading command prints data for CodeDeck (a log, a diff, a file list); the log says how
/// much, and keeps git's messages. An action keeps what it said, with the long lists of
/// branches and tags a fetch, pull or push prints counted instead of listed.
fn log_output(changes: bool, stdout: &[u8], stderr: &[u8]) -> String {
    let out = String::from_utf8_lossy(stdout);
    let err = String::from_utf8_lossy(stderr);
    let mut lines: Vec<String> = Vec::new();
    if changes {
        lines.extend(condense(&format!("{out}{err}")));
    } else {
        let data: Vec<&str> = out.lines().collect();
        if data.len() <= 3 && out.len() <= 300 {
            lines.extend(data.iter().filter(|l| !l.trim().is_empty()).map(|l| l.to_string()));
        } else {
            lines.push(format!("({} lines, {} of data for CodeDeck, not shown)", data.len(), size(stdout.len())));
        }
        lines.extend(condense(&err));
    }
    let text = lines.join("\n");
    if text.len() <= OUTPUT_KEPT {
        return text;
    }
    let mut end = OUTPUT_KEPT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n… {} more not kept", &text[..end], size(text.len() - end))
}

/// Ref lines (`* [new branch]  x -> origin/x`) counted by kind; rejected ones kept as they are.
/// Other lines up to [`LINES_KEPT`].
fn condense(text: &str) -> Vec<String> {
    let mut kept = Vec::new();
    let mut more = 0;
    let mut counts: Vec<(&str, usize)> = Vec::new();
    for line in text.lines().filter(|l| !l.trim().is_empty()) {
        match ref_kind(line) {
            Some(kind) if kind != "rejected" => match counts.iter_mut().find(|(k, _)| *k == kind) {
                Some((_, n)) => *n += 1,
                None => counts.push((kind, 1)),
            },
            _ if kept.len() < LINES_KEPT || ref_kind(line).is_some() => kept.push(line.to_string()),
            _ => more += 1,
        }
    }
    if more > 0 {
        kept.push(format!("… {more} more line{}", if more == 1 { "" } else { "s" }));
    }
    if !counts.is_empty() {
        let refs: Vec<String> = counts.iter().map(|(k, n)| format!("{n} {}", plural(k, *n))).collect();
        kept.push(refs.join(", "));
    }
    kept
}

/// The kind of a ref line of fetch, pull or push, `None` for other lines.
fn ref_kind(line: &str) -> Option<&'static str> {
    let t = line.trim_start();
    let (flag, rest) = (t.chars().next()?, t.get(1..)?.trim_start());
    let bracket = |s: &str| rest.starts_with(s);
    Some(match flag {
        '*' if bracket("[new branch]") => "new branch",
        '*' if bracket("[new tag]") => "new tag",
        '*' if bracket("[new ref]") => "new ref",
        '-' if bracket("[deleted]") => "deleted ref",
        '=' if bracket("[up to date]") => "unchanged ref",
        '!' => "rejected",
        '+' if rest.contains("...") => "forced update",
        't' if t.starts_with("t [tag update]") => "updated tag",
        _ if t.split_whitespace().next().is_some_and(|w| {
            w.split_once("..").is_some_and(|(a, b)| is_hex(a) && is_hex(b))
        }) => "updated branch",
        _ => return None,
    })
}

fn is_hex(s: &str) -> bool {
    s.len() >= 4 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn plural(kind: &str, n: usize) -> String {
    if n == 1 {
        return kind.to_string();
    }
    match kind.strip_suffix("branch") {
        Some(stem) => format!("{stem}branches"),
        None => format!("{kind}s"),
    }
}

fn size(bytes: usize) -> String {
    if bytes < 1024 { format!("{bytes} bytes") } else { format!("{} KB", bytes.div_ceil(1024)) }
}

/// Whether an action may run. Removing commands only in their narrow, path-bound form:
/// `rm` only from the index (`--cached`), `clean` only for named paths, never a whole tree.
pub(crate) fn allowed(args: &[String]) -> bool {
    let Some(sub) = args.first() else { return false };
    if !ACTIONS.contains(&sub.as_str()) {
        return false;
    }
    let paths = args.iter().position(|a| a == "--").map_or(0, |i| args.len() - i - 1);
    match sub.as_str() {
        "rm" => args.iter().any(|a| a == "--cached") && paths > 0,
        "clean" => paths > 0,
        "restore" => paths > 0,
        // Only adding one: `remote add <name> <url>`
        "remote" => {
            let name_ok = |n: &str| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c));
            args.len() == 4 && args[1] == "add" && name_ok(&args[2]) && !args[3].starts_with('-') && !args[3].is_empty()
        }
        // Only the one form that rewords commits: replays them up to a base, folding in the
        // `amend!` commits made just before; local changes are stashed and put back
        "rebase" => {
            let base = args.get(4).map(String::as_str).unwrap_or_default();
            args.len() == 5
                && args[1..4] == ["-i", "--autosquash", "--autostash"]
                && (base == "--root" || base.strip_suffix('^').is_some_and(|h| h.len() >= 7 && h.chars().all(|c| c.is_ascii_hexdigit())))
        }
        _ => true,
    }
}

/// An argument as one would type it in a shell; must match `quote` in the frontend's git.ts.
fn quote(arg: &str) -> String {
    if !arg.is_empty() && arg.chars().all(|c| c.is_ascii_alphanumeric() || "-_./=:@+,".contains(c)) {
        arg.to_string()
    } else {
        format!("'{}'", arg.replace('\'', "'\\''"))
    }
}

/// In a linked worktree `.git` is a file: `gitdir: <main repo>/.git/worktrees/<name>`.
/// Submodules have such a file too, pointing into `.git/modules`; they are no worktrees.
fn worktree_of(top: &Path) -> Option<String> {
    let link = fs::read_to_string(top.join(".git")).ok()?;
    let gitdir = PathBuf::from(link.trim().strip_prefix("gitdir:")?.trim());
    let gitdir = if gitdir.is_absolute() { gitdir } else { top.join(gitdir) };
    // <main>/.git/worktrees/<name>
    let worktrees = gitdir.parent()?;
    if worktrees.file_name()? != "worktrees" {
        return None;
    }
    Some(name_of(worktrees.parent()?.parent()?))
}

fn name_of(dir: &Path) -> String {
    dir.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy().into_owned())
}

/// The repo the root lies in, then the repos in folders below it, nearest first.
fn discover(root: &Path) -> Vec<Repo> {
    let mut repos = Vec::new();

    if let Some(top) = root.ancestors().find(|dir| dir.join(".git").exists()) {
        let prefix = root.strip_prefix(top).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        repos.push(Repo::new(top.to_path_buf(), String::new(), prefix));
    }

    let mut level = vec![(root.to_path_buf(), String::new())];
    for _ in 0..SEARCH_DEPTH {
        let mut next = Vec::new();
        for (dir, rel) in level {
            let Ok(children) = fs::read_dir(&dir) else { continue };
            for child in children.flatten() {
                let name = child.file_name().to_string_lossy().into_owned();
                // file_type does not follow symlinks: no loops, nothing outside the project
                if name.starts_with('.') || SKIP.contains(&name.as_str())
                    || !child.file_type().is_ok_and(|t| t.is_dir())
                {
                    continue;
                }
                let path = child.path();
                let rel = if rel.is_empty() { name } else { format!("{rel}/{name}") };
                if path.join(".git").exists() {
                    repos.push(Repo::new(path.clone(), rel.clone(), String::new()));
                }
                next.push((path, rel));
            }
        }
        level = next;
    }
    repos
}

/// Reads `git status --porcelain=v2 --branch -z`.
fn parse_status(out: &[u8], repo: &Repo, status: &mut RepoStatus) {
    let text = String::from_utf8_lossy(out);
    let mut fields = text.split('\0').filter(|f| !f.is_empty());
    while let Some(field) = fields.next() {
        if let Some(header) = field.strip_prefix("# ") {
            let (key, value) = header.split_once(' ').unwrap_or((header, ""));
            match key {
                "branch.head" if value != "(detached)" => status.branch = Some(value.into()),
                "branch.oid" if value != "(initial)" => status.head = Some(value.into()),
                "branch.upstream" => status.upstream = Some(value.into()),
                "branch.ab" => {
                    for part in value.split(' ') {
                        if let Some(n) = part.strip_prefix('+') {
                            status.ahead = n.parse().unwrap_or(0);
                        } else if let Some(n) = part.strip_prefix('-') {
                            status.behind = n.parse().unwrap_or(0);
                        }
                    }
                }
                _ => {}
            }
            continue;
        }
        // Ordinary `1`, renamed `2` (followed by its original path), conflict `u`, untracked `?`
        let (kind, rest) = field.split_at(1);
        let (xy, path) = match kind {
            "1" => (rest.get(1..3), rest.splitn(9, ' ').nth(8)),
            "2" => {
                fields.next();
                (rest.get(1..3), rest.splitn(10, ' ').nth(9))
            }
            "u" => (Some("UU"), rest.splitn(11, ' ').nth(10)),
            "?" => (Some("??"), rest.get(1..)),
            _ => continue,
        };
        let (Some(xy), Some(path)) = (xy, path) else { continue };
        let (x, y) = (xy.as_bytes()[0], xy.as_bytes()[1]);
        let state = match (x, y) {
            (b'?', _) => "?",
            (b'U', _) | (_, b'U') => "U",
            _ => match if y != b'.' { y } else { x } {
                b'A' | b'C' => "A",
                b'D' => "D",
                b'R' => "R",
                _ => "M",
            },
        };

        let dir = path.ends_with('/');
        let path = path.trim_end_matches('/');
        // Repo-relative to project-relative
        let path = if !repo.prefix.is_empty() {
            match path.strip_prefix(&repo.prefix).and_then(|p| p.strip_prefix('/')) {
                Some(inside) => inside.to_string(),
                // An untracked folder around the opened one: all of it is untracked, said by `""`
                None if dir && format!("{}/", repo.prefix).starts_with(&format!("{path}/")) => String::new(),
                None => continue, // outside the opened folder
            }
        } else if repo.path.is_empty() {
            path.to_string()
        } else {
            format!("{}/{path}", repo.path)
        };
        status.files.push(FileStatus { path, state, staged: x != b'.' && x != b'?', dir });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status_of(out: &str, repo: &Repo) -> RepoStatus {
        let mut status = RepoStatus {
            path: repo.path.clone(),
            name: String::new(),
            outer: false,
            prefix: String::new(),
            worktree_of: None,
            branch: None,
            head: None,
            upstream: None,
            remotes: Vec::new(),
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            error: None,
        };
        parse_status(out.as_bytes(), repo, &mut status);
        status
    }

    const OUT: &str = "# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0\
        # branch.ab +2 -1\0\
        1 .M N... 100644 100644 100644 aaa bbb src/a file.rs\0\
        1 A. N... 000000 100644 100644 000 ccc src/new.rs\0\
        2 R. N... 100644 100644 100644 ddd ddd R100 src/moved.rs\0src/old.rs\0\
        u UU N... 100644 100644 100644 100644 e f g src/clash.rs\0\
        ? notes/\0? src/tmp.txt\0";

    #[test]
    fn reads_branch_and_files() {
        let repo = Repo { top: PathBuf::from("/r"), path: "app".into(), prefix: String::new(), worktree_of: None };
        let s = status_of(OUT, &repo);
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(s.upstream.as_deref(), Some("origin/main"));
        assert_eq!((s.ahead, s.behind), (2, 1));
        let files: Vec<_> = s.files.iter().map(|f| (f.path.as_str(), f.state, f.staged, f.dir)).collect();
        assert_eq!(
            files,
            [
                ("app/src/a file.rs", "M", false, false),
                ("app/src/new.rs", "A", true, false),
                ("app/src/moved.rs", "R", true, false),
                ("app/src/clash.rs", "U", true, false),
                ("app/notes", "?", false, true),
                ("app/src/tmp.txt", "?", false, false),
            ]
        );
    }

    #[test]
    fn keeps_only_what_lies_in_the_opened_folder() {
        let repo = Repo { top: PathBuf::from("/r"), path: String::new(), prefix: "src".into(), worktree_of: None };
        let s = status_of(OUT, &repo);
        let paths: Vec<_> = s.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["a file.rs", "new.rs", "moved.rs", "clash.rs", "tmp.txt"]);
    }

    #[test]
    fn untracked_folder_around_the_opened_one_covers_everything() {
        let repo = Repo { top: PathBuf::from("/r"), path: String::new(), prefix: "src/ui".into(), worktree_of: None };
        let s = status_of("? src/\0? other/\0", &repo);
        let files: Vec<_> = s.files.iter().map(|f| (f.path.as_str(), f.dir)).collect();
        assert_eq!(files, [("", true)]);
    }

    #[test]
    fn commits_in_a_repo_below_the_project() {
        let base = std::env::temp_dir().join(format!("codedeck-act-{}", std::process::id()));
        let repo_dir = base.join("group/app");
        fs::create_dir_all(&repo_dir).unwrap();
        let git = |args: &[&str]| Command::new("git").args(args).current_dir(&repo_dir).output().unwrap();
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.name", "Test"]);
        git(&["config", "user.email", "test@example.invalid"]);
        fs::write(repo_dir.join("a.txt"), "a").unwrap();

        let project = Project::open(&base).unwrap();
        let runs = Mutex::new(Vec::new());
        let report = |run: &GitRun| runs.lock().unwrap().push(run.command.clone());
        let g = Git::new();
        let (repos, _) = g.status(&report, &project, true);
        assert_eq!(repos[0].path, "group/app");
        assert_eq!(repos[0].files.len(), 1);

        let refused = g.action(&report, &project, "group/app", &["reset".into(), "--hard".into()]);
        assert!(!refused.ok);
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(g.action(&report, &project, "group/app", &args(&["add", "-A"])).ok);
        let commit = g.action(&report, &project, "group/app", &args(&["commit", "-m", "first: it's here"]));
        assert!(commit.ok, "{}", commit.output);
        let (repos, _) = g.status(&report, &project, false);
        let _ = fs::remove_dir_all(&base);
        assert_eq!(repos[0].files.len(), 0);
        assert!(runs.lock().unwrap().contains(&"git commit -m 'first: it'\\''s here'".to_string()));
    }

    #[test]
    fn removing_actions_stay_narrow() {
        let a = |s: &str| s.split(' ').map(String::from).collect::<Vec<_>>();
        assert!(allowed(&a("clean -f -- notes.txt")));
        assert!(!allowed(&a("clean -fdx")));
        assert!(allowed(&a("rm --cached -- a.rs")));
        assert!(!allowed(&a("rm -- a.rs")));
        assert!(!allowed(&a("restore .")));
        assert!(!allowed(&a("reset --hard")));
    }

    #[test]
    fn the_log_keeps_the_essentials() {
        let fetch = b"From github.com:you/repo\n * [new branch]      a -> origin/a\n * [new branch]      b -> origin/b\n   1a2b3c4..5d6e7f8  main -> origin/main\n * [new tag]         v1 -> v1\n ! [rejected]        x -> x  (non-fast-forward)\n";
        assert_eq!(
            log_output(true, b"", fetch),
            "From github.com:you/repo\n ! [rejected]        x -> x  (non-fast-forward)\n2 new branches, 1 updated branch, 1 new tag"
        );
        let diff = "diff --git a/x b/x\n".repeat(50);
        assert_eq!(log_output(false, diff.as_bytes(), b""), "(50 lines, 950 bytes of data for CodeDeck, not shown)");
        assert_eq!(log_output(false, b"ada@x.org\n", b""), "ada@x.org");
        let many: String = (0..20).map(|i| format!("line {i}\n")).collect();
        assert!(log_output(true, many.as_bytes(), b"").ends_with("line 11\n… 8 more lines"));
    }

    #[test]
    fn quotes_like_a_shell() {
        assert_eq!(quote("--ff-only"), "--ff-only");
        assert_eq!(quote("fix: it's done"), "'fix: it'\\''s done'");
        assert_eq!(quote(""), "''");
    }

    #[test]
    fn recognises_a_worktree() {
        let base = std::env::temp_dir().join(format!("codedeck-wt-{}", std::process::id()));
        fs::create_dir_all(base.join("main/.git/worktrees/feature")).unwrap();
        fs::create_dir_all(base.join("feature")).unwrap();
        fs::write(base.join("feature/.git"), format!("gitdir: {}\n", base.join("main/.git/worktrees/feature").display())).unwrap();
        fs::create_dir_all(base.join("sub")).unwrap();
        fs::write(base.join("sub/.git"), "gitdir: ../main/.git/modules/sub\n").unwrap();
        let (wt, sub, main) = (worktree_of(&base.join("feature")), worktree_of(&base.join("sub")), worktree_of(&base.join("main")));
        let _ = fs::remove_dir_all(&base);
        assert_eq!(wt.as_deref(), Some("main"));
        assert_eq!(sub, None);
        assert_eq!(main, None);
    }

    #[test]
    fn detached_head_has_no_branch() {
        let repo = Repo { top: PathBuf::from("/r"), path: String::new(), prefix: String::new(), worktree_of: None };
        assert_eq!(status_of("# branch.head (detached)\0", &repo).branch, None);
    }

    /// Against a real folder: `CODEDECK_GIT_DIR=~/projects/x cargo test real_folder -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_folder() {
        let dir = std::env::var("CODEDECK_GIT_DIR").expect("CODEDECK_GIT_DIR");
        let project = Project::open(Path::new(&dir)).unwrap();
        let report = |run: &GitRun| println!("$ {}  [{}] {} ms ok={}", run.command, run.repo, run.ms, run.ok);
        let (repos, dirs) = Git::new().status(&report, &project, true);
        for r in &repos {
            println!(
                "{:<24} {:<20} ↑{} ↓{} {} changed {:?}",
                if r.path.is_empty() { "(root)" } else { &r.path },
                r.branch.as_deref().unwrap_or("-"),
                r.ahead,
                r.behind,
                r.files.len(),
                r.error
            );
        }
        println!("watching {} .git dirs", dirs.len());
        let paths: Vec<String> = repos.iter().map(|r| r.path.clone()).collect();
        let g = Git::new();
        g.status(&|_| {}, &project, true);
        for log in g.history(&|_| {}, &project, &paths) {
            let ai = log.commits.iter().filter(|c| c.assistant.is_some()).count();
            let unpushed = log.commits.iter().filter(|c| c.unpushed).count();
            let newest = log.commits.first().map(|c| c.subject.as_str()).unwrap_or("-");
            println!("{:<20} {:>3} commits, {:>3} with assistant, {:>2} unpushed, newest: {}", log.path, log.commits.len(), ai, unpushed, newest);
            let shape = |p: &crate::history::Patch| {
                let mut kinds = std::collections::BTreeMap::new();
                for c in &p.changes {
                    *kinds.entry(c.status.clone()).or_insert(0) += 1;
                }
                format!("{kinds:?} new dirs {:?} gone dirs {:?}", p.new_dirs, p.gone_dirs)
            };
            match g.working_diff(&|_| {}, &project, &log.path) {
                Ok(p) => println!("    working: {}", shape(&p)),
                Err(e) => println!("    working: error {e}"),
            }
            if let Some(c) = log.commits.first() {
                match g.commit_diff(&|_| {}, &project, &log.path, &c.hash) {
                    Ok(p) => println!("    newest:  {}", shape(&p)),
                    Err(e) => println!("    newest:  error {e}"),
                }
            }
        }
    }

    #[test]
    fn finds_repos_below_and_skips_dependencies() {
        let base = std::env::temp_dir().join(format!("codedeck-discover-{}", std::process::id()));
        for dir in ["one/.git", "group/two/.git", "a/b/c/.git", "a/b/c/d/.git", "node_modules/x/.git"] {
            fs::create_dir_all(base.join(dir)).unwrap();
        }
        let mut found: Vec<_> = discover(&base).into_iter().map(|r| r.path).collect();
        found.sort();
        let _ = fs::remove_dir_all(&base);
        assert_eq!(found, ["a/b/c", "group/two", "one"]);
    }
}
