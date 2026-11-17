//! How much of an account's allowance is used (step 2.4). The figures are the tool's: nothing is
//! estimated here. A tool states them to its status line (see `hook::statusline`), which hands
//! them to every window; they are kept per account, with when they were last seen, in
//! `~/.local/state/codedeck/usage.json` so that a restart does not forget them.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// One limit: the percentage used (it can pass 100) and when it starts over.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub used: f64,
    /// Unix seconds
    pub resets_at: u64,
}

/// What a tool stated for one account, as the adapter makes it neutral. A limit the tool did not
/// state is absent (it drops one once it has started over).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// The tool's account: for Claude Code its configuration folder
    pub account: String,
    pub five_hour: Option<Window>,
    pub seven_day: Option<Window>,
}

/// A message on a window's socket: the figures of one account.
#[derive(Serialize, Deserialize)]
pub struct Message {
    pub usage: Usage,
}

/// The figures of one account as they were last seen.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    #[serde(flatten)]
    pub usage: Usage,
    /// Unix milliseconds
    pub seen: u64,
}

/// Every account's last figures.
#[derive(Default)]
pub struct Store {
    accounts: HashMap<String, Seen>,
    /// Where it is kept; `None`: nowhere
    file: Option<PathBuf>,
}

impl Store {
    /// What an earlier window left; empty if nothing is there or it is unreadable.
    pub fn load() -> Self {
        Self::at(file())
    }

    fn at(file: Option<PathBuf>) -> Self {
        let accounts = file
            .as_ref()
            .and_then(|f| std::fs::read_to_string(f).ok())
            .and_then(|t| serde_json::from_str::<Vec<Seen>>(&t).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|s| (s.usage.account.clone(), s))
            .collect();
        Self { accounts, file }
    }

    /// Takes in what a tool stated. Returns whether anything differs from before (the time it
    /// was seen alone does not count): only then is it worth telling the interface and the disk.
    pub fn take(&mut self, usage: Usage, now: u64) -> bool {
        let changed = self.accounts.get(&usage.account).is_none_or(|s| s.usage != usage);
        match self.accounts.get_mut(&usage.account) {
            Some(seen) if !changed => seen.seen = now,
            _ => {
                self.accounts.insert(usage.account.clone(), Seen { usage, seen: now });
            }
        }
        if changed {
            self.save();
        }
        changed
    }

    /// In the order of the accounts' names, so that the list does not jump about.
    pub fn list(&self) -> Vec<Seen> {
        let mut all: Vec<Seen> = self.accounts.values().cloned().collect();
        all.sort_by(|a, b| a.usage.account.cmp(&b.usage.account));
        all
    }

    fn save(&self) {
        let Some(file) = &self.file else { return };
        let Ok(text) = serde_json::to_string(&self.list()) else { return };
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Replaced in one go: another window may write at the same time
        let tmp = file.with_extension(format!("json.{}", std::process::id()));
        if std::fs::write(&tmp, text).is_ok() {
            let _ = std::fs::rename(&tmp, file);
        }
    }
}

fn file() -> Option<PathBuf> {
    Some(crate::journal::state_dir()?.join("usage.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage(used: f64) -> Usage {
        Usage { account: "/h/.claude".into(), five_hour: Some(Window { used, resets_at: 100 }), seven_day: None }
    }

    #[test]
    fn tells_only_what_changed() {
        let tmp = std::env::temp_dir().join(format!("codedeck-usage-{}", std::process::id()));
        let file = tmp.join("usage.json");
        let mut store = Store::at(Some(file.clone()));
        assert!(store.take(usage(10.0), 1), "the first figures are news");
        assert!(!store.take(usage(10.0), 2), "the same again is not");
        assert_eq!(store.list()[0].seen, 2, "but it was seen again");
        assert!(store.take(usage(12.5), 3));
        // What was saved comes back
        assert_eq!(Store::at(Some(file)).list(), store.list());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
