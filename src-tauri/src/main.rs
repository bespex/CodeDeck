// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `codedeck hook`: run by Claude Code's hooks, passes the event to the open windows
    if std::env::args_os().nth(1).is_some_and(|a| a == "hook") {
        std::process::exit(codedeck_lib::hook::forward());
    }
    codedeck_lib::run()
}
