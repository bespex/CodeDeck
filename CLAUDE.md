# CodeDeck

Tauri 2 (Rust, `src-tauri/`) + React/TS/Tailwind (`src/`). Läuft neben Claude Code als „stilles
Radar“, hat keinen eigenen Editor. Was ansteht, steht in `ROADMAP.md`: den nächsten offenen Schritt nehmen und nur die dort genannten
Dateien lesen (Einzelheiten je Schritt in `docs/UMSETZUNG.md`, Entscheidungen in `docs/ENTSCHEIDUNGEN.md`,
Erkenntnisse in `docs/NOTIZEN.md`).
Das Zielbild zeigt der Click-Dummy in `design/click-dummy/`; er ist Vorlage, kein Bauplan (Abweichungen
nach Rückfrage, siehe „So läuft jeder Schritt“ unten). `docs/KONZEPT.md` erklärt das Zusammenspiel für
Menschen, Teil 4 das Zielbild; nur die Abschnitte lesen, die ein Schritt braucht.

## Karte (statt suchen)

| Datei | Zuständig für |
|---|---|
| `src-tauri/src/lib.rs` | Tauri-Commands (finden ihr Fenster über `windows::of`), Setup, `Locked` (Sperren ohne `unwrap`) |
| `src-tauri/src/windows.rs` | Ein Prozess, ein Fenster je Projekt (D25): `Win` (Projekt, Git, Watch, Bridge, Titel), `open` |
| `src-tauri/src/icon.rs` | Icon je Fenster, selbst gezeichnet: Projektfarbe (`project_color`), Markierung (fragt/fertig) |
| `src-tauri/src/accounts.rs`, `src/accounts.ts` | Konten (3.2): Konfigurationen mit Name, Farbe, Desktop-Profil (`accounts.json`), Art laut Adapter (`account_kind`), Papierkorb für Sicherungen; `useAccounts`, `accountLook` |
| `src-tauri/src/tmux.rs` | Sitzungen in tmux starten (`start`, Befehl vom Adapter `Harness::launch`, über die Login-Shell) und beenden; Startbefehl in `@codedeck-command` (`command_of`); nie `send-keys` |
| `src/pending.ts`, `src/components/SessionCommands.tsx` | „Starting…“-Zeilen gestarteter, noch stummer Sitzungen (`usePending`, sofort über `sessions_started`); Start- und Stoppbefehl zum Ansehen und Kopieren |
| `src-tauri/src/projects.rs`, `doors.rs` | Meine Projekte (`projects.json`); Wege in eine Sitzung: Terminal (tmux attach oder Fenster nach vorn), Desktop über `Harness::desktop_command`; `doors::ways` entscheidet je Sitzung `doors`/`actions`/`noDoor` (Frontend zeigt nur diese); `projects::start_with` (Werkzeug des Projektkontos), `can_start` |
| `src-tauri/src/hub.rs` | Der eine Socket des Prozesses: Hook-Ereignisse an alle Fenster, Nutzung, zweiter Aufruf `codedeck <ordner>` (`hand_over`, Instanz-Datei je Programmpfad), `codedeck --toggle` (`toggle`: nach vorn oder weg, für ein Tastenkürzel im Desktop unter Wayland); `codedeck` ohne Ordner öffnet kein Projekt, nur die Startseite bzw. holt die laufende Instanz nach vorn (`to_front`) |
| `src-tauri/src/git.rs` | `Git`: Repos finden (`repos`, `find`), `run`/`execute` (jeder Befehl ins Log), Status, Aktionen-Whitelist `allowed` |
| `src-tauri/src/history.rs` | Log, Diffs, `ScratchIndex`, `worktree_diff(base)` |
| `src-tauri/src/snapshot.rs` | Sicherungspunkte unter `refs/codedeck/snapshots/` (Anfang und Ende einer Runde, `end_turn`), Diff, Zurückgehen |
| `src-tauri/src/bridge.rs` | Je Fenster (Ereignisse mit `emit_to`): Sitzungen aus neutralen Ereignissen (`Inner::take_in`), Snapshot vor erstem Schreiben und am Ende der Runde (`Session.turn`, `Todo.ends`), Übergabe an nächsten Prompt |
| `src-tauri/src/hook.rs` | `codedeck hook [--harness <id>]`: nur Transport (Rohmeldung → Adapter → Socket jedes laufenden CodeDeck) |
| `src-tauri/src/platform.rs`, `terminal.rs`, `src/platform.ts`, `src/components/PlatformFacts.tsx` | Was der Rechner bietet, beim Start ermittelt, auf Wunsch neu (`refresh`; git, tmux, Terminal, X11/Wayland, Desktop, Tray): `platform::get`, `find_program` (auch über die Login-Shell), Befehl `platform`; Terminal-Programm mit Argumentform (`terminal::open`); im Frontend `usePlatform` (folgt `platform_changed`); „Erkannt auf diesem Rechner“ in Glocke und About |
| `src-tauri/src/welcome.rs`, `src/components/Welcome.tsx`, `WindowHelp.tsx` | Willkommensfenster (eigenes Fenster `welcome`, `?view=welcome`), zweite Seite „Erzähl mir mehr“ erklärt die Projektliste; Führung durch das Projektfenster (`WindowHelp`: folgt einer Arbeitsrunde, leuchtet die Bereiche mit `data-tour="…"` nacheinander aus und schaltet das Deck auf den Reiter des Schritts, Karte daneben, fehlende Bereiche werden übersprungen; einmal je Start im ersten sichtbaren Projektfenster, `window_help_due`, Rechner-Einstellung `windowHelp`); Leerzustand der Projektliste (`EmptyList` in `OverviewApp.tsx`); was CodeDeck sucht (`checks`: Status, Dringlichkeit, Webseite; Name/Seite des KI-Werkzeugs über `Harness::homepage`/`installed`; darunter „Verbinden“ je noch nicht verbundener Konfiguration, `Connect`), Erläuterung je Art im Frontend, Wayland-Warnkasten; bei jedem Start mit Fenster, bis abgeschaltet (Rechner-Einstellung `welcome`), wieder wenn Essenzielles fehlt (`due`); Befehle `checkup`, `welcome_done`, `open_welcome` (App-Menü, Einstellungen → Allgemein) |
| `src-tauri/src/place.rs` | Wo eine Sitzung läuft, vom Hook aus gesehen (`Place`: Prozess, tmux, `CODEDECK_SESSION`, Remote-Link über `Harness::remote_link`, im Hintergrund über `Harness::background_job`); nur beobachten, Vorarbeit für `docs/SITZUNGEN.md` |
| `src-tauri/src/harness/mod.rs` | Trait `Harness` (`declared`, abgeleitet `capabilities`), `Capabilities`, neutrales `Event`, `SessionInfo`, `Connection`; `all()`/`by_id`; Konformitätstests aller Adapter (`samples()`); neuer Adapter: `docs/KONZEPT.md` 2.8 |
| `src-tauri/src/harness/claude.rs` | Einziger Ort für Claude-Spezifisches: Hook-Ereignisse und -Felder, `settings.json`, Konfigurationen (`config_dirs`), Log-Format, laufende Prozesse (`running`, `<config>/sessions/`), Hintergrund-Sitzungen des Daemons (`parked`: `jobs/*/state.json`, `daemon/roster.json`; `attach`) |
| `src-tauri/src/harness/fake.rs` | Test-Adapter ohne echtes Werkzeug (nur in Tests): `Fake` startet nichts, `Starter` startet `fake-tool` |
| `src-tauri/src/identity.rs` | Farbe, Kurzname und eigener Titel je Sitzung, je Projekt in `~/.config/codedeck/sessions.json` |
| `src-tauri/src/markers.rs` | `@ai`-Marker (Regel D18): `git grep` als Vorauswahl, `marker_text` entscheidet, Codeblöcke in Markdown zählen nicht; in Markdown auch Marqs Kommentare in Listen und Zitaten, in HTML Hyqes Kommentare mitten in der Zeile, mehrzeilig mit ganzem Text (`in_documents`) |
| `src-tauri/src/scratch.rs`, `src/tidy.ts` | Scratch-Ordner `.scratch/`: Eintrag in `info/exclude` (`Git::exclude_scratch`, ersetzt die alte `.workbench/`-Zeile), Liste, Papierkorb, ins Projekt verschieben, gleiche Dateien im Projekt (`twins`); „Aufräumen…“ teilt in Kann weg / Erst ansehen / Bleibt (`tidyPlan`, Gründe aus Session, gesehen, angehängt, Art, Alter) |
| `src-tauri/src/findings.rs` | Woanders Abgelegtes und veröffentlichte Seiten je Projekt (`~/.config/codedeck/findings.json`): was zählt, Holen in `.scratch/`, Links aus dem Schlussbericht |
| `src-tauri/src/journal.rs` | Was im Projekt geschah, eine Zeile je Ereignis, 7 Tage (`~/.local/state/codedeck/journal/`); Material für 2.3 |
| `src-tauri/src/rules.rs` | Startregeln: der eine Text für Hook und Reiter Next prompt |
| `src-tauri/src/{watch,project,apps,recent,config}.rs` | Dateiwächter, Projektpfade, externe Programme, letzte Projekte, Config-Dateien und Rechner-Einstellungen (`settings.json`, Änderung an alle Fenster über `window::settings_changed`) |
| `src/theme.ts`, `src/components/ThemeChoice.tsx`, `public/theme-early.js` | Farbthema und Stil aus dem be spex kit (`@bespex/themes`, `../kit`): Wahl je Rechner (`appearance`), angebotene Achsen `AXES_USED`, Übersetzung alter Themes (`LEGACY`), eigene Einstellung „Ereignisse“ (`events`), frühes Setzen der Attribute über `public/theme-early.js`; Auswahl ist `<sx-appearance>` des Kits. `index.css` liest die Rollen `--sx-*` mit Rückfall auf Graphit, eigene Stufen `--cd-*` nach den Stilachsen |
| `src/backend.ts` | Alle `invoke`-Wrapper **mit Mock** für die Browser-Vorschau |
| `src/i18n.ts`, `src/i18n.de.ts` | Sprache der Oberfläche (Englisch/Deutsch): `t`, `T`, `plural`, `snapshotLabel`; Sprache in den Rechner-Einstellungen (Umschalter in den Schnelleinstellungen); deutsches Wörterbuch |
| `src/git.ts`, `src/history.ts`, `src/assistant.ts` | React-Hooks: Git-Status, Trail/Snapshots, Sitzungen |
| `src/components/Trail.tsx` | Zeitleiste (Zonen, Remote-Chip, Snapshots) |
| `src/components/views/ChangesView.tsx`, `DiffParts.tsx` | Diffs für jetzt / Runde / Commit / Snapshot / Vergleich; Kurzbericht der Runde; Zeile kommentieren, Datei als angesehen markieren (`Viewed`); ohne Dirq klappt ein Klick nur auf, Ansehen/Bearbeiten über die Werkzeuge der Zeile (`FileTools`); **mit Dirq** (installiert genügt) keine eingebetteten Diffs: Klick tut nichts, Doppelklick öffnet den Patch in Dirq mit nur dieser Datei (`--file`; `ScopeProvider`, `openInDirq`, `DirqContext`), der Knopf „Dirq“ alle Dateien, mit `--annotate` nur bei `worktree`; kein Mittelklick; kein Vormerken (Stage) |
| `src/dirqComments.ts`, `hub.rs` `dirq_comment` | Zeilenkommentare aus Dirq (Qiew `docs/ANNOTATE.md`): Hub prüft und ordnet über `doc` (`remember_dirq_doc`) dem Projekt zu, das Fenster legt `Note`s mit Id `dirq:<id>` an |
| `src/components/Deck.tsx` | Vier Reiter mit ihrer Frage (Activity, Changes, Workbench, Next prompt), öffnet in Changes |
| `src/fileView.ts`, `src-tauri/src/filemarks.rs`, `fileops.rs` | Dateiliste (docs/DATEISPALTE.md): Einstellungen (`useFileSettings`, Maschinen-Einstellung `files`, Schnelleinstellungen der Liste und Bereich „Dateien und Verzeichnisse“), Ausblenden/Wichtig je Projekt (`files.json`, `useFileMarks`, `hiddenBy`), Git-Ignoriertes aus `git status --ignored` (`RepoStatus.ignored`), „Im Baum zeigen“ (`revealInTree`); Umbenennen, Neu, Verschieben durch Ziehen (`path_move`), Papierkorb, Terminal im Ordner; Menü ⋯ neben der Suche für den Hauptordner (Neu, alles auf-/zuklappen, Dateimanager, Terminal); Suche über das ganze Projekt und Filter-Chips als flache Liste (`src/fileFind.ts`, `project_files`), Mehrfachauswahl (Strg/Umschalt), Tastatur (Pfeile, Enter, Strg+Enter, Leertaste, Kontextmenü-Taste) |
| `src/components/RowTools.tsx` | Werkzeuge einer Zeile beim Überfahren, überall gleich: `HoverTools` (gerahmt, links vor dem Dauerhaften), `Tool`, `ToolGap`, `AtRest` (z. B. angehängt in Ruhe) |
| `src/components/blocks.tsx` | Die fünf Erscheinungsformen: `Toolbar`, `Section`, `Rows`/`Row`, `Document`, `Decision` (neue Ansichten bauen damit) |
| `src/components/views/NextPromptView.tsx` | Reiter Nächster Prompt: alle Anhänge je Art mit Herkunft, genauer Text, Startregeln immer sichtbar |
| `src-tauri/src/prompts.rs`, `src/prompts.ts`, `src/components/PreparedPrompts.tsx`, `PromptEditor.tsx` | Vorbereitete Prompts: je Projekt Markdown in `.scratch/prompts/` (von der Scratch-Liste ausgelassen), Unterbereich „Vorbereitet“ unter Nächster Prompt (Liste, ein offener Editor, Autosave, Kopieren); Editor CodeMirror ohne Schreibhilfen, nur hängender Einzug für Aufzählungen und fette Überschriften |
| `src/components/AttachmentList.tsx` | `AttachmentSections` (die Liste im Reiter), `useAttachedCount`/`useAttachedKinds` (Zahlen für Reiter und Dashboard rechts) |
| `src/components/AttachTarget.tsx` | Für wen die Anhänge sind (eine bestimmte, „any session“ als bewusste Wahl, ohne Wahl nur die einzige); `ChooseTarget` fragt, wenn mehrere in Frage kommen |
| `src/components/views/ActivityView.tsx`, `src/timeline.ts` | Zeitleiste der Sitzungen („Heute“) aus dem Journal (`lanesOf`, `spanOf`), „Wie sicher ist deine Arbeit“, zuletzt geschriebene Dokumente |
| `src/components/NoticesPanel.tsx` | Glocke in der Reiterleiste: letzte Ereignisse (`noticesOf`), Tipps je Reiter, Fähigkeiten je KI-Werkzeug |
| `src/components/views/WorkbenchView.tsx`, `HintsTile.tsx`, `FoundTiles.tsx`, `src/scratch.ts` | Reiter Werkbank in Kacheln: woanders Abgelegtes und veröffentlichte Seiten (`FoundTiles`), Scratch-Ordner (Ziehen in den Dateibaum, `SCRATCH_DRAG`, `moveIntoProject`) und `@ai`-Hinweise mit Büroklammer |
| `src/news.ts`, `src/components/News.tsx` | „Neu“ in der Werkbank = noch nicht gesehen: je Projekt der letzte Blick und die gesehenen Einträge (`localStorage`), gesehen beim Verlassen nach 2 s oder beim Klick; Karte und Wort `neu`/`geändert`, Punkt am Reiter, Zahl in der Übersicht |
| `src/components/OverviewApp.tsx` | Startseite (Fenster `overview`, `?view=overview`, `START_PAGE`: nur ohne Projektfenster sichtbar) und Projektliste im Projektfenster (`inWindow`); früher Übersicht aller Projekte (`docs/UEBERSICHT.md`): Wartet auf dich, Projektliste mit Sitzungen, Werkzeugleiste; Daten aus `overview_state`, Zusammenfassung je Projekt aus `SidebarSummary` (`reportSummary`) |
| `src/groups.ts` | Gruppen der Übersicht aus den Ordnern der Projekte (`sectionsOf`, `nameIn`), Zugeklapptes je Rechner |
| `src/layout.ts`, `src/components/Splitter.tsx`, `FilesRail.tsx` | Spalten von links: Sitzungen, Deck, Trail, Dateien; Spaltenbreiten und Zugeklapptes je Projekt (`useLayout`, `fold`, `Ctrl+B`, Klick aufs Projektzeichen), Trennlinie, zugeklappte Dateiliste als Leiste |
| `src/components/ProjectsPanel.tsx`, `ProjectsRail` in `OverviewApp.tsx` | Linke Spalte des Projektfensters: Projektleiste (Farbe, Zeichen, Menüs) und die Liste aus `OverviewApp` mit `inWindow` (Klick zeigt hier, keine Sitzungen); zugeklappt Leiste der Projektzeichen (`useProjectsFolded`, je Rechner) |
| `src/projectMemory.ts` | Was ein Fenster von einem Projekt zeigte, bleibt beim Wechsel erhalten (`usePerProject`, `remember`/`recall`, `showProject`), Dauer des letzten Wechsels (`lastSwitch`) |
| `src/view.ts` | Welcher Reiter offen ist (`useView`, `openView`), damit die rechte Spalte in einen Reiter springen kann |
| `src/components/SessionsPanel.tsx` | Sitzungsspalte (links, früher „rechte Spalte“): eine Sitzungsliste in Startreihenfolge, Wartendes als erhabene Karte (`wait`, fertig bis angesehen: `Session.seen`), Karte: Zustand mit Zeit, Frage mit Befehl (`askedAbout`) bzw. Schlussworte (`report`), Knopfzeile (Runde ansehen `showTurnOf`, Antworten/Desktop/Terminal, Fortsetzen `resumeSession`); darunter „Earlier“ (Umbenennen, Entfernen, Hover, Quittung in der Karte); „Next prompt“ nach Bedarf (leer eine Zeile; sonst für wen bzw. „Wer soll es bekommen?“, Arten in einer Zeile, Tokens) |
| `src/components/SessionBadge.tsx`, `useSessionMarks` in `src/assistant.ts` | Schild einer Sitzung; Farbe/Kurzname/Schreiber je Datei für alle Komponenten |
| `src/components/HeaderBar.tsx`, `ProjectHeader.tsx` | Kopfleiste der rechten Spalte (`docs/KOPFLEISTE.md`): `ProjectMenu`, Schnelleinstellungen, App-Menü (CodeDeck-Logo), Leisten-Knopf; links `PathBar` über der Projektliste |
| `src-tauri/src/autostart.rs` | Bei der Anmeldung (3.5): Eintrag in `~/.config/autostart/` startet `codedeck --tray` (kein Fenster, Übersicht verborgen) |
| `src-tauri/src/tray.rs` | Tray-Symbol wie in Maillet (`ksni`, StatusNotifierItem, auch Wayland): Linksklick CodeDeck nach vorn oder weg (`windows::front_or_away`), Menü, Beenden; Titel der Übersicht in der Sprache der Oberfläche |
| `src-tauri/src/icon.rs` `mark_waiting`, `src/marks.ts` `markWaiting` | Markierung wie in allen be spex-Apps: Pille mit Zahl (fragt) oben rechts, Punkt (fertig) unten rechts; beide pixelgleich |
| `src-tauri/src/window.rs`, `SidebarSummary.tsx` | Platzierung am rechten Rand (`set_compact`, für die Übersicht), Verbergen/Zeigen an derselben Stelle, globale Kürzel im Prozess (`Ctrl+Alt+L` nach vorn oder weg, `in_front`); `SidebarSummary`: Zeile oben in der Sitzungsspalte mit dem Verbrauch der KI (`AssistantLine` in `StatusBar.tsx`), meldet unsichtbar die Zusammenfassung an Übersicht und Projektliste. Die Leiste je Projektfenster (`docs/SEITENLEISTE.md`) ist entfallen |
| `src/components/Dialogs.tsx`, `src/dialogs.ts`, `src-tauri/src/settings.rs` | About, Tastenkürzel (im CodeDeck-Menü hinter dem Logo, kein F1); `openDialog` von überall. Einstellungen als eigenes Fenster (`SettingsWindow`, `?view=settings&section=…`, `openSettings` von Startseite, Projektfenster und Tray, ohne Projekt; Werkzeuge über `harness_list`); About und Tastenkürzel von der Startseite ebenfalls als Fenster (`openPanel`, `?view=about|shortcuts`, `Modal` füllt dann das Fenster, `closeHere`); das Menü ⋯ der Startseite hat alles, was kein Projekt braucht, ohne Tastenkürzel: nur häufige Aktionen bekommen eines |
| `src/attention.ts`, `AttentionChoice.tsx`, `src-tauri/src/attention.rs` | „Wartet auf dich“ einmal berechnet; Fenstertitel, Taskleiste, Desktop-Meldung, „Nicht stören“ |
| `src/components/AssistantStatus.tsx` | KI-Werkzeug in der Statusleiste, `HookPanel` (verbinden); Namen und Angebote aus `mainHarness` |
| `src/attachments.ts` | Gemeinsamer Baustein jedes Anhangsteils (`createPart`: Einträge mit Revision, Quittung, Abgleich), `useAttachments` einmal in `App`, `attachmentCount` |
| `src/files.ts`, `src/markers.ts` | Angehängte Dateien (Pin = Anhang); Marker laden, als Anhang, „erledigt“ erkennen |
| `src/changes.ts` | Änderungen als Anhang (Git-Befehl statt Diff, neue Dateien als Pfad), `ChangeScopeContext` je Diff-Ansicht |
| `src/turns.ts`, `src/notes.ts`, `src/reviewed.ts` | Runden aus Snapshots und laufenden Sitzungen, wer welche Datei geändert hat; Zeilenkommentare als Teil der Übergabe; „Viewed“ je Datei mit Stand beim Ansehen („seit dem Ansehen geändert“) |
| `src/mock.ts` | Beispieldaten für die Vorschau; in `backend.ts` `?tool=minimal` (zweites Werkzeug mit wenig Fähigkeiten, `mockWays`), `?platform=…` und `?git=none` (Projekt ohne Repository) |
| `design/click-dummy/` | Zielbild als Click-Dummy (Vorlage für die MVP-Phasen in `ROADMAP.md`; README dort lesen, nicht die ganze `Main.dc.html`) |

