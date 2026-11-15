//! Snapshots: the whole working tree of a repository, untracked files included, kept as a commit
//! under `refs/codedeck/snapshots/`. Taken before an assistant writes for the first time in a
//! turn, so one can go back to that point without typing Git commands, and again when the turn
//! is over: the two are the turn, and what lies between them is what it changed.
//!
//! Taking one changes nothing the user works with: the files go through a copy of the index,
//! the commit is on no branch and is never pushed (only branches and tags are). Going back
//! takes a snapshot of the present first, so it can be undone the same way.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::git::{Git, Report, Repo};
use crate::history::{Patch, ScratchIndex};
use crate::project::Project;

const REFS: &str = "refs/codedeck/snapshots";
/// Snapshots kept per repository; older ones are let go.
const KEEP: usize = 50;
/// Nor older than this, in seconds.
const MAX_AGE: i64 = 14 * 86_400;

/// Who the snapshot commits are by, so they need no Git identity configured.
const IDENTITY: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "CodeDeck"),
    ("GIT_AUTHOR_EMAIL", "codedeck@localhost"),
    ("GIT_COMMITTER_NAME", "CodeDeck"),
    ("GIT_COMMITTER_EMAIL", "codedeck@localhost"),
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Project-relative path of the repository
    repo: String,
    hash: String,
    short: String,
    /// Unix seconds
    at: i64,
    /// What it was taken before, e.g. the prompt of the turn
    label: String,
    /// The assistant session that was about to write
    session: Option<String>,
    /// The first thing it was about to do, e.g. `Edit src/main.rs`
    tool: Option<String>,
    /// Taken before going back to another snapshot
    back: bool,
    /// The commit that was checked out when it was taken
    parent: Option<String>,
    /// For the end of a turn: the snapshot the turn began at
    turn_from: Option<String>,
    /// For the end of a turn: what the assistant said last, as it said it
    report: Option<String>,
}

/// What [`Git::take_snapshot`] gives back: the snapshot of the present, taken now or there already.
pub struct Taken {
    pub hash: String,
    pub new: bool,
}

/// Where a snapshot comes from, written into its message as trailers.
pub struct Origin<'a> {
    pub label: &'a str,
    pub session: Option<&'a str>,
    pub tool: Option<&'a str>,
    pub back: bool,
    /// Ends a turn that began at this snapshot
    pub from: Option<&'a str>,
    /// The assistant's last words of that turn
    pub report: Option<&'a str>,
}

impl<'a> Origin<'a> {
    pub fn before(label: &'a str, session: Option<&'a str>, tool: Option<&'a str>) -> Self {
        Self { label, session, tool, back: false, from: None, report: None }
    }
}

impl Git {
    /// Takes a snapshot of the repository. When nothing changed since the last one, that one
    /// stands for the present and no new one is taken.
    pub(crate) fn take_snapshot(&self, report: Report, repo: &Repo, origin: &Origin) -> Result<Taken, String> {
        let tree = self.tree_now(report, repo)?;
        let head = self.head(report, repo);
        if let Some(last) = self.list_snapshots(report, repo).into_iter().next() {
            if self.tree_of(report, repo, &last.hash).as_deref() == Some(tree.as_str()) && last.parent == head {
                return Ok(Taken { hash: last.hash, new: false });
            }
        }
        Ok(Taken { hash: self.keep(report, repo, &tree, head.as_deref(), origin)?, new: true })
    }

    /// Takes the snapshot that ends a turn begun at `origin.from`; `None` when the files are as
    /// they were then: such a turn changed nothing and is not kept. Unlike the start of a turn
    /// it is taken even if another snapshot has the same files: it is what says where the turn
    /// began, who it was and how it ended.
    pub(crate) fn end_turn(&self, report: Report, repo: &Repo, origin: &Origin) -> Result<Option<String>, String> {
        let tree = self.tree_now(report, repo)?;
        if origin.from.and_then(|from| self.tree_of(report, repo, from)).as_deref() == Some(tree.as_str()) {
            return Ok(None);
        }
        let head = self.head(report, repo);
        self.keep(report, repo, &tree, head.as_deref(), origin).map(Some)
    }

    fn head(&self, report: Report, repo: &Repo) -> Option<String> {
        self.run(report, repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).ok().map(text)
    }

    fn tree_of(&self, report: Report, repo: &Repo, commit: &str) -> Option<String> {
        self.run(report, repo, &["rev-parse", "--verify", "--quiet", &format!("{commit}^{{tree}}")]).ok().map(text)
    }

