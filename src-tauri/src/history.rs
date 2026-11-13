//! What changed: the commit history of each repository and the diffs, of the working tree and
//! of single commits. Reading only, always through the `git` command line like everything else.

use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

use crate::git::{Git, Report, Repo};
use crate::project::Project;

/// Commits read per repository.
const LOG_LIMIT: &str = "60";
/// A patch longer than this is cut; the frontend says so.
const PATCH_LIMIT: usize = 3 * 1024 * 1024;
/// Git's empty tree: what a repository without commits is compared with.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Co-author trailers naming one of these mark a commit as made with an AI assistant.
const AI_MARKS: &[&str] = &["noreply@anthropic.com", "claude", "copilot", "openai", "gemini", "cursor"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoLog {
    /// Project-relative path of the repository, as in its status
    pub(crate) path: String,
    pub(crate) commits: Vec<Commit>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub(crate) hash: String,
    short: String,
    /// Unix seconds, author date
    at: i64,
    author: String,
    /// The author is the one whose Git identity is configured here
    by_you: bool,
    pub(crate) subject: String,
    body: String,
    /// The co-author that marks it as made with an assistant, if any
    pub(crate) assistant: Option<String>,
    files: u32,
    insertions: u32,
    deletions: u32,
    /// On no remote yet
    pub(crate) unpushed: bool,
    merge: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    /// Unified diff of everything; untracked files appear as new files
    text: String,
    /// Cut at the size limit; `changes` is complete nevertheless
    truncated: bool,
    /// Every changed file, renames and moves recognised by Git
    pub(crate) changes: Vec<Change>,
    /// Folders that did not exist before and do now
    pub(crate) new_dirs: Vec<String>,
    /// Folders that existed before and do not any more
    pub(crate) gone_dirs: Vec<String>,
}

/// One changed file as `git diff --raw --numstat` reports it. Paths are repository-relative.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub(crate) path: String,
    /// The old path of a rename or the source of a copy
    from: Option<String>,
    /// A added, D deleted, M modified, R renamed, C copied, T type changed (file, link, submodule)
    pub(crate) status: String,
    /// How similar a renamed or copied file is to its source, in percent
    similarity: Option<u32>,
    /// `100644` file, `100755` executable, `120000` symbolic link, `160000` repository, `000000` none
    old_mode: String,
    new_mode: String,
    /// Lines; `None` for binary files
    added: Option<u32>,
    removed: Option<u32>,
}

/// A copy of the index to stage untracked files into with `--intent-to-add`: with them in it,
/// Git's own rename detection sees files that moved to a new place too. The real index stays
/// untouched; the copy is removed afterwards.
struct ScratchIndex(std::path::PathBuf);

impl ScratchIndex {
    fn new(git: &Git, report: Report, repo: &Repo) -> Result<Self, String> {
        static COUNT: AtomicU64 = AtomicU64::new(0);
        let real = git.run(report, repo, &["rev-parse", "--git-path", "index"])?;
        let real = repo.top.join(String::from_utf8_lossy(&real).trim());
        let path = std::env::temp_dir()
            .join(format!("codedeck-index-{}-{}", std::process::id(), COUNT.fetch_add(1, Ordering::Relaxed)));
        if real.exists() {
            fs::copy(&real, &path).map_err(|e| format!("copying the index: {e}"))?;
        }
        Ok(Self(path))
    }
}

impl Drop for ScratchIndex {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

impl Git {
    /// The latest commits of every repository, newest first per repository. For a repository
    /// the project only lies inside, only commits that touched the opened folder.
    pub fn history(&self, report: Report, project: &Project, repos: &[String]) -> Vec<RepoLog> {
        let found: Vec<Repo> = repos.iter().filter_map(|path| self.find(project, path)).collect();
        std::thread::scope(|scope| {
            let handles: Vec<_> =
                found.iter().map(|repo| scope.spawn(move || self.repo_history(report, repo))).collect();
            handles.into_iter().filter_map(|h| h.join().ok()).collect()
        })
    }

