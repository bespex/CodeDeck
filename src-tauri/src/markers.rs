//! Comment markers for the assistant in documents and code: a line that begins with `@ai`, or
//! with a comment that begins with it (`<!-- @ai …`, `// @ai …`, `# @ai …`, …). One writes them
//! in an outside editor; CodeDeck finds them and hands them to the assistant as a task. Found
//! with `git grep`, so ignored files stay out.
//!
//! The marker must begin the line (only blanks before it) so that text *about* markers (code,
//! tests, documentation quoting the spelling) is not taken for one; examples in fenced Markdown
//! code blocks do not count either. No per-project exceptions to maintain.
//!
//! In Markdown, an HTML comment may also stand in a list item or a quote (`- <!-- @ai: … -->`,
//! `> <!-- @ai: … -->`): that is where Marq puts a comment on such a block (Qiew, Marq started
//! with `--annotate`). Such a comment may span lines; its whole text is read from the file.

use std::path::Path;

use serde::Serialize;

use crate::git::{Git, Report};
use crate::project::Project;

/// A first cut for `git grep`: blanks, maybe some punctuation (also the quote and list markers of
/// Markdown before a comment: `> - <!--`, `1. <!--`), then `@ai`. [`marker_text`] decides.
const PATTERN: &str = r"^[[:space:]]*(([0-9]{1,9}[.)]|[^[:alnum:][:space:]]+)[[:space:]]*){0,6}@[aA][iI]";
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
            in_markdown(&mut found, &repo.top);
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
            let text = if markdown(path) { markdown_marker_text(content) } else { marker_text(content) };
            Some(Marker { path: path.to_string(), line: line.parse().ok()?, text: text? })
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

fn markdown(path: &str) -> bool {
    [".md", ".markdown", ".mdx"].iter().any(|e| path.to_ascii_lowercase().ends_with(e))
}

/// In Markdown, the quote and list markers in front of an HTML comment belong to the document, not
/// to the comment (Marq writes `- <!-- @ai: … -->` for a list item). Anything else in front still
/// makes the line no marker: `- @ai` is a list item that begins with the word.
fn markdown_marker_text(line: &str) -> Option<String> {
    let inner = strip_containers(line);
    marker_text(if inner.starts_with("<!--") { inner } else { line })
}

/// The line without leading quote markers (`>`) and list markers (`-`, `*`, `+`, `1.`, `1)`).
fn strip_containers(line: &str) -> &str {
    let mut rest = line.trim_start();
    loop {
        let next = if let Some(r) = rest.strip_prefix('>') {
            r
        } else if let Some(r) = rest.strip_prefix(['-', '*', '+']).filter(|r| r.starts_with([' ', '\t'])) {
            r
        } else {
            let digits = rest.len() - rest.trim_start_matches(|c: char| c.is_ascii_digit()).len();
            match rest[digits..].strip_prefix(['.', ')']) {
                Some(r) if (1..=9).contains(&digits) && r.starts_with([' ', '\t']) => r,
                _ => return rest,
            }
        };
        rest = next.trim_start();
    }
}

/// Markdown files are read once more: markers inside fenced code blocks are examples, not notes
/// (dropped), and an HTML comment that goes on over further lines gets its whole text.
fn in_markdown(found: &mut Vec<Marker>, top: &Path) {
    let mut files: Vec<String> = found.iter().filter(|m| markdown(&m.path)).map(|m| m.path.clone()).collect();
    files.dedup();
    for file in files {
        let Ok(text) = std::fs::read_to_string(top.join(&file)) else { continue };
        let fenced = fenced_lines(&text);
        found.retain(|m| m.path != file || !fenced.contains(&m.line));
        let lines: Vec<&str> = text.lines().collect();
        for m in found.iter_mut().filter(|m| m.path == file) {
            if let Some(whole) = comment_text(&lines, m.line as usize) {
                m.text = whole;
            }
        }
    }
}