## So läuft jeder Schritt

1. **Lesen:** die genannten Dateien (Karte in `CLAUDE.md`) und die genannte Stelle im Dummy.
2. **Prüfen, bevor etwas gebaut wird**, in drei Richtungen:
   - *Technik:* Liefern Hooks, Logs, Git oder tmux wirklich, was der Dummy zeigt? Unklares mit dem Agenten
     `claude-code-guide` klären, nicht schätzen.
   - *Bestand:* Was kann die betroffene Ansicht heute, das der Dummy nicht zeigt? Nichts davon darf
     stillschweigend verschwinden. Bekannt sind: Kontextmenü und „Öffnen mit“ im Datei-Navigator, Ziehen
     in den Fokus, Git-Aktionen je Repo (`RepoActions`), Git-Protokoll, mehrere Repos im Projekt mit
     eigenem Trail, Remote-Chip, Vergleich zweier Trail-Punkte, Struktur-Ansicht der Änderungen,
     „Open in Dirq“, Sitzungsfilter für Snapshots, gedimmtes Fenster ohne Fokus.
   - *Gestaltung:* Passt es zu den Regeln in `KONZEPT.md` 4.7 und zu dem, was schon umgebaut ist?
3. **Rückfrage:** Weicht das Ergebnis der Prüfung vom Dummy ab, oder gibt es mehr als einen sinnvollen
   Weg, erst den Nutzer fragen, mit Vorschlag. Dann bauen.