    fn repo_history(&self, report: Report, repo: &Repo) -> RepoLog {
        let mut log = RepoLog { path: repo.path.clone(), commits: Vec::new(), error: None };
        // Fields split by \x1f, records started by \x1e; --shortstat follows each record
        let format = "--format=%x1e%H%x1f%h%x1f%at%x1f%an%x1f%ae%x1f%P%x1f%s%x1f%b%x1f\
                      %(trailers:key=Co-authored-by,valueonly,separator=%x1d)";
        let mut args = vec!["log", "-n", LOG_LIMIT, "--shortstat", format];
        if !repo.prefix.is_empty() {
            args.extend(["--", &repo.prefix]);
        }
        // A repository without commits has no history yet; that is no error
        if self.run(report, repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
            return log;
        }
        let out = match self.run(report, repo, &args) {
            Ok(out) => out,
            Err(e) => {
                log.error = Some(e);
                return log;
            }
        };
        let me = self
            .run(report, repo, &["config", "user.email"])
            .map(|o| String::from_utf8_lossy(&o).trim().to_lowercase())
            .unwrap_or_default();
        let unpushed = self.unpushed(report, repo);
        log.commits = parse_log(&String::from_utf8_lossy(&out), &me, &unpushed);
        log
    }

    /// Commits on no remote. Without any remote nothing counts as unpushed: there is nowhere to push.
    fn unpushed(&self, report: Report, repo: &Repo) -> Vec<String> {
        let remotes = self.run(report, repo, &["remote"]).unwrap_or_default();
        if remotes.iter().all(u8::is_ascii_whitespace) {
            return Vec::new();
        }
        self.run(report, repo, &["rev-list", "-n", LOG_LIMIT, "HEAD", "--not", "--remotes"])
            .map(|o| String::from_utf8_lossy(&o).lines().map(String::from).collect())
            .unwrap_or_default()
    }

    /// The uncommitted changes of a repository against its last commit, staged and unstaged
    /// together, untracked files included as new files.
    pub fn working_diff(&self, report: Report, project: &Project, repo: &str) -> Result<Patch, String> {
        let repo = self.find(project, repo).ok_or_else(|| format!("{repo}: no repository here"))?;
        let has_head = self.run(report, &repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok();
        let base = if has_head { "HEAD" } else { EMPTY_TREE };
        let paths: &[&str] = if repo.prefix.is_empty() { &[] } else { &["--", &repo.prefix] };

        let index = ScratchIndex::new(self, report, &repo)?;
        let index_path = index.0.to_string_lossy().into_owned();
        let env = [("GIT_INDEX_FILE", index_path.as_str())];
        let add = [&["-c", "advice.addEmbeddedRepo=false", "add", "-A", "--intent-to-add"][..], paths].concat();
        self.run_with(report, &repo, &add, &env)?;

        let raw = [&["diff", base, "-M", "--raw", "--numstat", "-z", "--no-ext-diff"][..], paths].concat();
        let changes = parse_changes(&self.run_with(report, &repo, &raw, &env)?);
        let diff = [&["diff", base, "-M", "--no-color", "--no-ext-diff"][..], paths].concat();
        let text = String::from_utf8_lossy(&self.run_with(report, &repo, &diff, &env)?).into_owned();

        let before = self.dirs(report, &repo, base)?;
        let (new_dirs, gone_dirs) = dir_changes(&changes, |d| before.contains(d), |d| repo.top.join(d).is_dir());
        let mut patch = Patch { text, truncated: false, changes, new_dirs, gone_dirs };
        cut(&mut patch);
        Ok(patch)
    }

    /// What one commit changed. A merge shows what it brought in against its first parent.
    pub fn commit_diff(&self, report: Report, project: &Project, repo: &str, hash: &str) -> Result<Patch, String> {
        if hash.len() < 7 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("{hash}: not a commit hash"));
        }
        let repo = self.find(project, repo).ok_or_else(|| format!("{repo}: no repository here"))?;
        let paths: &[&str] = if repo.prefix.is_empty() { &[] } else { &["--", &repo.prefix] };
        let show = ["show", "--format=", "-M", "--no-ext-diff", "--diff-merges=first-parent", hash];