    /// Writes the commit and its ref. The message: the label, then the report if there is one,
    /// then the trailers, each a paragraph of its own.
    fn keep(&self, report: Report, repo: &Repo, tree: &str, head: Option<&str>, origin: &Origin) -> Result<String, String> {
        let trailers: Vec<String> = [
            origin.session.map(|s| format!("CodeDeck-Session: {s}")),
            origin.tool.map(|t| format!("CodeDeck-Tool: {}", t.replace('\n', " "))),
            origin.back.then(|| "CodeDeck-Back: yes".to_string()),
            origin.from.map(|f| format!("CodeDeck-From: {f}")),
        ]
        .into_iter()
        .flatten()
        .collect();
        let said = origin.report.map(str::trim).filter(|r| !r.is_empty()).map(String::from);
        let message = [Some(origin.label.trim().to_string()), said, (!trailers.is_empty()).then(|| trailers.join("\n"))]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join("\n\n");
        let mut args = vec!["commit-tree", tree];
        if let Some(head) = head {
            args.extend(["-p", head]);
        }
        args.extend(["-m", message.as_str()]);
        let commit = text(self.run_with(report, repo, &args, &IDENTITY)?);

        let name = format!("{REFS}/{}", SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis()));
        self.run(report, repo, &["update-ref", &name, &commit])?;
        self.prune_snapshots(report, repo);
        Ok(commit)
    }

    /// The tree the working tree would be if everything were committed now; ignored files aside.
    fn tree_now(&self, report: Report, repo: &Repo) -> Result<String, String> {
        let index = ScratchIndex::new(self, report, repo)?;
        let path = index.path();
        let env = [("GIT_INDEX_FILE", path.as_str())];
        let scope = if repo.prefix.is_empty() { "." } else { repo.prefix.as_str() };
        self.run_with(report, repo, &["-c", "advice.addEmbeddedRepo=false", "add", "-A", "--", scope], &env)?;
        Ok(text(self.run_with(report, repo, &["write-tree"], &env)?))
    }

    /// The snapshots of the given repositories (project-relative paths), newest first.
    pub fn snapshots(&self, report: Report, project: &Project, repos: &[String]) -> Vec<Snapshot> {
        let mut all: Vec<Snapshot> =
            repos.iter().filter_map(|path| self.find(project, path)).flat_map(|r| self.list_snapshots(report, &r)).collect();
        all.sort_by(|a, b| b.at.cmp(&a.at));
        all
    }

    fn list_snapshots(&self, report: Report, repo: &Repo) -> Vec<Snapshot> {
        let format = "--format=%(refname)%1f%(objectname)%1f%(committerdate:unix)%1f%(parent)%1f%(contents)%1e";
        let Ok(out) = self.run(report, repo, &["for-each-ref", "--sort=-refname", format, REFS]) else {
            return Vec::new();
        };
        parse_snapshots(&String::from_utf8_lossy(&out), &repo.path)
    }

    fn prune_snapshots(&self, report: Report, repo: &Repo) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
        let format = "--format=%(refname)%1f%(committerdate:unix)";
        let Ok(out) = self.run(report, repo, &["for-each-ref", "--sort=-refname", format, REFS]) else { return };
        for (i, line) in String::from_utf8_lossy(&out).lines().enumerate() {
            let (name, at) = line.split_once('\x1f').unwrap_or((line, "0"));
            if i >= KEEP || now - at.parse::<i64>().unwrap_or(0) > MAX_AGE {
                let _ = self.run(report, repo, &["update-ref", "-d", name]);
            }
        }
    }

    /// What changed since a snapshot: the working tree against it.
    pub fn snapshot_diff(&self, report: Report, project: &Project, repo: &str, hash: &str) -> Result<Patch, String> {
        let repo = self.find(project, repo).ok_or_else(|| format!("{repo}: no repository here"))?;
        let hash = self.known_snapshot(report, &repo, hash)?;
        self.worktree_diff(report, &repo, &hash)
    }

    /// Puts the working tree back as it was in a snapshot. The index stays as it is; ignored
    /// files are not touched. Before that, the present is kept as a snapshot of its own.
    pub fn restore_snapshot(&self, report: Report, project: &Project, repo: &str, hash: &str) -> Result<(), String> {
        let repo = self.find(project, repo).ok_or_else(|| format!("{repo}: no repository here"))?;
        let hash = self.known_snapshot(report, &repo, hash)?;
        let short = &hash[..hash.len().min(7)];
        let label = format!("Before going back to {short}");
        self.take_snapshot(report, &repo, &Origin { back: true, ..Origin::before(&label, None, None) })?;
        let scope = if repo.prefix.is_empty() { "." } else { repo.prefix.as_str() };

        // Files that are new since then: tracked ones go with the restore, untracked ones by name
        let now = self.tree_now(report, &repo)?;
        let added = self.run(report, &repo, &["diff", "--name-only", "-z", "--no-renames", "--diff-filter=A", &hash, &now, "--", scope])?;
        let added: Vec<String> =
            String::from_utf8_lossy(&added).split('\0').filter(|p| !p.is_empty()).map(String::from).collect();

        let source = format!("--source={hash}");
        self.execute_change(report, &repo, &["restore", &source, "--worktree", "--", scope])?;
        for chunk in added.chunks(200) {
            let mut args = vec!["clean", "-f", "--"];
            args.extend(chunk.iter().map(String::as_str));
            self.execute_change(report, &repo, &args)?;
        }
        Ok(())
    }

    /// Only commits that are snapshots of this repository can be shown or gone back to.
    fn known_snapshot(&self, report: Report, repo: &Repo, hash: &str) -> Result<String, String> {
        self.list_snapshots(report, repo)
            .into_iter()
            .find(|s| s.hash == hash)
            .map(|s| s.hash)
            .ok_or_else(|| format!("{hash}: no snapshot of this repository"))
    }

    fn execute_change(&self, report: Report, repo: &Repo, args: &[&str]) -> Result<(), String> {
        match self.execute(report, repo, args) {
            (true, _, _) => Ok(()),
            (false, _, stderr) => Err(String::from_utf8_lossy(&stderr).trim().to_string()),
        }
    }
}

