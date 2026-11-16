//! What sessions of a project left outside of it (step 2.2, KONZEPT 4.4): files written elsewhere,
//! and pages they published, as links. Kept per project in `~/.config/codedeck/findings.json`, so
//! that they are still there after a restart.
//!
//! A file counts when a session of the project wrote it outside the project, it is not in another
//! git repository (there it is that project's business and versioned), and it is not one of the
//! coding tool's own files (memory, settings; the adapter knows them). A page counts when the
//! session named its link at the end of its turn, as the start rules ask; only addresses of
//! places that publish pages count, not every link it mentions.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::project::Project;

/// Kept this long, then forgotten.
const KEPT_MS: u64 = 30 * 24 * 3600_000;
/// Per kind and project at most.
const KEPT: usize = 100;

/// Hosts that publish pages, whatever the tool; the adapter adds its own (`Harness::page_hosts`).
const PAGE_HOSTS: &[&str] = &["gist.github.com", "pastebin.com", "dpaste.org", "paste.rs", "hastebin.com", "codepen.io", "jsfiddle.net"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Outside {
    /// Absolute
    pub path: String,
    pub session: String,
    /// Unix milliseconds of the write
    pub at: u64,
    /// Project-relative path of the copy in the scratch folder, once fetched
    #[serde(default)]
    pub fetched: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub url: String,
    /// The link's text, or the words around it
    pub title: String,
    pub session: String,
    /// Unix milliseconds: when it was last named
    pub at: u64,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Found {
    #[serde(default)]
    outside: Vec<Outside>,
    #[serde(default)]
    pages: Vec<Page>,
    #[serde(skip)]
    dirty: bool,
}

/// A file outside as the interface shows it: only while it is there.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutsideFile {
    #[serde(flatten)]
    pub found: Outside,
    pub size: u64,
    /// Unix milliseconds
    pub modified: u64,
}

#[derive(Serialize, Clone, Default)]
pub struct FoundView {
    pub outside: Vec<OutsideFile>,
    pub pages: Vec<Page>,
}

impl Found {
    /// A file a session left outside the project (`left_outside` and the adapter decide that).
    pub fn wrote(&mut self, path: &Path, session: &str, at: u64) {
        let path = path.to_string_lossy().into_owned();
        match self.outside.iter_mut().find(|o| o.path == path) {
            Some(o) => {
                // Written again: a copy fetched before is no longer up to date
                (o.session, o.at, o.fetched) = (session.to_string(), at.max(o.at), None);
            }
            None => self.outside.push(Outside { path, session: session.to_string(), at, fetched: None }),
        }
        self.outside.sort_by(|a, b| b.at.cmp(&a.at));
        self.outside.truncate(KEPT);
        self.dirty = true;
    }

    /// The pages named in what a session said at the end of its turn.
    pub fn said(&mut self, text: &str, session: &str, at: u64, more_hosts: &[&str]) {
        for (url, title) in page_links(text, more_hosts) {
            match self.pages.iter_mut().find(|p| p.url == url) {
                Some(p) => (p.session, p.at) = (session.to_string(), at),
                None => self.pages.push(Page { url, title, session: session.to_string(), at }),
            }
            self.dirty = true;
        }
        self.pages.sort_by(|a, b| b.at.cmp(&a.at));
        self.pages.truncate(KEPT);
    }

    pub fn has_file(&self, path: &str) -> bool {
        self.outside.iter().any(|o| o.path == path)
    }

    pub fn forget(&mut self, key: &str) {
        let before = self.outside.len() + self.pages.len();
        self.outside.retain(|o| o.path != key);
        self.pages.retain(|p| p.url != key);
        self.dirty |= before != self.outside.len() + self.pages.len();
    }

    /// Copies a file left outside into the scratch folder; the original stays where it is.
    /// The copy's project-relative path.
    pub fn fetch(&mut self, project: &Project, path: &str) -> Result<String, String> {
        let found = self.outside.iter_mut().find(|o| o.path == path).ok_or_else(|| format!("{path}: not a file left outside"))?;
        let from = PathBuf::from(path);
        if !from.is_file() {
            return Err(format!("{path}: no longer there"));
        }
        let dir = project.root.join(crate::scratch::DIR);
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let to = free_name(&dir, from.file_name().map_or_else(|| "file".into(), |n| n.to_string_lossy()).as_ref());
        std::fs::copy(&from, &to).map_err(|e| format!("{}: {e}", to.display()))?;
        let relative = project.relative(&to).ok_or("the copy is outside the project")?;
        found.fetched = Some(relative.clone());
        self.dirty = true;
        Ok(relative)
    }

    /// What the interface shows: files only while they are there, newest first.
    pub fn view(&self) -> FoundView {
        let outside = self
            .outside
            .iter()
            .filter_map(|o| {
                let meta = std::fs::metadata(&o.path).ok().filter(|m| m.is_file())?;
                let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64);
                Some(OutsideFile { found: o.clone(), size: meta.len(), modified })
            })
            .collect();
        FoundView { outside, pages: self.pages.clone() }
    }
}