        let raw = [&show[..], &["--raw", "--numstat", "-z"], paths].concat();
        let changes = parse_changes(&self.run(report, &repo, &raw)?);
        let diff = [&show[..], &["--no-color"], paths].concat();
        let text = String::from_utf8_lossy(&self.run(report, &repo, &diff)?).into_owned();

        let parent = format!("{hash}^");
        let has_parent = self.run(report, &repo, &["rev-parse", "--verify", "--quiet", &parent]).is_ok();
        let before = self.dirs(report, &repo, if has_parent { &parent } else { EMPTY_TREE })?;
        let after = self.dirs(report, &repo, hash)?;
        let (new_dirs, gone_dirs) = dir_changes(&changes, |d| before.contains(d), |d| after.contains(d));
        let mut patch = Patch { text, truncated: false, changes, new_dirs, gone_dirs };
        cut(&mut patch);
        Ok(patch)
    }

    /// Every folder in a commit's tree.
    fn dirs(&self, report: Report, repo: &Repo, tree: &str) -> Result<HashSet<String>, String> {
        let out = self.run(report, repo, &["ls-tree", "-r", "-d", "-z", "--name-only", tree])?;
        Ok(String::from_utf8_lossy(&out).split('\0').filter(|d| !d.is_empty()).map(String::from).collect())
    }
}

/// The folders around the changed files that came into being or went away.
fn dir_changes(
    changes: &[Change],
    existed: impl Fn(&str) -> bool,
    exists: impl Fn(&str) -> bool,
) -> (Vec<String>, Vec<String>) {
    let mut around: BTreeSet<&str> = BTreeSet::new();
    for path in changes.iter().flat_map(|c| std::iter::once(c.path.as_str()).chain(c.from.as_deref())) {
        let mut rest = path;
        while let Some(slash) = rest.rfind('/') {
            rest = &rest[..slash];
            if !around.insert(rest) {
                break;
            }
        }
    }
    let new = around.iter().filter(|d| !existed(d) && exists(d)).map(|d| d.to_string()).collect();
    let gone = around.iter().filter(|d| existed(d) && !exists(d)).map(|d| d.to_string()).collect();
    (new, gone)
}

/// `git diff --raw --numstat -z`: first one raw record per file, then one numstat record per
/// file in the same order.
///
/// raw: `:100644 100644 <sha> <sha> R087\0old\0new\0` or `... M\0path\0`
/// numstat: `3\t1\tpath\0`, `3\t1\t\0old\0new\0`, `-\t-\tpath\0` for binary files
fn parse_changes(out: &[u8]) -> Vec<Change> {
    let text = String::from_utf8_lossy(out);
    let mut tokens = text.split('\0').filter(|t| !t.is_empty()).peekable();
    let mut changes = Vec::new();
    let mut counted = 0;
    while let Some(token) = tokens.next() {
        if let Some(raw) = token.strip_prefix(':') {
            let fields: Vec<&str> = raw.split(' ').collect();
            if fields.len() < 5 {
                continue;
            }
            let (letter, score) = fields[4].split_at(1);
            let first = tokens.next().unwrap_or_default().to_string();
            let (path, from) = if letter == "R" || letter == "C" {
                (tokens.next().unwrap_or_default().to_string(), Some(first))
            } else {
                (first, None)
            };
            changes.push(Change {
                path,
                from,
                status: letter.to_string(),
                similarity: score.parse().ok(),
                old_mode: fields[0].to_string(),
                new_mode: fields[1].to_string(),
                added: None,
                removed: None,
            });
        } else {
            let mut parts = token.splitn(3, '\t');
            let (added, removed) = (parts.next().unwrap_or("-"), parts.next().unwrap_or("-"));
            if parts.next().unwrap_or_default().is_empty() {
                // A rename: old and new path follow as tokens of their own
                tokens.next();
                tokens.next();
            }
            if let Some(change) = changes.get_mut(counted) {
                change.added = added.parse().ok();
                change.removed = removed.parse().ok();
            }
            counted += 1;
        }
    }
    changes
}

