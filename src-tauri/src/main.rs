// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    match std::env::args_os().nth(1).as_deref().and_then(|a| a.to_str()) {
        // `codedeck hook`: run by a coding tool's hooks, passes the event to the open windows
        Some("hook") => {
            let args: Vec<String> = std::env::args().skip(2).collect();
            std::process::exit(codedeck_lib::hook::forward(&args));
        }
        // `codedeck statusline`: run as a coding tool's status line, hands the usage to the open windows
        Some("statusline") => {
            let args: Vec<String> = std::env::args().skip(2).collect();
            std::process::exit(codedeck_lib::hook::statusline(&args));
        }
        Some("--version" | "-V") => println!("codedeck {VERSION} · be spex"),
        Some("--help" | "-h") => print!(
            "CodeDeck – AI session radar for Linux · be spex
Your co-deck for AI sessions.

Usage:
  codedeck [DIR]       open DIR in a window (default: the current directory);
                       a running CodeDeck opens it in a new window
  codedeck --tray      start in the tray without a window (what the login start runs)
  codedeck hook        what a coding tool's hooks run; CodeDeck sets this up itself
  codedeck statusline  what a coding tool's status line runs to tell the usage; set up on request
  codedeck --version
  codedeck --help

`codeck` is the same program under its earlier name.

https://github.com/bespex/CodeDeck
"
        ),
        _ => codedeck_lib::run(),
    }
}