fn text(out: Vec<u8>) -> String {
    String::from_utf8_lossy(&out).trim().to_string()
}

fn parse_snapshots(out: &str, repo: &str) -> Vec<Snapshot> {
    out.split('\x1e')
        .filter_map(|record| {
            let f: Vec<&str> = record.trim_start_matches('\n').splitn(5, '\x1f').collect();
            if f.len() < 5 || f[1].is_empty() {
                return None;
            }
            // Label, report, trailers: paragraphs. Only the last one can hold trailers, so that a
            // report quoting one is not taken for it
            let mut parts: Vec<&str> = f[4].trim().split("\n\n").collect();
            let trailers = match parts.last() {
                Some(last) if parts.len() > 1 && last.lines().all(|l| l.starts_with("CodeDeck-")) => parts.pop().unwrap_or_default(),
                _ => "",
            };
            let trailer = |key: &str| trailers.lines().find_map(|l| l.strip_prefix(key)).map(|v| v.trim().to_string());
            let report = parts[1..].join("\n\n");
            Some(Snapshot {
                repo: repo.to_string(),
                hash: f[1].to_string(),
                short: f[1][..f[1].len().min(7)].to_string(),
                at: f[2].trim().parse().unwrap_or(0),
                label: parts[0].lines().next().unwrap_or_default().trim().to_string(),
                session: trailer("CodeDeck-Session:"),
                tool: trailer("CodeDeck-Tool:"),
                back: trailer("CodeDeck-Back:").is_some(),
                // A snapshot has one parent at most
                parent: Some(f[3].trim().to_string()).filter(|p| !p.is_empty()),
                turn_from: trailer("CodeDeck-From:"),
                report: Some(report).filter(|r| !r.trim().is_empty()),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    /// A folder in the temp directory, removed afterwards.
    struct Temp(PathBuf);
    impl Temp {
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let o = Command::new("git").args(args).current_dir(dir).output().unwrap();
        assert!(o.status.success(), "git {:?}: {}", args, String::from_utf8_lossy(&o.stderr));
        String::from_utf8_lossy(&o.stdout).into_owned()
    }

    fn temp_repo() -> (Temp, Project) {
        let dir = std::env::temp_dir().join(format!("codedeck-snap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        git(&dir, &["init", "-q", "-b", "main"]);
        git(&dir, &["config", "user.name", "Ada"]);
        git(&dir, &["config", "user.email", "ada@x.org"]);
        let project = Project::open(&dir).unwrap();
        (Temp(dir), project)
    }

    #[test]
    fn parses_records_with_trailers() {
        let out = "refs/codedeck/snapshots/3\x1fabcdef123\x1f100\x1fc0ffee\x1fBefore: fix it\n\nCodeDeck-Session: s1\nCodeDeck-Tool: Edit a.rs\n\x1e\n\
                   refs/codedeck/snapshots/2\x1f0123456789\x1f90\x1f\x1fBefore going back to abc\n\nCodeDeck-Back: yes\n\x1e\n\
                   refs/codedeck/snapshots/1\x1f9999999\x1f80\x1fc0ffee\x1fAfter: fix it\n\nFixed it.\n\nThe trailer reads:\nCodeDeck-Session: no\n\nCodeDeck-Session: s1\nCodeDeck-From: 777\n\x1e";
        let s = parse_snapshots(out, "sub");
        assert_eq!(s.len(), 3);
        assert_eq!((s[0].label.as_str(), s[0].session.as_deref(), s[0].tool.as_deref()), ("Before: fix it", Some("s1"), Some("Edit a.rs")));
        assert_eq!((s[0].short.as_str(), s[0].at, s[0].back, s[0].repo.as_str()), ("abcdef1", 100, false, "sub"));
        assert_eq!((s[0].parent.as_deref(), s[0].turn_from.as_deref(), s[0].report.as_deref()), (Some("c0ffee"), None, None));
        // The end of a turn: where it began and what was said, a quoted trailer included
        assert_eq!((s[2].label.as_str(), s[2].session.as_deref(), s[2].turn_from.as_deref()), ("After: fix it", Some("s1"), Some("777")));
        assert_eq!(s[2].report.as_deref(), Some("Fixed it.\n\nThe trailer reads:\nCodeDeck-Session: no"));
        assert!(s[1].parent.is_none());
        assert!(s[1].back && s[1].session.is_none());
    }

    #[test]
    fn snapshot_and_go_back() {
        let (dir, project) = temp_repo();
        let root = dir.path();
        std::fs::write(root.join("a.txt"), "one\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-qm", "first"]);
        // Same size, same second as the index: Git must look at the content (racy git)
        std::fs::write(root.join("a.txt"), "two\n").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(root.join("keep.txt"), "untracked before\n").unwrap();

        let g = Git::new();
        let report = |_: &crate::git::GitRun| {};
        let repo = g.repos(&project).into_iter().next().unwrap();
        let origin = Origin::before("Before: test", Some("s1"), Some("Edit a.txt"));
        let taken = g.take_snapshot(&report, &repo, &origin).unwrap();
        assert!(taken.new);
        let snap = taken.hash;
        // Nothing changed: no second one, the first stands for the present
        let again = g.take_snapshot(&report, &repo, &origin).unwrap();
        assert!(!again.new && again.hash == snap);
        // Nor did a turn that began there change anything
        let end = Origin { from: Some(&snap), report: Some("Done."), ..Origin::before("After: test", Some("s1"), None) };
        assert!(g.end_turn(&report, &repo, &end).unwrap().is_none());
        // The index is untouched: keep.txt is still untracked
        assert!(git(root, &["status", "--porcelain"]).contains("?? keep.txt"));

        // The assistant changes, adds and deletes
        std::fs::write(root.join("a.txt"), "three\n").unwrap();
        std::fs::write(root.join("new.txt"), "new\n").unwrap();
        std::fs::remove_file(root.join("keep.txt")).unwrap();
        let diff = g.snapshot_diff(&report, &project, "", &snap).unwrap();
        assert_eq!(diff.changes.len(), 3);

        // The turn ends: its snapshot says where it began and what the assistant said
        let end = Origin { from: Some(&snap), report: Some("Changed three files.\n\nAll done."), ..Origin::before("After: test", Some("s1"), None) };
        let ended = g.end_turn(&report, &repo, &end).unwrap().expect("the turn changed files");
        let list = g.snapshots(&report, &project, &[String::new()]);
        assert_eq!((list[0].hash.as_str(), list[0].turn_from.as_deref(), list[0].report.as_deref()), (ended.as_str(), Some(snap.as_str()), Some("Changed three files.\n\nAll done.")));
        assert_eq!(list[0].parent, list[1].parent);
        assert_eq!(g.compare(&report, &project, "", &snap, &ended).unwrap().changes.len(), 3);
        // The next turn starts where this one ended: no snapshot of its own
        let next = g.take_snapshot(&report, &repo, &origin).unwrap();
        assert!(!next.new && next.hash == ended);

        g.restore_snapshot(&report, &project, "", &snap).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "two\n");
        assert_eq!(std::fs::read_to_string(root.join("keep.txt")).unwrap(), "untracked before\n");
        assert!(!root.join("new.txt").exists());
        // Going back left a snapshot of what was there, to go forward again
        let list = g.snapshots(&report, &project, &[String::new()]);
        // The end of the turn has the same files as the present: it stands for it
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].hash, ended);
        g.restore_snapshot(&report, &project, "", &list[0].hash).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("new.txt")).unwrap(), "new\n");

        // Comparing two points: the snapshot before the assistant and the one before going back
        let between = g.compare(&report, &project, "", &snap, &list[0].hash).unwrap();
        let mut paths: Vec<&str> = between.changes.iter().map(|c| c.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, ["a.txt", "keep.txt", "new.txt"]);
        assert!(g.compare(&report, &project, "", &snap, "nothex").is_err());
    }
}