fn cut(patch: &mut Patch) {
    if patch.text.len() > PATCH_LIMIT {
        let mut end = PATCH_LIMIT;
        while !patch.text.is_char_boundary(end) {
            end -= 1;
        }
        // End on a whole line
        end = patch.text[..end].rfind('\n').map_or(end, |i| i + 1);
        patch.text.truncate(end);
        patch.truncated = true;
    }
}

fn parse_log(text: &str, me: &str, unpushed: &[String]) -> Vec<Commit> {
    text.split('\x1e')
        .filter(|r| !r.trim().is_empty())
        .filter_map(|record| {
            let f: Vec<&str> = record.splitn(9, '\x1f').collect();
            if f.len() < 9 {
                return None;
            }
            // The trailers field runs into the --shortstat line that follows the record
            let (trailers, stat) = f[8].split_once('\n').unwrap_or((f[8], ""));
            let assistant = trailers
                .split('\x1d')
                .map(str::trim)
                .find(|t| AI_MARKS.iter().any(|m| t.to_lowercase().contains(m)))
                .map(|t| t.split(" <").next().unwrap_or(t).to_string());
            let (files, insertions, deletions) = parse_shortstat(stat);
            Some(Commit {
                hash: f[0].trim().to_string(),
                short: f[1].to_string(),
                at: f[2].parse().unwrap_or(0),
                author: f[3].to_string(),
                by_you: !me.is_empty() && f[4].to_lowercase() == me,
                merge: f[5].split(' ').filter(|p| !p.is_empty()).count() > 1,
                subject: f[6].to_string(),
                body: strip_trailers(f[7]),
                assistant,
                files,
                insertions,
                deletions,
                unpushed: unpushed.iter().any(|h| h == f[0].trim()),
            })
        })
        .collect()
}

/// The body without its trailer block (Co-authored-by and the like): that is shown apart.
fn strip_trailers(body: &str) -> String {
    let body = body.trim();
    let mut paragraphs: Vec<&str> = body.split("\n\n").collect();
    if let Some(last) = paragraphs.last() {
        let is_trailer = |l: &str| l.split_once(": ").is_some_and(|(k, _)| !k.is_empty() && !k.contains(' '));
        if last.lines().all(is_trailer) {
            paragraphs.pop();
        }
    }
    paragraphs.join("\n\n").trim().to_string()
}

