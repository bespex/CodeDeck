# CodeDeck

Tauri 2 (Rust, `src-tauri/`) + React/TS/Tailwind (`src/`). Läuft neben Claude Code als „stilles
Radar“, hat keinen eigenen Editor. Die weitere Umsetzung steht in `docs/PLAN.md`: zuerst den Abschnitt
„Einstieg für eine neue Session“ lesen, dann nur den Schritt der MVP-Phasen, an dem gearbeitet wird.
Das Zielbild zeigt der Click-Dummy in `design/click-dummy/`; er ist Vorlage, kein Bauplan (Abweichungen
nach Rückfrage, siehe „So läuft jeder Schritt“ im Plan). `docs/KONZEPT.md` erklärt das Zusammenspiel für
Menschen, Teil 4 das Zielbild; nur die Abschnitte lesen, die ein Schritt braucht.

## Karte (statt suchen)

| Datei | Zuständig für |
|---|---|
| `src-tauri/src/lib.rs` | Tauri-Commands, Setup, Events |
| `src-tauri/src/git.rs` | `Git`: Repos finden (`repos`, `find`), `run`/`execute` (jeder Befehl ins Log), Status, Aktionen-Whitelist `allowed` |
| `src-tauri/src/history.rs` | Log, Diffs, `ScratchIndex`, `worktree_diff(base)` |
| `src-tauri/src/snapshot.rs` | Sicherungspunkte unter `refs/codedeck/snapshots/` (Anfang und Ende einer Runde, `end_turn`), Diff, Zurückgehen |
| `src-tauri/src/bridge.rs` | Socket je Fenster, Sitzungen aus neutralen Ereignissen (`Inner::take_in`), Snapshot vor erstem Schreiben und am Ende der Runde (`Session.turn`, `Todo.ends`), Übergabe an nächsten Prompt |
| `src-tauri/src/hook.rs` | `codedeck hook [--harness <id>]`: nur Transport (Rohmeldung → Adapter → Fenster) |
| `src-tauri/src/harness/mod.rs` | Trait `Harness`, `Capabilities`, neutrales `Event`, `SessionInfo`, `Connection`; `all()`/`by_id` |
| `src-tauri/src/harness/claude.rs` | Einziger Ort für Claude-Spezifisches: Hook-Ereignisse und -Felder, `settings.json`, Konfigurationen (`config_dirs`), Log-Format |
| `src-tauri/src/harness/fake.rs` | Test-Adapter ohne echtes Werkzeug (nur in Tests) |
| `src-tauri/src/identity.rs` | Farbe, Kurzname und eigener Titel je Sitzung, je Projekt in `~/.config/codedeck/sessions.json` |
| `src-tauri/src/markers.rs` | `@ai`-Marker per `git grep` |
| `src-tauri/src/{watch,project,apps,recent,config}.rs` | Dateiwächter, Projektpfade, externe Programme, letzte Projekte, Config-Dateien |
| `src/backend.ts` | Alle `invoke`-Wrapper **mit Mock** für die Browser-Vorschau |
| `src/git.ts`, `src/history.ts`, `src/assistant.ts` | React-Hooks: Git-Status, Trail/Snapshots, Sitzungen |
| `src/components/Trail.tsx` | Zeitleiste (Zonen, Remote-Chip, Snapshots) |
| `src/components/views/ChangesView.tsx`, `DiffParts.tsx` | Diffs für jetzt / Runde / Commit / Snapshot / Vergleich; Kurzbericht der Runde; Zeile kommentieren, Datei abhaken |
| `src/components/Deck.tsx` | Vier Reiter mit ihrer Frage (Activity, Changes, Workbench, Handover), öffnet in Changes |
| `src/components/blocks.tsx` | Die fünf Erscheinungsformen: `Toolbar`, `Section`, `Rows`/`Row`, `Document`, `Decision` (neue Ansichten bauen damit) |
| `src/components/views/HandoverView.tsx` | Was mit dem nächsten Prompt rausgeht, Marker, Übergabe-Fortschritt |
| `src/components/views/ActivityView.tsx`, `WorkbenchView.tsx` | Zuletzt geschriebene Dokumente (Zeitleiste folgt in 2.3); Platzhalter bis 2.1 |
| `src/components/SessionsPanel.tsx` | Rechte Spalte: „Needs you“, Sitzungen (zwei Zeilen, „Earlier“, Umbenennen, Entfernen, Hover), „Next prompt“ (Warteschlange, Vorschau, Quittung, Fokus) |
| `src/components/SessionBadge.tsx`, `useSessionMarks` in `src/assistant.ts` | Schild einer Sitzung; Farbe/Kurzname/Schreiber je Datei für alle Komponenten |
| `src/components/AssistantStatus.tsx` | KI-Werkzeug in der Statusleiste, `HookPanel` (verbinden); Namen und Angebote aus `mainHarness` |
| `src/focus.ts`, `src/markers.ts` | Pin-Typ und Fokus-Text; Marker laden und „erledigt“ erkennen |
| `src/turns.ts`, `src/notes.ts`, `src/reviewed.ts` | Runden aus Snapshots und laufenden Sitzungen, wer welche Datei geändert hat; Zeilenkommentare als Teil der Übergabe; „looked at“ je Datei |
| `src/mock.ts` | Beispieldaten für die Vorschau |
| `design/click-dummy/` | Zielbild als Click-Dummy (Vorlage für `PLAN.md` „Zielbild“; README dort lesen, nicht die ganze `Main.dc.html`) |

## Regeln

- UI-Texte und Code-Kommentare auf Englisch. Kommentare erklären das Warum.
- Git nur über `Git::run`/`execute`, damit jeder Befehl im Log erscheint. Was etwas ändert, läuft über
  `execute` ohne Umgebungsvariablen und gilt dann als Änderung.
- Jede neue Backend-Funktion bekommt in `backend.ts` einen Mock, sonst bricht die Vorschau.
- Außerhalb von `harness/claude.rs` kommt weder „claude“ noch ein Hook-Feldname vor (Ausnahmen: `history.rs`
  `AI_MARKS`, Beispieldaten). Das Frontend fragt `capabilities`, nie den Namen des Werkzeugs.
- Prüfen: `cd src-tauri && cargo test` · `npx tsc --noEmit -p .` · Vorschau: `npx vite --port 5391`,
  dann `node tools/shot.mjs` (Aufruf steht im Kopf der Datei).
- Vorschau-Server: starten mit `setsid npx vite --port 5391 --strictPort >/dev/null 2>&1 &`, beenden mit
  `pkill -f "^node .*vite --port 5391"`. Das Muster braucht den Anker `^node`, sonst trifft `pgrep`/`pkill`
  die eigene Shell-Zeile, die denselben Text enthält.
- Builds landen in `/shared/cargo-target` (Dev-Binary: `/shared/cargo-target/debug/codedeck`).
- Nie das echte `~/.claude/settings.json` in Tests anfassen; `CLAUDE_CONFIG_DIR` auf ein Temp-Verzeichnis setzen.
- Commits nur auf Wunsch, auf `main`, Englisch, Autor aus der Repo-Config, mit KI-Zeilen.
