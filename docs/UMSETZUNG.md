# Umsetzung: Einzelheiten und Verlauf

> Einzelheiten der Schritte, die im Plan (`docs/PLAN.md`, bis 2026-11-27) standen: Stand, MVP-Phasen mit Ziel,
> Dateien und Abnahme, die ausgearbeiteten Vorhaben unter „Später“ und die älteren Pakete P0–P10. Die Zeichen
> ✅ ◐ ☐ geben den Stand vom 2026-11-27 wieder und werden hier nicht mehr gepflegt. **Was ansteht, steht in
> `ROADMAP.md`, offene Fragen in `TODO.md`, Ideen in `IDEAS.md`.** Arbeitsweise: `CLAUDE.md`.

## Stand (2026-11-18)

MVP 1 und MVP 2 sind gebaut und in der echten App bestanden (Checklisten `docs/praxistest-*.md`). Von MVP 3 sind
gebaut: 3.0 Ein Prozess (bestanden), 3.0b Übersicht, 3.2 Konten, 3.3 Steuern, 3.5 Bei der Anmeldung; 3.1 ist durch „Ort der Sitzung“ und
die Türen erledigt (abgehakt 2026-11-18). Themes S.1 und S.2 sind vorgezogen (`docs/STYLING.md`). Name nach D26: `codedeck`
überall; ein erstes Release unter diesem Namen steht aus (`brand/board.png` zeigt noch den alten Stand).

Zuletzt dazugekommen (2026-11-18): Übersicht mit Gruppen nach Ordner, Ziehen und einmaligem Sortieren, „All
projects in a folder…“, Menüs nach oben; Tray wie in Maillet; Markierung (Pille fragt, Punkt fertig) wie in allen
be spex-Apps; Changes öffnet Dateien wie der Dateibaum, Diff einer Datei in Dirq, eine Werkzeugleiste beim
Überfahren für alle Listen (`RowTools`). Praxistest dieser Teile laut Nutzer bestanden (2026-11-18). Danach der
Rest von 3.3 (Startbefehl sichtbar, „Starting…“ sofort, „at start“), Praxistest offen.

**Offene Praxistests:** 3.3 und 3.2 ganz; von 3.0b die älteren Teile (Position am rechten Rand, Farben, Regel
„nur lebendige Sitzungen“, Terminal-Tür für eine Hand-Sitzung); `docs/praxistest-3-vorarbeit.md` Teil 1 bis 3
(Teil 3 gehört zu 3.3b).

**Als Nächstes:** 3.4 Tagesliste und Startseite, dann 3.3b (3.5 ist auf den Start bei der Anmeldung geschrumpft und gebaut); aus MVP 4 ist 4.3 (Tests je Runde) zum
Vorziehen empfohlen.

Leitlinien (aus dem Konzept übernommen und festgelegt): CodeDeck führt die KI nicht selbst aus, Claude
Code tut das; CodeDeck darf Sitzungen in tmux starten und überwachen, ist aber kein Gesprächsweg (D4, D5).
Keine eigene Editierfläche, angezeigt und bearbeitet wird in externen Apps (Qiew).
Kontext bekommt die KI nur, wenn der Nutzer ihn ausdrücklich setzt, nie automatisch; einzige Ausnahme
sind wenige feste, offen einsehbare Startregeln (`KONZEPT.md` 4.5).
Optimistic Flow: Die KI schreibt direkt, abgesichert wird über die Sicherungspunkte.

## Reihenfolge

Es gilt die Reihenfolge der MVP-Phasen im nächsten Abschnitt. Von den alten Paketen sind P1, P2, P3 und
P5 erledigt; die offenen sind in die Phasen einsortiert (P0 → 1.1, P4 → 2.4, P6 → 4.5, P7 → 4.4,
P8 → 4.1, P10 → 1.2 und „Später“). P9 bleibt zurückgestellt.

---

## Zielbild: MVP-Phasen

Jede Phase endet mit etwas, das im Alltag benutzbar ist, und besteht aus mehreren Schritten. Ein Schritt
ist eine Session oder weniger. Der Click-Dummy ist die Vorlage, kein Bauplan: Er zeigt nicht alles, was
CodeDeck schon kann, und manches darin ist technisch ungeprüft.

### MVP 1: Der Leitstand im Projekt

*Nutzen danach:* Ein Projekt mit von Hand gestarteten Sitzungen lässt sich im neuen Aufbau beobachten,
prüfen und lenken. Alles beruht auf Daten, die es heute schon gibt.

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 1.1 Praxistest ✅ 2026-11-15 | P0 durchführen (braucht den Nutzer). Zusätzlich klären: Kommt Text aus dem Hook „Sitzung beginnt“ in der Sitzung an? Sieht der Hook Schreibvorgänge außerhalb des Projekts und Werkzeugaufrufe, die eine Seite veröffentlichen (mit Link)? Feuern die Hooks auch, wenn der Prompt über Desktop/Web kommt? | – | `hook.rs`, `bridge.rs` | Die fünf Punkte aus P0 und die drei Fragen sind beantwortet und unter „Notizen“ festgehalten |
| 1.2 Schnittstelle für KI-Werkzeuge ✅ 2026-11-15 | Alles Claude-Spezifische hinter die Schnittstelle aus „Kapselung der KI-Anbindung“ ziehen. Kein neues Verhalten | – | `hook.rs`, `sessions.rs`, `bridge.rs`, `lib.rs`, `backend.ts` | Tests grün; ein Test-Adapter ohne Claude liefert Sitzungen; Frontend fragt Fähigkeiten statt Werkzeugnamen |
| 1.2a Sitzungs-Identität ✅ 2026-11-15 | D15: Jede Sitzung bekommt Farbe und Kurzname, überall gleich (Liste, Trail, Snapshots, Dateien); Hover hebt Zugehöriges hervor; feste Reihenfolge nach Start statt nach Aktivität; Umbenennen (Titel, Kurzname) je Projekt. Titel aus dem Log: zuerst `custom-title`, dann `ai-title` | rechte Spalte, Trail | `bridge.rs` (`sort_by last`), `harness/claude.rs` (Log), `config.rs`, `SessionsPanel.tsx`, `Trail.tsx` | Zwei Sitzungen sind in Liste, Trail und Dateibaum an Farbe und Kurzname zu unterscheiden; die Liste springt nicht mehr; ein vergebener Name überlebt den Neustart |
| 1.3 Grundgerüst ✅ 2026-11-15 | Projekt öffnet in Changes (D14). Vier Reiter mit ihrer Frage, Bereichsfarben, die fünf Erscheinungsformen als wiederverwendbare Bausteine (Werkzeugleiste, Abschnitt, Zeile, Dokument, Entscheidung). Bestehende Ansichten einsortieren: Docs → Handover, Workspace/Map/Tests entfallen als Reiter | Projektansicht, alle Reiter | `Deck.tsx`, `views/*`, `index.css`, `App.tsx` | Alle heutigen Funktionen sind im neuen Gerüst erreichbar; Vorschau zeigt vier Reiter |
| 1.4 Rechte Spalte ✅ 2026-11-15 | „Needs you“, Sitzungen als zwei Zeilen mit aufklappbaren Details, „Next prompt“ mit Vorschau des Textes und Empfangsbestätigung | rechte Spalte, Szenen 2–7 | `SessionsPanel.tsx`, `assistant.ts`, `bridge.rs` (Übergabe abgeholt melden) | Wartende Sitzung erscheint oben mit Grund; nach dem nächsten Prompt steht „Delivered“ |
| 1.5 Changes je Runde ✅ 2026-11-15 | Auswahl „Turn n / All uncommitted“ (macht den Strg+Klick-Vergleich entdeckbar, ersetzt ihn nicht), Kurzbericht aus dem Log, Datei abhaken, „Claude“ oder „You“ je Datei, Zeile kommentieren | Changes, Szenen 4–7 | `ChangesView.tsx`, `DiffParts.tsx`, `history.rs`, `sessions.rs`, `focus.ts` | Ein Zeilenkommentar landet in „Next prompt“ und kommt bei Claude an |
| 1.6 Handover ✅ 2026-11-15 (Praxistest bestanden 2026-11-16) | Reiter mit Warteschlange, genauem Text, Quellen, `@ai`-Hinweisen; Startregeln (abhängig von 1.1) sichtbar; Marker-Regel D18, Zielsitzung D19. Auftrag: Notiz „Vorbereitung 1.6“ | Handover | `DocsView.tsx` → Handover, `markers.ts`, `hook.rs` | Regeln stehen wörtlich im Reiter und kommen in einer neuen Sitzung an |
| 1.6b Änderungen anhängen ✅ 2026-11-15 | Runde, Commit, Snapshot, Vergleich, nicht Committetes oder eine Datei davon als Verweis anhängen (Git-Befehl, nicht der Diff); Angehängtes am Ursprung markiert; je Sitzung „Got from CodeDeck“ | Changes, rechte Spalte | `changes.ts`, `ChangesView.tsx`, `DiffParts.tsx`, `StructureTree.tsx`, `bridge.rs` | Eine angehängte Runde kommt als `git diff …` bei Claude an, und die Sitzung zeigt danach, was sie bekommen hat |
| 1.7 Anhänge aus einem Guss ✅ 2026-11-15 | Aus dem Review vom 2026-11-15 (Notiz „Review 1.6–1.6b“): (A) ein Modul `attachments.ts` mit einem gemeinsamen Baustein je Anhangsteil (Speicher, Abgleich, Zählen) für Dateien, Änderungen, Zeilenkommentare und Hinweise; behebt den Wettlauf beim Absenden und zu viel „attached“ an Hinweisen. (B) Das Backend liefert den fertigen Text der Anhänge (`AssistantState.preview`), das Frontend setzt ihn nicht mehr selbst zusammen. (C) Mit umbenennen: `hand_over` → `attach`, `handovers` → `attachments`, `focus.ts` → `files.ts`, `HandoverTarget` → `AttachTarget` (rein mechanisch, Oberfläche unverändert). Kein neues Verhalten | – | `notes.ts`, `changes.ts`, `focus.ts`, `markers.ts`, `App.tsx`, `bridge.rs`, `lib.rs`, `backend.ts` | Ein Anhang, der während des Absendens dazukommt, bleibt stehen und geht mit dem nächsten Prompt raus; die Vorschau zeigt den Text aus dem Backend |
| 1.6a Einheitliche Begriffe ✅ 2026-11-15 | D20, D21: „Attach“ und „Next prompt“ überall; Reiter „Handover“ → „Next prompt“; Fokus weg, Anpinnen hängt direkt an | Handover, rechte Spalte (Dummy nennt es noch anders) | `NextPromptView.tsx`, `SessionsPanel.tsx`, `focus.ts`, `FilesPanel.tsx`, `DiffParts.tsx` | Kein „Handover“, „Focus“, „Hand to“, „Queue“ mehr in der Oberfläche; Anhänge an drei Stellen gleich gezählt |

