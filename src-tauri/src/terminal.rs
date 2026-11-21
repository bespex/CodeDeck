//! Which terminal program opens a session, and how it is told what to run (docs/SITZUNGEN-PRUEFUNG.md
//! K4). `x-terminal-emulator` exists only in the Debian family, and each terminal takes its command
//! in its own form (`-e`, `--`, `-x`, or none at all), so CodeDeck looks for one, in this order:
//! `$TERMINAL`, `xdg-terminal-exec` (the freedesktop way), `x-terminal-emulator`, then known
//! programs, those of the running desktop first. Without one the terminal door is not offered
//! (`crate::platform`).

use std::path::Path;
use std::process::Command;

/// How a terminal program takes the command it runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Form {
    /// `term -e cmd args…`
    DashE,
    /// `term -x cmd args…`
    DashX,
    /// `term -- cmd args…`
    DoubleDash,
    /// `term cmd args…`
    Plain,
    /// `wezterm start -- cmd args…`
    Start,
}

/// Known terminals and their form. For `$TERMINAL` the form comes from here too; an unknown one
/// gets `-e`, which most terminals understand.
const KNOWN: &[(&str, Form)] = &[
    ("konsole", Form::DashE),
    ("gnome-terminal", Form::DoubleDash),
    ("kgx", Form::DoubleDash),
    ("ptyxis", Form::DoubleDash),
    ("xfce4-terminal", Form::DashX),
    ("mate-terminal", Form::DashX),
    ("terminator", Form::DashX),
    ("tilix", Form::DashE),
    ("kitty", Form::Plain),
    ("foot", Form::Plain),
    ("alacritty", Form::DashE),
    ("ghostty", Form::DashE),
    ("wezterm", Form::Start),
    ("xterm", Form::DashE),
    ("xdg-terminal-exec", Form::Plain),
    ("x-terminal-emulator", Form::DashE),
];

/// The desktop's own terminals, tried before the others: on KDE Konsole, not whatever comes first.
fn of_desktop(desktop: &str) -> &'static [&'static str] {
    let desktop = desktop.to_ascii_lowercase();
    if desktop.contains("kde") {
        &["konsole"]
    } else if desktop.contains("gnome") || desktop.contains("unity") {
        &["kgx", "ptyxis", "gnome-terminal"]
    } else if desktop.contains("cinnamon") {
        &["gnome-terminal"]
    } else if desktop.contains("xfce") {
        &["xfce4-terminal"]
    } else if desktop.contains("mate") {
        &["mate-terminal"]
    } else {
        &[]
    }
}

/// The terminal CodeDeck found: its program and how it takes a command.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Terminal {
    /// As found: a name on the PATH or the path `$TERMINAL` gave
    pub program: String,
    form: Form,
}

impl Terminal {
    /// A command that opens a new terminal window running `argv`.
    pub fn command(&self, argv: &[&str]) -> Command {
        let mut command = Command::new(&self.program);
        match self.form {
            Form::DashE => command.arg("-e"),
            Form::DashX => command.arg("-x"),
            Form::DoubleDash => command.arg("--"),
            Form::Plain => &mut command,
            Form::Start => command.args(["start", "--"]),
        };
        command.args(argv);
        command
    }

    #[cfg(test)]
    pub fn for_tests(program: &str) -> Self {
        Terminal { program: program.into(), form: form_of(program) }
    }

    /// The program's name, without its folder: what the user is shown.
    pub fn name(&self) -> String {
        Path::new(&self.program).file_name().map_or_else(|| self.program.clone(), |n| n.to_string_lossy().into_owned())
    }
}

fn form_of(program: &str) -> Form {
    let name = Path::new(program).file_name().map_or(program.into(), |n| n.to_string_lossy());
    KNOWN.iter().find(|(known, _)| *known == name).map_or(Form::DashE, |(_, form)| *form)
}

/// Looks for a terminal: `terminal_var` is `$TERMINAL`, `desktop` is `$XDG_CURRENT_DESKTOP`,
/// `exists` says whether a program can be run. Apart from the environment, so tests can ask.
fn find(terminal_var: Option<&str>, desktop: &str, exists: impl Fn(&str) -> bool) -> Option<Terminal> {
    // `$TERMINAL` may carry arguments ("kitty --single-instance"): only its program is used
    let wanted = terminal_var.and_then(|v| v.split_whitespace().next()).filter(|p| exists(p));
    let fixed = ["xdg-terminal-exec", "x-terminal-emulator"];
    let rest = KNOWN.iter().map(|(name, _)| *name).filter(|name| !fixed.contains(name));
    let program = wanted
        .into_iter()
        .chain(fixed)
        .chain(of_desktop(desktop).iter().copied())
        .chain(rest)
        .find(|p| exists(p))?;
    Some(Terminal { program: program.to_string(), form: form_of(program) })
}

