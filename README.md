# CodeDeck

**A lightweight AI coding deck for Linux.** Not an IDE: CodeDeck puts a project directory, its
changes and an AI assistant side by side, and leaves viewing files to small external tools.

Part of [be spex](https://be-spex.github.io) – small, focused apps for Linux. Works together with
[Jayq, Xaq and Marq](https://github.com/be-spex/Qiew).

> Early development. Real: the file list, Git (status, changes, history and the everyday actions)
> for every repository in the project, and the bridge to Claude Code (sessions, snapshots, comments
> for the assistant). Still sample data: the Workspace view, the context and the assistant chat.

## Layout

| Column | What it is |
| --- | --- |
| **Files** | The project tree. A cyan dot marks files the assistant changed. The project name at the top switches to a recent project or opens a folder (`Ctrl+O`) here or in a new window (`Ctrl+Shift+O`); every folder in the path above it, and every folder in the tree, can become the project. `Ctrl+click` opens it in a new window instead. |
| **Deck** | The working surface, with views (Workspace, Map, Changes, Docs, Tests) and the **Trail**: the Git history of all repositories as one vertical line. Hovering opens it to the left, over the file list, into a timeline; a point shows what that commit changed, with its details on top. The line shows how safe the work is: amber while not committed, dashed amber with hollow amber rings while committed but not pushed, quiet grey with filled points once on a remote. The newest pushed commit of each repository carries its remote's name with what is left to push and pull (`origin ↑2`). A spark marks commits made with an assistant (from their `Co-authored-by` trailer); an anchor marks a snapshot (see below). |
| **Context** and **Assistant** | What the AI gets to see (pinned files, folders, snippets, with a token meter) and the chat with it. |

A project is a directory with an optional `.codedeck.toml`. No index, no project folder. Each window is
its own process with its own project, so several projects can be open side by side; they share only
the list of recent projects in `~/.config/codedeck/recent.json`.

Git runs through the `git` command line, so your configuration, hooks and credentials apply, and
the command that ran is always shown (status bar, tooltips). A project may hold several
repositories: the one it lies in, and any found up to three folders below it, e.g. a workspace
folder with one repository per subfolder. Each shows its branch on its folder in the tree, tinted
while there are uncommitted changes; a click there (or on the branch in the status bar) offers
commit, pull, push and fetch. Pointing at an action shows the exact git command before it runs,
and its output afterwards. Linked worktrees are recognised and marked, not managed.

**Changes** shows the uncommitted changes of every repository, with a commit line per repository,
in two ways. **Structure** (the default) is a tree of what changed in shape: new, deleted, moved and
renamed files and folders, and those only edited inside; Git's rename detection recognises moves,
also of files not yet added (through a scratch copy of the index, the real one stays untouched).
The counts on top filter the tree; a click on a file opens its diff in place. **Code** shows every
diff, file after file. Each file can be staged, unstaged or discarded (after asking); hovering an
action shows its command. The same view shows a commit picked on the trail.

The message of a commit not on any remote yet can be changed in place (the pencil next to it):
the newest one with `git commit --amend --only`, an older one with an `amend!` commit and
`git rebase -i --autosquash --autostash`, which runs without an editor. Pushed commits and
commits behind a merge are left alone.

## Claude Code

CodeDeck does not run the assistant; Claude Code does, in its terminal or desktop app. CodeDeck
watches alongside. **Connect Claude Code** (click *Claude* in the status bar) adds hooks to
`~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`) that run `codedeck hook`. That passes each
event, without file contents, to the socket every CodeDeck window keeps in
`$XDG_RUNTIME_DIR/codedeck/`; a window only takes in what concerns its project. Nothing else in
the settings changes, the file as it was is kept as `settings.json.before-codedeck`, and
*Disconnect* takes the hooks out again. Without a CodeDeck window open the hook does nothing.

- **Sessions:** the status bar counts the sessions working in the project and shows when one waits
  for you; a click lists them with their latest prompt and the files they wrote. Those files carry
  the dot in the file list.
- **Snapshots:** before a session writes for the first time in a turn (a file edit, or any shell
  command), CodeDeck keeps the repository's working tree, untracked files included, as a commit
  under `refs/codedeck/snapshots/`. That goes through a copy of the index: the real index, the
  branches and what you push stay untouched (`git log --all` does show them). Snapshots since a
  repository's last commit appear on the trail; picking one shows what changed since, and **Go back
  to here** puts the files back, after keeping the present as a snapshot of its own, so going back
  can be undone the same way. 50 per repository are kept, for 14 days.
- **Comments for the assistant:** write `<!-- @ai: … -->` into Markdown or HTML, or `[!AI: …]`
  into any text, in whatever editor. The **Docs** view collects them (with `git grep`, so ignored
  files stay out) and turns them into a task: copied, or **handed to Claude** with the next prompt
  you send in this project.

**Git commands** (click the last command in the status bar, or Ctrl+Shift+G) lists every git
command CodeDeck ran with what git printed and its exit code. Commands that changed something stand
out and can be shown alone; the status check every few seconds only appears when it fails; failed commands
open by themselves.

Hovering a row of the file list shows its tools: view and edit (default program), show in the
file manager, open a folder as project, and pin or unpin it for the assistant. A right click on a
file or folder (in the file list and in the structure view) offers the same outside actions.

The right mouse button is kept for CodeDeck's own menus; Shift + right click opens the web view's
menu (developer tools).

## Build from source

Tauri 2 (Rust) with React, TypeScript, Vite and Tailwind CSS.

```sh
./dev                  # start from source, opens the directory you are in
./dev ~/projects/foo   # open another project
./dev --link           # once: makes `codedeck-dev` available in every directory
```

`./dev` installs dependencies when needed and starts with hot reload: frontend changes appear
immediately, Rust changes rebuild and restart the window.

```sh
npm run tauri build    # .deb and AppImage
```

A package built locally only runs on systems with the same or a newer glibc. Releases are
therefore built by GitHub Actions on Ubuntu 24.04 ([`.github/workflows/release.yml`](.github/workflows/release.yml)):

1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`
3. The workflow tests, builds the `.deb` and the AppImage and publishes a GitHub release with
   both and `SHA256SUMS`. Started by hand (Actions → Release → Run workflow) it only builds and
   keeps the packages as workflow artifacts.

Logo candidates: `design/logos/index.html`.