### MVP 2: Nichts bleibt unbemerkt

*Nutzen danach:* Auch was außerhalb des Projekts entsteht und was über den Tag geschah, ist sichtbar.

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 2.1 Workbench-Ordner ✅ 2026-11-15 (Praxistest bestanden 2026-11-16) | Ordner anlegen und lokal ignorieren (`.git/info/exclude`, nicht `.gitignore`), Inhalt mit Größe und Alter, Öffnen, ins Projekt übernehmen, löschen, „älter als … löschen“. Startregel zu `.workbench/` (D16). Externe Dateien anhängen: verschoben nach „Später“ | Workbench | neu `workbench.rs`, `views/WorkbenchView.tsx`, `watch.rs` | Eine Datei im Ordner erscheint sofort, Aufräumen löscht nur Altes |
| 2.1a Aufmerksamkeit ✅ 2026-11-16 | Wer über Statusänderungen informiert werden will, sieht sie deutlich: Zahl im Fenstertitel, Taskleiste verlangt Aufmerksamkeit, Desktop-Meldung, neuer Eintrag unter „Wartet auf dich“ leuchtet kurz; wobei und wie wählt man im Projektmenü (Entscheidung des Nutzers 2026-11-16, `docs/SEITENLEISTE.md`) | nicht im Dummy | `lib.rs`, `bridge.rs`, neu `attention.rs`, `SessionsPanel.tsx`, `ProjectHeader.tsx` | Eine Erlaubnisfrage bei verdecktem Fenster ist in der Taskleiste und als Meldung zu sehen |
| 2.1b Kopfleiste ✅ 2026-11-16 | Rechte Spalte oben: Projektmenü, Schnelleinstellungen mit „Nicht stören“, App-Menü `⋯`, About, Tastenkürzel, Einstellungsdialog (Allgemein, Meldungen, KI-Werkzeuge); links nur noch der Pfad. Ersetzt Seitenleiste A | – (`docs/KOPFLEISTE.md`) | neu `HeaderBar.tsx`, `Dialogs.tsx`, `AttentionChoice.tsx`, `dialogs.ts`; `ProjectHeader.tsx` (jetzt `ProjectMenu` und `PathBar`), `attention.rs` (`quiet_until`), `lib.rs` (`app_info`, `open_url`), `build.rs` (Commit) | Sprache und Meldungen sind nicht mehr im Projektmenü |
| 2.1c Seitenleiste ✅ 2026-11-16 (Praxistest bestanden 2026-11-16) | Seitenleiste B aus `docs/SEITENLEISTE.md`: nur die rechte Spalte, Fenster schmal am rechten Rand seines Bildschirms (volle Höhe des Arbeitsbereichs); zurück an Ort und Größe. Übersicht (Git, Runden, Werkbank), Knopf in der Kopfleiste, `Ctrl+Shift+L`; globale Kürzel `Ctrl+Alt+C` (zeigen/ausblenden) und `Ctrl+Alt+L` (Leiste/voll) für alle Fenster | – (`docs/SEITENLEISTE.md`) | neu `window.rs`, `compact.ts`, `SidebarSummary.tsx`; `App.tsx`, `SessionsPanel.tsx`, `HeaderBar.tsx`, `Dialogs.tsx`, `view.ts`, `bridge.rs` (Fensterbotschaften) | Ein Druck auf `Ctrl+Alt+L` macht aus dem vollen Fenster die Leiste und zurück, an derselben Stelle |
| 2.2 Fundstücke und Links ✅ 2026-11-16 (Praxistest bestanden 2026-11-16) | Schreibvorgänge außerhalb des Projekts der Sitzung zuordnen und melden; veröffentlichte Seiten als Link merken (über die Startregel: Links im Schlussbericht der Runde) | Workbench: „Still somewhere else“, „Pages on claude.ai“ | neu `findings.rs`, `FoundTiles.tsx`; `bridge.rs`, Adapter (`is_own_file`, `page_hosts`, `Event.writes`), `lib.rs` | Eine in `/tmp` geschriebene Datei wird gemeldet und lässt sich holen |
| 2.3 Activity und Hinweise ✅ 2026-11-16 (Praxistest bestanden 2026-11-17, Funde als 2.3b bis 2.3e unten) | Zeitleiste der Sitzungen aus den Ereignissen, „How safe is your work“, geschriebene Dokumente; Panel „Notices and tips“ | Activity, Glocke | neu `views/ActivityView.tsx`, `bridge.rs` (Ereignisse merken) | Ein Vormittag ist als Zeitleiste nachvollziehbar |
| 2.3b Hintergrundjobs auslaufend ✅ 2026-11-17 (Praxistest bestanden 2026-11-17; belegt: `Stop` liefert `background_tasks` mit `id`/`type`/`status`/`description`/`command` und die Notification kommt als Prompt mit `<task-id>`, Claude Code 2.1.326; Debug-Aufzeichnung der Hook-Rohdaten über `~/.local/state/codedeck/hook-log`, siehe `hook.rs`) | Eine Runde gilt mit `Stop` als fertig, auch wenn Hintergrundarbeit weiterläuft (Shells mit `run_in_background`, Monitor, Subagenten); in der Zeitleiste fehlt dann der Balken. Quelle: das Feld `background_tasks` des `Stop`-Hooks (`id`, `type`, `status`, `description`, bei Shells `command`; Doku https://code.claude.com/docs/en/hooks, in der echten App zu prüfen, ob die Version es schon liefert). Kein eigenes Mitzählen von Start und Ende. Das Ende eines Jobs hat keinen Hook, nur die `<task-notification>` als neuer Prompt. Darum keine neue Phase: nach dem Rundenende hängt am Block ein Ausläufer. Ende bekannt (Notification kam): blasserer Balken, hart abgeschnitten. Ende unbekannt: Verlauf von voller Deckung auf 0 über feste Zeit (10 bis 15 Minuten, nicht Pixel), in Sitzungsfarbe, wenn nötig mit Schraffur. Tooltip in Worten („2 background jobs, end unknown“) | Activity | `harness/claude.rs` (`background_tasks` am `Stop`, neutrales Feld im Ereignis), `harness/mod.rs`, `bridge.rs`, `journal.rs`, `src/timeline.ts` (`lanesOf`: Feld `tail` = `known`/`unknown`), `ActivityView.tsx` | Eine Session startet einen Build im Hintergrund und endet die Runde: der Balken läuft aus. Kommt die Notification, endet er hart |
| 2.3c Ablehnung und Abbruch ✅ 2026-11-17 (Praxistest bestanden 2026-11-17; gebaut ohne Zeitlimit: Bridge liest alle 3 s das Logende der Sitzungen in `working`/`waiting`, `Harness::cut_short`, Test `sees_a_turn_the_user_stopped`) | Lehnt der Nutzer eine Erlaubnisfrage ab und bricht mit Esc ab, bleibt die Sitzung auf `waiting` („Claude needs your permission“) und der Balken gelb, bis der nächste Prompt kommt. Belegt im Journal: nach `waiting` kein `turn_done`, auch kein `idle_prompt`. Laut Hook-Doku gibt es dafür keinen Hook: `Stop` läuft nicht bei Nutzerabbruch, `PermissionDenied` nur im Auto-Modus, `PostToolUseFailure` deckt Ablehnungen nicht ab. Behelf, ausdrücklich nicht amtlich: bei `waiting` das Logende der Sitzung beobachten; der Eintrag „[Request interrupted by user for tool use]“ setzt auf `idle`. Dazu ein Zeitlimit („waiting“ ohne neues Ereignis und ohne neuen Logeintrag über X Minuten zählt nicht mehr als Frage) | Activity, Needs you | `harness/claude.rs` (Logende lesen), `bridge.rs`, `attention.ts` | Ablehnen und Esc: Status und Balken enden, „Needs you“ zählt die Sitzung nicht mehr als Frage |
| 2.3d Desktop-Meldungen stapeln sich ✅ 2026-11-17 (Praxistest bestanden 2026-11-17; Zurückziehen erledigter Meldungen und Ablaufzeit bewusst nicht gebaut) | Jede Meldung (`attention.rs` `desktop()`, `notify-rust`) bleibt im Benachrichtigungsbereich; Cinnamon zeigt die Zahl der ungelesenen als Badge am Taskleistensymbol (13, während „Needs you“ 2 zeigt; ein Klick auf das Fenster setzt sie auf 0). Besser: eine Meldung je Sitzung ersetzen (`replaces_id`), zurückziehen, sobald der Eintrag erledigt ist, Ablaufzeit setzen. Dazu den Fenstertitel trennen: `● 2 asking · 9 done` statt einer Zahl, und die Zahl in „Needs you“ mit Tooltip erklären (2 fragen, 9 fertig in den letzten 30 Minuten) | Needs you, Fenstertitel | `attention.rs`, `attention.ts`, `SessionsPanel.tsx` | Nach mehreren Runden steht höchstens eine Meldung je Sitzung da; die Zahl in der Taskleiste passt zu „Needs you“ |
| 2.3e Projekt ohne Git ✅ 2026-11-17 (Praxistest bestanden 2026-11-17; Funde behoben: `rev-parse --verify` ohne Commit stand rot im Git-Log, jetzt `Git::verify` mit Exit-Code 1 als Antwort; Git-Log kopierbar, „Copy“ im Kopf und je Eintrag) | Ohne Repository gibt es weder Commits noch Snapshots: der Trail wird nicht gezeigt. Stattdessen „No git repository“ mit Knopf `git init` links in der Statusleiste (die Übersicht oben rechts nennt nur den Hinweis), dazu ein Abschnitt mit den Vorteilen bei „Notices and tips“. `git init -b main` läuft über `Git::execute` (im Log), ist keine der `ACTIONS` und nur ohne Repository möglich. Das Git-Log gehört dem Prozess: beim Projektwechsel wird es geleert, vorher zeigte ein Projekt ohne Git die Befehle des vorigen | Statusleiste, Übersicht, Glocke | `git.rs` (`init`, `clear_log`), `lib.rs` (`git_init`, `open_project`), `git.ts` (`loaded`), neu `GitInit.tsx`, `Deck.tsx`, `StatusBar.tsx`, `SidebarSummary.tsx`, `NoticesPanel.tsx` | Ein Ordner ohne Git zeigt keinen Trail; ein Klick auf `git init` macht ihn zum Repository, der Trail erscheint |
| 2.4 Verbrauch ✅ 2026-11-17 (Praxistest bestanden 2026-11-17) | P4: erst den Spike. Ohne verlässliche Quelle entfällt die Anzeige, nicht schätzen | Activity, Statusleiste | siehe P4 | D2 ist entschieden und umgesetzt oder gestrichen |
| 2.5 Größen ✅ | Dateiliste und rechte Spalte in der Breite ziehen, Aufteilung je Projekt merken; Trennlinien haarfein (Zuklappen und Tastenkürzel gestrichen, Nutzer 2026-11-17, für die Dateiliste 2026-11-19 doch gebaut, siehe „Später“; Praxistest bestanden) | Trennlinien (im Dummy nur angedeutet) | `App.tsx`, `Deck.tsx`, `config.rs` | Aufteilung überlebt einen Neustart |

### MVP 3: CodeDeck ersetzt das Start-Script

*Nutzen danach:* Der Tag beginnt in CodeDeck. Das eigene Script wird nicht mehr gebraucht.

Reihenfolge (Nutzer 2026-11-17): 3.0, (3.0b, falls abgestimmt), 3.1, 3.3, 3.4, 3.2, dann 3.3b und 3.5 (aus `docs/SITZUNGEN.md` B9). Die
Tagesliste kommt so vor den Konten; bis 3.2 wählt sie das Konto aus den gefundenen Konfigurationen. Spikes
zu Desktop und Remote Control erledigt (SITZUNGEN B4, B11).

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 3.0 Ein Prozess ✅ 2026-11-17 (Praxistest bestanden 2026-11-17: neues Fenster, zweiter Aufruf, Hooks und Dateien je Fenster, Kürzel, Einstellungen, Meldung, Schließen. Funde: Klick auf Meldung holte das falsche Fenster → wie die Kürzel über `obey`; `git grep` ohne Treffer im Log rot → `Git::ask`; die Zahl am Taskleistensymbol zählt Cinnamon je Programm, steht also an allen Fenstern, nicht änderbar → Icon je Fenster, siehe Notizen) | D25 umsetzen, ohne neues Verhalten: Zustand je Fenster (`Windows`: Projekt, `Inner`, Watch, Git; `Inner` so zuschneiden, dass es in 3.4 auch ohne Fenster leben kann), Commands über das aufrufende Fenster, Ereignisse mit `emit_to`; ein Socket für alle Hooks; zweiter Aufruf und „Neues Fenster“ öffnen im laufenden Prozess; globale Kürzel und „vorn“ im Prozess (Abstimmung über Dateien entfällt); Einstellungen als Ereignis; Sperren ohne `unwrap()`; Dev- und installierte Version mit getrennten Socket-Namen. Ablauf in `docs/PROZESSMODELL.md` „Aufwand für B“ | – | `lib.rs`, `bridge.rs`, `window.rs`, `hook.rs`, `watch.rs`, `git.rs` | Praxistest: zwei Projekte in zwei Fenstern, Hooks landen im richtigen, Kürzel wirken, letztes Fenster zu beendet das Programm |
| 3.0b Übersicht ✅ 2026-11-18 (Nutzer 2026-11-17: „jetzt anfangen, in kleinen Schritten“; gebaut: Fenster `overview`, `overview_state`, Zusammenfassung je Projektfenster, Wartet auf dich und Projektliste, Icons beim Überfahren, Werkzeugleiste mit Öffnen, Einstellungen und `⋯` (Dialoge im Projektfenster, Quit), `Ctrl+Alt+L`, Knopf in der Kopfleiste, öffnet mit CodeDeck. Nächste Schritte nach `UEBERSICHT.md` „Meine Projekte …“: (a) ✅ feste Liste meiner Projekte in `projects.json`, Projekt aufnehmen ohne Fenster, Fenster-Symbol als Schalter; (b) ✅ Sitzungen geschlossener Projekte (eine Brücke je Projekt, `windows::Bridges`; auch Snapshots ohne Fenster); Türen aus der Übersicht vorgezogen: Doppelklick Desktop/Terminal, Mittelklick Terminal (`doors.rs`, `Harness::desktop_command`, Profile je Konto in `settings.json` `desktopProfiles`, Einstellung dazu mit 3.2); Klick auf die Marke verbirgt/zeigt das geladene Fenster, Doppelklick lädt es; Änderungen (Git, Nächster Prompt, Werkbank) als Icons immer sichtbar; (c) ✅ KI-Konfiguration je Projekt und Menü der Zeile (Stern für die Tagesliste, Warnung bei falscher Konfiguration); (d) ✅ Marken mit Auswahl, auch als Fenster-Icon; (e) ✅ Leistenform je Projekt entfernt, `Ctrl+Shift+L` zeigt die Übersicht; (f) ✅ 2026-11-18 Ziehen und einmaliges Sortieren, Gruppen nach Ordner (`groups.ts`), „All projects in a folder…“, Tray (`tray.rs`), Markierung Pille/Punkt; Praxistest von (f) und „Marke ändern“ bestanden 2026-11-18. Offen: Praxistest der älteren Teile (Position, Farben, nur lebendige Sitzungen, Terminal-Tür für eine Hand-Sitzung)) | `docs/UEBERSICHT.md` (2026-11-17). Ein eigenes Fenster für alle Projekte statt der Leiste je Projekt: Wartet auf dich über alle Projekte, ein Block je offenem Projekt (Zustand, Sitzungen einzeilig), Sprung ins Projektfenster; ist die Startseite (3.4 hängt die Tagesliste an). Leistenform je Projekt entfällt | `overview.html` | neu `OverviewApp.tsx`, `windows.rs` (Fenster `overview`, `overview_state`, `focus_project`), `window.rs` | Praxistest: drei Projekte offen, eine Übersicht zeigt alle; eine Frage aus einem verdeckten Projekt ist mit einem Klick erreicht |
| 3.1 tmux sehen ✅ 2026-11-18 (erledigt durch Ort der Sitzung, Türen Terminal/Desktop, Doppel- und Mittelklick, Konten; Handy-QR, ssh-Tür, „Open“ in der Desktop-Meldung und Fußzeile laut Nutzer nicht nötig; SITZUNGEN Fragen 1, 3, 4, 5 bestätigt) | Konzept zur Abstimmung: `docs/SITZUNGEN.md` (Entwurf 2026-11-17, Dummy `sessions.html`; schlägt neue Zuschnitte für 3.1 bis 3.3 vor). Laufende tmux-Sitzungen den Projekten und Claude-Sitzungen zuordnen; Sprungziele „Desktop“ und „tmux“. Vorher klären, wie das heutige Script startet (Befehl, Remote Control) | Sitzungsdetails | neu `tmux.rs`, `apps.rs` | Vom Script gestartete Sitzungen tragen ihren tmux-Namen, „tmux“ öffnet ein Terminal dort |
| 3.3 Steuern ◐ (2026-11-17 gebaut, Praxistest offen: `tmux.rs` startet in tmux über die Login-Shell mit `--session-id`/`--resume`, `-n`, `--remote-control`, Konto des Projekts als `CLAUDE_CONFIG_DIR` aus dem Adapter (`Harness::launch`), `CODEDECK_SESSION`, `@codedeck`; Übersicht: ▶ Tagesliste (überspringt Laufendes, setzt die letzte nicht beendete Unterhaltung fort), Menü „Sitzung starten“/„Neue Sitzung“, an der Sitzung Neu starten/Beenden (nur tmux, nicht während sie arbeitet). 2026-11-18 der Rest: „Starting…“ sofort nach jedem Start (Ereignis `sessions_started`), erst nach 20 s „waits in tmux“; Startbefehl genau so, wie er lief, in der tmux-Option `@codedeck-command` (Details der Sitzung: Zeile „Gestartet mit“ mit dem Befehl des Werkzeugs, Tooltip und Kopieren mit dem ganzen tmux-Befehl; Stoppbefehl im Tooltip von Beenden; kopieren auch in der Übersicht). Sitzungskarte der rechten Spalte umgebaut (Nutzer 2026-11-18, Platz in schmaler Spalte): drei Zeilen (Titel und Status; Kurztext in voller Breite; Art der Sitzung: Modell, von Hand, „tmux“ mit Namen im Tooltip, blaues Symbol für erreichbar, rechts beim Überfahren die Werkzeuge wie überall, `RowTools`: Desktop, Terminal | Neu starten, Beenden | `⋯`; feste Höhe, nichts springt; leerer `title` an `HoverTools`, damit nie zwei Tooltips stehen), Seltenes im `⋯` und Rechtsklick (Umbenennen, Startbefehl kopieren, Aus der Liste nehmen), Angaben als Liste mit einer Angabe je Zeile; Einstellung „Tagesliste: Mit CodeDeck starten“ (Allgemein, Rechner-Einstellung `startTodayAtStart`), wartet, bis jedes Projekt der Liste seine Logs gelesen hat; Adapter `Harness::running` liest die laufenden Prozesse aus `<config>/sessions/<pid>.json`, damit nach einem Neustart von CodeDeck eine ruhige laufende Sitzung als laufend gilt und nichts doppelt startet. Praxistest offen) | Start, Stop, Restart, New task über tmux, jeweils mit sichtbarem Befehl; Neustart nach dem Verbinden der Hooks anbieten | Sitzungsdetails, Kacheln | `tmux.rs`, Adapter (`launch`) | Eine Sitzung lässt sich aus CodeDeck starten und ist danach in Desktop bedienbar |
| 3.4 Tagesliste und Startseite ☐ | `docs/SITZUNGEN.md` A12, A13, B12 (abgestimmt 2026-11-17): Tagesliste (eine Sitzung je Projekt, ▶ setzt fort, „▶ All“ überspringt Laufendes, „at start“ beim Start von CodeDeck). Ohne offenes Projekt ist das Fenster die Startseite in Leistenform; mit Projekt „Wartet auf dich“ über alle Projekte und die Tagesliste im Projektmenü. `Inner` je bekanntem Projekt, auch ohne Fenster. Projekt schließen und letztes Fenster schließen → Startseite statt Beenden; Quit im App-Menü | `sessions.html` (Fenster: Startseite, Ereignis „CodeDeck started“) | `bridge.rs`, `lib.rs`, `recent.rs` bzw. `projects.json`, `tmux.rs`, `App.tsx`, `SessionsPanel.tsx`, `ProjectHeader.tsx` | Praxistest: CodeDeck starten, die Tagesliste läuft an, ohne dass ein Projekt aufgeht; eine wartende Sitzung ist mit Doppelklick erreichbar |
| 3.2 Konten ✅ 2026-11-17 (Praxistest offen; `accounts.rs`, `accounts.json`: Name, Farbe, Desktop-Profil je Konfiguration, Einstellungen → Konten; Adapter sagt `account_kind` in Gebrauch/unbenutzt/Sicherung und findet Desktop-Profile; Sicherungen und unbenutzte in den Papierkorb nach Rückfrage; Konto an jeder Sitzung, Name und Farbe in Übersicht und Menü; frühere `desktopProfiles` werden übernommen) | Gefundene Konfigurationen benennen und einfärben, Seitenleiste; Konto an jeder Sitzung. Verwaltung: Verzeichnisse, die keine benutzte Konfiguration sind (Sicherungskopien wie `.claude-cleanup-…`, nur `settings.json` und Kopien, keine Sitzungen), erkennbar kennzeichnen und nach Rückfrage löschbar machen (nie von selbst; Anlass 2026-11-17). Neue, noch unbenutzte Konfigurationen bleiben sichtbar, auch für tmux-Starts (3.3) | Startseite, Personen-Knopf | `hook.rs` (`config_dirs`), `config.rs`, Adapter | Jede Sitzung zeigt ihr Konto |
| 3.5 Bei der Anmeldung ✅ 2026-11-18 (Praxistest offen; Nutzer 2026-11-18: weitere Listen vorerst nicht, eine Tagesliste reicht; Warnungen mit Behebung nicht sinnvoll) | Einstellung „Bei der Anmeldung: Aus / Im Tray“ legt `~/.config/autostart/codedeck.desktop` an oder entfernt ihn (`autostart.rs`, XDG, auch Wayland); er startet `codedeck --tray`: kein Projektfenster, Übersicht verborgen, läuft schon eines, endet der Aufruf. Zeigt, wenn der Eintrag ein anderes Programm startet. Mit „Tagesliste: Mit CodeDeck starten“ laufen beim Anmelden auch deren Sitzungen an | – | `autostart.rs`, `lib.rs` (`run`), `windows.rs` (`hidden_overview`), `Dialogs.tsx` | Nach dem Anmelden läuft CodeDeck im Tray, ohne Fenster |

### MVP 4: Für andere benutzbar

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 4.1 Ersteinrichtung ☐ | Nach `KONZEPT.md` 4.8: Nötiges prüfen, Konten, Qiew-Werkzeuge suchen und verknüpfen, Projekte. Löst P8 ab | nicht im Dummy | `apps.rs`, `config.rs`, neu `setup.rs` | Auf einem frischen Benutzerkonto führt eine Seite bis zur ersten Sitzung |
| 4.2 Tutorial ☐ | Fünf Schritte auf der echten Oberfläche mit Beispielprojekt | Szenenleiste als Muster | `mock.ts`, neu `Tutorial.tsx` | Überspringbar, aus „Notices and tips“ wieder aufrufbar |
| 4.3 Tests je Runde ☐ | Testbefehl je Projekt, Ergebnis in Changes, roter Test in den nächsten Prompt | Changes, Szene 4 | neu `tests.rs`, `ChangesView.tsx` | Ein roter Test lässt sich mit einem Klick mitgeben |
| 4.4 Qiew-Rückkanal ☐ | P7 | – | siehe P7 | siehe P7 |
| 4.5 Worktrees ☐ | P6, soweit nach MVP 3 noch offen | Sitzung „API docs refresh“ | siehe P6 | siehe P6 |
| 4.6 Handbuch ☐ | Handbuch auf der Webseite, `/codedeck/manual/de/` (danach `/en/`): Geschichte, Einleitung, Tutorial, Nachschlagen, Anhang | – | Repo `bespex.github.io`: `src/pages/codedeck/manual/de/**/*.md`, Layout `src/layouts/Manual.astro` | Alle Seiten ohne `draft: true`, vom Nutzer abgenommen; Menüpunkt „Handbuch“ zeigt dorthin |

**4.6 Handbuch (Struktur angelegt 2026-11-21).** Die Struktur steht als Entwurf auf der Webseite und *ist* der Plan:
jede Seite nennt ihren Zweck und enthält die Arbeitsanweisungen (Kästen „Arbeitsanweisung“ für die Seite, „Inhalt“ je
Abschnitt). Vor jeder Seite zuerst die Regeln „Für alle Seiten des Handbuchs gilt“ auf der Startseite
(`index.md`) lesen. Eine Seite je Session, dann dem Nutzer zeigen. Empfohlene Reihenfolge: Einleitung, Tutorial 1–10
(mit dem Bilder-Skript `tools/manual-shots.mjs`, beim ersten Kapitel anlegen), Nachschlagen, Anhang, dann die Geschichte
auf der Startseite und das Glossar, zuletzt die englische Fassung. Die Entwürfe sind nirgends verlinkt und für
Suchmaschinen gesperrt (`draft`). Adresse: `bespex.run/codedeck/manual/de/` (Nutzer 2026-11-21; keine Subdomain `codedeck.bespex.run`), bis zum
Umzug der Website `bespex.github.io/codedeck/manual/de/`. Menüpunkt „Handbuch“ zeigt noch auf die README, umstellen, sobald die ersten Seiten stehen. Stand 2026-11-21: Einleitung fertig (fünf Seiten unter `einleitung/`, veröffentlicht, nicht verlinkt); Bilder mit `tools/manual-shots.mjs`. Das ganze Handbuch bleibt für Suchmaschinen gesperrt, bis `listed` in `Manual.astro` auf `true` steht (zusammen mit dem Menüpunkt). Stand 2026-11-22: englische Fassung unter `/codedeck/manual/en/` mit gleicher Struktur und englischen Pfaden (`introduction/`, `tutorial/`, `reference/`, `appendix/`), Entwürfe ebenfalls als Entwurf; jede englische Seite nennt ihre deutsche in `translation:`, daraus der Sprachwechsel im Handbuch. Bilder mit `node tools/manual-shots.mjs --lang=en`. Der Menüpunkt „Handbuch“ öffnet das Handbuch in der Sprache der Oberfläche.

### Später

- **Zweites KI-Werkzeug:** zuerst Codex CLI, dann opencode, je als Adapter (siehe unten). Erst dann zeigt
  sich, ob die Schnittstelle trägt.
- **Erlaubnis aus CodeDeck** (D13), **Karte** (P9).
- **Binärdateien in älteren Änderungen ansehen** ☐ (Nutzer, 2026-11-26): In „jetzt“ öffnet ein Klick auf eine
  Binärdatei (PDF, Bild …; Git meldet „Binary files … differ“, `FileDiff.binary`) sie mit `openFile(…, "view")` statt
  eines Diffs bzw. Dirq (`FileSection` in `ChangesView.tsx`, gebaut 2026-11-26). Offen sind Runde, Commit, Snapshot und
  Vergleich: Dort ist die Datei auf der Platte nicht der gemeinte Stand. Dafür den Stand aus Git holen
  (`git show <rev>:<pfad>` über `Git::run`) und als temporäre Datei mit gleicher Endung im Viewer öffnen; neuer
  Befehl mit Mock in `backend.ts`. Dazu einen Knopf „vorher“, wenn es einen alten Stand gibt (vorher und nachher
  nebeneinander, etwa zwei Bilder). Gelöschte Binärdateien (auch in „jetzt“) zeigen so den alten Stand. Ebenfalls zu
  klären: ob der Knopf „Dirq“ Binärdateien aus dem Patch weglässt.
- **„Woran habe ich am Tag X gearbeitet?“** (Idee des Nutzers, 2026-11-15): CodeDeck weiß mehr darüber als Git
  allein (Sitzungen mit Titel, Prompts, Zeiten, geschriebene Dateien, Sicherungspunkte, Commits je Projekt). Ein
  MCP-Server-Teil von CodeDeck könnte das einer KI bereitstellen, um Arbeitszeiten und -themen zu erkennen. Braucht
  ein dauerhaftes Ereignisprotokoll je Projekt (entsteht mit 2.3 „Ereignisse merken“) und eine Antwort auf die
  Frage, was davon das Gerät verlassen darf.
- **Externe Dateien anhängen** (Idee des Nutzers, 2026-11-15, bei 2.1 zurückgestellt): eine Datei von außerhalb des
  Projekts als Kopie nach `.workbench/attached/` holen (Stand des Moments) und ihren Pfad anhängen, per Ziehen aus dem
  Dateimanager auf Next prompt (Tauri `drag-drop`-Ereignis) oder Knopf „Attach a file from elsewhere…“ (Dialog-Plugin
  ist da). Nur der Pfad ginge auch, dann fragt Claude meist um Erlaubnis.
- **Seitenleiste** (Idee des Nutzers, 2026-11-16, Rückfragen beantwortet): per globalem Kürzel auf die rechte
  Spalte verkleinern (kein eigenes Design), zweites Kürzel blendet CodeDeck ein und aus; Projektmenü wandert nach
  rechts oben; Benachrichtigungen bei Statusänderungen. Kurzkonzept mit drei Schritten (A Kopf rechts, B Leiste,
  C Aufmerksamkeit) in `docs/SEITENLEISTE.md`. Alle drei gebaut: C als 2.1a, A als Kopfleiste 2.1b, B als 2.1c. Schritt A ist als **Kopfleiste** ausgearbeitet (Projekt, Schnelleinstellungen, App-Menü, About, Einstellungsdialog; auch für die Startseite): `docs/KOPFLEISTE.md`, Entwurf zur Abstimmung (2026-11-16).
- **Themes** (Wunsch des Nutzers, 2026-11-17): vorbereitete Farbgebungen zum Auswählen, Rollen und Eingriffe, Vorgabe „CodeDeck“ und Beispiel „Signal“. Konzept `docs/STYLING.md` (Schritte S.1 bis S.3), Labor `design/click-dummy/themes.html`. Nach MVP 3; S.1 (Rollen bereinigen, ohne sichtbare Änderung) jederzeit dazwischen.
- **Linke Spalte zu- und aufklappen** ◐ (Nutzer, 2026-11-19, ändert die Entscheidung vom 2026-11-17 in
  `docs/KONZEPT.md` 4.7 Regel 4, dort angepasst). Konzept abgestimmt und gebaut 2026-11-19 (`FilesRail.tsx`),
  Praxistest offen:
  - **Zugeklappt eine schmale Leiste** (44 px), nicht Breite 0, weil in der Spalte mehr steckt als der Dateibaum: oben
    das Projektzeichen in der Projektfarbe (hält die 44-px-Kopfzeile, Tooltip mit Name und Ort), darunter
    Schnelleinstellungen und `⋯` als Symbole; am Projektzeichen ein KI-Punkt, wenn kürzlich etwas geändert wurde
    (Zahl im Tooltip; das zuerst gebaute Dateibaum-Symbol zum Aufklappen ist entfallen, Nutzer 2026-11-19); unten wie in der Statusleiste das Symbol für das Git-Log (`GitCommands` mit `compact`) und der Branch als Symbol in der Farbe der Git-Statusleiste (geändert/Fehler),
    Klick öffnet die Git-Aktionen wie heute. Ohne Git dort ein graues Branch-Symbol, das die Liste öffnet: `git init`
    ändert etwas und bleibt der beschriftete Knopf der offenen Liste. Filterfeld und Baum gibt es nur aufgeklappt;
    der Baum behält derweil, was aufgeklappt war.
  - **Aufklappen/Zuklappen:** `Ctrl+B` (wie die Seitenleiste in VS Code; nur im Fenster, kein globales Kürzel, also
    auch unter Wayland, keine Kollision mit `Ctrl+Alt+…`) und ein Klick auf das Projektzeichen: oben links in der
    Pfadleiste klappt es zu, in der Leiste wieder auf (Praxistest 2026-11-19: der zuerst gebaute Pfeil auf der
    Trennlinie war nicht zu finden, er ist entfallen). Doppelklick auf die Linie bleibt „Standardbreite“. Kürzel in
    `F1` und in den Tooltips.
  - **Trail:** Er öffnet sich nach links über die Dateiliste; reicht der Platz dort nicht für seine 400 px (Leiste),
    ragt er um den Rest nach rechts über das Deck (`overhang` in `Trail.tsx`, Breite und Lage gleiten zusammen, damit
    die Maus drin bleibt).
  - **Linke Statusleiste unter dem Trail** (Nutzer 2026-11-19, gilt immer, nicht nur zugeklappt): Der Trail endet über
    ihr, die Leiste reicht bis zu seinem rechten Rand (`UNDER_TRAIL` in `StatusBar.tsx`, ohne Git kein Trail und kein
    Überstand). So hat der Branch mehr Platz, und der Fuß der Leiste zeigt Branch und Git-Log in voller Symbolgröße.
  - **Scrollbar des Trails:** Die globale Regel „dünne Scrollbars“ in `index.css` stand außerhalb jeder Ebene und
    schlug damit `[scrollbar-width:none]`; jetzt in `@layer base`.
  - **Gemerkt je Projekt** im Layout neben den Breiten (`Layout.filesFolded` in `config.rs`/`layout.ts`); die zuletzt
    gezogene Breite bleibt erhalten und kommt beim Aufklappen zurück. Die Linie einer zugeklappten Liste ziehen
    klappt sie wieder auf.
  - **Sprünge in den Baum klappen auf:** Was heute eine Datei im Baum zeigt (z. B. „Öffnen“ beim Nächsten Prompt,
    `showFile`), klappt die Spalte zuerst auf.
  - **Rechte Spalte nicht:** Sie ist das Radar; für den Blick über alles gibt es die Übersicht.
  - Dateien: `layout.ts` (`filesFolded`, `fold`, `RAIL`), `App.tsx` (Kürzel, `showFile`), neu `FilesRail.tsx`, `Trail.tsx`, `index.css`, `FilesPanel.tsx`,
    `ProjectHeader.tsx` (`placeOf`), `backend.ts` (`Layout`), `Dialogs.tsx` (F1); `config.rs` speichert das Layout
    ohnehin als freies JSON. Praxistest: zuklappen per Kürzel und Projektzeichen, Trail bei zugeklappter Liste, Leiste zeigt Projekt, Branch und
    Menüs, Neustart behält den Zustand je Projekt.
- **Projektliste im Fenster statt Übersicht** ☐ (Idee des Nutzers, 2026-11-19, abgestimmt; Anlass: viele Fenster auf
  dem Desktop verwirren, die Übersicht liegt oft verdeckt). Ersetzt das Fenster `overview` (3.0b) und die zuerst
  gedachte senkrechte Projektleiste; keine zweite Reiterleiste (Sorge des Nutzers).
  - **Spalten neu geordnet** (Nutzer, 2026-11-19, ✅ gebaut, Praxistest offen): Sitzungen → Deck → Trail → Dateien;
    der Trail wandert mit den Dateien und steht links von ihnen, öffnet sich nach links über das Deck, die
    Statusleiste der Dateien reicht unter ihm durch (`UNDER_TRAIL`). Projektfarbe und Menüs stehen bis Schritt (b)
    über den Dateien (oben rechts); mit der Projektliste ziehen sie über diese.
  - **Bild:** Ganz links im Projektfenster die **Projektliste, 300 px**, vor der Sitzungsspalte (zuerst gedacht: vor der Dateiliste): „Wartet auf dich“ über alle
    Projekte, Gruppen nach Ordner, je Projekt Zeichen, Name und Markierung (Pille = fragt, Punkt = fertig), das gezeigte
    hinterlegt, `+` zum Aufnehmen. **Keine Sitzungen in der Liste** (Nutzer): Die Sitzungen des gezeigten Projekts
    stehen wie heute in der rechten Spalte. Teilung damit klar: Liste = alle Projekte, rechte Spalte = dieses Projekt.
    Zugeklappt bleibt eine Leiste mit den Projektzeichen und ihren Markierungen (die Liste in schmal); Projektliste und
    Dateiliste klappen einzeln, `Strg+B` bleibt bei der Dateiliste.
  - **Ein Klick wechselt das Projekt in diesem Fenster.** Kein Herausziehen einer Projektseite in ein eigenes Fenster
    (Nutzer: macht es einfacher). Mehrere Bildschirme: ein zweites CodeDeck-Fenster wie ein zweites Browserfenster
    („Neues Fenster“, Strg+Klick), jedes mit Liste und eigenem gezeigten Projekt.
  - **Ohne Projekt** zeigt das Fenster nur die Liste: das ist die Startseite aus 3.4.
  - **Die Übersicht als eigenes Fenster entfällt** (auch nicht als „herausgezogene Liste“, Nutzer). Tray-Klick und
    `Ctrl+Alt+L` holen das zuletzt benutzte Fenster nach vorn (nach „vorn“ umschalten, nicht nach „sichtbar“:
    verdeckt heißt nach vorn holen, nur vorn heißt verbergen).
  - **Technik: eine Webview je Fenster, das Projekt wird gewechselt** (Weg 1, ohne Tauri `unstable`). Das Fenster
    wechselt schon heute das Projekt (`open` in `App.tsx`, `open_project`), das Backend hält Projekte ohne Fenster
    (`windows::Bridges`). Neu: Was das Frontend heute beim Wechsel wegwirft (`clearAttachments()`, Auswahl, Reiter,
    offene Ordner, Zuklappen), wird je Projekt gemerkt und beim Zurückkommen wiederhergestellt. Fühlt sich der Wechsel
    zu träge an (Git-Status und Logs laden neu), bleibt Weg 2: eine Webview je Projekt im Fenster (Spike unten).
  - **Bauschritte:** (a) ✅ 2026-11-19 gebaut, Praxistest mit (b): Zustand je Projekt beim Wechsel behalten
    (`src/projectMemory.ts`: `usePerProject` für offene Ordner, Filter, Punkt im Trail, Sitzungsfilter; Auswahl und
    Reiter in `App.open`; Anhänge über `switchAttachments` statt `clearAttachments`, abgeglichen mit dem, was das
    Backend für das Projekt noch hält; vorher blieben sie im Backend des alten Projekts liegen, ohne dass das Fenster
    sie zeigte), Wechsel messen (Konsole `CodeDeck: project switch took … ms` und „Diagnose kopieren“; messbar erst
    mit (b), denn bis dahin gibt es im Fenster keinen Weg zurück); (b) ✅ 2026-11-19 gebaut, Praxistest offen:
    Projektliste ins Projektfenster (`ProjectsPanel.tsx`: oben die Projektleiste mit Farbe, Zeichen, Schnell-
    einstellungen und `⋯`, darunter `OverviewApp` mit `inWindow`: Klick zeigt hier, Strg+Klick/Mittelklick in
    neuem Fenster, keine Sitzungen, „Wartet in anderen Projekten“ ohne das gezeigte Projekt, dessen Wartendes
    steht in der Sitzungsspalte; eigene Werkzeugzeile ▶, `+`, Gruppen auf/zu, `⋯` mit „Alle Projekte in einem
    Ordner“ und Sortieren), Breite 300 px fest; Klick auf das Projektzeichen klappt auf die Leiste
    (`ProjectsRail`: Zeichen je Projekt mit Pille/Punkt, `+`; oben Projektzeichen, Schnelleinstellungen, `⋯`),
    zugeklappt gilt je Rechner (`useProjectsFolded`, `localStorage`). Der Dateibaum hat dafür eine eigene
    Kopfzeile „Dateien“ mit Knopf zum Zuklappen (`Strg+B` bleibt), seine Leiste nur noch Baum-Symbol, Git-Log und
    Branch. Backend: `overview_changed` geht an alle Fenster (`app.emit`), nicht nur an die Übersicht.
    Nach dem Praxistest (Nutzer 2026-11-19: Wechsel schnell und gut): Dateibaum anfangs zugeklappt
    (`filesFolded` fehlt = zu); die Infozeile unter der Kopfleiste der Sitzungsspalte zeigt den Verbrauch der KI
    (`AssistantLine`, vorher Fußleiste der Spalte) statt Branch, Runden und Zeit; „Projekt hinzufügen“ steht im
    `⋯` der Liste (mit `Strg+O`), nicht mehr als `+`; beim Überfahren einer Zeile „In einem neuen Fenster öffnen“ und
    `⋯` statt „Sitzung starten“ und „Neue Sitzung“ (die stehen für das gezeigte Projekt in der Kopfleiste der
    Sitzungsspalte); Zeile von links: großes Projektzeichen (28 px), Name, KI-Zeichen und Statussymbole (Git, Anhänge,
    Werkbank, Punkt), die Werkzeuge beim Überfahren rechtsbündig am Rand;
    (c) ✅ 2026-11-19 gebaut, Praxistest offen: Fenster ohne Projekt = Startseite. Statt `Win` ohne Projekt (tiefer
    Umbau, gehört zu 3.4) ist es das vorhandene Fenster `overview`: `OverviewApp` mit `START_PAGE` (Liste ohne
    Sitzungen; Klick holt das Projektfenster nach vorn oder öffnet es, dann tritt die Startseite zurück). Sie wird beim
    Start verborgen angelegt und zeigt sich nur ohne Projektfenster: Tray, `Ctrl+Alt+L`, und von selbst, wenn das
    letzte Projektfenster schließt (CodeDeck hört weiter zu). Sie steht am linken Bildschirmrand (`set_compact`; Nutzer 2026-11-19, wie die Liste links im Projektfenster), das erste Projektfenster (beim Start oder von der Startseite aus) öffnet maximiert (Nutzer 2026-11-19), jedes weitere rechts neben der Startseite (`place_beside_overview`). „Projekt
    schließen“ (`⋯` der Projektkopfzeile, `Strg+W`, Command `close_window`) schließt das Fenster mit seinem Projekt; (d) ✅ 2026-11-19 gebaut, Praxistest offen:
    Die Übersicht als eigenes Fenster gibt es nicht mehr; das Fenster `overview` bleibt nur als Startseite (c).
    Tray-Klick und `Ctrl+Alt+L` (`windows::front_or_away`): das zuletzt benutzte Projektfenster nach vorn, oder weg,
    wenn es vorn ist; ohne Projektfenster die Startseite ebenso. „Vorn“ = hat den Fokus oder hatte ihn vor weniger als
    0,7 s (`window::in_front`, `Shortcuts.lost`): Ein Klick auf das Tray-Symbol nimmt dem Fenster den Fokus, bevor er
    ankommt. Tray-Menü: „CodeDeck zeigen“ (nur nach vorn) statt „Übersicht zeigen/verbergen“. `Ctrl+Shift+L` im
    Projektfenster klappt die Projektliste. `docs/UEBERSICHT.md` als abgelöst markiert, `KONZEPT.md` nachgezogen.
    Danach (Nutzer 2026-11-19, über 20 Projekte, an zweien wird gewechselt): Abschnitt „Zuletzt“ oben in der
    Projektliste mit den drei zuletzt gezeigten Projekten, das gezeigte hervorgehoben darunter, als eigener hinterlegter
    Kasten; feste Plätze (`recentInPlace`): Beim Wechseln zwischen ihnen ändert sich die Reihenfolge nicht, ein neues
    nimmt den Platz eines herausgefallenen (Nutzer). Sie bleiben auch in ihren Gruppen, damit dort nichts springt; in
    der zugeklappten Leiste oben abgesetzt; das Menü einer Zeile dort hat nur „In einem neuen Fenster öffnen“ und
    „Aus ‚Zuletzt‘ entfernen“ (`forget_recent`: `recent.json` behält nur die übrigen angezeigten, kein älteres rückt
    nach, Nutzer; das nächste Öffnen eines Projekts setzt es wieder hinein); `Strg+Tab` zurück zum vorher
    gezeigten. Quelle: `recent.json` (`recent::order`, Feld `recent` in `OverviewProject`), `open_project` meldet
    `overview_changed`.
    Jeder Schritt mit Praxistest.
  - **Spike zu Weg 2** (eine Webview je Projekt im selben Fenster, `.scratch/spike-webviews/`), als Reserve:
    Ergebnis (2026-11-19, Tauri 2.12.5 mit `unstable`, WebKitGTK unter Xvfb/X11):
    - Trägt: Zwei Projekt-Webviews in einem Fenster, Umschalten mit `hide`/`show`/`set_focus`; die Tastatur geht an die
      gezeigte. Der Zustand der Seite bleibt beim Umschalten erhalten (Eingabefeld behält seinen Text, kein Neuladen).
      Commands kennen ihre Webview (`Webview` als Parameter: Label und Fenster). `emit_to(EventTarget::webview(..))`
      erreicht nur diese Webview, wenn die Seite mit `getCurrentWebview().listen` lauscht; ein Ereignis an das
      Fenster-Label erreicht dann keine. Größenänderung des Fensters: die sichtbare Webview füllt es.
    - **`reparent` trägt:** eine Webview wandert ohne Neuladen in ein neues Fenster, behält ihren Zustand, meldet das
      neue Fenster und bekommt weiter ihre Ereignisse. Das ist „In eigenem Fenster“ (für mehrere Bildschirme) und
      umgekehrt das Zusammenlegen zweier Fenster, beides ohne die Seite neu aufzubauen.
    - **Trägt nicht:** mehrere *gleichzeitig sichtbare* Webviews nebeneinander. Unter Linux packt
      `tauri-runtime-wry` Kind-Webviews in die `GtkBox` des Fensters (`build_gtk(default_vbox)`), Position und Größe
      werden übergangen, sie stapeln sich. Darum **keine eigene Webview für die Leiste**: Jede Projekt-Webview zeichnet
      die Projektleiste selbst (React, Daten aus dem Backend, Änderung an alle Webviews des Fensters), und es ist immer
      genau eine Webview je Fenster sichtbar. So ist es auch getestet und trägt.
    - Offen für den Bau: echter Desktop (Cinnamon/X11) und Wayland, vor allem `reparent`; Fenster ohne Webview nach dem
      Schließen der letzten schließen. Umbau in CodeDeck: Frontend lauscht mit `getCurrentWebview()` statt
      `getCurrentWebviewWindow()` (`backend.ts`), Backend sendet an das Webview-Label; `windows::of` findet den Zustand
      über die Webview statt das Fenster (D25 wird „ein Zustand je Projekt-Webview“); Titel und Icon des Fensters
      folgen dem gezeigten Projekt, die Markierung zählt alle Projekte des Fensters; `focus_project` der Übersicht und
      die Meldungen zeigen erst die Webview, dann das Fenster.
- **Sitzungsliste überarbeitet** ✅ 2026-11-20 gebaut, Praxistest offen (Nutzer: meist 1–3 Sitzungen, wichtig sind
  Rückfragen, häufiger fertige Runden, und Wiederaufnehmen). (a) Eine Liste in Startreihenfolge statt Gruppe „Wartet auf
  dich“ (D27 geändert), darunter „Früher“ (neueste zuerst, aufgeklappt, wenn nichts läuft). (b) Rückfrage: unter der
  Frage der Befehl bzw. die Datei des letzten Schritts (neutrales `Event.detail`, im Adapter die erste Zeile des
  Shell-Befehls, gekürzt; nicht im Journal), nur wenn die Frage dessen Werkzeug nennt (`askedAbout`); Zustand mit
  Wartezeit („fragt · 3 min“), Knopf „Antworten ↗“. (c) Fertige Runde: bis drei Zeilen Schlussworte (`Session.report`,
  `report_shown`: Markdown weg, 400 Zeichen; auch aus dem Log für „Früher“), Zeit im Zustand („Runde fertig · vor 6 min“,
  heute Uhrzeit, gestern, Datum), „Runde ansehen“ öffnet in Changes die letzte Runde der Sitzung (`showTurnOf`,
  `useWantedTurn` in `turns.ts`). (d) Fertig wartet bis angesehen statt 30 Minuten (`Session.seen`, `Bridge::seen`,
  Command `session_seen`): Hineingehen (`enter_session`), die letzte Runde in Changes ansehen, ✓ an der Karte; höchstens
  6 h (`DONE_SHOWN_MS`, dann „Früher“), gilt für Liste, Fenstertitel, Projektliste, Tray und Meldungen. Angesehen ist die
  Karte ruhig (grauer Zustand). (e) „Fortsetzen ▶“ an beendeten und nicht mehr laufenden Sitzungen (auch Doppelklick):
  Command `resume_session` startet genau diese Unterhaltung in tmux (`--resume`), mit ihrem Werkzeug und Konto, sonst dem
  des Projekts; verweigert, solange ihr Prozess läuft. (f) Zeile 3 der Karte ist die Knopfzeile (aufklappen, Runde
  ansehen, Quittung, Werkzeuge beim Überfahren, Hauptknopf); Modell, „von Hand“, tmux und Remote stehen in den Details
  unter „Art“. Praxistest: Rückfrage mit Bash zeigt den Befehl; fertige Runde zeigt Schlussworte und verschwindet aus der
  Zahl nach Hineingehen bzw. „Runde ansehen“; beendete Sitzung lässt sich fortsetzen und erscheint als „Wird gestartet…“.
- **Sitzungen im Hintergrund** ✅ 2026-11-20 gebaut, Praxistest offen (Anlass: Pictorix-Sitzung nach `/background` nicht
  mehr auffindbar). Befund: `/background` (Claude Code 2.1.32x) übergibt die Unterhaltung als Abzweig mit **neuer ID** an
  den Daemon des Werkzeugs (kein Terminal, kein tmux); im Terminal läuft eine neue, leere Sitzung weiter; der Daemon hält
  leere Reserve-Sitzungen bereit. CodeDeck hörte die Hooks, zeigte aber zwei Karten „Pictorix“ ohne Weg hinein.
  Probe mit `claude --bg`: Prozessdatei `<config>/sessions/<pid>.json` mit `kind: "bg"`, `jobId`; im Hook
  `CLAUDE_CODE_SESSION_KIND=bg`, `CLAUDE_JOB_DIR=…/jobs/<id>`; hinein mit `claude attach <id>` (Ctrl+Z zurück, läuft
  weiter); `<config>/jobs/<id>/state.json` überlebt das Herunterfahren (`state` `blocked` mit `needs` = offene Frage),
  `daemon/roster.json` nennt, solange er läuft, die abgezweigte Unterhaltung (`dispatch.launch`, `fork`). Dokumentiert ist
  nur `claude agents --json` (zu langsam für den Takt, daher die Dateien; undokumentiert, tolerant gelesen). Gebaut:
  `Place.background` (Hook: `Harness::background_job`; erbt dort nicht `CODEDECK_SESSION`), `Harness::parked` (Daemon-
  Dateien, alle 6 s und beim Laden: Herkunft `continues`/`moved_to`, Frage → „fragt“), `Harness::attach` (Terminal-Tür und
  „Fortsetzen“ öffnen `claude attach`); eine Sitzung, aus deren Prozess eine andere meldet, gilt als beendet (`/clear`,
  `/background`); Reserve-Sitzungen (Hintergrund ohne Prompt) erscheinen nicht. Karte: Schild „im Hintergrund“, Zeilen
  „Läuft im Hintergrund weiter als …“ bzw. „Setzt fort: …“, kein Fortsetzen an der abgezweigten Ursprungs-Sitzung.
  Praxistest: in einer Sitzung `/background`; CodeDeck zeigt die alte als beendet mit Verweis, die neue „im Hintergrund“;
  „Terminal“ öffnet `claude attach`; eine Frage am Rundenende erscheint als „fragt“; nach Neustart von CodeDeck ist sie
  wieder da.
- **Sitzungen: Prüfung und Überarbeitung** ☐ (Nutzer 2026-11-20): Betriebswege, Kapselung je KI-Werkzeug, Fallbacks.
  Befunde, Konzept K1–K8, Schritte S1–S9 und die Entscheidungen des Nutzers in `docs/SITZUNGEN-PRUEFUNG.md`.
  S1 ✅ (Praxistest offen): Beenden/Neu starten nur noch für Sitzungen in einer tmux-Sitzung, die CodeDeck angelegt hat
  (`ownTmux` in `assistant.ts`; `tmux::stop` verweigert fremde tmux-Sitzungen); die Terminal-Tür wählt vorher Fenster und
  Pane der Sitzung (`tmux::show_pane`). Weiter in Gruppen G1–G4 (Tabelle im Dokument), eine Sitzung je Gruppe, Praxistest am Ende der Gruppe. Neu in S7: Hinweisdialog unter Wayland mit „Weiterhin anzeigen“.
- **TODO: Umgang mit dem Git-Index prüfen und ggf. überarbeiten** (Nutzer, 2026-11-19). Heute: CodeDeck merkt nie
  selbst vor; liegt etwas im Index (aus dem Terminal oder von einer Sitzung, die `git add` ausführte), committet ✓ Commit
  still nur das (`commitSteps` in `src/git.ts`), sonst vorher `git add -A`. Das sagt nur der Tooltip. Das Label „im
  Index“ in der Code-Ansicht täuscht bei teilweise Vorgemerktem (`MM`): Der Diff zeigt alles gegen HEAD, committet wird
  nur der vorgemerkte Teil; das Backend liefert nur Spalte X (`staged`), nicht Y. Zu klären, bevor gebaut wird:
  (1) Ist gezieltes Vormerken ein echter Anwendungsfall für CodeDeck, oder reicht „alles committen“ mit klarer Ansage?
  (2) Wenn ja, wie flexibel: nur Klartext in der Commit-Zeile („Nur 2 von 7 im Index“ + „Alle 7 committen“), Auswahl
  je Datei, oder Vorgemerktes/Nicht vorgemerktes getrennt im Diff (Richtung Stage-Werkzeug, bisher ausdrücklich nicht
  gewollt, siehe Karte in `CLAUDE.md`)? (3) Label je Datei: „im Index“ / „teilweise im Index“ mit Feld `unstaged`
  (Spalte Y) aus `git.rs`. (4) Was ist mit Dateien, die eine Sitzung vorgemerkt hat: anzeigen, wer es war?
- **Einstellungsseite** (Wunsch des Nutzers, 2026-11-15): z. B. wie lange eine fertige Runde unter „Needs you“
  steht, ab wann Sitzungen unter „Earlier“ einklappen.
- **Prompts vorbereiten („Vorbereitet“)** Erster Wurf ✅ 2026-11-22 gebaut, Praxistest offen. *Bedarf:* Einen Prompt,
  oft für eine neue Sitzung, über längere Zeit vorformulieren und daran feilen, ohne Gefahr, ihn vorzeitig abzuschicken
  (im Werkzeug sendet Enter sofort).
  - *Gebaut (mit dem Nutzer abgestimmt 2026-11-22):* je Projekt benannte Prompts als Markdown in `.scratch/prompts/`,
    von CodeDeck allein verwaltet (`prompts.rs`; die Scratch-Kachel der Werkbank lässt den Ordner aus). Im Bereich
    Nächster Prompt der Sitzungsspalte der Unterbereich **Vorbereitet**: höchstens drei Zeilen (zuletzt geändert zuerst,
    „… alle n“), „+“ legt an, Werkzeuge beim Überfahren (Bearbeiten, Kopieren, Papierkorb). Ein Prompt zur Zeit öffnet an
    Ort und Stelle; der Bereich wird dafür höher (Grid-Zeile `1.5fr`), sodass er neben Deck und Dateiliste offen bleibt.
    Kopfzeile: Name (Umbenennen an Ort und Stelle), Kopieren, Papierkorb, Schließen; Fuß: Speicherstand, Tokens.
    Speichert 600 ms nach der letzten Taste und beim Schließen; Änderungen von außen (eigener Editor) kommen herein,
    solange hier nichts Ungespeichertes wartet.
  - *Editor:* CodeMirror 6 (`state`, `view`, `commands`), **keine Schreibhilfen** (Nutzer: keine Leiste, kein Fortführen
    von Aufzählungen; Enter = schlichte neue Zeile). Nur für das Auge: hängender Einzug für Aufzählungen (`-`, `*`, `+`,
    `1.`, `1)`, Aufgaben-Kästchen, eingerückte Zeilen), gemessen in der Schrift des Editors; Überschriften fett. Der Text
    bleibt genau wie getippt.
  - *Bewusst nicht im ersten Wurf:* Übergabe an eine Sitzung (Nutzer: Kopieren genügt vorerst), Anhänge an einen
    Entwurf, projektübergreifende Prompts.
  - *Später:* (1) **Übergeben**: neue Sitzung damit starten (Startprompt über `Harness::launch`, nie `send-keys`;
    vorher mit `claude-code-guide` klären, ob und wie Claude Code einen Startprompt nimmt, auch in tmux und Desktop) und
    an eine wartende Sitzung als Anhang des nächsten Prompts (`bridge.rs`); berührt **D20** (Startprompt als bewusste,
    sichtbare Ausnahme) und **D21** (Entwurf als ausdrücklich gewollte Sammelliste, getrennt vom nächsten Prompt).
    (2) **Anhänge an einen Entwurf**: Büroklammer-Menü mit „nächster Prompt“ oder „Entwurf …“. (3) Entwurf aus „Noch
    offen“ im Schlussbericht, aus `@ai`-Hinweisen, aus Dirq-Kommentaren; Bezug auf eine Runde; Vorlagen; „frische
    Sitzung mit Zusammenfassung“ (siehe Token-Sparen).
  - *Dateien:* `src-tauri/src/prompts.rs`, `src/prompts.ts`, `src/components/PreparedPrompts.tsx`,
    `src/components/PromptEditor.tsx`, `src/components/SessionsPanel.tsx` (`NextPrompt`, Grid-Zeilen).
- **Token sparen** ☐ vorgesehen (Nutzer, 2026-11-22). *Frage:* Kann CodeDeck eingreifen oder dem Nutzer Mittel in die
  Hand geben? In die KI selbst greift CodeDeck nicht ein; es kann beeinflussen, **was in den Kontext kommt**, **wann ein
  Kontext zu groß wird**, und **sichtbar machen, wo Tokens bleiben**. Nach Nutzen geordnet:
  1. **Tokens je Runde sichtbar** (aus den Protokollen des Werkzeugs; CodeDeck kennt die Runden): „Runde 6: 120k, davon
     80k für das Lesen von Dateien“, im Kurzbericht der Runde. Erst das macht Sparen gezielt möglich.
  2. **Kontextgröße je Sitzung** auf der Sitzungskarte; bei vollem Kontext anbieten, mit einer **frischen Sitzung**
     weiterzumachen: Zusammenfassung aus dem Schlussbericht als Entwurf (siehe oben), Start damit.
  3. **Teure Lesezugriffe sperren**: Lock-Dateien, `dist/`, Generiertes über die Berechtigungen des Werkzeugs (Claude
     Code: `permissions.deny` mit `Read(...)`), als Liste in CodeDeck, vorbelegt mit der Mustertabelle von Dirq
     (Qiew `apps/dirq/src/generated.ts`); eintragen und zurücknehmen wie die Hooks (`hook::set`).
  4. **Treffender beilegen**: Warnung bei großen Anhängen („diese Änderung ≈ 40k Tokens; nur die Datei X?“); die
     Token-Schätzung gibt es schon im Bereich Nächster Prompt.
  5. **Kosten der eigenen Startregeln und der `CLAUDE.md`** je Sitzung zeigen.
  6. **Modellwahl beim Start** einer Sitzung, Kosten je Runde daneben.
  - *Vorschlag zur Reihenfolge:* 1 und 2 zuerst (Sichtbarkeit, frische Sitzung aus einem Entwurf), dann 3 (spart ohne
    Zutun). Baut auf P4/2.4 (Nutzung aus der Statuszeile) auf.
  - *Vor dem Bau klären:* Welche Zahlen liefern die Protokolle (`harness/claude.rs`, Log-Format) je Nachricht und
    Werkzeugaufruf (Eingabe, Ausgabe, Cache)? Woher die Kontextgröße einer laufenden Sitzung (Statuszeile, Log)? Wie
    `permissions.deny` mit vorhandenen Einstellungen des Nutzers zusammenspielt (nie das echte `settings.json` in Tests).
  - *Dateien:* `src-tauri/src/usage.rs`, `src/usage.ts`, `src-tauri/src/harness/claude.rs`, `src-tauri/src/hook.rs`,
    `src/components/SessionsPanel.tsx`, `src/components/views/ChangesView.tsx` (Kurzbericht), `src/components/AttachmentList.tsx`.

## Ältere Pakete (Nachschlagewerk)

Die Reihenfolge bestimmen die MVP-Phasen oben. Diese Pakete liefern die Einzelheiten, auf die ein Schritt
verweist. Wo sie von Ansichten sprechen, meinen sie die heutige App (Docs-Reiter, Workspace-Reiter); im
Zielbild gelten die vier Reiter aus D8.

### P0 Praxistest der Brücke `[S]` · offen · ist Schritt 1.1 · braucht den Nutzer
**Ziel:** Prüfen, ob die Annahmen über die Hook-Daten von Claude Code stimmen.
**Dateien:** `hook.rs` (`extract`, `EVENTS`), `bridge.rs` (`handle`).
**Schritte:** Der Nutzer verbindet im Dev-Build (Statusleiste → Claude) **jede** Konfiguration, mit der er
arbeitet. Er hat mindestens `~/.claude` und `~/.claude-private` (`CLAUDE_CONFIG_DIR`). Dann eine Runde
mit Claude arbeiten.
Dann prüfen: Sitzung erscheint, Status wechselt (working → waiting bei einer Berechtigungsfrage → idle),
Dateien werden markiert, Snapshot erscheint im Trail, Docs → „Hand to Claude“ kommt beim nächsten Prompt
an (Claude soll den Text wiedergeben). Weicht etwas ab, die Hook-Felder mit dem Agenten `claude-code-guide`
klären (`session_id`, `hook_event_name`, `tool_input.file_path`, `prompt`, `message`, `timeout` in Sekunden).
**Fertig wenn:** Alle fünf Punkte funktionieren in einer echten Sitzung.
**Achtung:** Beim Testen nur über die Oberfläche verbinden, `settings.json` nie von Hand bearbeiten.

### P1 Sitzungen von vor dem Start `[S–L]` · ✅ erledigt 2026-11-14
**Ziel:** CodeDeck kennt auch Sitzungen, die schon liefen, bevor das Fenster oder die Hooks da waren.
**Dateien:** neu `src-tauri/src/sessions.rs`; `bridge.rs` (Sitzungen zusammenführen); `Session` in `backend.ts`.
**Schritte:** `~/.claude/projects/<kodierter Pfad>/*.jsonl` lesen: das Projekt und seine Elternordner, nur
Dateien, die in den letzten 24 h geändert wurden. Die Kodierung des Pfads vorher an echten Ordnern prüfen
(vermutlich `/` und `.` → `-`). Nur das Ende jeder Datei lesen (etwa 64 KB): letzter Prompt, Zeit,
Modell, geschriebene Dateien (aus `tool_use`-Einträgen mit `Edit`/`Write`). Status `idle`, wenn die
letzte Aktivität länger als 10 Minuten her ist, sonst `working`. Die Sitzungs-ID ist der Dateiname, über
sie mit den Hook-Sitzungen zusammenführen. Optional: Modell in der Sitzungsliste anzeigen.
**Fertig wenn:** Nach einem Neustart von CodeDeck stehen laufende Sitzungen in der Liste, mit Test über
eine Beispiel-`.jsonl`.
**Achtung:** Das jsonl-Format ist intern und kann sich ändern. Fehlertolerant parsen, unbekannte Zeilen
ignorieren und keine Inhalte speichern.

### P2 Spalte „Sessions & Focus“ `[L]` · ✅ erledigt 2026-11-14
**Ziel:** Die rechte Spalte wird echt. Oben stehen die Sitzungen (Spuren), unten der Fokus: angeheftete
Dateien, Ordner und Ausschnitte, die man an Claude übergeben kann.
**Dateien:** `App.tsx` (Zustand `pins`, `pinFromEntry`), `AssistantPanel.tsx` (wird ersetzt),
`AssistantStatus.tsx` (die Komponente `Sessions` hierher verschieben), `mock.ts` (Chat-Teile entfernen),
`backend.ts` (`handOver`).
**Schritte:** Neue Komponente `SessionsPanel.tsx`. Die Sitzungsliste, je Sitzung aufklappbar mit den
geschriebenen Dateien; ein Klick öffnet den Diff, also `Point` „now“ und Auswahl der Datei. Darunter die
Fokus-Liste mit der bestehenden Pin-Logik und Token-Schätzung. Knopf „Hand focus to Claude“ baut einen Text
aus Pfaden (keine Inhalte, Claude liest selbst) und Ausschnitten und schickt ihn an `handOver`; die
wartende Übergabe wird angezeigt und lässt sich zurücknehmen (wie in `DocsView`). Leerer Fokus heißt:
nichts wird übergeben. Die Statusleiste behält nur die Zusammenfassung, das Popover zeigt dann nur noch die
Einrichtung der Hooks.
**Fertig wenn:** Anheften → Übergeben → beim nächsten Prompt kommt es an (Test wie in P0); im Mock-Modus
sinnvolle Vorschau; die Chat-Mocks sind weg.
**Achtung:** Es gibt nur eine Übergabe zur Zeit (`Bridge.handover`). Fokus und Marker-Auftrag zu einem Text
zusammenfassen, statt sich gegenseitig zu überschreiben. Dafür `hand_over` erweitern, z. B. mehrere
benannte Teile.

### P3 Docs-Radar `[S]` · ✅ erledigt 2026-11-14
**Ziel:** Neu entstandene Ergebnisdokumente sofort sehen; erkennen, wann Marker erledigt sind.
**Dateien:** `DocsView.tsx`, `Deck.tsx` (Badge am Tab), `assistant.ts` (`touchedFiles`).
**Schritte:** (a) Abschnitt „Recently written“: von Sitzungen geschriebene `.md`/`.html`/`.txt`/`.adoc`-Dateien
der letzten 24 h, mit Öffnen-Knopf (`openFile(path, "view")`). (b) Die Marker-Liste in einen Hook
`useMarkers` heben, damit der Docs-Tab ein Badge mit der Anzahl offener Marker bekommt. (c) Nach einer
Übergabe die übergebenen Marker merken; fehlen sie später in der Liste, als erledigt zeigen („3 of 4 done“).
**Fertig wenn:** In der Vorschau sichtbar, `tsc` sauber.

### P4 Token-/Zeitfenster-Monitor `[Spike S, dann S]` · offen · ist Schritt 2.4
**Ziel:** Verbrauch in % je Zeitfenster (5 h / Woche), mit Warnung vor Knappheit.
**Spike:** Mit `claude-code-guide` klären, ob die Statusline-Eingabe von Claude Code Angaben zu den
Rate-Limits enthält (Felder, Einheiten) oder eine andere verlässliche lokale Quelle existiert. Ergebnis
unter D2 eintragen.
**Wenn ja:** Modus `codedeck statusline`, der das JSON auf stdin wie `hook` an die Sockets weiterreicht und
danach die *bisherige* Statusline des Nutzers aufruft und deren Ausgabe durchreicht (alten Befehl beim
Verbinden merken, beim Trennen zurückschreiben, analog zu `hook::set`). Anzeige in der Statusleiste,
Warnung ab 80 %.
**Wenn nein:** Paket streichen und den Grund hier notieren. Nicht schätzen.

### P5 Trail-Ausbau `[S–L]` · ✅ erledigt 2026-11-14
**Ziel:** Besser vergleichen und springen.
**Dateien:** `Trail.tsx`, `ChangesView.tsx`, `history.rs`, `snapshot.rs`, `apps.rs`, `lib.rs`.
**Schritte:** (a) Mit Strg+Klick zwei Punkte wählen: Diff zwischen beiden (Backend: `git diff A B` mit
Commits oder Snapshot-Hashes, Prüfung wie `known_snapshot` bzw. Commit-Hash). (b) „Open in dirq“:
den Patch an `dirq -` über stdin geben, mit `--reuse` und `--geometry` (siehe Qiew-README, Abschnitt
„Working with CodeDeck“); Start ähnlich wie `apps::open`. (c) Filter „nur diese Sitzung“ für Snapshots.
**Fertig wenn:** Test für den Diff zwischen zwei Punkten; dirq öffnet sich mit dem Patch.

### P6 Parallele Spuren / Worktrees `[L]` · offen · ist Schritt 4.5
**Ziel:** Mehrere Sitzungen in verschiedenen Worktrees überblicken und vergleichen.
**Dateien:** `git.rs` (`worktree_of`, `discover`), `bridge.rs` (Sitzung → Repo über `cwd`), Sitzungs-UI (P2).
**Schritte:** Jeder Sitzung ihr Repo/Worktree zuordnen und im Dateibaum am Repo-Ordner ein Sitzungs-Badge
zeigen. Linked Worktrees ausdrücklich als Spur darstellen. Vergleich zweier Worktree-Branches über den
Diff aus P5a.
**Fertig wenn:** Zwei Sitzungen in zwei Worktrees werden getrennt angezeigt und lassen sich vergleichen.

### P7 Rückkanal aus den Qiew-Viewern `[L]` · offen · ist Schritt 4.4 · betrifft auch das Qiew-Repo
**Ziel:** In jayq/xaq/hyqe/marq etwas markieren und mit „Send to CodeDeck“ in den Fokus legen.
**Protokoll (steht im Qiew-README):** CodeDeck startet die Viewer mit `CODEDECK_SOCKET=<pfad>`; der Viewer
schickt eine JSON-Zeile `{"action":"add_to_context","source","file","selector","content"}`.
**CodeDeck-Seite:** `apps.rs` setzt beim Start eines Viewers die Variable auf den eigenen Socket
(`Bridge::socket`). `bridge.rs::serve` unterscheidet nach dem Feld `action` und erzeugt einen Pin
(Event an das Frontend, Pin-Zustand aus P2). Der Viewer muss nach dem Senden seine Schreibseite schließen,
denn `serve` liest bis EOF.
**Qiew-Seite:** eigenes Paket im Qiew-Repo (dort Englisch, **keine KI-Zeilen** in Commits).
**Fertig wenn:** Ein Knoten aus jayq landet als Pin in CodeDeck.

### P8 Workspace-Ansicht echt `[S–L]` · abgelöst durch Schritt 4.1
Der Workspace-Reiter entfällt (D8). Was er zeigen sollte (Konfiguration, Hook-Status, gewählte Programme),
gehört in die Ersteinrichtung und die Konten-Seitenleiste. Der Text unten bleibt als Stoffsammlung.
**Ziel:** Die Mock-Karten in `WorkspaceView.tsx` durch echte Daten ersetzen: `.codedeck.toml` (Format erst
festlegen; heute wird die Datei nur erwähnt, nicht gelesen), Hook-Status, Socket-Pfad, gewählte Programme
(`apps.json`), ignorierte Ordner (`SKIP` in `git.rs`).
**Fertig wenn:** Keine Daten aus `mock.ts` mehr in dieser Ansicht.

### P9 Karte / Blast Radius `[XL]` · zurückgestellt
Braucht für jede Sprache einen Abhängigkeits-Scanner. Erst angehen, wenn P0–P6 im Alltag tragen. Ein
möglicher Einstieg: nur Ordner-Ebene, Kanten aus Imports von Rust und TS.

### P10 Andere KI-Harnesses `[XL]` · abgelöst durch Schritt 1.2 und „Später“
Die Trennung kommt früh (1.2, „Kapselung der KI-Anbindung“), ein zweites Werkzeug später.
Das Event-Format der Brücke ist schon unabhängig von Claude. Ein Adapter wäre ein weiterer
`codedeck hook`-Aufrufer für die Hooks anderer Werkzeuge. Erst bei konkretem Bedarf.
