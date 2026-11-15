//! CodeDeck backend.
//!
//! The project directory, its file list and a file watcher. Each window is its own process with
//! its own project; several can run side by side. Git for every repository in it, and a socket
//! through which coding tools report what they do (see [`harness`]).

mod apps;
mod bridge;
mod config;
mod git;
mod harness;
mod history;
pub mod hook;
mod identity;
mod markers;
mod project;
mod recent;
mod rules;
mod snapshot;
mod watch;
mod workbench;

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use tauri_plugin_opener::OpenerExt;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use apps::{FileApps, Role};
use bridge::{AssistantState, Bridge};
use harness::Connection;
use markers::Marker;
use snapshot::Snapshot;
use git::{ActionResult, Git, GitRun, RepoStatus};
use history::{Patch, RepoLog};
use project::{Entry, PathStats, Project, ProjectInfo};
use recent::RecentProject;
use watch::Watch;

/// The project this window shows. It can be switched; holders of the old one keep a valid copy.
pub struct Current(RwLock<Arc<Project>>);

impl Current {
    pub fn get(&self) -> Arc<Project> {
        self.0.read().unwrap().clone()
    }
}

/// Window title, so that several CodeDeck windows can be told apart in the task bar.
fn set_title(app: &AppHandle, project: &Project) {
    if let Some(window) = app.get_webview_window("main") {
        let name = project.root.file_name().map_or_else(|| "/".into(), |n| n.to_string_lossy());
        let _ = window.set_title(&format!("{name} – CodeDeck"));
    }
}

#[tauri::command]
fn project_info(current: State<Arc<Current>>) -> ProjectInfo {
    current.get().info()
}

/// Lists one directory and keeps watching it from now on.
#[tauri::command]
fn read_dir(path: &str, current: State<Arc<Current>>, watch: State<Watch>) -> Result<Vec<Entry>, String> {
    let project = current.get();
    let entries = project.read_dir(path)?;
    watch.add(&project.resolve(path)?);
    Ok(entries)
}

#[tauri::command]
fn path_stats(path: &str, current: State<Arc<Current>>) -> Result<PathStats, String> {
    current.get().stats(path)
}

/// Opens a file of the project in its default program, a folder in the default file manager.
#[tauri::command]
fn open_path(path: &str, app: AppHandle, current: State<Arc<Current>>) -> Result<(), String> {
    let full = current.get().resolve(path)?;
    app.opener().open_path(full.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Opens a file of the project in its program for viewing or editing: the one chosen in CodeDeck,
/// else the system's default for the type.
#[tauri::command]
fn open_file(path: &str, role: Role, app: AppHandle, current: State<Arc<Current>>) -> Result<(), String> {
    let full = current.get().resolve(path)?;
    if apps::open(&full, role)? {
        return Ok(());
    }
    app.opener().open_path(full.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// The programs for viewing and editing a file, and every program installed for its type.
#[tauri::command]
fn file_apps(path: &str, current: State<Arc<Current>>) -> Result<FileApps, String> {
    Ok(apps::for_file(&current.get().resolve(path)?))
}

/// Remembers a program for viewing or editing this kind of file; `None` goes back to the system's.
#[tauri::command]
fn choose_file_app(path: &str, role: Role, app: Option<String>, current: State<Arc<Current>>) -> Result<(), String> {
    apps::choose(&current.get().resolve(path)?, role, app)
}

/// Shows a file in the default file manager, selected in its folder; a folder is opened itself.
#[tauri::command]
fn show_in_file_manager(path: &str, app: AppHandle, current: State<Arc<Current>>) -> Result<(), String> {
    let full = current.get().resolve(path)?;
    let opener = app.opener();
    if full.is_dir() {
        opener.open_path(full.to_string_lossy(), None::<&str>)
    } else {
        opener.reveal_item_in_dir(&full)
    }
    .map_err(|e| e.to_string())
}

/// Switches this window to another directory.
#[tauri::command]
fn open_project(
    path: &str,
    app: AppHandle,
    current: State<Arc<Current>>,
    watch: State<Watch>,
    bridge: State<Arc<Bridge>>,
) -> Result<ProjectInfo, String> {
    let project = Arc::new(Project::open(Path::new(path))?);
    *current.0.write().unwrap() = project.clone();
    watch.clear();
    bridge.clear(&app);
    recent::remember(&project.root);
    set_title(&app, &project);
    exclude_workbench(&app);
    Ok(project.info())
}

/// Git leaves the workbench of the current project alone (once per repository, in the background).
fn exclude_workbench(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let project = app.state::<Arc<Current>>().get();
        let report = |run: &GitRun| {
            let _ = app.emit(GIT_RAN, run);
        };
        app.state::<Git>().exclude_workbench(&report, &project);
    });
}

/// The files in the workbench, newest first; its folders are watched from now on, so a new
/// file shows up at once.
#[tauri::command]
fn workbench_list(current: State<Arc<Current>>, watch: State<Watch>) -> Vec<workbench::WorkFile> {
    let (files, dirs) = workbench::list(&current.get());
    dirs.iter().for_each(|d| watch.add(d));
    files
}

/// Moves files of the workbench to the trash.
#[tauri::command]
fn workbench_trash(paths: Vec<String>, current: State<Arc<Current>>) -> Result<(), String> {
    workbench::trash(&current.get(), &paths)
}

/// Moves a file of the workbench into the project; the new project-relative path.
#[tauri::command]
fn workbench_move(from: String, to: String, current: State<Arc<Current>>) -> Result<String, String> {
    workbench::move_into(&current.get(), &from, &to)
}

/// Opens a directory in a new CodeDeck window: a separate process that lives on its own.
#[tauri::command]
fn open_window(path: &str) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("{path}: not a directory"));
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new(exe)
        .arg(dir)
        // Own process group: closing this window or its terminal does not take the new one along
        .process_group(0)
        .spawn()
        .map(drop)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn recent_projects(current: State<Arc<Current>>) -> Vec<RecentProject> {
    recent::list(&current.get().root)
}

/// The system's folder dialog, starting next to the current project. `None` when cancelled.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    let current = app.state::<Arc<Current>>().get();
    let start = current.root.parent().map_or_else(|| current.root.clone(), PathBuf::from);
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Open project")
            .set_directory(start)
            .blocking_pick_folder()
            .and_then(|picked| picked.into_path().ok())
            .map(|path| path.display().to_string())
    })
    .await
    .ok()
    .flatten()
}