/// Whether a written file is one left outside the project at `root`.
pub fn left_outside(root: &Path, file: &Path) -> bool {
    file.is_absolute()
        && !file.starts_with(root)
        && !["/dev", "/proc", "/sys"].iter().any(|d| file.starts_with(d))
        && !in_a_repository(file)
}

/// Inside a git working tree: some folder above it holds `.git`.
fn in_a_repository(file: &Path) -> bool {
    file.ancestors().skip(1).any(|dir| dir.join(".git").exists())
}

/// `name`, or `name-2`, `name-3`, … before the extension, whichever is free in `dir`.
fn free_name(dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (1..)
        .map(|n| if n == 1 { dir.join(name) } else { dir.join(format!("{stem}-{n}{ext}")) })
        .find(|p| !p.exists())
        .expect("some name is free")
}

/// The addresses of published pages in a text, with a title for each: the link's text in
/// Markdown, else the words on its line.
pub fn page_links(text: &str, more_hosts: &[&str]) -> Vec<(String, String)> {
    let mut found: Vec<(String, String)> = Vec::new();
    for line in text.lines() {
        let mut rest = line;
        while let Some(start) = rest.find("https://") {
            let tail = &rest[start..];
            let end = tail.find(|c: char| c.is_whitespace() || ")]>\"'`<".contains(c)).unwrap_or(tail.len());
            let url = tail[..end].trim_end_matches(['.', ',', ';', ':', '!', '?']);
            let host = url["https://".len()..].split(['/', '?', '#']).next().unwrap_or_default();
            let publishes = PAGE_HOSTS.iter().chain(more_hosts).any(|h| host == *h || host.ends_with(&format!(".{h}")));
            // An address with a path only: the host alone is no page
            if publishes && url.len() > "https://".len() + host.len() + 1 && !found.iter().any(|(u, _)| u == url) {
                found.push((url.to_string(), title_of(line, &rest[..start], url)));
            }
            rest = &tail[end..];
        }
    }
    found
}

fn title_of(line: &str, before: &str, url: &str) -> String {
    // [title](url)
    if let Some(label) = before.strip_suffix("](").and_then(|b| b.rfind('[').map(|i| &b[i + 1..])) {
        if !label.trim().is_empty() {
            return label.trim().to_string();
        }
    }
    // The words leading up to it ("The mock-up: https://…"), else the line without it
    let clean = |text: &str| {
        let words: String = text.chars().filter(|c| !"*_`[]()<>#".contains(*c)).collect();
        let words = words.split_whitespace().collect::<Vec<_>>().join(" ");
        words.trim_matches(|c: char| ":-·,;".contains(c) || c.is_whitespace()).chars().take(100).collect::<String>()
    };
    let lead = clean(before);
    if !lead.is_empty() {
        return lead;
    }
    let rest = clean(&line.replace(url, " "));
    if rest.is_empty() { url["https://".len()..].to_string() } else { rest }
}

