# CodeDeck

Tauri 2 (Rust, `src-tauri/`) + React/TS/Tailwind (`src/`). Läuft neben Claude Code als „stilles
Radar“, hat keinen eigenen Editor. Die weitere Umsetzung steht in `docs/PLAN.md`: zuerst den Abschnitt
„Stand“ lesen, dann nur das Arbeitspaket, an dem gearbeitet wird.

## Karte (statt suchen)

| Datei | Zuständig für |
|---|---|
| `src-tauri/src/lib.rs` | Tauri-Commands, Setup, Events |
| `src-tauri/src/git.rs` | `Git`: Repos finden (`repos`, `find`), `run`/`execute` (jeder Befehl ins Log), Status, Aktionen-Whitelist `allowed` |
| `src-tauri/src/history.rs` | Log, Diffs, `ScratchIndex`, `worktree_diff(base)` |
| `src-tauri/src/snapshot.rs` | Sicherungspunkte unter `refs/codedeck/snapshots/`, Diff, Zurückgehen |
| `src-tauri/src/bridge.rs` | Socket je Fenster, Sitzungen, Snapshot vor erstem Schreiben, Übergabe an nächsten Prompt |
| `src-tauri/src/hook.rs` | `codedeck hook` (Weiterleitung) + Hooks in Claude-Settings ein-/austragen |
| `src-tauri/src/markers.rs` | `@ai`-Marker per `git grep` |
| `src-tauri/src/{watch,project,apps,recent,config}.rs` | Dateiwächter, Projektpfade, externe Programme, letzte Projekte, Config-Dateien |
| `src/backend.ts` | Alle `invoke`-Wrapper **mit Mock** für die Browser-Vorschau |
| `src/git.ts`, `src/history.ts`, `src/assistant.ts` | React-Hooks: Git-Status, Trail/Snapshots, Sitzungen |
| `src/components/Trail.tsx` | Zeitleiste (Zonen, Remote-Chip, Snapshots) |
| `src/components/views/ChangesView.tsx` | Diffs für jetzt / Commit / Snapshot |
| `src/components/views/DocsView.tsx` | Marker-Liste, Auftrag kopieren/übergeben |
| `src/components/AssistantStatus.tsx` | Claude in der Statusleiste: Sitzungen, Hooks verbinden |
| `src/mock.ts`, `AssistantPanel.tsx`, `WorkspaceView.tsx` | Noch Beispieldaten |

## Regeln

- UI-Texte und Code-Kommentare auf Englisch. Kommentare erklären das Warum.
- Git nur über `Git::run`/`execute`, damit jeder Befehl im Log erscheint. Was etwas ändert, läuft über
  `execute` ohne Umgebungsvariablen und gilt dann als Änderung.
- Jede neue Backend-Funktion bekommt in `backend.ts` einen Mock, sonst bricht die Vorschau.
- Prüfen: `cd src-tauri && cargo test` · `npx tsc --noEmit -p .` · Vorschau: `npx vite --port 5391`,
  dann `node tools/shot.mjs` (Aufruf steht im Kopf der Datei).
- Builds landen in `/shared/cargo-target` (Dev-Binary: `/shared/cargo-target/debug/codedeck`).
- Nie das echte `~/.claude/settings.json` in Tests anfassen; `CLAUDE_CONFIG_DIR` auf ein Temp-Verzeichnis setzen.
- Commits nur auf Wunsch, auf `main`, Englisch, Autor aus der Repo-Config, mit KI-Zeilen.