/// ` 3 files changed, 10 insertions(+), 2 deletions(-)`
fn parse_shortstat(stat: &str) -> (u32, u32, u32) {
    let mut result = (0, 0, 0);
    for part in stat.trim().split(", ") {
        let mut words = part.split(' ');
        let n = words.next().and_then(|n| n.parse().ok()).unwrap_or(0);
        match words.next() {
            Some(w) if w.starts_with("file") => result.0 = n,
            Some(w) if w.starts_with("insertion") => result.1 = n,
            Some(w) if w.starts_with("deletion") => result.2 = n,
            _ => {}
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::sync::Mutex;

    #[test]
    fn reads_a_log_record() {
        let text = "\x1eabc123\x1fabc\x1f1700000000\x1fAda\x1fada@x.org\x1fp1\x1fAdd limiter\x1f\
                    Body line\n\nCo-authored-by: Claude <noreply@anthropic.com>\n\x1fClaude <noreply@anthropic.com>\n\n \
                    3 files changed, 10 insertions(+), 2 deletions(-)\n\
                    \x1edef456\x1fdef\x1f1690000000\x1fBob\x1fbob@x.org\x1fp1 p2\x1fMerge branch\x1f\x1f\n";
        let commits = parse_log(text, "ada@x.org", &["abc123".into()]);
        assert_eq!(commits.len(), 2);
        let c = &commits[0];
        assert_eq!((c.short.as_str(), c.subject.as_str(), c.body.as_str()), ("abc", "Add limiter", "Body line"));
        assert_eq!(c.assistant.as_deref(), Some("Claude"));
        assert_eq!((c.files, c.insertions, c.deletions), (3, 10, 2));
        assert!(c.by_you && c.unpushed && !c.merge);
        assert!(commits[1].merge && !commits[1].by_you && commits[1].assistant.is_none());
    }

    #[test]
    fn history_and_diffs_of_a_real_repo() {
        let base = std::env::temp_dir().join(format!("codedeck-hist-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        let git = |args: &[&str]| Command::new("git").args(args).current_dir(&base).output().unwrap();
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.name", "Ada"]);
        git(&["config", "user.email", "ada@x.org"]);
        fs::write(base.join("a.txt"), "one\ntwo\n").unwrap();
        git(&["add", "-A"]);
        git(&["commit", "-q", "-m", "First", "-m", "Co-authored-by: Claude <noreply@anthropic.com>"]);
        fs::write(base.join("a.txt"), "one\nTWO\n").unwrap();
        fs::write(base.join("new.txt"), "fresh").unwrap();

        let project = Project::open(&base).unwrap();
        let report = |_: &crate::git::GitRun| {};
        let g = Git::new();
        g.status(&report, &project, true);
        let logs = g.history(&report, &project, &[String::new()]);
        let working = g.working_diff(&report, &project, "").unwrap();
        let hash = logs[0].commits[0].hash.clone();
        let shown = g.commit_diff(&report, &project, "", &hash).unwrap();
        let _ = fs::remove_dir_all(&base);

        let c = &logs[0].commits[0];
        assert_eq!((c.subject.as_str(), c.assistant.as_deref(), c.by_you, c.unpushed), ("First", Some("Claude"), true, false));
        assert!(working.text.contains("-two\n+TWO"), "{}", working.text);
        assert!(working.text.contains("+++ b/new.txt\n@@ -0,0 +1 @@\n+fresh\n\\ No newline"), "{}", working.text);
        assert!(shown.text.contains("+++ b/a.txt"));
        assert!(g.commit_diff(&report, &project, "", "HEAD; rm").is_err());
    }

    #[test]
    fn a_repo_without_commits_has_an_empty_history() {
        let base = std::env::temp_dir().join(format!("codedeck-empty-{}", std::process::id()));
        fs::create_dir_all(&base).unwrap();
        Command::new("git").args(["init", "-q"]).current_dir(&base).output().unwrap();
        fs::write(base.join("a.txt"), "x\n").unwrap();
        let project = Project::open(&base).unwrap();
        let runs = Mutex::new(0);
        let report = |_: &crate::git::GitRun| *runs.lock().unwrap() += 1;
        let g = Git::new();
        g.status(&report, &project, true);
        let logs = g.history(&report, &project, &[String::new()]);
        let working = g.working_diff(&report, &project, "").unwrap();
        let _ = fs::remove_dir_all(&base);
        assert!(logs[0].error.is_none() && logs[0].commits.is_empty());
        assert!(working.text.contains("+++ b/a.txt"));
    }

    #[test]
    fn reads_raw_and_numstat_records() {
        let out = b":100644 100644 aaa bbb M\0a.txt\0:100644 100644 ccc ccc R100\0old/b.txt\0new/b.txt\0\
                    :000000 100644 000 ddd A\0pic.png\0\
                    2\t1\ta.txt\0\
                    0\t0\t\0old/b.txt\0new/b.txt\0-\t-\tpic.png\0";
        let c = parse_changes(out);
        assert_eq!(c.len(), 3);
        assert_eq!((c[0].path.as_str(), c[0].added, c[0].removed), ("a.txt", Some(2), Some(1)));
        assert_eq!((c[1].path.as_str(), c[1].from.as_deref(), c[1].status.as_str(), c[1].similarity), ("new/b.txt", Some("old/b.txt"), "R", Some(100)));
        assert_eq!((c[2].status.as_str(), c[2].added, c[2].new_mode.as_str()), ("A", None, "100644"));
    }

    /// Moves of untracked files are recognised, and the real index is left as it was.
    #[test]
    fn the_structure_of_uncommitted_changes() {
        let base = std::env::temp_dir().join(format!("codedeck-struct-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("src/old")).unwrap();
        fs::create_dir_all(base.join("lib")).unwrap();
        let git = |args: &[&str]| Command::new("git").args(args).current_dir(&base).output().unwrap();
        git(&["init", "-q", "-b", "main"]);
        let lines = |from: u32| (from..from + 40).map(|n| format!("{n}\n")).collect::<String>();
        fs::write(base.join("src/old/a.txt"), lines(1)).unwrap();
        fs::write(base.join("lib/c.txt"), lines(100)).unwrap();
        fs::write(base.join("keep.txt"), "keep\n").unwrap();
        git(&["add", "-A"]);
        git(&["-c", "user.name=A", "-c", "user.email=a@x.org", "commit", "-q", "-m", "init"]);
        let index_before = fs::read(base.join(".git/index")).unwrap();

        fs::create_dir_all(base.join("src/new")).unwrap();
        fs::rename(base.join("src/old/a.txt"), base.join("src/new/a.txt")).unwrap();
        fs::remove_dir(base.join("src/old")).unwrap();
        fs::write(base.join("lib/d.txt"), lines(100).replace("120\n", "XX\n")).unwrap();
        fs::remove_file(base.join("lib/c.txt")).unwrap();
        fs::remove_file(base.join("keep.txt")).unwrap();
        fs::write(base.join("fresh.txt"), "hi\n").unwrap();

        let project = Project::open(&base).unwrap();
        let report = |_: &crate::git::GitRun| {};
        let g = Git::new();
        g.status(&report, &project, true);
        let patch = g.working_diff(&report, &project, "").unwrap();
        let index_after = fs::read(base.join(".git/index")).unwrap();
        let _ = fs::remove_dir_all(&base);

        let find = |p: &str| patch.changes.iter().find(|c| c.path == p).unwrap_or_else(|| panic!("{p}: {:?}", patch.changes));
        assert_eq!((find("src/new/a.txt").status.as_str(), find("src/new/a.txt").similarity), ("R", Some(100)));
        assert_eq!(find("src/new/a.txt").from.as_deref(), Some("src/old/a.txt"));
        assert_eq!(find("lib/d.txt").status, "R");
        assert!(find("lib/d.txt").similarity.unwrap() < 100);
        assert_eq!(find("keep.txt").status, "D");
        assert_eq!((find("fresh.txt").status.as_str(), find("fresh.txt").added), ("A", Some(1)));
        assert_eq!(patch.new_dirs, ["src/new"]);
        assert_eq!(patch.gone_dirs, ["src/old"]);
        assert_eq!(index_before, index_after);
    }

    /// The commands the Changes view and the Git actions build, in the order one uses them,
    /// against a real repository with a real (bare) remote.
    #[test]
    fn the_everyday_actions_work_end_to_end() {
        let base = std::env::temp_dir().join(format!("codedeck-flow-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let sh = |dir: &std::path::Path, args: &[&str]| {
            let o = Command::new("git").args(args).current_dir(dir).output().unwrap();
            assert!(o.status.success(), "git {:?}: {}", args, String::from_utf8_lossy(&o.stderr));
        };
        sh(&base, &["init", "-q", "--bare", "-b", "main", "remote.git"]);
        sh(&base, &["clone", "-q", "remote.git", "work/app"]);
        sh(&base, &["clone", "-q", "remote.git", "other"]);
        let app = base.join("work/app");
        let other = base.join("other");
        for dir in [&app, &other] {
            sh(dir, &["config", "user.name", "Ada"]);
            sh(dir, &["config", "user.email", "ada@x.org"]);
        }

        let project = Project::open(&base.join("work")).unwrap();
        let report = |_: &crate::git::GitRun| {};
        let g = Git::new();
        let act = |args: &[&str]| {
            let args: Vec<String> = args.iter().map(|a| a.to_string()).collect();
            let r = g.action(&report, &project, "app", &args);
            assert!(r.ok, "git {}: {}", args.join(" "), r.output);
        };
        let files = || {
            let (repos, _) = g.status(&report, &project, false);
            let mut f: Vec<String> = repos[0].files.iter().map(|f| format!("{}{}{}", f.state, if f.staged { "+" } else { "" }, f.path)).collect();
            f.sort();
            f
        };
        g.status(&report, &project, true);

        // First commit in an empty repo: stage, unstage without HEAD, stage again, commit, publish
        fs::write(app.join("a.txt"), "one\n").unwrap();
        act(&["add", "--", "a.txt"]);
        assert_eq!(files(), ["A+app/a.txt"]);
        act(&["rm", "--cached", "--", "a.txt"]);
        assert_eq!(files(), ["?app/a.txt"]);
        act(&["add", "-A"]);
        act(&["commit", "-m", "First"]);
        act(&["push", "-u", "origin", "main"]);
        assert!(files().is_empty());

        // Discard: a modification goes back, a new file goes away
        fs::write(app.join("a.txt"), "changed\n").unwrap();
        fs::write(app.join("scratch.txt"), "x").unwrap();
        act(&["restore", "--source=HEAD", "--staged", "--worktree", "--", "a.txt"]);
        act(&["clean", "-f", "--", "scratch.txt"]);
        assert!(files().is_empty());
        assert_eq!(fs::read_to_string(app.join("a.txt")).unwrap(), "one\n");

        // Stage and unstage with HEAD, commit only what is staged
        fs::write(app.join("a.txt"), "two\n").unwrap();
        fs::write(app.join("b.txt"), "b\n").unwrap();
        act(&["add", "-A", "--", "a.txt"]);
        act(&["commit", "-m", "Only a"]);
        assert_eq!(files(), ["?app/b.txt"]);
        act(&["add", "--", "b.txt"]);
        act(&["restore", "--staged", "--", "b.txt"]);
        assert_eq!(files(), ["?app/b.txt"]);
        act(&["push"]);

        // Someone else pushes; fetch, then pull fast-forward
        sh(&other, &["pull", "-q"]);
        fs::write(other.join("c.txt"), "c\n").unwrap();
        sh(&other, &["add", "-A"]);
        sh(&other, &["commit", "-qm", "From elsewhere"]);
        sh(&other, &["push", "-q"]);
        act(&["fetch"]);
        let (repos, _) = g.status(&report, &project, false);
        assert_eq!(repos[0].behind, 1);
        act(&["pull", "--ff-only"]);
        assert!(app.join("c.txt").exists());

        let logs = g.history(&report, &project, &["app".to_string()]);
        let subjects: Vec<&str> = logs[0].commits.iter().map(|c| c.subject.as_str()).collect();
        let _ = fs::remove_dir_all(&base);
        assert_eq!(subjects, ["From elsewhere", "Only a", "First"]);
        assert!(logs[0].commits.iter().all(|c| !c.unpushed));
    }
}
