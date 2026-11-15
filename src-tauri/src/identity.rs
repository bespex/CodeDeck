//! What tells sessions apart wherever they show up: a colour and a short name each, and the
//! title the user gave. Kept per project in `~/.config/codedeck/sessions.json`, so a session
//! looks the same after a restart and its snapshots keep their colour when it is long over.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Colours in the interface's palette for sessions; an identity holds an index into it.
pub const COLORS: u8 = 6;
/// A short name has to fit a small badge.
const SHORT_MAX: usize = 4;
/// Sessions not heard of for this long are forgotten (milliseconds).
const KEPT_MS: u64 = 30 * 24 * 3600 * 1000;
/// How often at most the time a session was last heard of is written down (milliseconds).
const SEEN_STEP_MS: u64 = 3600 * 1000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Identity {
    pub color: u8,
    pub short: String,
    /// The title the user gave in CodeDeck; goes before the tool's
    #[serde(default)]
    pub name: Option<String>,
    /// The tool's title as last known, for when the session is no longer listed
    #[serde(default)]
    pub title: Option<String>,
    /// Taken off the list by the user; it comes back when the session reports again
    #[serde(default)]
    pub hidden: bool,
    /// Unix milliseconds: first and last heard of
    pub first: u64,
    pub seen: u64,
}

impl Identity {
    /// The title to show: the user's, else the tool's.
    pub fn shown_title(&self) -> Option<String> {
        self.name.clone().or_else(|| self.title.clone())
    }
}

/// A session listed right now, as far as it matters for giving the next one its identity.
pub struct Listed<'a> {
    pub color: u8,
    pub short: &'a str,
    pub active: bool,
}

/// The identities of one project's sessions.
#[derive(Serialize, Deserialize, Default, Debug)]
pub struct Identities {
    /// Counts the short names given, so they go on through the alphabet over the days
    #[serde(default)]
    next: u32,
    #[serde(default)]
    sessions: HashMap<String, Identity>,
    /// Changed since it was read or written
    #[serde(skip)]
    pub dirty: bool,
}

impl Identities {
    pub fn get(&self, id: &str) -> Option<&Identity> {
        self.sessions.get(id)
    }

    pub fn all(&self) -> impl Iterator<Item = (&String, &Identity)> {
        self.sessions.iter()
    }

    /// The session's identity; a new one gets the colour fewest active sessions have and the
    /// next letter no listed session has.
    pub fn of(&mut self, id: &str, now: u64, listed: &[Listed]) -> Identity {
        if let Some(known) = self.sessions.get(id) {
            return known.clone();
        }
        let mut uses = [0usize; COLORS as usize];
        for l in listed.iter().filter(|l| l.active) {
            uses[usize::from(l.color % COLORS)] += 1;
        }
        let color = (0..COLORS).min_by_key(|c| uses[usize::from(*c)]).unwrap_or(0);
        let mut short = letter(self.next);
        for _ in 0..26 {
            short = letter(self.next);
            self.next = self.next.wrapping_add(1);
            if !listed.iter().any(|l| l.short == short) {
                break;
            }
        }
        let identity = Identity { color, short, name: None, title: None, hidden: false, first: now, seen: now };
        self.sessions.insert(id.to_string(), identity.clone());
        self.dirty = true;
        identity
    }

    /// Notes that the session was heard of; written down only now and then.
    pub fn touch(&mut self, id: &str, now: u64) {
        if let Some(i) = self.sessions.get_mut(id).filter(|i| now > i.seen + SEEN_STEP_MS) {
            i.seen = now;
            self.dirty = true;
        }
    }

    /// Takes the session off the list of its project, or puts it back.
    pub fn hide(&mut self, id: &str, hidden: bool) {
        if let Some(i) = self.sessions.get_mut(id).filter(|i| i.hidden != hidden) {
            i.hidden = hidden;
            self.dirty = true;
        }
    }

    /// Remembers the tool's title for the session.
    pub fn set_title(&mut self, id: &str, title: Option<&str>) {
        if let Some(i) = self.sessions.get_mut(id).filter(|i| title.is_some() && i.title.as_deref() != title) {
            i.title = title.map(String::from);
            self.dirty = true;
        }
    }

    /// The user's title (`None` or empty: the tool's again) and short name (`None` or empty:
    /// as it is).
    pub fn rename(&mut self, id: &str, name: Option<&str>, short: Option<&str>) -> Option<&Identity> {
        let i = self.sessions.get_mut(id)?;
        i.name = name.map(str::trim).filter(|n| !n.is_empty()).map(String::from);
        if let Some(short) = short.map(str::trim).filter(|s| !s.is_empty()) {
            i.short = short.chars().take(SHORT_MAX).collect();
        }
        self.dirty = true;
        Some(i)
    }
}

fn letter(n: u32) -> String {
    char::from(b'A' + (n % 26) as u8).to_string()
}

