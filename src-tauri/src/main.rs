// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `codedeck hook`: run by a coding tool's hooks, passes the event to the open windows
    if std::env::args_os().nth(1).is_some_and(|a| a == "hook") {
        let args: Vec<String> = std::env::args().skip(2).collect();
        std::process::exit(codedeck_lib::hook::forward(&args));
    }
    codedeck_lib::run()
}