4. **Abschließen:** `cargo test`, `tsc`, Screenshot der Vorschau; Schritt in `ROADMAP.md` abhaken, Erkenntnisse in
   einer Zeile unter „Notizen“ in `docs/NOTIZEN.md`; bei geänderter Bedienung `KONZEPT.md` nachziehen.

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
- Prüfen: `cd src-tauri && cargo test` · `npx tsc --noEmit -p .` (Themen prüft das Kit: dort `npm run check`) · Vorschau: `npx vite --port 5391`,
  dann `node tools/shot.mjs` (Aufruf steht im Kopf der Datei).
- Vorschau-Server: starten mit `setsid npx vite --port 5391 --strictPort >/dev/null 2>&1 &`, beenden mit
  `pkill -f "^node .*vite --port 5391"`. Das Muster braucht den Anker `^node`, sonst trifft `pgrep`/`pkill`
  die eigene Shell-Zeile, die denselben Text enthält.
- Builds landen in `/shared/cargo-target` (Dev-Binary: `/shared/cargo-target/debug/codedeck`).
- Nie das echte `~/.claude/settings.json` in Tests anfassen; `CLAUDE_CONFIG_DIR` auf ein Temp-Verzeichnis setzen.
- Name (D26, Regeln in `bespex.github.io/brand/README.md`): ein Name überall, „CodeDeck“ im Text, `codedeck` für
  Befehl, Programm, Paket, Schriftzug, Dateien und Verzeichnisse (`~/.config/codedeck`, `refs/codedeck/`, `CODEDECK_*`)
  und die Adresse `bespex.run/codedeck` (keine eigene Subdomain). `codeck` gibt es nur noch als Alias und Übergangspaket, nirgends im Text. Teile
  heißen nach dem, was sie sind (Übersicht, Projektfenster). Im Text „be spex“, nie „be-spex“.
- Commits nur auf Wunsch, auf `main`, Englisch, Autor **Bert Speckels <skrrytch@speckels.net>** (lokale Repo-Config; nie die globale Arbeitsadresse), **ohne KI-Zeilen** (kein `Co-Authored-By`, kein `Claude-Session`, kein „Generated with Claude Code“; gilt für alle bespex-Projekte).

## Aufgaben, Ideen, Roadmap

Offene Punkte und geplante Aufgaben stehen in `TODO.md`, Ideen in `IDEAS.md`, eine von der KI geplante Roadmap (optional) in `ROADMAP.md` (Repository-Hauptordner; Aufbau und Regeln in `~/.claude/CLAUDE.md`). Alle drei landen im Git-Repository: keine Zugangsdaten, privaten Daten, internen URLs, Hostnamen oder IPs. Ideen aus `IDEAS.md` nur nach ausdrücklicher Freigabe umsetzen.
