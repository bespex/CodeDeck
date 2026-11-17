//! Comment markers for the assistant in documents and code: a line that begins with `@ai`, or
//! with a comment that begins with it (`<!-- @ai …`, `// @ai …`, `# @ai …`, …). One writes them
//! in an outside editor; CodeDeck finds them and hands them to the assistant as a task. Found
//! with `git grep`, so ignored files stay out.
//!
//! The marker must begin the line (only blanks before it) so that text *about* markers (code,
//! tests, documentation quoting the spelling) is not taken for one; examples in fenced Markdown
//! code blocks do not count either. No per-project exceptions to maintain.

use std::path::Path;

use serde::Serialize;

use crate::git::{Git, Report};
use crate::project::Project;

/// A first cut for `git grep`: blanks, maybe some punctuation, then `@ai`. [`marker_text`] decides.
const PATTERN: &str = r"^[[:space:]]*([^[:alnum:][:space:]]+[[:space:]]*)?@[aA][iI]";
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
            let mut args = vec!["grep", "-n", "-I", "--untracked", "--null", "--no-color", "-E", "-e", PATTERN];
            if !repo.prefix.is_empty() {
                args.extend(["--", repo.prefix.as_str()]);
            }
            // Finding nothing is exit code 1: an answer, no failure in the log
            let Some(out) = self.ask(report, &repo, &args) else { continue };
            let mut found = parse(&String::from_utf8_lossy(&out));
            drop_fenced(&mut found, &repo.top);
            for m in found {
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

/// `git grep -n --null`: `path\0line\0content` per line; only real markers are kept.
fn parse(out: &str) -> Vec<Marker> {
    out.lines()
        .filter_map(|l| {
            let mut f = l.splitn(3, '\0');
            let (path, line, content) = (f.next()?, f.next()?, f.next()?);
            Some(Marker { path: path.to_string(), line: line.parse().ok()?, text: marker_text(content)? })
        })
        .collect()
}

/// Comment openers a marker may follow, with what closes such a comment on the same line.
const OPENERS: &[(&str, Option<&str>)] = &[
    ("<!--", Some("-->")),
    ("/*", Some("*/")),
    ("//", None),
    ("*", Some("*/")), // the next line of a block comment
    ("#", None),
    ("--", None),
    (";", None),
    ("%", None),
];

/// What a marker line says; `None` if the line is no marker.
fn marker_text(line: &str) -> Option<String> {
    let mut rest = line.trim_start();
    let mut closer = None;
    if let Some((opener, close)) = OPENERS.iter().find(|(o, _)| rest.starts_with(o)) {
        rest = &rest[opener.len()..];
        // `///`, `##`, `/**`: the same comment, written longer
        let last = opener.chars().last().expect("not empty");
        rest = rest.trim_start_matches(last);
        closer = *close;
    }
    let rest = rest.trim_start();
    if !rest.get(..3).is_some_and(|m| m.eq_ignore_ascii_case("@ai")) {
        return None;
    }
    let rest = &rest[3..];
    // Only blanks, a colon or nothing may follow: `@aim`, `@ai_x` are other words, and `@ai.tool`,
    // `@ai(…)` decorators of a module called `ai`
    if rest.chars().next().is_some_and(|c| !c.is_whitespace() && c != ':') {
        return None;
    }
    let rest = rest.strip_prefix(':').unwrap_or(rest);
    let text = closer.and_then(|c| rest.find(c)).map_or(rest, |i| &rest[..i]).trim();
    Some(if text.is_empty() { "(no text)".to_string() } else { text.to_string() })
}

/// Markers inside fenced code blocks of Markdown files are examples, not notes: dropped.
fn drop_fenced(found: &mut Vec<Marker>, top: &Path) {
    let markdown = |p: &str| [".md", ".markdown", ".mdx"].iter().any(|e| p.to_ascii_lowercase().ends_with(e));
    let mut files: Vec<String> = found.iter().filter(|m| markdown(&m.path)).map(|m| m.path.clone()).collect();
    files.dedup();
    for file in files {
        let Ok(text) = std::fs::read_to_string(top.join(&file)) else { continue };
        let fenced = fenced_lines(&text);
        found.retain(|m| m.path != file || !fenced.contains(&m.line));
    }
}

/// Numbers (from 1) of the lines inside ``` or ~~~ fences, the fences included.
fn fenced_lines(text: &str) -> Vec<u32> {
    let mut lines = Vec::new();
    let mut open: Option<&str> = None;
    for (i, line) in text.lines().enumerate() {
        let n = i as u32 + 1;
        let t = line.trim_start();
        match open {
            Some(fence) => {
                lines.push(n);
                if t.starts_with(fence) {
                    open = None;
                }
            }
            None => {
                if let Some(fence) = ["```", "~~~"].into_iter().find(|f| t.starts_with(f)) {
                    lines.push(n);
                    open = Some(fence);
                }
            }
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_marker_begins_the_line_or_its_comment() {
        let yes = [
            ("@ai shorten this", "shorten this"),
            ("   @AI: add an example", "add an example"),
            ("<!-- @ai: shorten this --> rest", "shorten this"),
            ("<!--@ai open end", "open end"),
            ("// @ai: name it better", "name it better"),
            ("/// @ai doc comment", "doc comment"),
            ("/* @ai: in a block */ code", "in a block"),
            ("/** @ai javadoc", "javadoc"),
            (" * @ai next line of a block", "next line of a block"),
            ("# @ai: python or a heading", "python or a heading"),
            ("## @ai heading", "heading"),
            ("-- @ai sql", "sql"),
            ("; @ai lisp", "lisp"),
            ("% @ai latex", "latex"),
            ("@ai", "(no text)"),
            ("@ai:", "(no text)"),
        ];
        for (line, text) in yes {
            assert_eq!(marker_text(line).as_deref(), Some(text), "{line}");
        }
        let no = [
            "Intro <!-- @ai: not at the start -->",
            "code(); // @ai: after code",
            "\"<!-- @ai: in a string\"",
            "`@ai` in prose",
            "[!AI: the old form]",
            "@aim higher",
            "@ai_x",
            "@ai.tool",
            "@ai(name=\"x\")",
            "# @ai.route(\"/\")",
            "@ai-generated",
            "- @ai a list item with a dash",
            "email@ai.example",
        ];
        for line in no {
            assert_eq!(marker_text(line), None, "{line}");
        }
    }

    #[test]
    fn reads_grep_output_and_skips_what_is_no_marker() {
        let out = "docs/plan.md\x0012\x00<!-- @ai: shorten this --> rest\n\
                   src/a.rs\x003\x00    let s = \"// @ai: in code\";\n\
                   notes.txt\x001\x00@ai: open end\n";
        let m = parse(out);
        assert_eq!(m.len(), 2);
        assert_eq!(m[0], Marker { path: "docs/plan.md".into(), line: 12, text: "shorten this".into() });
        assert_eq!((m[1].path.as_str(), m[1].text.as_str()), ("notes.txt", "open end"));
    }

    #[test]
    fn examples_in_fenced_blocks_do_not_count() {
        let text = "@ai real\n\n```markdown\n<!-- @ai: example -->\n```\n~~~\n@ai also an example\n~~~\n@ai real again\n";
        assert_eq!(fenced_lines(text), [3, 4, 5, 6, 7, 8]);
        let dir = std::env::temp_dir().join(format!("codedeck-markers-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), text).unwrap();
        let mut found = parse("a.md\x001\x00@ai real\na.md\x004\x00<!-- @ai: example -->\na.md\x009\x00@ai real again\nb.txt\x004\x00@ai other file\n");
        drop_fenced(&mut found, &dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(found.iter().map(|m| (m.path.as_str(), m.line)).collect::<Vec<_>>(), [("a.md", 1), ("a.md", 9), ("b.txt", 4)]);
    }
}