/// The identities of the project at `root`; none when nothing was kept or the file is unreadable.
pub fn load(root: &Path) -> Identities {
    crate::config::file("sessions.json").map(|file| load_from(&file, root)).unwrap_or_default()
}

/// Writes the project's identities down if they changed; other projects' stay as they are.
pub fn save(root: &Path, identities: &mut Identities, now: u64) {
    if let Some(file) = crate::config::file("sessions.json").filter(|_| identities.dirty) {
        // A failed write only costs the colours after the next restart
        let _ = save_to(&file, root, identities, now);
    }
}

type Stored = HashMap<String, Identities>;

fn read(file: &Path) -> Stored {
    std::fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

fn load_from(file: &Path, root: &Path) -> Identities {
    read(file).remove(root.to_string_lossy().as_ref()).unwrap_or_default()
}

fn save_to(file: &Path, root: &Path, identities: &mut Identities, now: u64) -> Result<(), String> {
    // Read again: another window may have written its project meanwhile
    let mut stored = read(file);
    let ours = Identities { next: identities.next, sessions: identities.sessions.clone(), dirty: false };
    stored.insert(root.to_string_lossy().into_owned(), ours);
    for project in stored.values_mut() {
        project.sessions.retain(|_, i| i.seen + KEPT_MS > now);
    }
    stored.retain(|_, project| !project.sessions.is_empty());
    let text = serde_json::to_vec_pretty(&stored).map_err(|e| e.to_string())?;
    crate::config::write(file, &text)?;
    identities.dirty = false;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gives_each_session_a_colour_and_a_letter_and_keeps_them() {
        let mut ids = Identities::default();
        let a = ids.of("s1", 10, &[]);
        let b = ids.of("s2", 20, &[Listed { color: a.color, short: &a.short, active: true }]);
        assert_eq!((a.color, a.short.as_str(), a.first), (0, "A", 10));
        assert_eq!((b.color, b.short.as_str()), (1, "B"));
        // Asked again: the same, whatever is listed
        assert_eq!(ids.of("s1", 99, &[]), a);
        assert!(ids.dirty);
    }

    #[test]
    fn reuses_the_colour_fewest_active_sessions_have_and_skips_letters_in_use() {
        let mut ids = Identities { next: 25, ..Default::default() };
        let at = |color: u8, short: &'static str, active: bool| Listed { color, short, active };
        // Colours 0, 1 and 3 to 5 are worn by active sessions, 2 by an ended one only; "Z" and "A" are taken
        let list = [at(0, "Z", true), at(1, "A", true), at(2, "Q", false), at(3, "R", true), at(4, "S", true), at(5, "T", true)];
        let i = ids.of("new", 1, &list);
        assert_eq!((i.color, i.short.as_str()), (2, "B"));
    }

    #[test]
    fn renames_and_goes_back_to_the_tools_title() {
        let mut ids = Identities::default();
        ids.of("s1", 1, &[]);
        ids.set_title("s1", Some("Rate limiter fix"));
        assert_eq!(ids.get("s1").unwrap().shown_title().as_deref(), Some("Rate limiter fix"));
        ids.rename("s1", Some("  Limiter  "), Some("limiter"));
        let i = ids.get("s1").unwrap();
        assert_eq!((i.shown_title().as_deref(), i.short.as_str()), (Some("Limiter"), "limi"));
        ids.rename("s1", Some(""), None);
        let i = ids.get("s1").unwrap();
        assert_eq!((i.shown_title().as_deref(), i.short.as_str()), (Some("Rate limiter fix"), "limi"));
        assert!(ids.rename("unknown", None, None).is_none());
    }

    #[test]
    fn survives_a_restart_per_project_and_forgets_old_sessions() {
        let file = std::env::temp_dir().join(format!("codedeck-identity-test-{}/sessions.json", std::process::id()));
        let _ = std::fs::remove_dir_all(file.parent().unwrap());
        let (p, q) = (Path::new("/p"), Path::new("/q"));
        let now = KEPT_MS + 1000;

        let mut ids = Identities::default();
        ids.of("old", 500, &[]);
        ids.of("s1", now, &[]);
        ids.rename("s1", Some("Mine"), Some("API"));
        save_to(&file, p, &mut ids, now).unwrap();
        let mut other = Identities::default();
        other.of("s9", now, &[]);
        save_to(&file, q, &mut other, now).unwrap();

        let back = load_from(&file, p);
        assert!(!ids.dirty && !back.dirty);
        assert_eq!(back.get("s1"), ids.get("s1"));
        assert_eq!(back.get("s1").map(|i| (i.short.as_str(), i.name.as_deref())), Some(("API", Some("Mine"))));
        // Not heard of for a month: gone; the counter of names goes on
        assert!(back.get("old").is_none() && back.next == 2);
        assert!(load_from(&file, q).get("s9").is_some() && load_from(&file, Path::new("/r")).get("s1").is_none());
        std::fs::remove_dir_all(file.parent().unwrap()).unwrap();
    }
}
