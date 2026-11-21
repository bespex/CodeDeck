//! Which program views and which edits a file, in `~/.config/codedeck/apps.json`.
//!
//! The desktop knows only one default program per file type. CodeDeck keeps two choices of its
//! own, for viewing and for editing, per file kind: `*.md` by extension, or the whole name for
//! files without one (`Makefile`, `.gitignore`). Without a choice the system's default is used.
//! The programs on offer are those installed for the file type (`.desktop` files via GIO).

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

use gio::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    View,
    Edit,
}

/// The stored choices: file kind → desktop file id, e.g. `"*.md" → "typora.desktop"`.
#[derive(Serialize, Deserialize, Default)]
struct Stored {
    #[serde(default)]
    view: BTreeMap<String, String>,
    #[serde(default)]
    edit: BTreeMap<String, String>,
}

impl Stored {
    fn load() -> Self {
        crate::config::file("apps.json")
            .and_then(|file| fs::read(file).ok())
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn of(&mut self, role: Role) -> &mut BTreeMap<String, String> {
        match role {
            Role::View => &mut self.view,
            Role::Edit => &mut self.edit,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct App {
    /// Desktop file id, e.g. `org.gnome.TextEditor.desktop`
    id: String,
    name: String,
    /// Claims exactly this type, not just a broader one such as `text/plain` (see [`for_file`])
    recommended: bool,
    /// Chosen in CodeDeck before, for any kind of file
    used: bool,
}

impl App {
    fn of(info: &gio::AppInfo) -> Option<App> {
        Some(App { id: info.id()?.to_string(), name: info.display_name().to_string(), recommended: false, used: false })
    }
}

/// The program for one role and whether the user chose it (else it is the system's default).
#[derive(Serialize)]
pub struct Pick {
    app: Option<App>,
    chosen: bool,
}

#[derive(Serialize)]
pub struct FileApps {
    /// The file kind a choice is remembered for, e.g. `*.md`
    kind: String,
    /// MIME type, e.g. `text/markdown`
    mime: String,
    /// The system's default for the type
    system: Option<App>,
    view: Pick,
    edit: Pick,
    /// Every program installed for the type, the system's default first
    candidates: Vec<App>,
}

/// `*.md` for `README.MD`, the whole name for `Makefile` or `.gitignore`.
fn kind_of(path: &Path) -> String {
    match path.extension() {
        Some(ext) => format!("*.{}", ext.to_string_lossy().to_lowercase()),
        None => path.file_name().map_or_else(String::new, |n| n.to_string_lossy().into_owned()),
    }
}

/// From the content where the name says little, as the file manager does.
fn mime_of(path: &Path) -> String {
    gio::File::for_path(path)
        .query_info("standard::content-type", gio::FileQueryInfoFlags::NONE, gio::Cancellable::NONE)
        .ok()
        .and_then(|info| info.content_type())
        .map(|t| t.to_string())
        .unwrap_or_else(|| gio::content_type_guess(Some(path), &[]).0.to_string())
}

/// The viewers of be spex (Qiew): program, desktop entry, the file endings each one is made for.
/// Preferred for viewing where no program was chosen, and driven through their common command line
/// (`--reuse`, `--line`, `--geometry`, Qiew's `crates/frame/src/launch.rs`); they stay programs of
/// their own (docs/QIEW.md).
const QIEW: &[(&str, &str, &[&str])] = &[
    ("marq", "Marq.desktop", &["md", "markdown"]),
    ("jayq", "Jayq.desktop", &["json"]),
    ("xaq", "Xaq.desktop", &["xml", "xsd", "xsl", "xslt"]),
    ("hyqe", "Hyqe.desktop", &["html", "htm"]),
    ("cusq", "Cusq.desktop", &["csv", "tsv"]),
    ("dirq", "Dirq.desktop", &["diff", "patch"]),
    ("maiqe", "Maiqe.desktop", &["mmd", "mermaid"]),
    ("trisq", "Trisq.desktop", &["tsx", "jsx"]),
];

/// The be spex viewer made for this file, if it is installed.
fn qiew_app(path: &Path) -> Option<gio::AppInfo> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let (program, desktop, _) = QIEW.iter().find(|(_, _, exts)| exts.contains(&ext.as_str()))?;
    viewer(program)?;
    gio::DesktopAppInfo::new(desktop).map(|app| app.upcast())
}

/// The program of a be spex viewer, if the app is one: it is started with the options then.
/// Also its name, for the options only one viewer understands.
fn qiew_program(app: &gio::AppInfo) -> Option<(&'static str, std::path::PathBuf)> {
    let id = app.id()?;
    let (program, ..) = QIEW.iter().find(|(_, desktop, _)| *desktop == id.as_str())?;
    Some((program, viewer(program)?))
}

/// The options a be spex viewer gets beyond `how`: Marq may write comments on the blocks of a
/// project file (`<!-- @ai: … -->`, `--annotate`, for this file only); CodeDeck finds the `@ai`
/// ones as hints (`markers.rs`). Text shown from standard input never gets it (`pipe_to`).
fn own_options(program: &str) -> &'static [&'static str] {
    match program {
        "marq" => &["--annotate"],
        _ => &[],
    }
}

/// How a viewer of be spex opens a file: one window reused while stepping through files, at a
/// line, over a place of CodeDeck's window (physical pixels). Other programs get only the file.
#[derive(Default)]
pub struct Launch {
    pub line: Option<u32>,
    /// `WxH+X+Y`
    pub geometry: Option<String>,
}

fn system_default(mime: &str) -> Option<gio::AppInfo> {
    gio::AppInfo::default_for_type(mime, false)
}

/// A stored choice, as long as the program is still installed.
fn chosen(stored: &mut Stored, role: Role, kind: &str) -> Option<gio::AppInfo> {
    let id = stored.of(role).get(kind)?;
    gio::DesktopAppInfo::new(id).map(|app| app.upcast())
}

pub fn for_file(path: &Path) -> FileApps {
    let kind = kind_of(path);
    let mime = mime_of(path);
    let system = system_default(&mime);
    let mut stored = Stored::load();
    // Viewing: where nothing was chosen, the be spex viewer for the type comes before the system's
    let qiew = qiew_app(path);
    let pick = |stored: &mut Stored, role| match chosen(stored, role, &kind) {
        Some(app) => Pick { app: App::of(&app), chosen: true },
        None if role == Role::View && qiew.is_some() => Pick { app: qiew.as_ref().and_then(App::of), chosen: false },
        None => Pick { app: system.as_ref().and_then(App::of), chosen: false },
    };
    let view = pick(&mut stored, Role::View);
    let edit = pick(&mut stored, Role::Edit);

    // All programs for a source file include every text editor, browser and e-book reader that
    // takes `text/plain`; the recommended ones registered for the type itself are the short list
    let recommended: HashSet<String> =
        gio::AppInfo::recommended_for_type(&mime).iter().filter_map(|app| app.id()).map(|id| id.to_string()).collect();
    // The be spex viewer for the type first, recommended (the Qiew README: CodeDeck prefers them)
    let mut candidates: Vec<App> = qiew.iter().chain(system.iter()).chain(&gio::AppInfo::all_for_type(&mime)).filter_map(App::of).collect();
    let mut seen = HashSet::new();
    candidates.retain(|app| seen.insert(app.id.clone()));
    let used: HashSet<&String> = stored.view.values().chain(stored.edit.values()).collect();
    candidates.iter_mut().for_each(|app| {
        app.recommended = recommended.contains(&app.id) || QIEW.iter().any(|(_, desktop, _)| *desktop == app.id);
        app.used = used.contains(&app.id);
    });

    FileApps { kind, mime, system: system.as_ref().and_then(App::of), view, edit, candidates }
}

/// Remembers a program for this kind of file, or forgets the choice (`None`: system default).
pub fn choose(path: &Path, role: Role, app: Option<String>) -> Result<(), String> {
    let file = crate::config::file("apps.json").ok_or("no config directory")?;
    let kind = kind_of(path);
    let mut stored = Stored::load();
    match app {
        Some(id) => {
            gio::DesktopAppInfo::new(&id).ok_or_else(|| format!("{id}: not installed"))?;
            stored.of(role).insert(kind, id)
        }
        None => stored.of(role).remove(&kind),
    };
    crate::config::write(&file, &serde_json::to_vec_pretty(&stored).map_err(|e| e.to_string())?)
}

/// Opens the file in the program for the role: the chosen one, for viewing else the be spex viewer
/// for the type, else the system's default. A be spex viewer is started with `how`. `Ok(false)`:
/// there is none, the caller falls back to the plain opener.
pub fn open(path: &Path, role: Role, how: &Launch) -> Result<bool, String> {
    let app = chosen(&mut Stored::load(), role, &kind_of(path))
        .or_else(|| if role == Role::View { qiew_app(path) } else { None })
        .or_else(|| system_default(&mime_of(path)));
    let Some(app) = app else { return Ok(false) };
    if let Some((name, program)) = qiew_program(&app) {
        let mut command = std::process::Command::new(program);
        command.arg(path).arg("--reuse").args(own_options(name));
        if let Some(line) = how.line {
            command.args(["--line", &line.to_string()]);
        }
        if let Some(geometry) = &how.geometry {
            command.args(["--geometry", geometry]);
        }
        return detach(command).map(|_| true);
    }
    app.launch(&[gio::File::for_path(path)], gio::AppLaunchContext::NONE)
        .map(|_| true)
        .map_err(|e| format!("{}: {e}", app.display_name()))
}



/// A viewer of be spex (part of Qiew), if installed: the program found on the `PATH`.
fn viewer(program: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(program)).find(|p| p.is_file())
}

/// The diff viewer (Dirq), if installed.
pub fn diff_viewer() -> Option<std::path::PathBuf> {
    viewer("dirq")
}

/// The Markdown viewer (Marq), if installed.
pub fn markdown_viewer() -> Option<std::path::PathBuf> {
    viewer("marq")
}

/// Shows a patch in Dirq: `dirq - --reuse`, the patch on its standard input. One window is
/// reused while stepping through points; it lives on when CodeDeck closes.
pub fn show_patch(text: &str) -> Result<(), String> {
    let dirq = diff_viewer().ok_or("Dirq is not installed (it is part of Qiew: sudo apt install dirq)")?;
    pipe_to(&dirq, text)
}

/// Shows Markdown text as a page in Marq, the same way: one window, reused.
pub fn show_markdown(text: &str) -> Result<(), String> {
    let marq = markdown_viewer().ok_or("Marq is not installed (it is part of Qiew: sudo apt install marq)")?;
    pipe_to(&marq, text)
}

/// Starts a program that lives on by itself (a desktop app, a terminal) and returns at once.
/// Nothing ties it to CodeDeck: no inherited pipes, and a session of its own without a controlling
/// terminal. Started from a terminal, a child in CodeDeck's process group that touches that terminal
/// stops the whole group, CodeDeck's window with it; a process group of its own is not enough: as a
/// background group of the same session it is stopped itself (Claude Desktop asks a login shell for
/// its environment at start and froze before showing a window). A child writing to inherited pipes
/// nobody reads would block. A thread waits for it, so it leaves no `<defunct>` entry behind.
pub fn detach(mut command: std::process::Command) -> Result<(), String> {
    use std::process::Stdio;
    let program = command.get_program().to_string_lossy().into_owned();
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = own_session(&mut command).spawn().map_err(|e| format!("{program}: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Lets the child start a session of its own: no controlling terminal, so nothing it does to a
/// terminal can stop it or CodeDeck (see [`detach`]).
fn own_session(command: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::unix::process::CommandExt;
    // SAFETY: between fork and exec only setsid runs, which is async-signal-safe
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        })
    }
}

/// Starts `<viewer> - --reuse` with the text on its standard input.
fn pipe_to(viewer: &Path, text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut command = std::process::Command::new(viewer);
    command.args(["-", "--reuse"]).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    let mut child = own_session(&mut command)
        .spawn()
        .map_err(|e| format!("{}: {e}", viewer.display()))?;
    let mut stdin = child.stdin.take().ok_or_else(|| format!("{}: no input", viewer.display()))?;
    let text = text.to_string();
    // Writing may block until the viewer reads; the window must not wait for that
    std::thread::spawn(move || {
        let _ = stdin.write_all(text.as_bytes());
        drop(stdin);
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_marq_may_annotate_and_only_the_file_opened() {
        assert_eq!(own_options("marq"), ["--annotate"]);
        for other in ["jayq", "xaq", "hyqe", "cusq", "dirq", "maiqe", "trisq"] {
            assert!(own_options(other).is_empty(), "{other}");
        }
    }

    #[test]
    fn a_detached_program_is_tied_to_nothing() {
        let dir = std::env::temp_dir().join(format!("codedeck-detach-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let out = dir.join("out");
        // What the child sees: its input, its error output (its standard output goes to the file),
        // whether it leads a session of its own, and whether it still has a terminal to be stopped by
        let mut command = std::process::Command::new("sh");
        command.arg("-c").arg(r#"{ readlink /proc/self/fd/0; readlink /proc/$$/fd/2; [ "$(ps -o sid= -p $$ | tr -d ' ')" = "$$" ] && echo own; ps -o tty= -p $$; } > "$0.tmp"; mv "$0.tmp" "$0""#).arg(&out);
        detach(command).unwrap();
        let until = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !out.exists() && std::time::Instant::now() < until {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let seen = fs::read_to_string(&out).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(seen.lines().map(str::trim).collect::<Vec<_>>(), ["/dev/null", "/dev/null", "own", "?"]);
    }

    #[test]
    fn a_missing_program_says_so() {
        let error = detach(std::process::Command::new("codedeck-no-such-program")).unwrap_err();
        assert!(error.starts_with("codedeck-no-such-program: "), "{error}");
    }
}
