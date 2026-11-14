//! Snapshots: the whole working tree of a repository, untracked files included, kept as a commit
//! under `refs/codedeck/snapshots/`. Taken before an assistant writes for the first time in a
//! turn, so one can go back to that point without typing Git commands.
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
}

/// Where a snapshot comes from, written into its message as trailers.
pub struct Origin<'a> {
    pub label: &'a str,
    pub session: Option<&'a str>,
    pub tool: Option<&'a str>,
    pub back: bool,
}

impl Git {
    /// Takes a snapshot of the repository; `None` when nothing changed since the last one.
    pub(crate) fn take_snapshot(&self, report: Report, repo: &Repo, origin: &Origin) -> Result<Option<String>, String> {
        let tree = self.tree_now(report, repo)?;
        let head = self.run(report, repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).ok().map(text);
        if let Some(last) = self.list_snapshots(report, repo).first() {
            let same_tree = self.run(report, repo, &["rev-parse", &format!("{}^{{tree}}", last.hash)]).ok().map(text);
            let parent = self.run(report, repo, &["rev-parse", "--verify", "--quiet", &format!("{}^", last.hash)]).ok().map(text);
            if same_tree.as_deref() == Some(tree.as_str()) && parent == head {
                return Ok(None);
            }
        }

        let mut message = origin.label.trim().to_string();
        let trailers: Vec<String> = [
            origin.session.map(|s| format!("CodeDeck-Session: {s}")),
            origin.tool.map(|t| format!("CodeDeck-Tool: {}", t.replace('\n', " "))),
            origin.back.then(|| "CodeDeck-Back: yes".to_string()),
        ]
        .into_iter()
        .flatten()
        .collect();
        if !trailers.is_empty() {
            message = format!("{message}\n\n{}", trailers.join("\n"));
        }
        let mut args = vec!["commit-tree", tree.as_str()];
        if let Some(head) = &head {
            args.extend(["-p", head.as_str()]);
        }
        args.extend(["-m", message.as_str()]);
        let commit = text(self.run_with(report, repo, &args, &IDENTITY)?);

        let name = format!("{REFS}/{}", SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis()));
        self.run(report, repo, &["update-ref", &name, &commit])?;
        self.prune_snapshots(report, repo);
        Ok(Some(commit))
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
        let format = "--format=%(refname)%1f%(objectname)%1f%(committerdate:unix)%1f%(contents)%1e";
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
        self.take_snapshot(report, &repo, &Origin { label: &label, session: None, tool: None, back: true })?;
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
            let f: Vec<&str> = record.trim_start_matches('\n').splitn(4, '\x1f').collect();
            if f.len() < 4 || f[1].is_empty() {
                return None;
            }
            let contents = f[3];
            let trailer = |key: &str| {
                contents.lines().find_map(|l| l.strip_prefix(key)).map(|v| v.trim().to_string())
            };
            Some(Snapshot {
                repo: repo.to_string(),
                hash: f[1].to_string(),
                short: f[1][..f[1].len().min(7)].to_string(),
                at: f[2].trim().parse().unwrap_or(0),
                label: contents.lines().next().unwrap_or_default().trim().to_string(),
                session: trailer("CodeDeck-Session:"),
                tool: trailer("CodeDeck-Tool:"),
                back: trailer("CodeDeck-Back:").is_some(),
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
        let out = "refs/codedeck/snapshots/2\x1fabcdef123\x1f100\x1fBefore: fix it\n\nCodeDeck-Session: s1\nCodeDeck-Tool: Edit a.rs\n\x1e\n\
                   refs/codedeck/snapshots/1\x1f0123456789\x1f90\x1fBefore going back to abc\n\nCodeDeck-Back: yes\n\x1e";
        let s = parse_snapshots(out, "sub");
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].label.as_str(), s[0].session.as_deref(), s[0].tool.as_deref()), ("Before: fix it", Some("s1"), Some("Edit a.rs")));
        assert_eq!((s[0].short.as_str(), s[0].at, s[0].back, s[0].repo.as_str()), ("abcdef1", 100, false, "sub"));
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
        let origin = Origin { label: "Before: test", session: Some("s1"), tool: Some("Edit a.txt"), back: false };
        let snap = g.take_snapshot(&report, &repo, &origin).unwrap().expect("a snapshot");
        // Nothing changed: no second one
        assert!(g.take_snapshot(&report, &repo, &origin).unwrap().is_none());
        // The index is untouched: keep.txt is still untracked
        assert!(git(root, &["status", "--porcelain"]).contains("?? keep.txt"));

        // The assistant changes, adds and deletes
        std::fs::write(root.join("a.txt"), "three\n").unwrap();
        std::fs::write(root.join("new.txt"), "new\n").unwrap();
        std::fs::remove_file(root.join("keep.txt")).unwrap();
        let diff = g.snapshot_diff(&report, &project, "", &snap).unwrap();
        assert_eq!(diff.changes.len(), 3);

        g.restore_snapshot(&report, &project, "", &snap).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "two\n");
        assert_eq!(std::fs::read_to_string(root.join("keep.txt")).unwrap(), "untracked before\n");
        assert!(!root.join("new.txt").exists());
        // Going back left a snapshot of what was there, to go forward again
        let list = g.snapshots(&report, &project, &[String::new()]);
        assert_eq!(list.len(), 2);
        assert!(list[0].back);
        g.restore_snapshot(&report, &project, "", &list[0].hash).unwrap();
        assert_eq!(std::fs::read_to_string(root.join("new.txt")).unwrap(), "new\n");
    }
}
