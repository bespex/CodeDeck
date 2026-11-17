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
| `src-tauri/src/lib.rs` | Tauri-Commands (finden ihr Fenster über `windows::of`), Setup, `Locked` (Sperren ohne `unwrap`) |
| `src-tauri/src/windows.rs` | Ein Prozess, ein Fenster je Projekt (D25): `Win` (Projekt, Git, Watch, Bridge, Titel), `open` |
| `src-tauri/src/icon.rs` | Icon je Fenster, selbst gezeichnet: Projektfarbe (`project_color`), Statuspunkt (fragt/fertig) |
| `src-tauri/src/projects.rs`, `doors.rs` | Meine Projekte (`projects.json`); Wege in eine Sitzung: Terminal (tmux attach oder Fenster nach vorn), Desktop über `Harness::desktop_command` |
| `src-tauri/src/hub.rs` | Der eine Socket des Prozesses: Hook-Ereignisse an alle Fenster, Nutzung, zweiter Aufruf `codedeck <ordner>` (`hand_over`, Instanz-Datei je Programmpfad) |
| `src-tauri/src/git.rs` | `Git`: Repos finden (`repos`, `find`), `run`/`execute` (jeder Befehl ins Log), Status, Aktionen-Whitelist `allowed` |
| `src-tauri/src/history.rs` | Log, Diffs, `ScratchIndex`, `worktree_diff(base)` |
| `src-tauri/src/snapshot.rs` | Sicherungspunkte unter `refs/codedeck/snapshots/` (Anfang und Ende einer Runde, `end_turn`), Diff, Zurückgehen |
| `src-tauri/src/bridge.rs` | Je Fenster (Ereignisse mit `emit_to`): Sitzungen aus neutralen Ereignissen (`Inner::take_in`), Snapshot vor erstem Schreiben und am Ende der Runde (`Session.turn`, `Todo.ends`), Übergabe an nächsten Prompt |
| `src-tauri/src/hook.rs` | `codedeck hook [--harness <id>]`: nur Transport (Rohmeldung → Adapter → Socket jedes laufenden CodeDeck) |
| `src-tauri/src/place.rs` | Wo eine Sitzung läuft, vom Hook aus gesehen (`Place`: Prozess, tmux, `CODEDECK_SESSION`, Remote-Link über `Harness::remote_link`); nur beobachten, Vorarbeit für `docs/SITZUNGEN.md` |
| `src-tauri/src/harness/mod.rs` | Trait `Harness`, `Capabilities`, neutrales `Event`, `SessionInfo`, `Connection`; `all()`/`by_id` |
| `src-tauri/src/harness/claude.rs` | Einziger Ort für Claude-Spezifisches: Hook-Ereignisse und -Felder, `settings.json`, Konfigurationen (`config_dirs`), Log-Format |
| `src-tauri/src/harness/fake.rs` | Test-Adapter ohne echtes Werkzeug (nur in Tests) |
| `src-tauri/src/identity.rs` | Farbe, Kurzname und eigener Titel je Sitzung, je Projekt in `~/.config/codedeck/sessions.json` |
| `src-tauri/src/markers.rs` | `@ai`-Marker (Regel D18): `git grep` als Vorauswahl, `marker_text` entscheidet, Codeblöcke in Markdown zählen nicht |
| `src-tauri/src/scratch.rs` | Scratch-Ordner `.scratch/`: Eintrag in `info/exclude` (`Git::exclude_scratch`, ersetzt die alte `.workbench/`-Zeile), Liste, Papierkorb, ins Projekt verschieben |
| `src-tauri/src/findings.rs` | Woanders Abgelegtes und veröffentlichte Seiten je Projekt (`~/.config/codedeck/findings.json`): was zählt, Holen in `.scratch/`, Links aus dem Schlussbericht |
| `src-tauri/src/journal.rs` | Was im Projekt geschah, eine Zeile je Ereignis, 7 Tage (`~/.local/state/codedeck/journal/`); Material für 2.3 |
| `src-tauri/src/rules.rs` | Startregeln: der eine Text für Hook und Reiter Next prompt |
| `src-tauri/src/{watch,project,apps,recent,config}.rs` | Dateiwächter, Projektpfade, externe Programme, letzte Projekte, Config-Dateien und Rechner-Einstellungen (`settings.json`, Änderung an alle Fenster über `window::settings_changed`) |
| `src/palette.ts`, `src/theme.ts`, `src/themes/*.json` | Themes (`docs/STYLING.md`): Ableitung, Prüfung und CSS-Variablen `--t-…` (`palette.ts`, ohne Abhängigkeiten); Wahl je Rechner, Vorschau beim Überfahren, frühes Setzen über `public/theme-early.js` (`theme.ts`); prüfen mit `npm run themes`. `index.css` liest nur Rollen mit Rückfall auf „CodeDeck“ |
| `src/backend.ts` | Alle `invoke`-Wrapper **mit Mock** für die Browser-Vorschau |
| `src/i18n.ts`, `src/i18n.de.ts` | Sprache der Oberfläche (Englisch/Deutsch): `t`, `T`, `plural`, `snapshotLabel`; Sprache in den Rechner-Einstellungen (Umschalter in den Schnelleinstellungen); deutsches Wörterbuch |
| `src/git.ts`, `src/history.ts`, `src/assistant.ts` | React-Hooks: Git-Status, Trail/Snapshots, Sitzungen |
| `src/components/Trail.tsx` | Zeitleiste (Zonen, Remote-Chip, Snapshots) |
| `src/components/views/ChangesView.tsx`, `DiffParts.tsx` | Diffs für jetzt / Runde / Commit / Snapshot / Vergleich; Kurzbericht der Runde; Zeile kommentieren, Datei abhaken |
| `src/components/Deck.tsx` | Vier Reiter mit ihrer Frage (Activity, Changes, Workbench, Next prompt), öffnet in Changes |
| `src/components/blocks.tsx` | Die fünf Erscheinungsformen: `Toolbar`, `Section`, `Rows`/`Row`, `Document`, `Decision` (neue Ansichten bauen damit) |
| `src/components/views/NextPromptView.tsx` | Reiter Nächster Prompt: alle Anhänge je Art mit Herkunft, genauer Text, Startregeln immer sichtbar |
| `src/components/AttachmentList.tsx` | `AttachmentSections` (die Liste im Reiter), `useAttachedCount`/`useAttachedKinds` (Zahlen für Reiter und Dashboard rechts) |
| `src/components/AttachTarget.tsx` | Für wen die Anhänge sind („any session“ oder eine bestimmte) |
| `src/components/views/ActivityView.tsx`, `src/timeline.ts` | Zeitleiste der Sitzungen („Heute“) aus dem Journal (`lanesOf`, `spanOf`), „Wie sicher ist deine Arbeit“, zuletzt geschriebene Dokumente |
| `src/components/NoticesPanel.tsx` | Glocke in der Reiterleiste: letzte Ereignisse (`noticesOf`), Tipps je Reiter, Fähigkeiten je KI-Werkzeug |
| `src/components/views/WorkbenchView.tsx`, `HintsTile.tsx`, `FoundTiles.tsx`, `src/scratch.ts` | Reiter Werkbank in Kacheln: woanders Abgelegtes und veröffentlichte Seiten (`FoundTiles`), Scratch-Ordner (Ziehen in den Dateibaum, `SCRATCH_DRAG`, `moveIntoProject`) und `@ai`-Hinweise mit Büroklammer |
| `src/news.ts`, `src/components/News.tsx` | „Neu“ in der Werkbank = noch nicht gesehen: je Projekt der letzte Blick und die gesehenen Einträge (`localStorage`), gesehen beim Verlassen nach 2 s oder beim Klick; Karte und Wort `neu`/`geändert`, Punkt am Reiter, Zahl in der Übersicht |
| `src/components/OverviewApp.tsx` | Übersicht aller Projekte (`docs/UEBERSICHT.md`, Fenster `overview`, `?view=overview`): Wartet auf dich, Projektliste mit Sitzungen, Werkzeugleiste; Daten aus `overview_state`, Zusammenfassung je Projekt aus `SidebarSummary` (`reportSummary`) |
| `src/view.ts` | Welcher Reiter offen ist (`useView`, `openView`), damit die rechte Spalte in einen Reiter springen kann |
| `src/components/SessionsPanel.tsx` | Rechte Spalte: „Needs you“, Sitzungen (zwei Zeilen, „Earlier“, Umbenennen, Entfernen, Hover), „Next prompt“ als Dashboard (Zahlen je Art, Tokens, für wen, Quittung, öffnet den Reiter) |
| `src/components/SessionBadge.tsx`, `useSessionMarks` in `src/assistant.ts` | Schild einer Sitzung; Farbe/Kurzname/Schreiber je Datei für alle Komponenten |
| `src/components/HeaderBar.tsx`, `ProjectHeader.tsx` | Kopfleiste der rechten Spalte (`docs/KOPFLEISTE.md`): `ProjectMenu`, Schnelleinstellungen, App-Menü `⋯`, Leisten-Knopf; links nur `PathBar` |
| `src/compact.ts`, `src-tauri/src/window.rs`, `SidebarSummary.tsx` | Seitenleiste (`docs/SEITENLEISTE.md`): Form umschalten, Ort des vollen Fensters, globale Kürzel im Prozess (zuletzt benutztes Fenster aus dem Fokus) |
| `src/components/Dialogs.tsx`, `src/dialogs.ts` | About, Tastenkürzel (`F1`), Einstellungsdialog (`Ctrl+,`); `openDialog` von überall |
| `src/attention.ts`, `AttentionChoice.tsx`, `src-tauri/src/attention.rs` | „Wartet auf dich“ einmal berechnet; Fenstertitel, Taskleiste, Desktop-Meldung, „Nicht stören“ |
| `src/components/AssistantStatus.tsx` | KI-Werkzeug in der Statusleiste, `HookPanel` (verbinden); Namen und Angebote aus `mainHarness` |
| `src/attachments.ts` | Gemeinsamer Baustein jedes Anhangsteils (`createPart`: Einträge mit Revision, Quittung, Abgleich), `useAttachments` einmal in `App`, `attachmentCount` |
| `src/files.ts`, `src/markers.ts` | Angehängte Dateien (Pin = Anhang); Marker laden, als Anhang, „erledigt“ erkennen |
| `src/changes.ts` | Änderungen als Anhang (Git-Befehl statt Diff, neue Dateien als Pfad), `ChangeScopeContext` je Diff-Ansicht |
| `src/turns.ts`, `src/notes.ts`, `src/reviewed.ts` | Runden aus Snapshots und laufenden Sitzungen, wer welche Datei geändert hat; Zeilenkommentare als Teil der Übergabe; „looked at“ je Datei |
| `src/mock.ts` | Beispieldaten für die Vorschau |
| `design/click-dummy/` | Zielbild als Click-Dummy (Vorlage für `PLAN.md` „Zielbild“; README dort lesen, nicht die ganze `Main.dc.html`) |

