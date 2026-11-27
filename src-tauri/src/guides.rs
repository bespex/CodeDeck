//! Guide files (roadmap U8, docs/UMSETZUNG.md "U8 und U9"): the files that steer the work with the
//! AI and have a role of their own: standing instructions for the tool, the README, and the planning
//! files TODO, IDEAS and ROADMAP. Which names count is a machine setting (`guides` in settings.json,
//! one list of names per role), a project can name its own (`guides` in files.json, e.g. a roadmap
//! under another name), and the names of the instruction files come from the adapters, so no tool's
//! name is written here.
//!
//! A name without `/` counts in the project's top folder; for instructions in every folder, since
//! tools read those where they work. A name with `/` is a path from the top folder.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Instructions,
    Readme,
    Tasks,
    Ideas,
    Roadmap,
}

impl Role {
    pub const ALL: [Role; 5] = [Role::Instructions, Role::Readme, Role::Tasks, Role::Ideas, Role::Roadmap];

    fn key(self) -> &'static str {
        match self {
            Role::Instructions => "instructions",
            Role::Readme => "readme",
            Role::Tasks => "tasks",
            Role::Ideas => "ideas",
            Role::Roadmap => "roadmap",
        }
    }

    /// The names that count when nobody chose others.
    fn defaults(self) -> Vec<String> {
        let names: &[&str] = match self {
            // Tool-neutral; the adapters add their own
            Role::Instructions => &["AGENTS.md"],
            Role::Readme => &["README.md", "README"],
            Role::Tasks => &["TODO.md"],
            Role::Ideas => &["IDEAS.md"],
            Role::Roadmap => &["ROADMAP.md"],
        };
        names.iter().map(|n| n.to_string()).collect()
    }
}

/// A guide file found in the project.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Guide {
    /// Project-relative
    pub path: String,
    pub role: Role,
}

/// The names per role: the defaults, replaced per role by the machine setting and then by the
/// project's own choice. The instruction files the adapters name always count: a setting can add
/// names to them, not take the tool's own away.
pub fn names(machine: &serde_json::Value, project: &BTreeMap<String, Vec<String>>, tools: &[&str]) -> BTreeMap<Role, Vec<String>> {
    let list = |v: &serde_json::Value| -> Option<Vec<String>> {
        v.as_array().map(|a| a.iter().filter_map(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty()).map(String::from).collect())
    };
    Role::ALL
        .into_iter()
        .map(|role| {
            let mut names = project
                .get(role.key())
                .cloned()
                .or_else(|| machine.get(role.key()).and_then(list))
                .unwrap_or_else(|| role.defaults());
            if role == Role::Instructions {
                names.extend(tools.iter().map(|t| t.to_string()));
            }
            let mut seen = std::collections::HashSet::new();
            names.retain(|n| seen.insert(n.clone()));
            (role, names)
        })
        .collect()
}

/// Which of the project's files (project-relative, as `fileops::all_files` gives them) are guide
/// files: top folder first, in the order of the roles, then deeper instruction files. A file has one
/// role, the first that names it.
pub fn find(files: &[String], names: &BTreeMap<Role, Vec<String>>) -> Vec<Guide> {
    let mut found: Vec<Guide> = Vec::new();
    for path in files {
        // The scratch folder holds copies and drafts, never the real thing
        if path.starts_with(".scratch/") {
            continue;
        }
        let (dir, name) = path.rsplit_once('/').unwrap_or(("", path));
        let role = Role::ALL.into_iter().find(|role| {
            names[role].iter().any(|n| {
                if n.contains('/') {
                    n.trim_start_matches("./") == path
                } else {
                    // README, Readme.md: names of this kind are not written the same way everywhere
                    n.eq_ignore_ascii_case(name) && (dir.is_empty() || *role == Role::Instructions)
                }
            })
        });
        if let Some(role) = role {
            found.push(Guide { path: path.clone(), role });
        }
    }
    found.sort_by_key(|g| (g.path.contains('/'), g.role, g.path.clone()));
    found
}

/// The guide files of the project at `project`.
pub fn of(project: &crate::project::Project) -> Vec<Guide> {
    let machine = crate::config::machine_settings().get("guides").cloned().unwrap_or_default();
    let own = crate::filemarks::of(&project.root).guides;
    let tools: Vec<&str> = crate::harness::all().iter().flat_map(|h| h.instruction_files().iter().copied()).collect();
    find(&crate::fileops::all_files(project), &names(&machine, &own, &tools))
}

// ---------------------------------------------------------------------------------------------
// Reading the planning files (U8.3). Their form is fixed by the convention (stages `## M1: …` with
// `Status:`, steps `- [ ]`/`- [~]`/`- [x]`; TODO with "open points" and "planned tasks"; IDEAS one
// `## ` heading per idea), read leniently: what does not fit is left out, nothing fails.

