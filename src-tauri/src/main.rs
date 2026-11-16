// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    match std::env::args_os().nth(1).as_deref().and_then(|a| a.to_str()) {
        // `codeck hook`: run by a coding tool's hooks, passes the event to the open windows
        Some("hook") => {
            let args: Vec<String> = std::env::args().skip(2).collect();
            std::process::exit(codedeck_lib::hook::forward(&args));
        }
        Some("--version" | "-V") => println!("codeck {VERSION} · be spex"),
        Some("--help" | "-h") => print!(
            "CodeDeck – AI session radar for Linux · be spex

Usage:
  codeck [DIR]     open DIR in a window (default: the current directory)
  codeck hook      what a coding tool's hooks run; CodeDeck sets this up itself
  codeck --version
  codeck --help

https://github.com/bespex/CodeDeck
"
        ),
        _ => codedeck_lib::run(),
    }
}
