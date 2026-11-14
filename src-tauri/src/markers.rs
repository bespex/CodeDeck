//! Comment markers for the assistant in documents: `<!-- @ai: … -->` (Markdown, HTML) and
//! `[!AI: …]` (any text). One writes them in an outside editor; CodeDeck finds them and hands
//! them to the assistant as a task. Found with `git grep`, so ignored files stay out.

use serde::Serialize;

use crate::git::{Git, Report};
use crate::project::Project;

const PATTERNS: [&str; 2] = [r"<!--[[:space:]]*@ai:", r"\[!AI:"];
/// More than this is a sign of something else than notes for the assistant.
const LIMIT: usize = 500;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    /// Project-relative
    path: String,
    line: u32,
    /// What it says, without the marker syntax
    text: String,
}

impl Git {
    /// Every marker in the project's repositories, tracked and untracked files alike.
    pub fn markers(&self, report: Report, project: &Project) -> Vec<Marker> {
        let mut all = Vec::new();
        for repo in self.repos(project) {
            let mut args = vec!["grep", "-n", "-I", "--untracked", "--null", "--no-color", "-E"];
            for p in &PATTERNS {
                args.extend(["-e", p]);
            }
            if !repo.prefix.is_empty() {
                args.extend(["--", repo.prefix.as_str()]);
            }
            // Finding nothing is exit code 1, which counts as failure: no markers then
            let Ok(out) = self.run(report, &repo, &args) else { continue };
            for m in parse(&String::from_utf8_lossy(&out)) {
                let path = if repo.prefix.is_empty() {
                    if repo.path.is_empty() { m.path } else { format!("{}/{}", repo.path, m.path) }
                } else {
                    m.path.strip_prefix(&format!("{}/", repo.prefix)).unwrap_or(&m.path).to_string()
                };
                all.push(Marker { path, ..m });
            }
            if all.len() >= LIMIT {
                all.truncate(LIMIT);
                break;
            }
        }
        all
    }
}

/// `git grep -n --null`: `path\0line\0content` per line.
fn parse(out: &str) -> Vec<Marker> {
    out.lines()
        .filter_map(|l| {
            let mut f = l.splitn(3, '\0');
            let (path, line, content) = (f.next()?, f.next()?, f.next()?);
            Some(Marker { path: path.to_string(), line: line.parse().ok()?, text: marker_text(content)? })
        })
        .collect()
}

fn marker_text(line: &str) -> Option<String> {
    // ASCII only, so byte positions stay the same
    let lower = line.to_ascii_lowercase();
    let (start, end) = if let Some(i) = lower.find("@ai:") {
        (i + 4, line[i..].find("-->").map(|j| i + j))
    } else {
        let i = line.find("[!AI:")?;
        (i + 5, line[i..].find(']').map(|j| i + j))
    };
    let text = line[start..end.unwrap_or(line.len())].trim();
    Some(if text.is_empty() { "(no text)".to_string() } else { text.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_both_forms() {
        let out = "docs/plan.md\x0012\x00Intro <!-- @ai: shorten this --> rest\n\
                   notes.txt\x003\x00[!AI: add an example] and more\n\
                   a.md\x001\x00<!--@AI:open end\n";
        let m = parse(out);
        assert_eq!(m[0], Marker { path: "docs/plan.md".into(), line: 12, text: "shorten this".into() });
        assert_eq!(m[1].text, "add an example");
        assert_eq!(m[2].text, "open end");
    }
}