/// Where an entry stands: open, being worked on, done.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum State {
    Open,
    Active,
    Done,
}

/// One line of a planning file: its text as a title (bold marks taken off) and where it is.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub text: String,
    /// From 1
    pub line: usize,
    pub state: State,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stage {
    /// What stands before the colon: `M3`, `MVP 3`, `U8`
    pub id: String,
    pub title: String,
    pub state: State,
    pub goal: Option<String>,
    pub line: usize,
    pub steps: Vec<Entry>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Roadmap {
    pub path: String,
    pub title: Option<String>,
    pub goal: Option<String>,
    pub as_of: Option<String>,
    pub stages: Vec<Stage>,
    /// Stages without a place yet ("Later")
    pub later: usize,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tasks {
    pub path: String,
    /// Open points: questions and decisions still to make
    pub questions: Vec<Entry>,
    /// Planned tasks
    pub tasks: Vec<Entry>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Ideas {
    pub path: String,
    pub ideas: Vec<Entry>,
}

/// What the planning files of a project say.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub roadmap: Option<Roadmap>,
    pub tasks: Option<Tasks>,
    pub ideas: Option<Ideas>,
}

/// `**Name** more` → `Name`; otherwise the line without Markdown's emphasis and code marks, shortened.
fn title_of(text: &str) -> String {
    let t = text.trim();
    if let Some(rest) = t.strip_prefix("**") {
        if let Some(end) = rest.find("**") {
            return rest[..end].trim().trim_end_matches(':').to_string();
        }
    }
    let plain = t.replace("**", "").replace('`', "");
    let mut out: String = plain.chars().take(400).collect();
    if plain.chars().count() > 400 {
        out.push('…');
    }
    out
}

/// A checkbox item at the start of a line (not indented): its state and text.
fn checkbox(line: &str) -> Option<(State, &str)> {
    let rest = line.strip_prefix("- [").or_else(|| line.strip_prefix("* ["))?;
    let mut chars = rest.chars();
    let mark = chars.next()?;
    let rest = chars.as_str().strip_prefix("] ")?;
    let state = match mark {
        ' ' => State::Open,
        '~' => State::Active,
        'x' | 'X' => State::Done,
        _ => return None,
    };
    Some((state, rest))
}

fn stage_state(word: &str) -> Option<State> {
    let w = word.trim().to_lowercase();
    if w.starts_with("erledigt") || w.starts_with("done") {
        Some(State::Done)
    } else if w.starts_with("in arbeit") || w.starts_with("in progress") || w.starts_with("active") {
        Some(State::Active)
    } else if w.starts_with("offen") || w.starts_with("open") {
        Some(State::Open)
    } else {
        None
    }
}

/// Reads a roadmap. A stage is a `## Id: Title` heading; "Später"/"Later" counts its list items.
pub fn read_roadmap(path: &str, text: &str) -> Roadmap {
    let mut map = Roadmap { path: path.to_string(), ..Default::default() };
    let mut in_later = false;
    let mut in_comment = false;
    for (i, raw) in text.lines().enumerate() {
        let line = raw.trim_end();
        // The legend in an HTML comment shows checkboxes as examples
        if in_comment || line.trim_start().starts_with("<!--") {
            in_comment = !line.contains("-->");
            continue;
        }
        if let Some(h) = line.strip_prefix("# ") {
            map.title = Some(h.trim().trim_start_matches("ROADMAP:").trim().to_string());
        } else if let Some(h) = line.strip_prefix("## ") {
            let h = h.trim();
            in_later = matches!(h.to_lowercase().as_str(), "später" | "later");
            if in_later {
                continue;
            }
            let (id, title) = h.split_once(':').map(|(a, b)| (a.trim(), b.trim())).unwrap_or(("", h));
            map.stages.push(Stage { id: id.to_string(), title: title_of(title), state: State::Open, goal: None, line: i + 1, steps: Vec::new() });
        } else if in_later {
            if line.starts_with("- ") {
                map.later += 1;
            }
        } else if let Some(stage) = map.stages.last_mut() {
            if let Some(v) = line.strip_prefix("Status:") {
                if let Some(state) = stage_state(v) {
                    stage.state = state;
                }
            } else if let Some(v) = line.strip_prefix("Ziel:").or_else(|| line.strip_prefix("Goal:")) {
                stage.goal = Some(v.trim().to_string());
            } else if let Some((state, rest)) = checkbox(line) {
                stage.steps.push(Entry { text: title_of(rest), line: i + 1, state });
            }
        } else if let Some(v) = line.strip_prefix("Ziel:").or_else(|| line.strip_prefix("Goal:")) {
            map.goal = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("Stand:").or_else(|| line.strip_prefix("As of:")) {
            map.as_of = Some(v.trim().to_string());
        }
    }
    map
}

/// Reads a TODO file: unchecked items under the heading of open points and of planned tasks (by
/// what the heading says; items before any heading count as tasks).
pub fn read_tasks(path: &str, text: &str) -> Tasks {
    let mut tasks = Tasks { path: path.to_string(), ..Default::default() };
    let mut questions = false;
    let mut in_comment = false;
    for (i, raw) in text.lines().enumerate() {
        let line = raw.trim_end();
        if in_comment || line.trim_start().starts_with("<!--") {
            in_comment = !line.contains("-->");
            continue;
        }
        if let Some(h) = line.strip_prefix("## ") {
            let h = h.to_lowercase();
            questions = h.contains("offen") || h.contains("open") || h.contains("prüf") || h.contains("question");
        } else if let Some((state, rest)) = checkbox(line) {
            if state == State::Done {
                continue;
            }
            let entry = Entry { text: title_of(rest), line: i + 1, state };
            if questions {
                tasks.questions.push(entry);
            } else {
                tasks.tasks.push(entry);
            }
        }
    }
    tasks
}

/// Reads an IDEAS file: one idea per `## ` heading.
pub fn read_ideas(path: &str, text: &str) -> Ideas {
    let ideas = text
        .lines()
        .enumerate()
        .filter_map(|(i, l)| l.strip_prefix("## ").map(|h| Entry { text: h.trim().to_string(), line: i + 1, state: State::Open }))
        .collect();
    Ideas { path: path.to_string(), ideas }
}

/// The plan of a project from its guide files: the first of each role in the top folder, else the first found.
pub fn plan_of(project: &crate::project::Project, guides: &[Guide]) -> Plan {
    let first = |role: Role| guides.iter().find(|g| g.role == role).map(|g| g.path.clone());
    let read = |path: &str| std::fs::read_to_string(project.root.join(path)).ok();
    Plan {
        roadmap: first(Role::Roadmap).and_then(|p| read(&p).map(|t| read_roadmap(&p, &t))),
        tasks: first(Role::Tasks).and_then(|p| read(&p).map(|t| read_tasks(&p, &t))),
        ideas: first(Role::Ideas).and_then(|p| read(&p).map(|t| read_ideas(&p, &t))),
    }
}

/// The plan in one line, for the project list (U8.3): the stage being worked on and what is open.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanLine {
    /// `M2 Limits per client`; `None` without a roadmap or with every stage done
    pub stage: Option<String>,
    pub questions: usize,
    pub tasks: usize,
    pub ideas: usize,
}

/// The text of the guide files in the top folder of `root` (no walk through the tree): to see whether
/// one of them names a scratch file, which then does not expire (U8.5).
pub fn top_texts(root: &std::path::Path) -> Vec<String> {
    let machine = crate::config::machine_settings().get("guides").cloned().unwrap_or_default();
    let own = crate::filemarks::of(root).guides;
    let tools: Vec<&str> = crate::harness::all().iter().flat_map(|h| h.instruction_files().iter().copied()).collect();
    let Ok(entries) = std::fs::read_dir(root) else { return Vec::new() };
    let mut files: Vec<String> = entries.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    files.extend(own.values().flatten().filter(|p| p.contains('/') && root.join(p).is_file()).cloned());
    find(&files, &names(&machine, &own, &tools)).iter().filter_map(|g| std::fs::read_to_string(root.join(&g.path)).ok()).collect()
}

/// The plan line of the project at `root`, cheap enough for every refresh of the list: only the
/// top folder is looked at (the project's own paths too), never the whole tree. `None` without any
/// planning file.
pub fn line_at(root: &std::path::Path) -> Option<PlanLine> {
    let machine = crate::config::machine_settings().get("guides").cloned().unwrap_or_default();
    let own = crate::filemarks::of(root).guides;
    let mut files: Vec<String> = std::fs::read_dir(root).ok()?.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    files.extend(own.values().flatten().filter(|p| p.contains('/') && root.join(p).is_file()).cloned());
    let names = names(&machine, &own, &[]);
    let found = find(&files, &names);
    let plan = plan_of(&crate::project::Project { root: root.to_path_buf() }, &found);
    if plan.roadmap.is_none() && plan.tasks.is_none() && plan.ideas.is_none() {
        return None;
    }
    let stage = plan.roadmap.as_ref().and_then(|r| r.stages.iter().find(|s| s.state == State::Active).or_else(|| r.stages.iter().find(|s| s.state == State::Open)));
    Some(PlanLine {
        stage: stage.map(|s| [s.id.as_str(), s.title.as_str()].iter().filter(|x| !x.is_empty()).copied().collect::<Vec<_>>().join(" ")),
        questions: plan.tasks.as_ref().map_or(0, |t| t.questions.len()),
        tasks: plan.tasks.as_ref().map_or(0, |t| t.tasks.len()),
        ideas: plan.ideas.as_ref().map_or(0, |i| i.ideas.len()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn files(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_guides_by_role_on_top_and_instructions_anywhere() {
        let names = names(&json!(null), &BTreeMap::new(), &["TOOL.md", ".tool/TOOL.md"]);
        let found = find(
            &files(&["Readme.md", "TODO.md", "docs/TODO.md", "src/TOOL.md", "TOOL.md", ".tool/TOOL.md", ".scratch/TOOL.md", "ROADMAP.md", "IDEAS.md", "main.rs"]),
            &names,
        );
        let got: Vec<(&str, Role)> = found.iter().map(|g| (g.path.as_str(), g.role)).collect();
        assert_eq!(
            got,
            vec![
                ("TOOL.md", Role::Instructions),
                ("Readme.md", Role::Readme),
                ("TODO.md", Role::Tasks),
                ("IDEAS.md", Role::Ideas),
                ("ROADMAP.md", Role::Roadmap),
                (".tool/TOOL.md", Role::Instructions),
                ("src/TOOL.md", Role::Instructions),
            ]
        );
    }

    #[test]
    fn the_machine_and_the_project_choose_names_but_not_the_tools() {
        let machine = json!({ "roadmap": ["PLAN.md"], "instructions": ["RULES.md"] });
        let mut own = BTreeMap::new();
        own.insert("tasks".to_string(), vec!["docs/tasks.md".to_string()]);
        let names = names(&machine, &own, &["TOOL.md"]);
        assert_eq!(names[&Role::Roadmap], vec!["PLAN.md"]);
        assert_eq!(names[&Role::Instructions], vec!["RULES.md", "TOOL.md"]);
        assert_eq!(names[&Role::Ideas], vec!["IDEAS.md"]);
        let found = find(&files(&["PLAN.md", "ROADMAP.md", "TODO.md", "docs/tasks.md", "TOOL.md"]), &names);
        let got: Vec<&str> = found.iter().map(|g| g.path.as_str()).collect();
        assert_eq!(got, vec!["TOOL.md", "PLAN.md", "docs/tasks.md"]);
    }

    #[test]
    fn reads_a_roadmap_by_the_convention() {
        let text = "# ROADMAP: Ship it\n\n<!-- Status: [ ] offen, [~] in Arbeit -->\n\nZiel: Out of the door\nStand: 2026-11-27\n\n## M1: Base\nStatus: erledigt\nZiel: Runs\n\n## M2: **More**\nStatus: in Arbeit\n\n- [x] One\n- [~] Two (in Arbeit: test)\n- [ ] **Three** and more\n  - [ ] not a step\n\nPrüfung: ok\n\n## Später\n- Far\n- Away\n";
        let map = read_roadmap("ROADMAP.md", text);
        assert_eq!(map.title.as_deref(), Some("Ship it"));
        assert_eq!(map.goal.as_deref(), Some("Out of the door"));
        assert_eq!(map.as_of.as_deref(), Some("2026-11-27"));
        assert_eq!(map.later, 2);
        assert_eq!(map.stages.len(), 2);
        assert_eq!((map.stages[0].id.as_str(), map.stages[0].state), ("M1", State::Done));
        let m2 = &map.stages[1];
        assert_eq!((m2.title.as_str(), m2.state, m2.line), ("More", State::Active, 12));
        let steps: Vec<(&str, State)> = m2.steps.iter().map(|s| (s.text.as_str(), s.state)).collect();
        assert_eq!(steps, vec![("One", State::Done), ("Two (in Arbeit: test)", State::Active), ("Three", State::Open)]);
    }

    #[test]
    fn reads_tasks_and_ideas() {
        let text = "# TODO\n\n## Offene Punkte & Prüfungen\n<!-- Fragen\n- [ ] example -->\n- [ ] **D13: Ask?** Long text\n- [x] Settled\n\n## Geplante Aufgaben & Anpassungen\n- [ ] Build it\n";
        let t = read_tasks("TODO.md", text);
        assert_eq!(t.questions.iter().map(|e| (e.text.as_str(), e.line)).collect::<Vec<_>>(), vec![("D13: Ask?", 6)]);
        assert_eq!(t.tasks.iter().map(|e| e.text.as_str()).collect::<Vec<_>>(), vec!["Build it"]);
        let i = read_ideas("IDEAS.md", "# IDEAS\n\n## One\ntext\n## Two\n");
        assert_eq!(i.ideas.iter().map(|e| (e.text.as_str(), e.line)).collect::<Vec<_>>(), vec![("One", 3), ("Two", 5)]);
    }
}