/// Status of every repository in the project; `rescan` looks for repositories again.
/// Runs off the main thread: `git status` in a large repo takes a moment.
#[tauri::command]
async fn git_status(rescan: bool, app: AppHandle) -> Result<Vec<RepoStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = app.state::<Arc<Current>>().get();
        let report = |run: &GitRun| {
            let _ = app.emit(GIT_RAN, run);
        };
        let (statuses, git_dirs) = app.state::<Git>().status(&report, &project, rescan);
        let watch = app.state::<Watch>();
        git_dirs.iter().for_each(|dir| watch.add(dir));
        statuses
    })
    .await
    .map_err(|e| e.to_string())
}

/// Runs exactly these git arguments in one repository of the project; only common actions
/// (add, commit, pull, push, fetch) are allowed.
#[tauri::command]
async fn git_action(repo: String, args: Vec<String>, app: AppHandle) -> Result<ActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = app.state::<Arc<Current>>().get();
        let report = |run: &GitRun| {
            let _ = app.emit(GIT_RAN, run);
        };
        app.state::<Git>().action(&report, &project, &repo, &args)
    })
    .await
    .map_err(|e| e.to_string())
}

/// The latest commits of the given repositories (project-relative paths).
#[tauri::command]
async fn git_history(repos: Vec<String>, app: AppHandle) -> Result<Vec<RepoLog>, String> {
    blocking(app, move |app, project, report| app.state::<Git>().history(report, &project, &repos)).await
}

/// Uncommitted changes of one repository as a patch, untracked files included.
#[tauri::command]
async fn git_working_diff(repo: String, app: AppHandle) -> Result<Patch, String> {
    blocking(app, move |app, project, report| app.state::<Git>().working_diff(report, &project, &repo)).await?
}

/// What one commit changed, as a patch.
#[tauri::command]
async fn git_commit_diff(repo: String, hash: String, app: AppHandle) -> Result<Patch, String> {
    blocking(app, move |app, project, report| app.state::<Git>().commit_diff(report, &project, &repo, &hash)).await?
}

/// Runs git work off the main thread, with the current project and a reporter for its commands.
async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&AppHandle, Arc<Project>, git::Report) -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = app.state::<Arc<Current>>().get();
        let report = |run: &GitRun| {
            let _ = app.emit(GIT_RAN, run);
        };
        work(&app, project, &report)
    })
    .await
    .map_err(|e| e.to_string())
}

/// What changed from one commit (or snapshot) to another, as a patch.
#[tauri::command]
async fn git_compare(repo: String, from: String, to: String, app: AppHandle) -> Result<Patch, String> {
    blocking(app, move |app, project, report| app.state::<Git>().compare(report, &project, &repo, &from, &to)).await?
}

/// Whether Dirq, the diff viewer, is installed.
#[tauri::command]
fn has_diff_viewer() -> bool {
    apps::diff_viewer().is_some()
}

/// Shows a patch in Dirq.
#[tauri::command]
fn show_patch(text: String) -> Result<(), String> {
    apps::show_patch(&text)
}

/// Whether Marq, the Markdown viewer, is installed.
#[tauri::command]
fn has_markdown_viewer() -> bool {
    apps::markdown_viewer().is_some()
}

/// Shows Markdown text as a page in Marq.
#[tauri::command]
fn show_markdown(text: String) -> Result<(), String> {
    apps::show_markdown(&text)
}

/// Snapshots of the working tree taken before an assistant wrote, newest first.
#[tauri::command]
async fn git_snapshots(repos: Vec<String>, app: AppHandle) -> Result<Vec<Snapshot>, String> {
    blocking(app, move |app, project, report| app.state::<Git>().snapshots(report, &project, &repos)).await
}

