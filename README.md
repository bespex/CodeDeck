# CodeDeck

**A lightweight AI coding deck for Linux.** Not an IDE: CodeDeck puts a project directory, its
changes and an AI assistant side by side, and leaves viewing files to small external tools.

Part of [be spex](https://be-spex.github.io) – small, focused apps for Linux. Works together with
[Jayq, Xaq and Marq](https://github.com/be-spex/Qiew).

> Early development. Real: the file list, Git (status, changes, history and the everyday actions)
> for every repository in the project. Still sample data: the Workspace view, the context and the
> assistant.

## Layout

| Column | What it is |
| --- | --- |
| **Files** | The project tree. A cyan dot marks files the assistant changed. The project name at the top switches to a recent project or opens a folder (`Ctrl+O`) here or in a new window (`Ctrl+Shift+O`); every folder in the path above it, and every folder in the tree, can become the project. `Ctrl+click` opens it in a new window instead. |
| **Deck** | The working surface, with views (Workspace, Map, Changes, Docs, Tests) and the **Trail**: the Git history of all repositories as one vertical line. Hovering opens it to the left, over the file list, into a timeline; a point shows what that commit changed, with its details on top. A spark marks commits made with an assistant (from their `Co-authored-by` trailer), a dashed ring commits not pushed yet. |
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

Logo candidates: `design/logos/index.html`.