/// The text of a comment marker that does not end on its line (`<!-- @ai: first line` … `-->`),
/// joined into one line; `None` if it ends there or never does (within a few lines).
fn comment_text(lines: &[&str], line: usize) -> Option<String> {
    let first = strip_containers(lines.get(line.checked_sub(1)?)?);
    if !first.starts_with("<!--") || first.contains("-->") {
        return None;
    }
    let mut text = marker_text(first)?;
    for next in lines.iter().skip(line).take(20) {
        let next = next.trim_start().trim_start_matches(|c: char| c == '>' || c.is_whitespace());
        let (part, end) = match next.find("-->") {
            Some(i) => (&next[..i], true),
            None => (next, false),
        };
        let part = part.trim();
        if !part.is_empty() {
            if text == "(no text)" {
                text.clear();
            } else {
                text.push(' ');
            }
            text.push_str(part);
        }
        if end {
            return Some(text);
        }
    }
    None
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
    fn in_markdown_a_comment_may_stand_in_a_list_item_or_a_quote() {
        let yes = [
            ("- <!-- @ai: on the item -->", "on the item"),
            ("  * <!-- @ai: nested -->", "nested"),
            ("12. <!-- @ai: numbered -->", "numbered"),
            ("3) <!-- @ai: numbered too -->", "numbered too"),
            ("> <!-- @ai: in a quote -->", "in a quote"),
            ("> > - <!-- @ai: deep -->", "deep"),
            ("<!-- @ai: plain -->", "plain"),
            ("@ai bare", "bare"),
        ];
        for (line, text) in yes {
            assert_eq!(markdown_marker_text(line).as_deref(), Some(text), "{line}");
        }
        let no = [
            "- @ai a list item with a dash",
            "> @ai: a quote that begins with the word",
            "- text <!-- @ai: after text -->",
            "-<!-- @ai: no space after the marker -->",
            "<!-- @ai#erledigt: done, Marq's ticked comment -->",
            "- <!-- @me: a note to oneself -->",
        ];
        for line in no {
            assert_eq!(markdown_marker_text(line), None, "{line}");
        }
        // Elsewhere list markers are no comment openers: a YAML list stays as it was.
        assert_eq!(marker_text("- <!-- @ai: in yaml -->"), None);
    }

    #[test]
    fn the_pattern_finds_what_marker_text_takes() {
        let re = |line: &str| {
            std::process::Command::new("grep")
                .args(["-E", "-q", "-e", PATTERN])
                .stdin(std::process::Stdio::piped())
                .spawn()
                .and_then(|mut c| {
                    use std::io::Write;
                    c.stdin.take().unwrap().write_all(format!("{line}\n").as_bytes())?;
                    c.wait()
                })
                .is_ok_and(|s| s.success())
        };
        for line in ["- <!-- @ai: x -->", "> > - <!-- @ai: x -->", "12. <!-- @ai: x -->", "<!-- @ai: x -->", "@ai x", "  // @ai x"] {
            assert!(re(line), "{line}");
        }
    }

    #[test]
    fn a_comment_over_several_lines_gives_its_whole_text() {
        let text = "Intro\n\n<!-- @ai: Mehrzeiliger\n     Kommentar -->\n\n- <!-- @ai: im Eintrag\n  zweite Zeile -->\n  Eintrag\n\n> <!-- @ai: im Zitat\n> weiter -->\n\n<!-- @ai: eine Zeile -->\n";
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(comment_text(&lines, 3).as_deref(), Some("Mehrzeiliger Kommentar"));
        assert_eq!(comment_text(&lines, 6).as_deref(), Some("im Eintrag zweite Zeile"));
        assert_eq!(comment_text(&lines, 10).as_deref(), Some("im Zitat weiter"));
        assert_eq!(comment_text(&lines, 13), None, "ends on its line: grep's text stands");
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
        in_markdown(&mut found, &dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(found.iter().map(|m| (m.path.as_str(), m.line)).collect::<Vec<_>>(), [("a.md", 1), ("a.md", 9), ("b.txt", 4)]);
    }
}