/// What changed since a snapshot, as a patch.
#[tauri::command]
async fn git_snapshot_diff(repo: String, hash: String, app: AppHandle) -> Result<Patch, String> {
    blocking(app, move |app, project, report| app.state::<Git>().snapshot_diff(report, &project, &repo, &hash)).await?
}

/// Puts the working tree back as it was in a snapshot; the present is kept as one before.
#[tauri::command]
async fn git_restore_snapshot(repo: String, hash: String, app: AppHandle) -> Result<(), String> {
    blocking(app, move |app, project, report| app.state::<Git>().restore_snapshot(report, &project, &repo, &hash)).await?
}

/// The `@ai` markers in the project's documents.
#[tauri::command]
async fn find_markers(app: AppHandle) -> Result<Vec<Marker>, String> {
    blocking(app, move |app, project, report| app.state::<Git>().markers(report, &project)).await
}

/// The assistant sessions in this project, as far as their hooks told.
#[tauri::command]
fn assistant_state(bridge: State<Arc<Bridge>>) -> AssistantState {
    bridge.state()
}

/// One part (`key`) of the attachments to the next prompt in this project; `None` removes that
/// part. `rev` is the interface's count of its changes to the part, returned with the receipt.
#[tauri::command]
fn attach(key: String, text: Option<String>, label: Option<String>, rev: Option<u64>, app: AppHandle, bridge: State<Arc<Bridge>>) {
    bridge.attach(&app, key, text.map(|t| (t, label.unwrap_or_default(), rev.unwrap_or_default())));
}

/// The session the attachments are meant for; `None`: whichever session in the project prompts first.
#[tauri::command]
fn attach_for(session: Option<String>, app: AppHandle, bridge: State<Arc<Bridge>>) {
    bridge.set_target(&app, session);
}

/// The rules every session gets when it starts, word for word.
#[tauri::command]
fn start_rules() -> &'static str {
    rules::START_RULES
}

/// The user's title and short name for a session; an empty title brings the tool's back.
#[tauri::command]
fn rename_session(id: String, title: Option<String>, short: Option<String>, app: AppHandle, bridge: State<Arc<Bridge>>) {
    bridge.rename(&app, &id, title.as_deref(), short.as_deref());
}

/// Takes a session off the list of this project until it reports again.
#[tauri::command]
fn forget_session(id: String, app: AppHandle, bridge: State<Arc<Bridge>>) {
    bridge.forget(&app, &id);
}

/// Whether the coding tools report to CodeDeck, per tool and account.
#[tauri::command]
fn harness_connections() -> Vec<Connection> {
    harness::all().iter().flat_map(|h| h.connections()).collect()
}

/// Makes the tool of one account report to CodeDeck, or stops that; the state of all afterwards.
#[tauri::command]
fn set_harness_connection(harness: String, account: String, install: bool) -> Result<Vec<Connection>, String> {
    let tool = harness::by_id(Some(&harness)).ok_or_else(|| format!("{harness}: not a tool CodeDeck knows"))?;
    tool.connect(&account, install)?;
    Ok(harness_connections())
}

/// The git commands run so far, oldest first.
#[tauri::command]
fn git_log(git: State<Git>) -> Vec<GitRun> {
    git.log()
}

/// Event sent after every git command; payload [`GitRun`].
pub(crate) const GIT_RAN: &str = "git_ran";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let project = match Project::from_args() {
        Ok(project) => Arc::new(project),
        Err(message) => {
            eprintln!("codedeck: {message}");
            std::process::exit(2);
        }
    };
    recent::remember(&project.root);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            set_title(app.handle(), &project);
            let current = Arc::new(Current(RwLock::new(project)));
            app.manage(Watch::start(app.handle().clone(), current.clone())?);
            app.manage(current);
            app.manage(Git::new());
            // Without the socket CodeDeck works on, only without hearing from assistants
            match Bridge::start(app.handle().clone()) {
                Ok(bridge) => {
                    app.manage(bridge);
                }
                Err(e) => eprintln!("codedeck: no socket for assistants: {e}"),
            }
            exclude_workbench(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_info,
            read_dir,
            open_path,
            open_file,
            file_apps,
            choose_file_app,
            show_in_file_manager,
            path_stats,
            open_project,
            workbench_list,
            workbench_trash,
            workbench_move,
            open_window,
            recent_projects,
            pick_folder,
            git_status,
            git_action,
            git_history,
            git_working_diff,
            git_commit_diff,
            git_compare,
            has_diff_viewer,
            show_patch,
            has_markdown_viewer,
            show_markdown,
            git_snapshots,
            git_snapshot_diff,
            git_restore_snapshot,
            find_markers,
            assistant_state,
            attach,
            attach_for,
            start_rules,
            rename_session,
            forget_session,
            harness_connections,
            set_harness_connection,
            git_log
        ])
        .build(tauri::generate_context!())
        .expect("error while building CodeDeck")
        .run(|app, event| {
            // State is not dropped on exit: the socket would stay behind
            if let tauri::RunEvent::Exit = event {
                if let Some(bridge) = app.try_state::<Arc<Bridge>>() {
                    let _ = std::fs::remove_file(bridge.socket());
                }
            }
        });
}