## Regeln

- Code-Kommentare auf Englisch, sie erklären das Warum. UI-Texte stehen englisch im Code und gehen durch `t()`
  / `<T>` / `plural()` aus `src/i18n.ts`; jede neue Zeichenkette bekommt ihre deutsche Übersetzung in
  `src/i18n.de.ts` (Schlüssel = englischer Text). Nicht übersetzt wird, was Claude bekommt (Startregeln, Text der
  Anhänge, Namen von Änderungen) und was in Git landet (Snapshot-Namen). Prüfen: Vorschau auf Deutsch, dann
  `window.missingTranslations()` in der Konsole (bzw. `eval:` in `tools/shot.mjs`).
- Git nur über `Git::run`/`execute`, damit jeder Befehl im Log erscheint. Was etwas ändert, läuft über
  `execute` ohne Umgebungsvariablen und gilt dann als Änderung.
- Jede neue Backend-Funktion bekommt in `backend.ts` einen Mock, sonst bricht die Vorschau.
- Außerhalb von `harness/claude.rs` kommt weder „claude“ noch ein Hook-Feldname vor (Ausnahmen: `history.rs`
  `AI_MARKS`, Beispieldaten). Das Frontend fragt `capabilities`, nie den Namen des Werkzeugs.
- Prüfen: `cd src-tauri && cargo test` · `npx tsc --noEmit -p .` · `npm run themes` (nach Farbänderungen) · Vorschau: `npx vite --port 5391`,
  dann `node tools/shot.mjs` (Aufruf steht im Kopf der Datei).