type Stored = HashMap<String, Found>;

fn file() -> Option<PathBuf> {
    crate::config::file("findings.json")
}

fn read(file: &Path) -> Stored {
    std::fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

pub fn load(root: &Path) -> Found {
    file().map(|f| read(&f).remove(root.to_string_lossy().as_ref()).unwrap_or_default()).unwrap_or_default()
}

/// Writes the project's findings down if they changed; other projects' stay as they are.
pub fn save(root: &Path, found: &mut Found, now: u64) {
    let Some(file) = file().filter(|_| found.dirty) else { return };
    // Read again: another window may have written its project meanwhile
    let mut stored = read(&file);
    found.outside.retain(|o| o.at + KEPT_MS > now);
    found.pages.retain(|p| p.at + KEPT_MS > now);
    stored.insert(root.to_string_lossy().into_owned(), Found { outside: found.outside.clone(), pages: found.pages.clone(), dirty: false });
    stored.retain(|_, f| !f.outside.is_empty() || !f.pages.is_empty());
    if let Ok(text) = serde_json::to_vec_pretty(&stored) {
        // A failed write only costs the findings after the next restart
        if crate::config::write(&file, &text).is_ok() {
            found.dirty = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_published_pages_with_a_title_and_skips_other_links() {
        let text = "Done. The mock-up is published: [Rate limit dashboard](https://pages.example/artifact/abc123).\n\
                    See https://docs.rs/serde for the API.\n\
                    Gist with the script: https://gist.github.com/me/42, and again https://gist.github.com/me/42.";
        let links = page_links(text, &["pages.example"]);
        assert_eq!(
            links,
            [
                ("https://pages.example/artifact/abc123".to_string(), "Rate limit dashboard".to_string()),
                ("https://gist.github.com/me/42".to_string(), "Gist with the script".to_string()),
            ]
        );
        // The host alone is no page
        assert!(page_links("https://gist.github.com/", &[]).is_empty());
    }

    #[test]
    fn a_file_counts_as_left_outside_only_away_from_projects_and_repositories() {
        let tmp = std::env::temp_dir().join(format!("codedeck-findings-{}", std::process::id()));
        let repo = tmp.join("other");
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        let root = tmp.join("project");
        assert!(left_outside(&root, &tmp.join("draft.md")));
        assert!(!left_outside(&root, &root.join("src/a.rs")));
        assert!(!left_outside(&root, &repo.join("notes.md")));
        assert!(!left_outside(&root, Path::new("/dev/null")));
        assert!(!left_outside(&root, Path::new("relative.txt")));
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn a_fetched_file_lands_in_the_scratch_folder_under_a_free_name() {
        let tmp = std::env::temp_dir().join(format!("codedeck-fetch-{}", std::process::id()));
        let root = tmp.join("project");
        std::fs::create_dir_all(root.join(".scratch")).unwrap();
        std::fs::write(root.join(".scratch/plan.md"), "older").unwrap();
        let outside = tmp.join("plan.md");
        std::fs::write(&outside, "new plan").unwrap();
        let project = Project::open(&root).unwrap();
        let mut found = Found::default();
        found.wrote(&outside, "s1", 10);
        let copy = found.fetch(&project, &outside.to_string_lossy()).unwrap();
        assert_eq!(copy, ".scratch/plan-2.md");
        assert_eq!(std::fs::read_to_string(root.join(&copy)).unwrap(), "new plan");
        assert!(outside.exists(), "the original stays");
        assert_eq!(found.view().outside[0].found.fetched.as_deref(), Some(".scratch/plan-2.md"));
        // Written again: the copy is no longer up to date
        found.wrote(&outside, "s1", 20);
        assert_eq!(found.view().outside[0].found.fetched, None);
        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