/// Whether a program can be run: a path to an executable file, or a name found on the PATH.
pub fn on_path(program: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;
    let runnable = |p: &Path| p.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0);
    if program.contains('/') {
        return runnable(Path::new(program));
    }
    std::env::var_os("PATH").is_some_and(|path| std::env::split_paths(&path).any(|dir| runnable(&dir.join(program))))
}

/// The terminal of this computer, looked for in its environment.
pub fn detect() -> Option<Terminal> {
    let var = std::env::var("TERMINAL").ok();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    find(var.as_deref(), &desktop, on_path)
}

/// Opens a new terminal window running `argv`, with the terminal found at the start.
pub fn open(argv: &[&str]) -> Result<(), String> {
    let terminal = crate::platform::get().terminal.as_ref().ok_or("no terminal program was found on this computer")?;
    crate::apps::detach(terminal.command(argv)).map_err(|e| format!("{} could not be started: {e}", terminal.name()))
}

/// Opens a terminal with the user's shell in `dir` (the file list's "Path → Open in terminal").
pub fn open_in(dir: &Path) -> Result<(), String> {
    let terminal = crate::platform::get().terminal.as_ref().ok_or("no terminal program was found on this computer")?;
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let mut command = terminal.command(&[&shell]);
    command.current_dir(dir);
    crate::apps::detach(command).map_err(|e| format!("{} could not be started: {e}", terminal.name()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(t: &Terminal) -> Vec<String> {
        t.command(&["tmux", "attach"]).get_args().map(|a| a.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn terminal_variable_comes_first() {
        let t = find(Some("kitty --single-instance"), "X-Cinnamon", |p| ["kitty", "x-terminal-emulator"].contains(&p)).unwrap();
        assert_eq!(t.program, "kitty");
        assert_eq!(args(&t), ["tmux", "attach"]);
    }

    #[test]
    fn a_terminal_variable_that_is_not_installed_is_passed_over() {
        let t = find(Some("kitty"), "", |p| p == "x-terminal-emulator").unwrap();
        assert_eq!(t.program, "x-terminal-emulator");
        assert_eq!(args(&t), ["-e", "tmux", "attach"]);
    }

    #[test]
    fn freedesktop_way_before_debian_alternative() {
        let t = find(None, "", |p| ["xdg-terminal-exec", "x-terminal-emulator"].contains(&p)).unwrap();
        assert_eq!(t.program, "xdg-terminal-exec");
        assert_eq!(args(&t), ["tmux", "attach"]);
    }

    #[test]
    fn the_desktops_own_terminal_before_others() {
        let installed = ["xterm", "konsole", "gnome-terminal"];
        let kde = find(None, "KDE", |p| installed.contains(&p)).unwrap();
        assert_eq!(kde.program, "konsole");
        let gnome = find(None, "ubuntu:GNOME", |p| installed.contains(&p)).unwrap();
        assert_eq!(gnome.program, "gnome-terminal");
        assert_eq!(args(&gnome), ["--", "tmux", "attach"]);
    }

    #[test]
    fn each_terminal_in_its_form() {
        let only = |name: &'static str| find(None, "", move |p| p == name).unwrap();
        assert_eq!(args(&only("xfce4-terminal"))[0], "-x");
        assert_eq!(args(&only("foot"))[0], "tmux");
        assert_eq!(args(&only("wezterm"))[..2], ["start", "--"]);
        assert_eq!(args(&only("xterm"))[0], "-e");
    }

    #[test]
    fn unknown_terminal_variable_gets_dash_e() {
        let t = find(Some("/opt/myterm/bin/myterm"), "", |p| p.starts_with("/opt")).unwrap();
        assert_eq!(t.name(), "myterm");
        assert_eq!(args(&t)[0], "-e");
    }

    #[test]
    fn none_found() {
        assert_eq!(find(Some("kitty"), "KDE", |_| false), None);
    }
}