- Vorschau-Server: starten mit `setsid npx vite --port 5391 --strictPort >/dev/null 2>&1 &`, beenden mit
  `pkill -f "^node .*vite --port 5391"`. Das Muster braucht den Anker `^node`, sonst trifft `pgrep`/`pkill`
  die eigene Shell-Zeile, die denselben Text enthält.
- Builds landen in `/shared/cargo-target` (Dev-Binary: `/shared/cargo-target/debug/codedeck`).
- Nie das echte `~/.claude/settings.json` in Tests anfassen; `CLAUDE_CONFIG_DIR` auf ein Temp-Verzeichnis setzen.
- Name (D26, Regeln in `bespex.github.io/brand/README.md`): ein Name überall, „CodeDeck“ im Text, `codedeck` für
  Befehl, Programm, Paket, Schriftzug, Dateien und Verzeichnisse (`~/.config/codedeck`, `refs/codedeck/`, `CODEDECK_*`)
  und die Domain `codedeck.bespex.run`. `codeck` gibt es nur noch als Alias und Übergangspaket, nirgends im Text. Teile
  heißen nach dem, was sie sind (Übersicht, Projektfenster). Im Text „be spex“, nie „be-spex“.
- Commits nur auf Wunsch, auf `main`, Englisch, Autor aus der Repo-Config, mit KI-Zeilen.
