# CodeDeck – Umsetzungsplan

So arbeitet eine Session damit: „Einstieg“, „Stand“ und „Entscheidungen“ lesen, den nächsten offenen
Schritt aus den MVP-Phasen nehmen und **nur** die dort genannten Dateien lesen (die Karte steht in
`CLAUDE.md`). Danach den Status hier aktualisieren: Schritt abhaken, Erkenntnisse in einer Zeile unter
„Notizen“ festhalten.
Was CodeDeck für den Anwender tut und wie es mit Claude zusammenspielt, erklärt `docs/KONZEPT.md`. Seine
zwei Grundsätze sind der Maßstab für jeden Schritt: **Sehen** (der Anwender sieht jederzeit, was geschieht
und wie der Stand ist) und **Einfach bedienen** (nichts lernen, nichts von Hand konfigurieren). Teil 3
dort listet die Lücken der heutigen App, Teil 4 beschreibt das Zielbild. Das Gemini-Konzept (`docs/codedeck_claude_konzeption_hebel_ausbauphasen.md`)
braucht man nur noch bei Grundsatzfragen.

## Einstieg für eine neue Session

1. Diesen Abschnitt, „Stand“ und „Entscheidungen“ lesen.
2. `design/click-dummy/README.md` lesen und den Dummy ansehen (Aufruf steht dort). Er ist das abgestimmte
   Zielbild. `docs/KONZEPT.md` Teil 4 erklärt es in Worten; nur die Abschnitte lesen, die der Schritt nennt.
3. Im Abschnitt „Zielbild: MVP-Phasen“ den nächsten offenen Schritt nehmen und nach „So läuft jeder
   Schritt“ vorgehen. Die älteren Pakete P0–P10 weiter unten sind nur noch Nachschlagewerk für Details.

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

## Entscheidungen

| ID | Frage | Status |
|---|---|---|
| D1 | Rechte Spalte: Context- und Assistant-Mock durch eine Spalte „Sessions & Focus“ ersetzen? | entschieden 2026-11-14: ja, eigener Chat entfällt |
| D2 | Quelle für den Token-/Zeitfenster-Monitor | entschieden 2026-11-17 (Schritt 2.4): CodeDeck liefert `codeck statusline [--then '<Befehl des Nutzers>']`, eingetragen als `statusLine` je Konfiguration; der Befehl des Nutzers steckt in unserem Eintrag (`--then`), Trennen stellt ihn exakt wieder her. Grundsatz des Nutzers 2026-11-17: CodeDeck schafft seinen **eigenen** Weg und stützt sich nicht auf Scripts, die der Nutzer lokal eingerichtet hat (z. B. dessen `statusline-mqtt.py`). Gemeint ist die Statuszeile von Claude Code selbst (`statusLine` in `settings.json`, ein Befehl je Konfiguration): hat der Nutzer schon eine, bleibt sie unverändert in Betrieb. Click-Dummy: `design/click-dummy/usage.html` |
| D3 | Sicherungspunkte als Refs (in `git log --all` sichtbar) | entschieden: Refs, sonst löscht `gc` sie |
| D4 | Darf CodeDeck Sitzungen starten und überwachen? | entschieden 2026-11-15: ja, in tmux, statt des Start-Scripts. Die KI läuft weiter außerhalb von CodeDeck |
| D5 | Darf CodeDeck mit tmux-Sitzungen kommunizieren? | entschieden 2026-11-15: nur zum Lesen nötiger Informationen und für bewusste Steuerungen (Start, Stop, Restart, New task). Nie Prompts |
| D6 | Wo laufen Sitzungen und CodeDeck? | entschieden 2026-11-15: beide auf der Arbeitsstation. Server erreicht die KI per ssh aus einem lokalen Ordner; kein CodeDeck-Teil auf Servern |
| D7 | Wer verwaltet KI-Konten? | entschieden 2026-11-15: Der Nutzer bringt sie mit. Konto = Name + Werkzeug + Startweise; CodeDeck speichert keine Zugangsdaten |
| D8 | Deck-Reiter | entschieden 2026-11-15: Activity, Changes, Workbench, Handover. Tests und Docs gehen darin auf |
| D9 | Temporäres außerhalb des Projekts | entschieden 2026-11-15: Standardordner im Projekt (Arbeitsname `.workbench/`), per Startregel mitgeteilt; claude.ai-Seiten nur als Link |
| D10 | Profile | entschieden 2026-11-15: „Arbeitszeit“ und „Freizeit“ |
| D11 | KI-Anbindung | entschieden 2026-11-15: hinter einer Schnittstelle gekapselt, siehe „Kapselung der KI-Anbindung“ |
| D12 | Name des Standardordners (`.workbench`, `.drafts`, `.scratch`) | entschieden 2026-11-15: `.workbench` |
| D13 | Erlaubnisfragen aus CodeDeck beantworten („Allow once“) | offen. Im Dummy gezeigt; berührt D5 |
| D14 | Öffnet ein Projekt in Activity oder in Changes? | entschieden 2026-11-15: Changes (Activity gibt es erst mit 2.3). Am Ende von MVP 2 noch einmal prüfen, ist leicht zu ändern |
| D16 | Welche Startregeln gehen mit 1.6 raus? | entschieden 2026-11-15: nur die Link-Regel (eine veröffentlichte Seite wird mit Link genannt). Die Ordner-Regel (`.workbench/`) kommt erst mit 2.1, wenn CodeDeck den Ordner anlegt, ignoriert und anzeigt |
| D17 | Sind die Startregeln abschaltbar? | entschieden 2026-11-15: nein, immer an und im Reiter sichtbar. Sie sind ein Baustein von CodeDeck; ein Schalter kommt nur, wenn es einen bewussten Grund gibt |
| D18 | Was gilt als `@ai`-Marker? | entschieden 2026-11-15: `@ai` am Zeilenanfang (Leerraum davor zählt nicht, alles andere schon), oder am Anfang eines Kommentars, der die Zeile beginnt: `<!-- @ai` (HTML/XML) und ebenso nach den Kommentarzeichen von Code (`// @ai`, `# @ai`, …). Zwischen Kommentarzeichen und `@ai` darf nur Leerraum stehen, nach `@ai` nur Leerraum, `:` oder das Zeilenende (Review: sonst zählten Decorators wie `@ai.tool`). Die Form `[!AI: …]` entfällt. Keine Ausnahmelisten je Projekt |
| D19 | Übergabe an eine bestimmte Sitzung? | entschieden 2026-11-15: Zielsitzung wählbar („any session“ oder eine bestimmte). Geändert 2026-11-19 (Nutzer): ohne Wahl bekommt es nur die einzige Sitzung, die es nehmen kann; bei mehreren wartet der Anhang, unten rechts fragt „Wartet: Wer soll es bekommen?“ mit einem Knopf je Sitzung. „Jede Sitzung“ nur noch als bewusste Wahl (`any`); nach dem Zustellen und wenn die gewählte Sitzung endet, ist wieder nichts gewählt. Die zugeklappte Sitzungskarte zeigt „nächster Prompt“ bzw. die Quittung (Büroklammer, Haken, Uhrzeit) |
| D20 | Wie heißt, was CodeDeck an eine Sitzung gibt? | entschieden 2026-11-15: ein Vorgang **anhängen** („Attach“), ein Ort **Next prompt** (Reiter, vorher „Handover“, und Bereich rechts). Den Prompt schreibt der Nutzer im Werkzeug, CodeDeck hängt nur an. Startregeln sind kein Anhang und stehen getrennt. Ändert D8 (Reitername) |
| D21 | Fokus als Sammelliste vor der Übergabe? | entschieden 2026-11-15: nein. Anpinnen hängt direkt an (Büroklammer); nach dem Absenden ist die Liste leer. Ändert D1 („Sessions & Focus“) |
| D22 | Oberfläche übersetzbar, Englisch und Deutsch? | entschieden 2026-11-15: ja, jetzt (vor MVP 2, solange es billig ist). Englischer Text im Code ist der Schlüssel, Deutsch im Wörterbuch; Sprache folgt dem System, Umschalter im Projektmenü, je Rechner gemerkt. Übersetzt wird, was man versteht („Änderungen“, „Aktivität“, „Werkbank“, „Nächster Prompt“, „Anhängen“); Fachwörter bleiben (Commit, Push, Pull, Branch, Snapshot, Prompt, Diff, Repo). Was Claude bekommt und was in Git steht, bleibt englisch |
| D23 | Wohin gehören die `@ai`-Hinweise, wie heißt der Ordner, was zeigt die rechte Spalte? | entschieden 2026-11-16 (Nutzer): Hinweise sind eine Kachel der **Werkbank** (vorläufige Einträge, die vor dem Commit verschwinden sollen, wie Entwürfe), angehängt per Büroklammer wie im Dateibaum, nicht per Häkchen (ein Häkchen läse sich als „erledigt“). Werkbank bleibt der Oberbegriff, der Ordner heißt **`.scratch/`** (auch im Deutschen „Scratch“). Reiter Nächster Prompt: nur, was rausgeht, raumgreifend ohne Rahmen und Füllung, Startregeln immer sichtbar. Rechte Spalte: Zusammenfassung wie ein Dashboard (Zahlen je Art, Tokens, Ziel), springt in den Reiter. Weicht vom Dummy ab |
| D24 | Name, Befehl, Schriftzug, Logo | entschieden 2026-11-16 (Nutzer): offizieller Name bleibt **CodeDeck**, ebenso in Dateien und Verzeichnissen (`~/.config/codedeck`, `refs/codedeck/`, `.codedeck.toml`). Befehl **`codeck`**. Schriftzug in Programm und About: `co`**`de`**`ck` mit orangem „de“ (Entwurf `.scratch/name-identity/`). Icon bleibt der Stapel, auch vor dem Schriftzug. Domains: `codedeck.bespex.run` führt, `codeck.bespex.run` leitet auf dieselbe Seite (geändert 2026-11-16). Geändert 2026-11-21 (Nutzer): Die Adresse ist `bespex.run/codedeck`, eine Subdomain `codedeck.bespex.run` gibt es nicht. Pakete: `codeck` = das Programm (Release dieses Repos), `codedeck` = Metapaket in `bespex/packages` (`Depends: codeck`, `Recommends: marq, dirq, jayq`), entsteht dort, sobald `codeck` veröffentlicht ist. Namensprüfung siehe Notizen 2026-11-16. Regeln für alle be-spex-Programme (Schriftzüge, Icons, Domains, wo was erscheint): `bespex.github.io/brand/README.md` |
| D25 | Ein Prozess je Fenster oder einer für alle? | **Ein Prozess, mehrere Fenster** (Option B, Nutzer 2026-11-17). Letztes Fenster zu: Programm beendet sich (Hintergrund später mit dem Tray). Absturz trifft alle Fenster: in Kauf genommen, dafür Panics abfangen und keine `lock().unwrap()`. Umsetzung Schritt 3.0, Begründung `docs/PROZESSMODELL.md` |
| D27 | Rechte Spalte: Doppelungen und Platz? | entschieden 2026-11-19 (Nutzer): „Wartet auf dich“ ist kein eigener Block mehr, sondern die oberste Gruppe der Sitzungsliste (jede Sitzung einmal, als erhabene Karte, „Runde fertig“ beiseitelegen über das Werkzeug der Karte). Die Zusammenfassung ist eine Zeile mit dem, was kein Reiter sagt (Branch, Ahead/Behind, Runden, letzter Snapshot); offene Dateien, Hinweise und Neues stehen an den Reitern. „Nächster Prompt“ ist leer eine Zeile, sonst Ziel und die vorhandenen Arten in einer Zeile. Weicht vom Dummy ab. **Geändert 2026-11-20 (Nutzer):** keine eigene Gruppe mehr, eine Liste in fester Startreihenfolge (meist 1–3 Sitzungen, Karten wandern nicht); was wartet, ist an seiner Karte erhaben, die Zahl steht am Kopf „Sitzungen“. Siehe „Sitzungsliste überarbeitet“ unter „Später“ |
| D26 | Ein Name oder zwei (CodeDeck und `codeck`)? | entschieden 2026-11-17 (Nutzer, Variante A): **ein Name überall, CodeDeck**. Befehl, Programm, Paket und Schriftzug heißen `codedeck`; wie bei allen be-spex-Programmen ist der Schriftzug der Name klein und zugleich der Befehl. `codeck` bleibt als Alias (`/usr/bin/codeck` → `codedeck`) und als Übergangspaket (`codeck` 1.0, `Depends: codedeck`), damit Hooks und Gewohnheiten nicht brechen; Hooks mit dem alten Namen ziehen von selbst um (`follow_program`). Ein Paket statt Metapaket: `codedeck` bringt das Programm, die Viewer stehen in `Recommends` (Version mit Epoche `1:<version>`, weil das alte Metapaket `codedeck` 1.0 hieß). Schriftzug `code`**`deck`** mit orangem „code“ (Nutzer). Das Wortspiel „Co“ (du und die KI an einem Deck) steht im Untertitel: „AI session radar for Linux“, darunter „your co-deck for AI sessions“. Teile des Programms heißen nach dem, was sie sind (Übersicht, Projektfenster), nicht nach der Marke. Ersetzt D24 in Befehl, Schriftzug, Paketen |
| D15 | Sitzungs-Identität (Farbe + Kurzname, feste Reihenfolge, Umbenennen) als eigener Teilschritt vor 1.3 oder in 1.4? | entschieden 2026-11-15: eigener Teilschritt 1.2a vor 1.3 |

## Reihenfolge

Es gilt die Reihenfolge der MVP-Phasen im nächsten Abschnitt. Von den alten Paketen sind P1, P2, P3 und
P5 erledigt; die offenen sind in die Phasen einsortiert (P0 → 1.1, P4 → 2.4, P6 → 4.5, P7 → 4.4,
P8 → 4.1, P10 → 1.2 und „Später“). P9 bleibt zurückgestellt.

---

## Zielbild: MVP-Phasen

Jede Phase endet mit etwas, das im Alltag benutzbar ist, und besteht aus mehreren Schritten. Ein Schritt
ist eine Session oder weniger. Der Click-Dummy ist die Vorlage, kein Bauplan: Er zeigt nicht alles, was
CodeDeck schon kann, und manches darin ist technisch ungeprüft.

### So läuft jeder Schritt

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
4. **Abschließen:** `cargo test`, `tsc`, Screenshot der Vorschau; Schritt hier abhaken, Erkenntnisse in
   einer Zeile unter „Notizen“; bei geänderter Bedienung `KONZEPT.md` nachziehen.

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

---

## Kapselung der KI-Anbindung

**Prinzip:** Ports und Adapter. Der Kern von CodeDeck (Git, Trail, Anker, Übergabe, Oberfläche) kennt kein
KI-Werkzeug, sondern nur ein neutrales Modell und eine Liste von Fähigkeiten. Jedes Werkzeug ist ein
Adapter. Bewusst **keine** nachladbaren Plugins: Adapter werden mitkompiliert. Das hält Rechte und
Fehlersuche einfach; die Trennung ist dieselbe, und ein Plugin-Weg bleibt über das Ereignisprotokoll offen.

Es gibt zwei Nähte:

1. **Hinein, als Ereignisse.** Was ein Werkzeug meldet, kommt als neutrales Ereignis über den Socket:
   Sitzung beginnt/endet, Prompt abgeschickt, gleich wird geschrieben, wurde geschrieben, wartet, Runde
   fertig. `codedeck hook` ist heute schon so ein Übersetzer für Claude. Für ein anderes Werkzeug kann das
   derselbe Befehl mit anderem Übersetzer sein (`codedeck hook --harness codex`) oder ein fremdes Programm,
   das dieselben Zeilen schickt.
2. **Hinaus, als Schnittstelle.** Was CodeDeck von sich aus tut, läuft über den Trait `Harness` je Werkzeug
   (`src-tauri/src/harness/mod.rs`). Stand, Fähigkeiten und Rohbau eines neuen Adapters: `docs/KONZEPT.md` 2.8
   „So kommt ein Werkzeug dazu“.

**Regeln für die Trennung:**

- Außerhalb von `harness/claude.rs` kommt weder „claude“ noch ein Hook-Feldname vor. Heute verteilt sich
  das auf `hook.rs` (Ereignisnamen, `settings.json`, `config_dirs`), `sessions.rs` (Log-Format) und Teile
  von `bridge.rs`.
- Das Frontend bekommt je Sitzung `harness` und `capabilities` und entscheidet nur danach, was es anbietet
  (kein „Hand to Claude“ ohne `handover`, stattdessen „Copy“). Texte wie „Claude“ kommen aus dem Adapter.
- Der Übergabetext wird im Kern gebaut; wie er zugestellt wird, entscheidet der Adapter.
- Jeder Adapter hat einen Test mit aufgezeichneten Rohmeldungen. Ein Test-Adapter ohne echtes Werkzeug
  beweist, dass der Kern ohne Claude läuft.
- tmux gehört nicht zum Adapter: Starten und Überwachen ist für alle Werkzeuge gleich, der Adapter liefert
  nur Befehl und Umgebung.

---

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

---

## Rezepte

**Brücke von Anfang bis Ende ohne echtes Claude** (ohne Fenster auf dem Desktop):
```sh
xvfb-run -a /shared/cargo-target/debug/codedeck /pfad/zum/testrepo &
echo '{"session_id":"t1","hook_event_name":"UserPromptSubmit","cwd":"/pfad/zum/testrepo","prompt":"x"}' \
  | /shared/cargo-target/debug/codedeck hook
echo '{"session_id":"t1","hook_event_name":"PreToolUse","cwd":"/pfad/zum/testrepo","tool_name":"Edit","tool_input":{"file_path":"/pfad/zum/testrepo/a.txt"}}' \
  | /shared/cargo-target/debug/codedeck hook
git -C /pfad/zum/testrepo for-each-ref refs/codedeck   # Snapshot da?
```
Danach nur den eigenen Prozess beenden und nur den eigenen Socket in `$XDG_RUNTIME_DIR/codedeck/`
löschen, denn dort liegen auch die Sockets echter Fenster des Nutzers.

**Vorschau mit Screenshots:** `npx vite --port 5391 &`, dann
`node tools/shot.mjs http://localhost:5391 /tmp/…/x hover:'[aria-label="Trail"]' snap:open`.

## Fallen

- Tauri nimmt als Fensterbild (Taskleiste) das **erste PNG** der Liste `bundle.icon` in `tauri.conf.json`. Vorn
  steht `icons/128x128.png`: 16 px wurde in einer hohen Taskleiste verschwommen hochskaliert, mit 512 px zeigte
  Cinnamon/X11 gar kein Icon (vermutlich zu groß für die Fenster-Eigenschaft, die GDK sonst weglässt). Für das `.deb`
  ist die Reihenfolge egal, es sortiert nach Größe.

- `ScratchIndex` muss die Änderungszeit des echten Index behalten (racy git). Daran nichts ändern, der Test
  `snapshot_and_go_back` sichert das ab.
- `codedeck hook` gibt nichts aus außer dem Übergabe-Text bei `UserPromptSubmit`, denn Claude Code fügt
  stdout dem Prompt hinzu. Der Hook endet immer mit Exit-Code 0 und schickt keine Dateiinhalte.
- Die Ereignisse gehen an alle Fenster; jedes filtert selbst nach `project.root`
  (`bridge.rs::handle`, `concerns`).
- Frontend-Aktionen nur mit Befehlen, die `git::allowed` zulässt. Interne Änderungen wie Snapshots laufen
  nicht über diese Whitelist.

- Zum Prüfen der Hooks: `$XDG_RUNTIME_DIR/codedeck/hook-trace.log` zeigt je Hook-Meldung eine Zeile (immer an,
  ohne Inhalt); `CODEDECK_HOOK_LOG=<datei>` in der Umgebung einer Sitzung schreibt zusätzlich die rohen Meldungen
  (mit Inhalten, nur für Tests).

## Notizen

- Changes: „geändert nach dem Abhaken“ (Nutzer 2026-11-17, Idee aus dem Praxistest 3.0). Die Werkbank markiert Neues seit dem letzten Blick (`src/news.ts`); in Changes wäre ein allgemeines „neu“ fast überall, denn dort steht ohnehin nur Geändertes. Sinnvoll ist: Eine als angesehen abgehakte Datei (`src/reviewed.ts`), die sich danach wieder ändert, verliert das Häkchen und trägt „geändert“ (Vergleich über den Stand beim Abhaken, z. B. Blob-Hash). Umgesetzt 2026-11-19 zusammen mit dem Umbau des Häkchens: statt Kästchen links (las sich wie Vormerken/Stage) ein Schalter „Angesehen“ rechts im Dateikopf; „seit dem Ansehen geändert“ über den gemerkten Stand je Ansicht (`reviewSlot`: Bereich + HEAD + Pfad, nach einem Commit also kein „geändert“); die Commit-Zeile nennt „n nicht angesehen“, ohne den Commit zu ändern.
- Fenster in der Taskleiste unterscheiden (Nutzer 2026-11-17, Praxistest 3.0): Titel jetzt mit dem Projektnamen zuerst (`orbit-api ● 2 asking – CodeDeck`, `set_title_status`). Icon je Fenster gebaut als Spike (`icon.rs`: CodeDeck-Raute, Streifen in der Projektfarbe aus dem Pfad, Punkt bernstein = fragt, grün = fertig; `set_icon` bei jeder Titeländerung; `_NET_WM_ICON` 64×64 belegt). Offen: zeigt Cinnamons Fensterliste es (gruppiert/ungruppiert)? Emoji je Projekt später mit 3.0b. Die Zahl am Symbol zählt Cinnamon je Programm und steht an allen Fenstern.
- Rechte Spalte ruhiger (2026-11-17, Nutzer): Sitzungen und Nächster Prompt ohne eigene Tönung, Zahl bei „Wartet auf dich“ bernsteinfarben nur bei Fragen, mehr Raum um die Karten; Activity „Claude-Verbrauch“ oben wie unten 24 px. Behoben: Punkt vor „Runde fertig“ wurde nie eingefärbt (ungültiger Selektor `:is(> span)`), gefüllte Schilder ohne Punkt.
- „Wartet auf dich“ als Karten und „neu“ in der Werkbank (2026-11-17, Nutzer, Dummy `design/click-dummy/attention.html` Variante B): keine getönte Fläche mehr (Bernstein auf Grau wurde braun), Karten mit feiner Umrandung, bernsteinfarben bei Fragen, Neues gleitet herein und leuchtet kurz (`wait-card`, `attention-new`). „Neu“ in der Werkbank heißt jetzt „seit dem letzten Blick nicht gesehen“ (`src/news.ts`) statt „24 Stunden“: Scratch-Dateien (neu/geändert), abgelegte Dateien, Seiten, Hinweise; Karte in KI-Farbe mit „neu“, Punkt am Reiter, „n neu in der Werkbank“ in der Übersicht. `events: focus` tönt wartende Zeilen nicht mehr. Praxistest bestanden (2026-11-17).

- Forest überarbeitet (2026-11-17, Nutzer): Bedienelemente grün (obere Leiste, Statusleiste, Knöpfe, Menüs), Inhalt erdig, Highlights in Blüten- und Fruchtfarben, `events: loud`. Neu: `zoneSurfaces` (Bereichsflächen genau setzen); Pfadleiste und Kopfleiste gehören zur Zone `zone-tabs`.
- Vorgabe „CodeDeck“ verfeinert (2026-11-17, Nutzer): `events: focus`, Fehler `#e66a78`, Hauptknopf `#bd4f00`, Menügrund `#32373e`, Sitzungen A `#7f95ff` und D `#e391d0`; Rückfallwerte in `index.css` gleich.
- Terminal beruhigt (2026-11-17): ANSI-Farben mit Bedeutung (Gelb geändert/wartet, Magenta du, Cyan KI), kaum noch Grün in Schrift und Flächen, kein Schimmer, `events: focus`.
- Elegance verfeinert (2026-11-17): Lackrahmen (obere Leiste, Statusleiste), „wartet“ in Cognac statt Rosé (war neben Fehlerrot kaum zu unterscheiden), `events: focus`.
- Moon überarbeitet (2026-11-17, Nutzer: „sehr blau“): Nachtblau nur als Rahmen, Inhalt Graphit, KI Flieder, `events: focus`, kein Schimmer. Lehre für alle Themes in `STYLING.md` B7 (Forest).
- Paper nach dem Vorbild „Charamel“ (Thunderbird) neu (2026-11-17, Nutzer): Karamell-Rahmen, Creme-Inhalt, eigene warme Grauskala, Orange und Himmelblau. Behoben: „Licht von oben“ (`gradient`) nahm auf hellen Themes die dunkle Schrift als Lichtfarbe, jetzt Weiß (`--t-light-from`).
- Paper als Naturpapier (2026-11-17, Nutzer): Flächen ausdrücklich gesetzt (gebrochenes Weiß, Elefantenhaut), gedämpfte Tinte, neue Stufe `events: focus` (nur Wartendes laut).
- Colorful neu abgestimmt (2026-11-17, Nutzer: „farbenfroh, aber angenehm“): Zonen- und Bedeutungsfarben je mit gleicher Helligkeit und Sättigung in OKLCH; die anderen Themes nutzen `events: clear` (Paper, Elegance, Moon, Forest, Moon/Forest dazu `zones` 5/6) bzw. `loud` (Terminal, Contrast), Tabelle in `STYLING.md` B7.
- Themes `zones` und `events` (2026-11-17, Wunsch des Nutzers): Bereiche einfärben über neu belegtes `--color-panel` je Zone (`zone-files`, `zone-tabs`, `zone-side`, `zone-bar`), Ereignisse über `data-event` an `event-chip`/`event-row`, Fensterrand über `attn-asks`/`attn-done` an `<html>` (aus `useAttention`). Neue Rolle `done`. Colorful färbt die Bereiche, Fancy ist jetzt „Spotlight“ (dunkle Bühne, nur Ereignisse leuchten). Vorgabe unverändert (`events: quiet`, `zones: 0`).

- Theme-Familie (2026-11-17, Wunsch des Nutzers): neun Themes (CodeDeck, Paper, Colorful, Moon, Forest, Elegance, Fancy, Terminal, Contrast), je mit eigenem Gestaltungsgedanken, `docs/STYLING.md` B7; Graphite und Signal entfallen (in Elegance und Fancy aufgegangen). Neue Schriftstufe `mono`. Ableitung der Sitzungsfarben hält 40° Abstand zu den Bedeutungsfarben. Das Labor `design/click-dummy/themes.html` zeigt noch die ersten vier.

- Themes S.1/S.2 (2026-11-17, vorgezogen auf Wunsch des Nutzers, `docs/STYLING.md`): `palette.ts` leitet aus wenigen Farben alle Rollen ab und prüft sie (dieselbe Datei läuft in `npm run themes` unter Node mit `--experimental-strip-types`), `theme.ts` setzt `--t-…` auf `<html>`, `index.css` hat für jede Rolle „CodeDeck“ als Rückfall. Vier Themes (CodeDeck mit allen heutigen Werten, Paper, Graphite, Signal). Inaktives Fenster jetzt abgeleitet (`color-mix` in OKLCH), nicht mehr von Hand. Fallen: Inline-Skripte verbietet die CSP, darum `public/theme-early.js`; Tailwinds `rounded` ist ein fester Wert und wird außerhalb der Ebenen überschrieben; ein Häkchenfeld erzwang `color-scheme: dark`. Nicht gebaut: durchscheinendes Fenster (Spike), `selection`, „dem System folgen“. Praxistest offen.

- Vorarbeit MVP 3 (2026-11-17, vor 3.0): Der Hook meldet je Nachricht `Place` (Prozess des Werkzeugs samt Startzeit, tmux-Pane und -Name, `CODEDECK_SESSION`, Remote-Link aus `CLAUDE_CODE_BRIDGE_SESSION_ID`), die Brücke hält es an der Sitzung, die Details zeigen es. Nur Beobachtung, keine Entscheidung aus `docs/SITZUNGEN.md` vorweggenommen. Praxistest bestanden (2026-11-17): Sitzung in tmux mit `--remote-control` zeigt Name und Link; der tmux-Name kommt nur bei Start, Prompt und Rundenende (kostet einen Prozess).

- Zielbild (2026-11-15): Der Dummy wurde nur im lokalen Betrachter durchgeklickt, nicht gegen echte Daten
  geprüft. Technisch ungeprüft sind vor allem: Text über den Hook „Sitzung beginnt“, Link einer
  veröffentlichten Seite im Hook, Zuordnung tmux-Sitzung ↔ Claude-Sitzung, Quelle für den Verbrauch,
  Kurzbericht und Plan einer Runde aus dem Log. Das klärt jeweils der Schritt, der es braucht.

- **1.1 Praxistest (2026-11-15, `~/.claude-private`, Claude Code mit Modell haiku-5-5 als Testsitzung)**
  - Bestanden: Sitzung erscheint schon bei `SessionStart`; Status working → idle („turn done“) → nach ca. 1 Minute
    `Notification` `idle_prompt` („waiting for you“); Berechtigungsfrage kommt als `Notification`
    `permission_prompt` etwa 3 s nach `PreToolUse`; Modell und Titel erscheinen nach der ersten Antwort (aus dem
    Log); Snapshot vor dem ersten Schreiben/Bash einer Runde, mit `CodeDeck-Session` und `CodeDeck-Tool`.
    Sitzungen, die vor dem Verbinden liefen, melden sich ab ihrem nächsten Schritt (Claude Code liest
    `settings.json` bei laufender Sitzung neu).
  - Rohmeldungen (Mitschnitt mit `CODEDECK_HOOK_LOG=<datei>` in der Umgebung der Sitzung, siehe `hook.rs`
    `record_raw`): `SessionStart` enthält `model` und `source`; `Notification` enthält `notification_type`
    (`permission_prompt`, `idle_prompt`, …) und `message`; `Stop` enthält `last_assistant_message` (Quelle für
    den Kurzbericht in 1.5); jede Meldung enthält `permission_mode`; `PreToolUse` für Bash enthält
    `tool_input.command` und `description` (Schreibvorgänge außerhalb des Projekts sind also nur über den
    Befehlstext zu erkennen, für Write/Edit über `file_path`).
  - Aus der Doku (code.claude.com/docs/en/hooks): Text auf stdout von `SessionStart` kommt als Kontext in die
    Sitzung (auch `hookSpecificOutput.additionalContext`); Hooks feuern gleich in Terminal, IDE und Desktop,
    Cloud-Sitzungen lesen die lokale `settings.json` nicht; MCP-Aufrufe lassen sich mit Matcher `mcp__.*`
    abonnieren, auch `PermissionRequest` gibt es. Noch nicht live geprüft.
  - Gefundene Fehler: Nach einer erlaubten Bash-Frage blieb „needs your permission“ stehen (kein
    `PostToolUse` für Bash) → `Stop`/`SessionEnd` löschen jetzt die Meldung (behoben, `bridge.rs`).
  - Befunde für spätere Schritte: (a) Die Anzeige „turn done“ steht bis zu eine Minute, bevor sie „waiting“
    wird; für „Needs you“ (1.4) `Stop` nehmen, nicht auf `idle_prompt` warten. (b) Snapshots entstehen auch bei
    lesenden Bash-Befehlen und werden nach Baum entdoppelt: der Snapshot einer früheren Runde ist dann der
    Stand „vor dem Schreiben“ und trägt deren Prompt (vor 1.5 klären). (c) Der blaue Punkt im Dateibaum heißt
    nur „kürzlich geändert“ (2 Minuten, nicht KI-spezifisch). (d) Sitzungen sind im Trail, in der Liste und im
    Dateibaum schwer zuzuordnen; die Liste sortiert nach letzter Aktivität (`bridge.rs` `sort_by last`) und
    springt. (e) `Notification` `permission_prompt` nennt den Befehl nicht; er steht im vorangehenden
    `PreToolUse` und könnte gemerkt werden. (f) Die Statusanzeige im HookPanel nennt jetzt „Connected“ im Text.
  - Gewünscht vom Nutzer, noch nicht entschieden (D15): Sitzungs-Identität mit Farbe und Kurzname überall, wo die
    Sitzung vorkommt (Liste, Trail, Snapshots, Dateien), Hover hebt Zugehöriges hervor, feste Reihenfolge
    (nach Start statt Aktivität), Umbenennen mit Titel und Kurzname je Projekt in `config.rs`.
  - „Hand to Claude“ (Test E): Der Text kam mit dem nächsten Prompt in der Test-Sitzung an (Claude gab ihn
    wieder, die Sitzung zeigt „got the hand-over“). Auffälligkeiten: (a) Der Marker-Scan findet 19 Treffer, fast
    alle sind falsch: er liest die Marker-Schreibweise in `markers.rs` (Code, Tests), `DocsView.tsx`,
    `backend.ts`, README und den Konzeptdokumenten (Text „…“). Echt waren nur wenige. Scan muss
    Quelltext/Dokumentation der Schreibweise ausnehmen oder nur echte Kommentarzeilen zählen. (b) Doppelte Zustellung war
    kein Fehler: Der Nutzer hatte den Knopf zweimal gedrückt, der zweite Klick setzte die Übergabe neu und
    wurde vom nächsten Prompt in einer anderen Sitzung abgeholt; „not picked up yet“ war richtig. Aber:
    die Übergabe gilt für **jede** Sitzung des Projekts, die zuerst einen Prompt schickt, nicht für eine
    gewählte. Für 1.4 prüfen, ob man eine Zielsitzung wählen können soll. (c) Der Tooltip von „Hand to
    Claude“ wird von der rechten Spalte abgeschnitten. (d) Nutzer wusste nicht, was der Reiter und der
    Knopf tun: „Docs“ klingt nach Dokumentenliste, zeigt aber die Treffer des Marker-Scans (mit Zeilennummern, bei
    Fehltreffern wirkt das willkürlich) und unten die zuletzt von der KI geschriebenen Dokumente. Der Knopf je
    Datei übergibt nur deren Marker, der obere alle; die Zielsitzung ist nicht wählbar. Für 1.6: Zielsitzung
    nennen oder wählen, genauen Text zeigen, einen Satz Erklärung, Scan auf echte Kommentarzeilen (auch
    `@ai` am Zeilenanfang genügt für Text- und Markdown-Dateien; die Klammerform `[!AI: …]` ist in Markdown
    problematisch, weil eckige Klammern dort eigene Bedeutung haben (Links, Checkboxen). Der einfachste Versuch
    des Nutzers, `@ai: …` ohne Klammern, wurde nicht erkannt).
  - Desktop-App (Test F): Wählt man keinen Ordner, läuft die Sitzung in einem Scratch-Ordner der App
    (`~/.config/claude-desktop-privat/scratch-workspaces/…`) und wird von CodeDeck zu Recht ignoriert (Ordner
    liegt außerhalb des Projekts). Die Desktop-App nutzte hier `~/.claude` (Log unter `~/.claude/projects/`),
    nicht `~/.claude-private`; ihre Metadaten liegen in `~/.config/claude-desktop-privat/claude-code-sessions/`
    (Titel, `cwd`, Modell, `cliSessionId` = Sitzungs-ID im Log). Das Log von Claude Code kennt `custom-title`
    (vom Nutzer vergebener Name) und `agent-name`: für D15 (Umbenennen) zuerst `custom-title` lesen, dann
    `ai-title`. Hook-Ereignisse stehen nicht im Log, ob sie feuern, zeigt nur CodeDeck oder der Mitschnitt.
  - Zu viele Sitzungen in der Liste (Nutzer: 7, davon 2 „ended“; bis zu 20 werden gehalten, `SESSIONS_KEPT`).
    Beendete Sitzungen sind eingeklappt und gedimmt, aber noch in der Liste. Vorschlag für 1.4: beendete
    standardmäßig in einem eigenen Abschnitt „Earlier“ einklappen, Sitzungen ohne Aktivität seit Stunden ebenso.
  - **Desktop-App feuert keine Hooks** (Test F, belegt): Eine Sitzung der Desktop-App (Claude Code 2.1.325,
    `--setting-sources=user,project,local`, Ordner = Projekt, `~/.claude` mit eingetragenen Hooks) schickte
    nach einem Prompt keine einzige Meldung; die Spur `hook-trace.log` (`$XDG_RUNTIME_DIR/codedeck/`, eine Zeile
    je Hook-Meldung: Zeit, Ereignis, Sitzung, erreichte Fenster) zeigt nur die CLI-Sitzung. Trotz Doku („gleiche
    Hooks in Desktop“). Ursache offen. Folge: Desktop-Sitzungen sind für CodeDeck nur über das Log beim Start
    sichtbar, ohne Status, Anker und Übergabe; verlässlich ist nur die CLI (passt zu D4, tmux).
  - Offen aus 1.1 und auf spätere Schritte verschoben: Text aus `SessionStart` live (1.6), Link einer
    veröffentlichten Seite (2.2), Ursache für Desktop ohne Hooks (3.1).

- 1.2 (2026-11-15): Alles Claude-Spezifische liegt in `harness/claude.rs` (Hooks, `settings.json`, Konfigurationen,
  Log-Format); `sessions.rs` gibt es nicht mehr, `hook.rs` ist nur noch Transport. Über den Socket geht ein neutrales
  `Event` mit `kind` (`session_started`, `prompt_submitted`, `before_write`, `after_write`, `waiting`, `turn_done`,
  `session_ended`); `before_write` ohne `file` heißt „kann alles ändern“ (Shell). `codedeck hook` ohne `--harness`
  nimmt den Standard-Adapter (Claude, erster in `harness::all()`), eingetragene Hooks bleiben gültig. Jede Sitzung
  trägt `harness` und `capabilities`; nur aus dem Log bekannt = `Capabilities::from_log_only` (kein `liveStatus`,
  `beforeWrite`, `handover`), mit dem ersten Ereignis gelten die des Werkzeugs. Die Oberfläche zeigt das noch nicht an
  (für 1.4: „nur aus dem Log“ statt „idle“). Frontend: `mainHarness(state)` liefert Namen und Fähigkeiten,
  `useConnections` ersetzt `useHooks`; „Hand to …“ nur bei `handover = withNextPrompt`, bei `clipboard` „Copy“.
  Kernlogik der Brücke ist `Inner::take_in` (ohne Fenster und Git testbar), Test-Adapter `harness/fake.rs`.
  Bewusste Ausnahme: `history.rs` `AI_MARKS` (Co-Autoren in Commits) bleibt im Kern. `hook-trace.log` schreibt jetzt
  `<zeit> <harness> <Art> <sitzung> …`. Die Rohmeldungen im Claude-Test sind aus den Notizen zu 1.1 nachgebaut, ein
  echter Mitschnitt (`CODEDECK_HOOK_LOG`) lag nicht mehr vor; bei Gelegenheit ersetzen.
  In der echten App geprüft (CLI-Sitzung, 2026-11-15): Status, Titel, Sicherungspunkt („Before: <Prompt>“) und
  Übergabe mit dem nächsten Prompt funktionieren wie vor dem Umbau. Die Übergabe enthielt nur den Fehltreffer
  `README.md:70` (Zeile, die die Marker-Schreibweise erklärt); er gilt als übergeben und wird nie „erledigt“ (für 1.6).
- 1.2a (2026-11-15): Identität je Sitzung in `identity.rs`, gespeichert in `~/.config/codedeck/sessions.json` je
  Projektpfad (Farbe als Index 0–5, Kurzname, eigener Titel, letzter Werkzeug-Titel, zuerst/zuletzt gesehen; nach
  30 Tagen vergessen). Neue Sitzung: die Farbe, die die wenigsten nicht beendeten Sitzungen tragen; nächster Buchstabe,
  den keine gelistete Sitzung hat. `Session.started` = „zuerst gesehen“, die Liste sortiert danach (neueste oben); für
  Sitzungen aus dem Log ist das deren letzte Aktivität beim ersten Einlesen. `AssistantState.identities` enthält auch
  nicht mehr gelistete Sitzungen, damit alte Snapshots ihre Farbe behalten. Frontend: `useSessionMarks()` (Kontext aus
  `App.tsx`) liefert `of(id)`, `writer(path)`, `hovered`/`hover`; `SessionBadge` ist das Schild. Farben stehen als
  `--color-session-0…5` in `index.css` **außerhalb** von `@theme` (Tailwind verwirft Theme-Variablen, die keine
  Utility nutzt). Titel aus dem Log: `custom-title` vor `ai-title` (im Adapter). Offen: Hover nur von der Liste aus
  (Gegenrichtung mit 1.4); der Punkt im Dateibaum erscheint weiter nur 2 Minuten, gefärbt nur für gelistete Sitzungen;
  zwei Fenster auf demselben Projekt können sich beim Speichern überschreiben. Nur in Tests und Vorschau geprüft.
- 1.3 (2026-11-15): Vier Reiter in `Deck.tsx` (ohne Icons, Frage rechts in der Leiste, Name des Werkzeugs aus
  `mainHarness`), Start in Changes. Docs → `HandoverView` (zeigt jetzt alle wartenden Übergabeteile, auch den Fokus,
  mit „Take back“); „Recently written“ → `ActivityView`; `WorkbenchView` ist Platzhalter. `WorkspaceView`, `ComingView`
  und die Workspace-Beispieldaten sind gelöscht (waren unecht). Bausteine in `blocks.tsx`: `Toolbar`, `Section`,
  `Rows`/`Row`, `Document`, `Decision`; die drei neuen Ansichten nutzen sie, `Toolbar` und `Document` haben noch
  keinen Nutzer. **Changes ist nicht umgestellt** (860 Zeilen, eigene Rahmen): das gehört zu 1.5. Bereichsfarben:
  `--color-area-ai` (Sitzungen) und `--color-area-you` (Fokus, später „Next prompt“) in `index.css`. Der Trail bleibt
  die schmale Spalte, die beim Überfahren aufgeht (Dummy zeigt ihn dauerhaft offen); Glocke „Notices“ kommt mit 2.3.
  Hover-Nachbesserung zu 1.2a ist enthalten: Commits bleiben hell, Hervorhebung hält zwischen zwei Sitzungen.
- 1.4 (2026-11-15): Rechte Spalte in drei Bereichen (`SessionsPanel.tsx`). **Needs you:** Sitzung fragt (Status
  `waiting`, Grund = Meldung) oder hat ihre Runde beendet (`Session.turnDone`); Letzteres lässt sich weglegen (×) und
  verschwindet nach 30 Minuten von selbst (`DONE_SHOWN_MS`, soll Einstellung werden). **Sessions:** zwei Zeilen
  (Titel + Zustand, darunter `Session.step` / Frage / Ergebnis), Details klappen auf; „Earlier“ (eingeklappt) sammelt
  beendete, nur aus dem Log bekannte und seit 6 h untätige (`EARLIER_AFTER_MS`); „Remove from list“ nimmt eine Sitzung
  heraus (`forget_session`, `Identity.hidden`), sie kommt mit ihrem nächsten Schritt von selbst wieder. **Next
  prompt:** wartende Teile mit „Preview“ des genauen Textes und „Take back“, danach die Quittung „Delivered at … to
  <Sitzung>“ (`AssistantState.delivered`), darunter der Fokus mit „Add to next prompt“. Belegt aus der Hook-Spur:
  Wird eine Runde abgebrochen oder läuft ins Nutzungslimit, feuert **kein `Stop`**; erst `Notification`
  `idle_prompt` eine Minute später. Der Claude-Adapter übersetzt `idle_prompt` deshalb als `turn_done` (keine Frage),
  der Kern behält den ersten Zeitpunkt. Nicht gebaut: „Allow once“ (D13), Befehlstext bei der Erlaubnisfrage
  (Befehle verlassen den Hook bewusst nicht), Zielsitzung wählen, „New session…“ (3.x), Größen ziehen.
  **Für 2.4 (Verbrauch) belegt:** Das Log enthält bei erreichtem Limit einen `assistant`-Eintrag mit
  `isApiErrorMessage: true`, `error: "rate_limit"` und Text wie „You've hit your 5-hour limit · resets 7pm
  (Europe/Berlin)“. Daraus lässt sich „wartet auf Reset“ je Sitzung ablesen, aber erst beim nächsten Log-Lesen
  (kein Hook in dem Moment). Der Nutzer liest den Verbrauch schon heute für Home Assistant aus (Prozent im
  5-Stunden-Fenster, Prozent im Wochenfenster, Reset des Wochenfensters): die Quelle ist die
  **Statuszeile von Claude Code**: Ihr Befehl bekommt auf stdin JSON mit `rate_limits.five_hour` und
  `rate_limits.seven_day`, je `used_percentage` und `resets_at` (so liest es `~/.claude/statusline-mqtt.py` des
  Nutzers, aufgerufen aus `statusline-command.sh`, und meldet es per MQTT). Das beantwortet D2 weitgehend. Offen für
  2.4: wie CodeDeck an diese Werte kommt, ohne die vorhandene Statuszeile des Nutzers zu ersetzen (z. B. ein
  `codedeck usage`, das das Script zusätzlich füttert, oder CodeDeck liest eine Datei, die das Script schreibt), und
  dass die Werte je Konto gelten und nur kommen, während eine Sitzung läuft. Die Liste zeigt Sitzungen, deren Ordner das Projekt ist, darin liegt **oder es enthält**
  (eine Sitzung im Elternordner erscheint also auch); ob Letzteres bleiben soll, mit MVP 3 (mehrere Projekte) klären.
- 1.5 (2026-11-15): **Runde = zwei Sicherungspunkte derselben Sitzung in einem Repo.** Anfang wie bisher vor dem
  ersten Schreiben; neu das Ende bei `TurnDone` (`Git::end_turn`, Label „After: <Prompt>“, Trailer `CodeDeck-From:
  <Anfang>`, im Trail ⚑), nur wenn sich seit dem Anfang etwas geändert hat. Die Runde steht damit ganz im
  End-Snapshot (`Snapshot.turnFrom`, `.report`, `.parent`), kein eigener Speicher. Befund b aus 1.1 ist so gelöst:
  `take_snapshot` gibt bei unverändertem Stand den vorhandenen Punkt zurück (`Taken { hash, new }`), die Runde beginnt
  dann dort (meist am Ende der vorigen). Die laufende Runde steht in `Session.turn` (Repo + Anfang), ihr Diff reicht
  bis jetzt. Kommt ein neuer Prompt ohne `TurnDone` davor, endet die alte Runde mit ihm. **Kurzbericht** = Claudes
  Abschlussnachricht im Wortlaut: `last_assistant_message` aus `Stop` (`Event.report`, bis 6000 Zeichen; bewusste
  Ausnahme von „keine Antworten verlassen den Hook“), sonst der letzte Text aus dem Log (`SessionInfo.report`, für
  abgebrochene Runden); er steht in der Nachricht des End-Snapshots, also in Git-Objekten des Repos, die nie gepusht
  werden. Frontend: `turns.ts` (`turnsOf`: nur Runden auf dem aktuellen HEAD; `useTurnWriters`: je Runde die
  geänderten Pfade über `gitCompare`, einmal gefragt), Auswahl `Scopes` und `TurnChanges` in `ChangesView`;
  „Before this turn…“ öffnet den Anfangs-Snapshot, dort ist „Go back“. Wer-Schild je Datei nur in „All uncommitted“
  und nur, wenn für mindestens eine Datei eine Sitzung bekannt ist. `reviewed.ts`: Haken je Datei in `localStorage`,
  Schlüssel aus Repo, Pfad und Fingerabdruck des Diffs. `notes.ts`: Zeilenkommentare als Übergabeteil `notes`; ist
  der Teil aus der Warteschlange (ausgeliefert oder zurückgenommen), sind die Kommentare weg. Kommentieren geht in
  jedem Diff, nur an Zeilen der neuen Seite. `tools/shot.mjs` kann jetzt `type:` und `eval:`; kopfloses Chromium meldet
  keine Maus, per CSS-Hover Eingeblendetes klickt man dort mit `eval:`. Der Bericht ist Markdown: In Changes stehen nur die ersten drei
  Zeilen roh, „Read in Marq“ zeigt alles formatiert (`apps::show_markdown`, `marq - --reuse`, Text über stdin wie bei
  Dirq); ohne Marq klappt der Text an Ort und Stelle auf. **Nicht gebaut:** „Claude asks“ aus dem
  Bericht, Testzeile (4.3), Zustand „done · Claude changed this line“ am Kommentar, Changes vollständig auf
  `blocks.tsx` (nur `Toolbar` und `Section` der Runde). **Offen:** nur in Tests und Vorschau geprüft; in der echten
  App zu prüfen: Ende-Punkt nach `Stop`, Bericht, Kommentar kommt bei Claude an; ob „Runde“ für den Nutzer
  nachvollziehbar ist (mehrere Sitzungen gleichzeitig landen im selben Diff). `StatusDot`: Der Ring läuft auch bei
  „reduzierter Bewegung“, weil GTK das hier meldet (`gtk-enable-animations = False`), ohne dass der Nutzer es gewählt hat.
- **Vorbereitung 1.6 (2026-11-15, mit dem Nutzer entschieden, noch nichts gebaut):**
  - *Startregeln (D16, D17):* Jede Sitzung bekommt beim Start über den Hook „Sitzung beginnt“ einen festen Text
    (Claude: stdout von `SessionStart` bzw. `hookSpecificOutput.additionalContext`, laut Doku; **live noch nicht
    geprüft**, das ist der erste Prüfpunkt des Schritts). Inhalt in 1.6: nur die Link-Regel. Die Regel zu
    `.workbench/` (D12) erst mit 2.1. Immer an, kein Schalter. Der Text steht wörtlich im Reiter Handover.
    Technik: `Capabilities.start_rules` für Claude auf `true`, `Harness::reply` liefert den Text beim Ereignis
    `SessionStarted`; der Regeltext selbst gehört in den Kern (ein Ort, von Reiter und Hook gelesen), nicht in
    den Adapter. Zu klären beim Bauen: `SessionStart` feuert auch bei `resume`/`compact`/`clear` (Feld `source`):
    Regeln dann erneut mitgeben? Vorschlag: ja bei `clear` und `compact` (der Kontext ist weg), nein bei `resume`.
  - *Marker (D18):* `markers.rs` `PATTERNS` ersetzen durch eine Regel:
    `^[[:space:]]*((<!--|//|/\*|\*|#|--|;|%)[[:space:]]*)?@ai`, danach Wortgrenze, Doppelpunkt freiwillig. Die
    Kommentarzeichen: `<!--`, `//`, `/*` und `*` (Folgezeile eines Blockkommentars), `#`, `--`, `;`, `%`. `[!AI:`
    streichen (auch in Doku, Mock und Tests). Mit dem Nutzer besprochene Folgen: Der Kommentar muss die Zeile
    beginnen; `Text <!-- @ai … -->` und `code(); // @ai …` zählen nicht. In Markdown sind `#` und `*` auch
    Überschrift und Listenpunkt: `# @ai …` und `* @ai …` zählen dort ebenfalls, das ist gewollt hingenommen. Übrig bleiben können Beispiele, die allein auf einer Zeile stehen (Codeblock in
    README/Konzept): nach dem Umbau im CodeDeck-Repo zählen; sind es noch welche, Zeilen in Markdown-Codeblöcken
    (zwischen ```-Zeilen) ausnehmen, statt Ausnahmen je Projekt zu pflegen. README und `KONZEPT.md` nennen die
    Schreibweise: Beispiele dort so setzen, dass sie nicht am Zeilenanfang stehen.
  - *Zielsitzung (D19):* In „Next prompt“ (rechte Spalte und Reiter) wählbar: „any session“ (wie heute: wer im
    Projekt zuerst promptet) oder eine gelistete Sitzung mit `handover = withNextPrompt`. `bridge.rs`: Ziel an
    der Warteschlange merken, in `take_in` bei `PromptSubmitted` nur ausliefern, wenn die Sitzung passt; endet
    die Zielsitzung oder wird sie entfernt, fällt das Ziel auf „any“ zurück und die Oberfläche sagt es. Vorauswahl
    bei Zeilenkommentaren: die Sitzung der Runde, in der kommentiert wurde (`Turn.session`; `notes.ts` kennt sie
    heute nicht). Ein Ziel für die ganze Warteschlange, nicht je Teil.
  - *Reiter Handover:* heute `HandoverView.tsx` (Warteschlange mit „Take back“, Marker, Fortschritt). Laut Dummy
    kommen dazu: der genaue Text als ein Dokument (`Document` aus `blocks.tsx`, bisher ohne Nutzer), Quellen zum
    Aufnehmen, die Startregeln. Bekannte Mängel aus 1.1 (Test E): Fehltreffer `README.md:70` gilt als übergeben
    und wird nie „erledigt“ (löst D18), Tooltip von „Hand to …“ wird rechts abgeschnitten, ein Satz Erklärung fehlt.
  - *Fertig wenn:* Regeln stehen wörtlich im Reiter und kommen in einer neuen Sitzung an (braucht den Nutzer).
- 1.6 (2026-11-15): **Startregeln:** Text in `rules.rs` (`START_RULES`, ein Ort für Hook und Reiter, Befehl
  `start_rules`). Das Fenster, das die Sitzung betrifft, antwortet auf `SessionStarted` damit, wenn das Werkzeug
  `start_rules` kann und die Sitzung nicht fortgesetzt ist (`Event.resumed`; Claude: `source == "resume"`; `clear` und
  `compact` bekommen die Regeln erneut). Der Claude-Adapter druckt bei `SessionStart` wie bei `UserPromptSubmit`;
  `codedeck hook` entdoppelt gleiche Texte (zwei Fenster auf einem Projekt). Ohne offenes Fenster bekommt eine Sitzung
  keine Regeln, so steht es auch im Reiter. `AssistantState.ruled` = wer sie zuletzt bekam. Mit dem echten Binary und
  nachgestellten Meldungen geprüft (startup/compact: Text, resume: nichts, anderes Projekt: nichts). **Marker
  (D18):** `git grep` nur als grobe Vorauswahl, `markers.rs::marker_text` entscheidet (Kommentarzeichen dürfen
  verdoppelt sein: `///`, `##`, `/**`); Zeilen in Markdown-Codeblöcken (``` und ~~~) zählen nicht (`drop_fenced`, liest
  nur Markdown-Dateien mit Treffern). Im CodeDeck-Repo bleiben damit 0 Treffer, auch `README.md:70` ist weg.
  **Zielsitzung (D19):** `Inner.target`/`target_lost`, Befehl `hand_over_to`; ausgeliefert wird nur an die Zielsitzung
  (oder an jede ohne Ziel); geliefert oder Warteschlange leer → Ziel wieder „any“; endet die Zielsitzung, wird sie
  entfernt oder fällt aus der Liste, gilt „any“ und `TargetLost` sagt es. Auswahl `HandoverTarget.tsx` (natives
  `select`) in „Next prompt“ und oben im Reiter. Vorauswahl beim ersten Zeilenkommentar: die Sitzung der Runde
  (`NoteSessionContext` aus `TurnChanges`), sonst wer die Datei zuletzt schrieb. **Reiter:** `Toolbar` (Ziel, wartet),
  „Queued“ mit dem genauen Text als `Document` (erster Nutzer), „Pick up for the next prompt“ (Zeilenkommentare, Fokus,
  Hinweise; „Failing test“ erst mit 4.3), Hinweise mit einem Satz Erklärung, Startregeln wörtlich. **Offen, braucht den
  Nutzer:** ob der Tooltip von „Hand to …“ noch abgeschnitten wird (nicht geprüft; `Tooltip` begrenzt die Lage schon auf
  das Fenster); kommt der Text aus `SessionStart` in einer echten Claude-Sitzung an (Frage in einer neuen Sitzung: „Welche
  Regeln von CodeDeck hast du bekommen?“), auch nach `/clear`; Zielsitzung mit zwei echten Sitzungen.
- 1.6a (2026-11-15, D20, D21): Anlass war die Frage des Nutzers, was „Handover“, Pins und „Next prompt“
  voneinander unterscheidet: nichts, alles ist Text, den CodeDeck an den nächsten Prompt hängt. Jetzt: Reiter
  `NextPromptView.tsx` (`ViewId` `next`), Verb „Attach“ / „Remove“, Büroklammer statt Pin (Dateibaum, Liste).
  Pins sind der Übergabeteil `files` (vorher `focus`): `useAttachedFiles` in `focus.ts` (aus `App.tsx`) hält Pins
  und Teil gleich und leert die Pins, wenn der Teil weg ist (abgeschickt oder entfernt), wie `useNotesSync`.
  `attachmentCount` zählt jede Datei einzeln und jeden anderen Teil einmal (Reiter-Badge, Abschnitt, rechte
  Spalte). Startregeln heißen „Every session gets this when it starts“ und sagen „Not an attachment“. Interne Namen
  (`hand_over`, `Handover`, `capabilities.handover`, `HandoverTarget`) bleiben, nur die Oberfläche ist umbenannt.
  Der Dummy nennt es noch „Handover“; er ist Vorlage, kein Bauplan. Nur in Vorschau und `tsc` geprüft.
- 1.6b (2026-11-15): **Änderung als Verweis** (mit dem Nutzer entschieden): angehängt wird der Git-Befehl, der sie
  zeigt, nicht der Diff (Grundsatz „Pfade, keine Inhalte“; Snapshots sind Refs im selben Repo). `changes.ts`:
  `ChangeScope` (Repo, Git-Argumente, Name) als Context je Ansicht in `ChangesView` (Runde `diff from [to]`, nicht
  Committetes `diff HEAD`, Commit `show`, Snapshot `diff <snap>`, Vergleich `diff a b`), `changeCommand` mit `-C` für
  eingebettete Repos und `:/pfad`, wenn das Projekt im Repo liegt; Hashes auf 12 Zeichen. Teil `changes` wie `notes`
  (`useChangesSync` in `Deck`). Knopf `AttachChange` (DiffParts): am Kopf mit Text, je Datei nur die Büroklammer (beim
  Überfahren; angehängt bleibt sie sichtbar), auch in der Strukturansicht. Claude muss `git` ausführen dürfen (evtl.
  Erlaubnisfrage). **Markiert am
  Ursprung:** Dateien (Dateibaum), Zeilen („attached“), Änderungen (Büroklammer hell), Hinweise („attached“, solange
  der Teil `markers` wartet; `handed` sammelt alle je Fenster, kann also zu viel markieren, wenn man Hinweise nach dem
  Entfernen neu wählt). **Rückblick:** `Session.received` (zuletzt 10: Zeit und Namen der Teile, auch „Start rules“),
  in den Sitzungsdetails als „Got from CodeDeck“; ersetzt „got the hand-over“. Nur in Tests und Vorschau geprüft.
- **Review 1.6–1.6b (2026-11-15):** Behoben: (1) Änderungen gegen den Arbeitsstand (`ChangeScope.worktree`: laufende
  Runde, nicht Committetes, seit Snapshot) nannten nur `git diff`, das ungetrackte neue Dateien nicht zeigt, CodeDeck
  aber schon (ScratchIndex). Jetzt wird eine neue Datei als Pfad angehängt („a new file, read …“), und der Text nennt
  `git status --short` für die übrigen. (2) Marker: nach `@ai` nur Leerraum, `:` oder Zeilenende, sonst wären
  Decorators wie `@ai.tool` Hinweise. (5) Repo ohne Commit: Vergleich mit dem leeren Baum statt `HEAD`. `Session.handed`
  entfernt (ersetzt durch `received`). Offen und als Schritt 1.7 geplant: Wettlauf beim Absenden (ein Anhang, der
  zwischen Abholen und Ereignis dazukommt, wird mit gelöscht, ein Zeilenkommentar kann doppelt rausgehen), zu viel
  „attached“ an Hinweisen, drei Bauweisen für dieselbe Sache (Modul-Speicher in `notes.ts`/`changes.ts`, Zustand in
  `App` für Pins, `handOver` direkt bei Hinweisen), Gesamttext doppelt gebaut (Frontend und `take_parts`), Namen im Code
  (`hand_over` usw.). Bekannt, ohne Schritt: Werkzeuge mit `handover = clipboard` bekommen Kommentare und Änderungen
  nie (kein Adapter dieser Art); Desktop-Sitzungen und solche ohne offenes Fenster beim Start bekommen weder Regeln
  noch Anhänge, das sagt nur die Doku, nicht die App (für den Praxistest im Blick behalten). `ChangesView.tsx` (über
  1150 Zeilen, fünf Ansichten mit gleichem Muster) bekommt einen gemeinsamen Rahmen mit dem nächsten Changes-Schritt.
- 1.7 (2026-11-15): `attachments.ts` mit `createPart(key, {id, text, label, onSent})` für alle vier Teile (`files.ts`,
  `changes.ts`, `notes.ts`, `markers.ts`). Jede Änderung eines Teils zählt dessen Revision hoch, jeder Eintrag merkt sich
  seine; `attach(key, text, label, rev)` schickt sie mit, die Quittung (`Delivery.parts`: Schlüssel und Revision) sagt,
  welche Einträge rausgingen. Nur die verschwinden, später Hinzugekommenes wird neu angehängt. Der Baustein hört selbst
  auf jedes `assistant_changed` (nicht über React-Zustand, der Zustände zusammenfassen kann) und gleicht beim ersten
  Zustand ab: Eigenes geht raus, was nur das Backend noch hat (Fenster neu geladen), wird entfernt. „Remove“ läuft über
  `removeAttachment`, Projektwechsel über `clearAttachments`. Hinweise: „Attach“ fügt hinzu statt zu ersetzen und nimmt
  sie wieder heraus, wenn alle angehängt sind; „attached“ ist jetzt genau der Inhalt des Teils; „Hints sent to …“ zählt
  die abgeschickten. Pins liegen nicht mehr im Zustand von `App`. Den Gesamttext baut nur das Backend
  (`AssistantState.preview`, im Mock nachgebaut). Umbenannt: Befehle `attach`/`attach_for`, `Attachment`, `attachments`,
  `Capabilities.attach` (Enum `Attach`), `AttachTarget.tsx`, `files.ts`. Wettlauf in der Vorschau nachgestellt:
  `window.mockSendPrompt(true)` holt die Anhänge ab und hält die Quittung bis zur nächsten Änderung zurück; ein in
  diesem Moment angehängter Ordner blieb stehen und ging mit dem nächsten Prompt allein raus. Ohne TS-Testrahmen nur
  so geprüft. **Ablauf Praxistest 1.5–1.7:** (1) `./dev`, Statusleiste „Connected“. (2) Neue CLI-Sitzung: „Welche
  Regeln von CodeDeck hast du bekommen?“, danach `/clear` und noch einmal; Details zeigen „Start rules“. (3) Claude
  etwas ändern lassen: Endpunkt ⚑ und Kurzbericht in Changes, „Turn n“ verständlich, auch mit zwei Sitzungen. (4) Datei
  anpinnen, Zeile kommentieren, Runde und Hinweis anhängen, prompten: alles kommt an, `git diff` läuft, danach „Sent
  at …“ und „Got from CodeDeck“. (5) Zielsitzung: in der anderen Sitzung prompten, dort kommt nichts an. (6) Tooltip von
  „Attach“ abgeschnitten? Begriffe klar?
- **Vorbereitung 2.1 (2026-11-15, geprüft, noch nichts gebaut; Fragen F1–F6 an den Nutzer offen):**
  - *Technik (an Wegwerf-Repos ausprobiert):* Der Eintrag `.workbench/` (ohne führenden `/`) in der Datei, die
    `git rev-parse --git-path info/exclude` nennt, wirkt in jeder Tiefe: auch wenn das Projekt nur ein Unterordner
    seines Repos ist (`Repo.prefix`), und für alle verknüpften Worktrees, weil sie `info/exclude` des Haupt-Repos
    teilen. Damit lassen ohne weiteren Code die Diffs von CodeDeck (`ScratchIndex`, `add -A --intent-to-add`), die
    Marker-Suche (`git grep --untracked`) und `git status` den Ordner aus. Snapshots enthalten ihn nicht, und „Go back“
    lässt ihn stehen (`restore_snapshot` löscht nur, was im Snapshot-Vergleich neu ist, Ignoriertes nie): Entwürfe
    überleben ein Zurückgehen, sind aber auch durch keinen Snapshot gesichert, darum Löschen in den Papierkorb
    (`gio::File::trash`, `gio` ist schon Abhängigkeit). Ein Projekt ohne Repo braucht keinen Eintrag; liegen nur
    eingebettete Repos im Projekt, gehört `.workbench/` keinem davon. Die Datei `info/exclude` wird direkt geschrieben,
    nicht über Git; damit es trotzdem sichtbar ist, soll der Schritt im Git-Protokoll erscheinen (Eintrag wie ein
    Befehl, Vorschlag) oder als Hinweis.
  - *Bestand:* Der Dateibaum zeigt Punktordner (versteckt ist nur `.git`, `project.rs` `HIDDEN`), `.workbench/`
    erscheint dort also schon. `watch.rs` beobachtet nur geöffnete Ordner, nicht rekursiv: Für „erscheint sofort“ muss
    `.workbench/` (mit Unterordnern) eigens beobachtet werden, sobald es existiert. Von der KI geschriebene Dateien dort
    tragen über `Session.touched` schon ihre Sitzung (nur Write/Edit, nicht per Shell erzeugte). `WorkbenchView.tsx`
    ist Platzhalter. Der Dialog-Plugin ist da (Dateiauswahl für „von woanders anhängen“). Dateien aus dem
    Dateimanager ins Fenster ziehen liefert Tauri als `drag-drop`-Ereignis mit Pfaden (`dragDropEnabled` ist Standard);
    das interne Ziehen in Next prompt (HTML5) läuft daneben weiter, unter Linux ohne bekannten Konflikt.
  - *Gestaltung (Dummy):* Kopf mit Ordnername, Summe und „Delete n older than 7 days (Größe)“; ein Satz Erklärung;
    je Datei Name, „Alter · Sitzung“ (alt: gelb), Größe, „Open“, „Move into project“, „Delete“; darüber „Still
    somewhere else“ (2.2) und darunter „Pages on claude.ai“ (2.2). In 2.1 nur der Ordner-Teil.
  - *Fragen an den Nutzer (je mit Vorschlag):* **F1** Wann wird der Ignorier-Eintrag geschrieben? Vorschlag:
    automatisch beim Öffnen eines Projekts mit Repo (er ist lokal, ändert nichts Geteiltes), sichtbar im
    Git-Protokoll; den Ordner selbst legt erst an, wer ihn braucht (die KI nach der Startregel, oder „Open folder“).
    **F2** Löschen: in den Papierkorb (Vorschlag) oder endgültig. **F3** „Move into project“: kleiner Dialog mit
    Zielpfad, vorbelegt mit Projektwurzel + Dateiname (Vorschlag), oder Ziehen in den Dateibaum. **F4** `.workbench/`
    im Dateibaum: zeigen, gedimmt wie Ignoriertes (Vorschlag), oder ausblenden, weil es einen eigenen Reiter hat.
    **F5** „Älter als“: fest 7 Tage, später Einstellung (Vorschlag). **F6** Externe Dateien anhängen: als Kopie nach
    `.workbench/attached/` (Stand des Moments; Vorschlag), per Ziehen auf Next prompt und Knopf „Attach a file from
    elsewhere…“; oder nur den Pfad anhängen (dann fragt Claude meist um Erlaubnis). Startregel, Vorschlag: „Put drafts,
    mock-ups, throwaway scripts and test data into .workbench/ in this project, not into /tmp or your home folder.“
- 2.1 (2026-11-15): Antworten des Nutzers auf F1–F6: Eintrag automatisch (ja), Papierkorb, Übernehmen per Ziehen
  (Dialog nur, wenn etwas dagegen spräche: nichts), im Dateibaum gedimmt, fest 7 Tage, externe Dateien später.
  `workbench.rs`: `Git::exclude_workbench` (beim Start und bei `open_project`, im Hintergrund; nur im Repo mit
  `path == ""`, also dem, zu dem die Projektwurzel gehört; erkennt vorhandene Schreibweisen), Eintrag samt Kommentarzeile,
  im Git-Protokoll als `echo '.workbench/' >> .git/info/exclude` über das neue `Git::note_change` (Protokolleintrag für
  Änderungen ohne Git). `list` (rekursiv, Links werden nicht verfolgt, bis 1000 Dateien; die Ordner beobachtet
  `workbench_list` danach), `trash` (`gio::File::trash`, nur Pfade im Workbench), `move_into` (Ziel im Projekt, nicht
  im Workbench, nicht belegt, keine `..`/absoluten Pfade, Ordner unterwegs werden angelegt, Link-Ausbruch geprüft).
  Frontend: `WorkbenchView` (Summe, „Delete n older than 7 days“, je Datei Alter · Sitzung aus `Session.touched`,
  Größe, Öffnen, Papierkorb; Zeilen sind ziehbar), `workbench.ts` (`moveIntoProject`, letzte Verschiebung für die
  Ansicht), `FilesPanel`: Ordner und Wurzel nehmen `WORKBENCH_DRAG` an, ein zugeklappter Ordner öffnet sich nach 0,7 s
  Verweilen, `.workbench` gedimmt mit Erklärung. Zweite Startregel ist aktiv (Text in `rules.rs`). Geprüft: Tests
  (Eintrag, Liste, Verschieben und seine Grenzen), echtes Binary zweimal auf einem Unterordner-Projekt gestartet
  (Eintrag genau einmal, Ordner danach ignoriert), Ziehen in der Vorschau mit nachgestellten Drag-Ereignissen.
  **Praxistest 2.1:** (1) Projekt öffnen: Git-Protokoll zeigt den `echo`-Eintrag, `git status` ignoriert `.workbench/`.
  (2) Neue Sitzung bitten, ein Wegwerf-Script zu schreiben: landet es in `.workbench/` (Startregel), erscheint es sofort
  im Reiter mit Sitzung? (3) Datei auf einen Ordner im Dateibaum ziehen, auch tief (Ordner öffnet sich beim Verweilen).
  (4) Löschen: liegt die Datei im Papierkorb? Nicht geprüft: echtes Ziehen mit der Maus unter WebKitGTK (nur
  nachgestellt in Chromium).
- Übersetzung (2026-11-15, D22): `i18n.ts` (`t(text, values)`, `<T text="… {name} …" name={…}/>` für Sätze mit Elementen,
  `plural(n, noun)` mit deutschen Formen in `nouns`, `known()` für Bezeichnungen, die schon in der Sprache entstanden
  sind, `snapshotLabel()` für „Before: …“/„After: …“ beim Anzeigen, `LOCALE` als lebende Bindung für Datumsformate).
  Sprachwechsel zeichnet `App` neu (`key` in `main.tsx`); Anhänge überleben, weil sie außerhalb der Komponenten
  liegen. Fehlende Übersetzungen sammelt `window.missingTranslations()`. Bewusst englisch: Startregeln, Anhangstexte,
  Namen von Änderungen in deren Text, Snapshot-Namen in Git, Fehlermeldungen aus dem Backend (rund 100 Stellen,
  mit 2.x bei Bedarf), Meldungen von Claude Code selbst („Claude needs your permission …“). Die Bezeichnung eines
  Anhangs entsteht in der Sprache des Moments und bleibt so in der Quittung. Geprüft: Vorschau auf Deutsch durch alle
  Reiter, Trail, Commit, Git-Protokoll, Verbindungs-Panel ohne fehlende Übersetzung; Umschalten live mit erhaltenen
  Anhängen. Im echten Fenster (WebKitGTK) noch nicht gesehen: `navigator.language` dort und `localStorage` über
  Neustarts.
- Reiter Nächster Prompt neu aufgeteilt (2026-11-15, nach Durchsicht des Nutzers: „konfus, teilweise doppelt“): drei
  Bereiche nach Wichtigkeit. (1) Kasten „Geht mit deinem nächsten Prompt raus“ mit `AttachmentList` (jeder Anhang
  einzeln, nach Art gruppiert, je ×, im Reiter „alle entfernen“ je Gruppe; dieselbe Komponente kompakt in der rechten
  Spalte), genauer Text eingeklappt (`AssistantState.preview`), leer: die vier Wege zum Anhängen. (2) „Hinweise in
  deinen Dateien“ mit Häkchen statt Knöpfen, Erklärung im (?), Fortschritt im Kopf, Kopieren als Aufgabe. (3)
  Startregeln als eingeklappte Zeile. Ab 1024 px Deckbreite (`@container`, `@5xl:`) stehen (2) und (3) neben (1).
  Gezählt wird jetzt überall jeder Eintrag (`useAttachedCount`), `attachmentCount` ist weg. Angehängte Änderungen
  tragen neben dem englischen `label` (für Claude) ein `shown` in der Sprache der Oberfläche. Entfallen: Tabelle „Was
  du anhängen kannst“, „Zu Änderungen“, Teile-Zeilen ohne Einzelliste, Knöpfe „Anhängen/Angehängt“ bei Hinweisen.
- D23 umgesetzt (2026-11-16): `scratch.rs` (vorher `workbench.rs`, Befehle `scratch_list/trash/move`), `DIR = ".scratch"`;
  `exclude_scratch` entfernt eine von CodeDeck geschriebene `.workbench/`-Zeile samt Kommentar (`without_old`, getestet).
  Werkbank: `WorkbenchView` = Kacheln `ScratchTile` und `HintsTile` (Büroklammer je Hinweis, beim Überfahren sichtbar,
  angehängt hell; „Alle anhängen“; (?) erklärt; Kopieren als Aufgabe), ab 1024 px nebeneinander. Reiter-Zahl der
  Werkbank = offene Hinweise. Nächster Prompt: `AttachmentSections` (je Art ein `Section` mit `Rows`, Zeilen mit
  Herkunft, Tokens, ×, „alle entfernen“, Link zur Quelle über `openView`), genauer Text aufklappbar, Startregeln
  immer offen. Rechte Spalte: vier Zahlen (`useAttachedKinds`), Token-Balken, Ziel, Zustand/Quittung, „Öffnen ↗“;
  einzelne Anhänge entfernt man nur noch im Reiter. `src/view.ts` hält den offenen Reiter für alle Komponenten.
  Zielauswahl ist eine eigene Liste (`AttachTarget`, fest am Fenster positioniert, öffnet unten im Fenster nach
  oben), weil WebKitGTK das native `select` im hellen System-Theme zeichnet; zusätzlich `color-scheme: dark` in
  `index.css` für übrige native Elemente. Reiter-Knöpfe brechen nicht mehr um (`shrink-0 whitespace-nowrap`).
- Namensprüfung „Codeck“ (2026-11-16, Websuche, keine Markenregister): **Codeck** (Peerlist, maxburleigh) ist eine
  Mac-App für 5 $, die Codex- und Claude-Code-Aufgaben in einem „keyboard deck“ sammelt: gleiche Nische, gleicher
  Name. Außerdem `lkuczborski/codeck` (Swift, Markdown-Präsentationen für Codex-Workflows), npm-Paket `codeck`
  (verwaist) und Scope `@codeck/*` (Milkdown), Domain `codeck.ai` (Inhalt unklar). Auch **CodeDeck** ist belegt:
  Desktop-App auf Product Hunt („power of Claude Code with a better interface“), iPad-Lernkarten-App. Ähnlich, andere
  Branche: Codecks (Berlin, Projektmanagement für Spieleentwickler). Vor einer öffentlichen Vorstellung Markenregister
  prüfen (DPMA, EUIPO/TMview, USPTO).
- Name und Auftritt (2026-11-16, D24): Binary `codeck` (`[[bin]]` in `Cargo.toml`, `mainBinaryName`), Paket, Dateien,
  Ordner, Refs, `CODEDECK_*` bleiben „codedeck“. `codeck --version` / `--help`. Hooks: `is_ours` kennt beide Namen;
  beim Start zieht `Harness::follow_program` eigene Hooks auf das laufende Programm um, wenn ihr Programm fehlt oder
  das alte `codedeck` im selben Ordner ist (Build-Ordner, Update); eine andere vorhandene Installation bleibt („Use
  this one“). Das alte `/shared/cargo-target/debug/codedeck` bleibt liegen, bis man es löscht. `.desktop`, Cargo-
  und Bundle-Texte nach der CI (`brand/README.md`), README-Kopf mit Aussprache. Icons: `codeck-small.svg` (16/24 px,
  ohne Schein und Konturen) und `codeck-symbolic.svg` (einfarbig, für Seitenleiste/Tray, noch ohne Nutzer).
  Statusleiste: „git“ steht jetzt links neben dem Branch. About-Dialog kommt mit Seitenleisten-Schritt A.
  Paket: Tauri nennt das `.deb` nach `productName` („code-deck“); der Release-Workflow packt es um zu `codeck`
  (`Package` aus `mainBinaryName`, dazu `Replaces/Conflicts/Provides: code-deck`), Datei `codeck_<version>_amd64.deb`.
  Lokal am gebauten Paket ausprobiert, in GitHub Actions noch nicht gelaufen.
- Viele Runden (2026-11-16, nach Commit `6f7c9c5`): **Neustart mitten in einer Runde** ließ je Neustart einen neuen
  „Before“-Snapshot ohne Ende entstehen (laufende Runde nur im Speicher; beim Bauen mit `./dev` startet das Fenster
  bei jeder Rust-Änderung neu). Jetzt hält `bridge.rs` laufende Runden zusätzlich in
  `$XDG_RUNTIME_DIR/codedeck/turns.json` (je Projekt, je Sitzung; nach 12 h ohne Nachricht verworfen); ein neues
  Fenster übernimmt sie, sobald die Sitzung auftaucht (`Inner::resume`/`take_back`, Test
  `a_restarted_window_goes_on_with_the_running_turn`). Prompts, die Claude Code selbst einspeist
  (`<task-notification>`), heißen „Background task finished“ statt Rohtext (`plain_prompt`, auch beim Log-Lesen).
  Darstellung: Changes zeigt die letzten zwei Runden als Knöpfe, davor „Frühere (n) ▾“ mit Liste (Uhrzeit, Sitzung,
  Prompt), der Tooltip zählt die Runden seit dem Commit; im Trail falten ab drei Snapshots in Folge zu einem
  Stapel-Punkt mit Zahl (Klick öffnet, „Diese Snapshots falten“ schließt; ein gewählter Snapshot hält seinen Lauf
  offen). Tooltips hängen jetzt per Portal an `document.body`: WebKitGTK schnitt sie am Rand der scrollenden
  Trail-Spalte ab (Chromium nicht, darum in der Vorschau unsichtbar).
- 2.1a Aufmerksamkeit (2026-11-16): `src/attention.ts` rechnet „Wartet auf dich“ einmal für rechte Spalte und Fenster
  (`useWaiting`, `needsYou`, `putAside` als gemeinsamer Speicher) und meldet mit `useAttention` (in `App`) Neues, wenn das
  Fenster nicht angesehen wird (`document.hidden` oder ohne Fokus): neu = neuer Schlüssel (`waitKey`) **und** jünger als
  das Fenster (`waitsSince > OPENED_AT`; die Liste ist bis zum ersten Zustand leer). Mehreres in 1,5 s wird eine Meldung.
  Fenstertitel immer „● n warten · Projekt – CodeDeck“ (`set_title_prefix`). Backend `attention.rs`: Einstellungen in
  `~/.config/codedeck/attention.json` (eine Frage, Runde fertig, Git-Fehler; Taskleiste, Meldung), Taskleiste über
  `request_user_attention`, Meldung über `notify-rust` (D-Bus, zieht `zbus` 6 zusätzlich zu 5), Klick holt das Fenster
  nach vorn; Cinnamon meldet die Fähigkeit `actions`. Icon der Meldung: das eingebaute 128-px-Bild als Datei im
  Socket-Ordner. Neuer Eintrag in „Wartet auf dich“ leuchtet dreimal (`attention-new`). Auswahl im Projektmenü
  („Melden, wenn ich woanders bin“). Vorschau: `window.mockAsk()` lässt die arbeitende Sitzung fragen,
  `window.mockNotifications` zeigt, was gemeldet worden wäre. Nicht gebaut: „Sitzung abgebrochen/Fehler“ (kein
  verlässliches Signal live). **Prüfen in der echten App:** (1) Fenster verdecken, eine Sitzung um Erlaubnis fragen
  lassen: Taskleiste markiert, Meldung erscheint, Klick holt CodeDeck nach vorn. (2) Runde beenden lassen: dasselbe.
  (3) Bei offenem Fenster mit Fokus: keine Meldung, nur Titel und Aufleuchten. (4) Im Menü „als Meldung“ aus: nur
  Taskleiste.
- 2.1c Seitenleiste (2026-11-16): Zustand `compact` in `src/compact.ts` (gemeinsam, `setCompact`/`toggleCompact`);
  `openView` und das Zeigen einer Datei schalten vorher aufs volle Fenster. In der Leiste sind Dateibaum und Deck nur
  verborgen (`hidden` statt `contents`), ihr Zustand bleibt. Backend `window.rs`: `set_compact` merkt Ort, Größe und
  Maximiert des vollen Fensters, setzt die Mindestgröße (1040×600 ↔ 280×400) und schrumpft zum rechten Rand hin; die
  Breite der Leiste liegt in `localStorage` (`codedeck.sidebarWidth`, Vorgabe 400, vorher 340). Die Form selbst wird **nicht**
  gemerkt: ein neues Fenster („Neues Fenster“) käme sonst unerwartet als Leiste. Globale Kürzel über
  `tauri-plugin-global-shortcut`: unter X11 hält nur ein Programm eine Tastenkombination, darum hält das erste Fenster
  beide und handelt für alle über deren Sockets (`{"window": "show"|"hide"|"front"|"toggleCompact"}`, in
  `Bridge::serve` vor den Ereignissen erkannt); die anderen versuchen es alle 15 s, damit nach dem Schließen eines
  übernimmt. Wer vorn ist und wer zuletzt benutzt wurde, schreibt jedes Fenster bei Fokuswechsel in `front` und
  `last-used` im Socket-Ordner; wer erst vor < 0,7 s den Fokus verlor, gilt noch als vorn (der Tastendruck selbst kann
  ihn kurz nehmen). Registrieren wartet auf den Hauptthread, darum in eigenem Thread. „Belegt“ zeigen Einstellungen
  (Allgemein) und `F1`, wenn das Registrieren scheitert und kein anderes CodeDeck-Fenster läuft. Die Kürzel sind
  noch fest (Ändern: Einstellungsbereich „Tastenkürzel“, offen). `tools/shot.mjs` kennt `size:340x900`.
  **Prüfen in der echten App:** (1) Knopf rechts in der Kopfleiste und `Ctrl+Shift+L`: Leiste am rechten Rand, zurück
  an Ort und Größe, auch aus maximiertem Fenster. (2) Klick auf eine Zeile der Übersicht oder „Öffnen“: volles Fenster
  im passenden Reiter. (3) `Ctrl+Alt+C` aus einem anderen Programm: CodeDeck kommt nach vorn, noch einmal: verschwindet,
  noch einmal: kommt wieder. (4) `Ctrl+Alt+L` von überall. (5) Zwei Fenster: beide verschwinden und kommen zusammen,
  nach vorn kommt das zuletzt benutzte; das erste schließen, nach höchstens 15 s wirkt das Kürzel weiter. (6) Bei
  Fokusklau-Schutz des Desktops kommt das Fenster evtl. nur markiert statt vorn: dann melden.
- 2.2 Fundstücke und Links (2026-11-16): `findings.rs` hält je Projekt in `~/.config/codedeck/findings.json`
  (30 Tage, je 100) Dateien, die eine Sitzung **des Projekts** außerhalb geschrieben hat, und Links veröffentlichter
  Seiten. Datei zählt (`left_outside`), wenn absolut, außerhalb der Wurzel, nicht unter `/dev`, `/proc`, `/sys`,
  **nicht in einem anderen Git-Arbeitsbaum** (dort ist sie versioniert und Sache jenes Projekts) und nicht eigene
  Datei des Werkzeugs (`Harness::is_own_file`; Claude: alles in einer Konfiguration außer `plans/`). Quellen:
  `AfterWrite` mit Datei außerhalb, Schreibvorgänge aus dem Log (`apply`), und bei Shell-Befehlen ein Ratespiel aus
  dem Text (`Event.writes`, Claude `shell_outputs`: Ziele von `>`, `>>`, `tee`, absolut oder `~/`). Gezeigt wird nur,
  was auf der Platte liegt (`Found::view` prüft beim Abruf), darum stört ein falsch geratenes Ziel nicht und
  aufgeräumtes `/tmp` verschwindet von selbst. „In den Scratch-Ordner“ **kopiert** (`fetch`, freier Name `-2`, `-3`),
  das Original bleibt; wird die Datei danach neu geschrieben, gilt sie wieder als nicht geholt. Öffnen und Zeigen
  außerhalb des Projekts nur über `open_outside`, das ausschließlich bekannte Fundstücke annimmt. Seiten: aus dem
  Schlussbericht der Runde (`Stop`/Log, wie für den Kurzbericht), Adressen mit Pfad auf Hosts, die Seiten
  veröffentlichen (Kern: Gists, Pastebins, CodePen, JSFiddle; Adapter: `page_hosts`, Claude `claude.ai`); Titel ist
  der Linktext in Markdown, sonst die Wörter davor. Nicht über einen MCP-Hook: der Weg über die Startregel gilt für
  jedes Werkzeug und braucht keine Hook-Erweiterung. Gemeldet wird über die Zahl am Reiter Werkbank (Hinweise +
  nicht geholte Dateien) und eine Zeile in der Übersicht der Seitenleiste, nicht als Desktop-Meldung. Konto je Seite
  folgt mit 3.2. **Prüfen in der echten App:** (1) Eine Sitzung bitten, eine Datei nach `/tmp` zu schreiben (Write)
  und eine per `cat > /tmp/x.txt`: beide erscheinen unter „Woanders abgelegt“, der Reiter zählt. (2) „In den
  Scratch-Ordner“: Kopie erscheint im Scratch-Ordner, Zeile zeigt „Kopiert nach …“. (3) Öffnen und „Im Dateimanager
  zeigen“. (4) Eine Sitzung ein Artefakt veröffentlichen lassen: Link unter „Veröffentlichte Seiten“ nach Ende der
  Runde. (5) Datei in einem Nachbar-Repo schreiben lassen: erscheint nicht.
- Vorbereitung 2.3 und Testsession (2026-11-16, aus dem Review): **Journal** `journal.rs`: jedes Ereignis, das das
  Projekt betrifft (nach `take_in`), als eine JSON-Zeile in `~/.local/state/codedeck/journal/<Projektpfad>.jsonl`
  (`XDG_STATE_HOME`), dazu `opened`, wenn ein Fenster das Projekt öffnet; Felder `at`, `kind`, `harness`, `session`,
  `file` (relativ im Projekt), `tool`, `text` (Prompt oder Meldung, 160 Zeichen). Sieben Tage, aufgeräumt beim ersten
  Schreiben eines Prozesses. `journal::read(root, since)` ist für die Zeitleiste in 2.3 da. Snapshots stehen nicht
  darin, sie liegen in Git. **Diagnose** `diagnostics` (`lib.rs`), im Menü `⋯` „Diagnose kopieren“: Version und
  Commit, System, X11/Wayland, Desktop, Programm, Projekt, Fenster, Verbindungen je Konfiguration, globale Kürzel,
  Meldungs-Einstellungen, Pfad des Journals, die letzten 40 Zeilen `hook-trace.log`; das Frontend ergänzt Sitzungen,
  Form, Größe, Sprache, Fokus, Fundstücke. Home steht als `~`. Testprotokoll: `docs/praxistest-2.1c-2.2.md`.
- Einstellungen in allen Fenstern (2026-11-16): Sprache und Meldungen galten nur im Fenster, in dem sie geändert
  wurden (jedes Fenster ist ein Prozess mit eigenem `localStorage`). Jetzt: Rechner-Einstellungen in
  `~/.config/codedeck/settings.json` (`config::machine_settings`, `set_machine_setting`, Anfang des
  Einstellungsspeichers), die Sprache liegt dort (`localStorage` nur noch als Kopie fürs erste Bild, alter Wert wird
  einmal übernommen). Nach jeder Änderung (auch `set_attention_settings`) schickt das Fenster `SettingsChanged` über
  die Sockets an die anderen (`window::settings_changed`), diese lesen neu (Ereignis `settings_changed`). Bei D25 = B
  wird daraus ein Ereignis im Prozess.
- Erster Test 2.1c/2.2 (2026-11-16, Nutzer): (1) Die Leiste sprang an den linken Rand des Bildschirms rechts
  daneben. Wunsch: **immer auf demselben Bildschirm, immer am rechten Rand.** Jetzt: `set_compact` rechnet in
  physischen Pixeln (Bildschirme mit verschiedener Skalierung), nimmt den Arbeitsbereich des aktuellen Bildschirms
  (`Monitor::work_area`, ohne Panels), setzt die Leiste an dessen rechten Rand über die volle Höhe (Rahmen des Desktops
  abgezogen), wartet bei maximiertem Fenster, bis der Desktop es wiederhergestellt hat (Command ist dafür `async`), und
  schreibt, was es getan hat, in die Diagnose („Last switch of the form“). Zweiter Befund: aus dem Vollbild weiter
  auf dem Nachbarbildschirm. Vermutete Ursache: Den Rahmen hatte ich am maximierten Fenster gemessen (dort 0), die
  Leiste ragte also um die Rahmenbreite über den Rand. Jetzt: Rahmen nach dem Wiederherstellen messen, auch echtes
  Vollbild verlassen (`set_fullscreen(false)`), nach dem Setzen nachmessen und bis zu sechsmal neu setzen; die
  Diagnose nennt Ziel und Landeplätze. Dritter Befund: richtig platziert, aber Flackern auf dem anderen Bildschirm
  (der Desktop stellt das Fenster erst am alten Platz wieder her). Jetzt: Ziel vor dem Aufheben der Maximierung
  setzen, GTK nimmt es als Platz für das Wiederherstellen. Breite der Leiste: Vorgabe 400 (Nutzer). Vierter Befund:
  danach füllte die Leiste den halben Bildschirm (Cinnamon kachelt ein maximiertes Fenster, dem man Größe und Platz
  gibt). Zurückgenommen; stattdessen wird das Fenster versteckt, solange der Desktop die Maximierung aufhebt, und erst
  am Ziel wieder gezeigt; das Nachmessen prüft jetzt auch die Breite. „?“ steht in jeder Kachel ganz rechts (Nutzer).
- Seitenleiste **gemessen statt geraten** (2026-11-16, mit `xdotool`/`xwininfo` an einer eigenen Test-Instanz auf dem
  Desktop des Nutzers; drei Bildschirme 0–1920, 1920–3840 primär, Laptop 3840–5760 mit y+180; Cinnamon meldet
  `_NET_WORKAREA` als **ein** Rechteck über alle, `Monitor::work_area` liefert aber den richtigen je Bildschirm):
  (a) „halber Bildschirm“ war die **Mindestbreite 1040** des vollen Fensters: Die kleinere wurde gesetzt, als der
  Desktop noch die alte hielt; beim Zurückschalten merkte sich das Frontend dann 1040 als Leistenbreite. Jetzt ist
  die Mindestgröße immer 280×400 (`tauri.conf.json`), gemerkte Breiten über 800 gelten nicht. (b) Flackern auf dem
  Nachbarbildschirm: Platz und Größe nacheinander (in jeder Reihenfolge) oder zusammen (ein GTK-`move`+`resize`)
  ließen das Fenster mit neuem Platz und alter Größe über den Rand ragen, Cinnamon schob es auf den Nachbarn. Jetzt
  `place`: erst schrumpfen, was schrumpft, dann verschieben, dann wachsen, je mit kurzem Warten auf den Desktop;
  gemessen drei Schritte zu etwa 20 ms, alle auf demselben Bildschirm. (c) Aus dem maximierten Fenster: Cinnamon
  stellt erst am alten Platz wieder her (vorher gesetzte Größe nimmt es nicht, Verstecken zeigte es leer und am
  alten Platz); jetzt wird ohne Warten gleich weiter platziert, gemessen etwa 35 ms am alten Platz, dazu Cinnamons
  Animation (abschaltbar unter Effekte). (d) `Strg+Alt+C`: Regel jetzt „sichtbar → ausblenden, ausgeblendet →
  zurückholen“ (Datei `hidden` im Socket-Ordner, gelöscht bei Start und bei Fokus) statt „vorn“, denn bei mehreren
  Bildschirmen ist CodeDeck oft sichtbar ohne Fokus. Beim Zurückholen verweigerte Cinnamon den Fokus
  (`_NET_WM_STATE_DEMANDS_ATTENTION`); jetzt bittet das Fenster als Pager (`_NET_ACTIVE_WINDOW`, Quelle 2, über
  `x11rb`), gemessen: Fokus kommt. `Strg+Alt+L` aus einem anderen Fenster: Form wechselt, Fokus kommt.
- Seitenleiste ruhiger und als Leiste erkennbar (2026-11-16, Nutzer): Die Übersicht ist immer da (im vollen Fenster
  mit Höhe 0) und lädt ihre Zahlen im Hintergrund, so springt beim Umschalten nichts nach; der Inhalt wartet während
  des Wechsels ausgeblendet (`useSwitching` in `compact.ts`) und blendet in 150 ms ein. Danach (Nutzer): Die
  Übersicht steht **auch im vollen Fenster**, die rechte Spalte ist in beiden Formen gleich. Ein Rand zur
  Bildschirmmitte (orange Linie mit Schatten) gefiel nicht und ist wieder entfernt. Möglicher späterer Schritt:
  Leiste ohne Titelleiste des Desktops (eigenes Verschieben nötig).
- „Wartet auf dich“ als Zeilen wie die Sitzungen statt Kacheln (Nutzer, 2026-11-16): Schild, Titel, rechts Zustand mit
  Punkt („fragt“ orange, „Runde fertig · Uhrzeit“ grau), darunter Meldung bzw. „Wartet auf deinen nächsten Prompt“;
  Weglegen (×) beim Überfahren. Deutlich bleiben getönte Fläche, Zahl im Kopf, orange Kante links und oranger Text
  bei einer Frage; ein neuer Eintrag pulsiert jetzt als Hintergrund der Zeile (`attention-new`).
- Werkbank übersichtlich (2026-11-16, Vorschlag umgesetzt): Reihenfolge nach Entscheidungsbedarf (Außerhalb des
  Projekts, Hinweise, Scratch); „Woanders abgelegt“ und „Veröffentlichte Seiten“ sind eine Kachel **„Außerhalb des
  Projekts“** mit den Gruppen „Dateien“ und „Online“ (nur, solange es etwas gibt). `Section` kann einklappen (`fold`,
  Zustand je Kachel in `localStorage` über `useFold`) und hat eine „?“-Hilfe (`help`); die Einleitung ist eine Zeile.
  Lange Listen zeigen 8 Einträge, dann „Alle n zeigen“ (`useShowAll`). Scratch als Baum (`treeOf`): lose Dateien
  zuerst (neueste oben), dann Ordner nach jüngster Datei, Ordner eingeklappt mit Zahl, Größe, Alter, im
  Dateimanager zeigen, ganz in den Papierkorb (`scratch_trash` nimmt Ordner, `gio` kann das); die Kachel startet
  eingeklappt ab 20 Dateien, bis man sie einmal öffnet. Ordner lassen sich noch nicht ins Projekt ziehen. (2) Werkbank: Auge statt Link-Symbol,
  Doppelklick ansehen, Mittelklick bearbeiten (wie im Dateibaum), Einleitungstexte über die volle Breite. Offen:
  Übersichtlichkeit der Werkbank (Scratch als Baum, lange Listen, Begriff „Veröffentlichte Seiten“), Vorschlag an den
  Nutzer. (3) About: Schriftzug mit Lautschrift `/ˈkoʊdɛk/` wie ein Wörterbucheintrag, darunter „CodeDeck – KI-
  Sitzungsradar für Linux“ mit „de“/„De“ in Orange, damit der Name den Schriftzug erklärt statt ihn zu wiederholen.
- 2.3 Activity und Hinweise (2026-11-16): `journal_lines(since)` (`lib.rs`) liest das Journal, `src/timeline.ts` macht daraus
  Spuren: ein Block beginnt mit dem Prompt (oder dem ersten Schreiben ohne gesehenen Prompt), wird „wartet auf dich“,
  wenn die Sitzung fragt, und endet mit dem Ende der Runde; offen läuft er bis jetzt, solange die Sitzung arbeitet oder
  wartet, sonst bis zu ihrem letzten Ereignis. Anker sind die Snapshots der Sitzung (ohne Rücksprung-Snapshots).
  `ActivityView`: „Heute“ (Zeitleiste ohne Rahmen: dünne Linie je Sitzung, eckige Balken: Arbeit gefüllt, Warten als gelber Rahmen (kein Zusatzzeichen, das Fähnchen des Trails heißt „Runde zu Ende“), Snapshots vor dem ersten Schreiben einer Runde (keine Runden-Enden) als graue Dreiecke; **Begriff:** nur „Snapshot“, kein zweites Wort „Anker“ mehr (⚓ vor der Runde, ⚑ Ende, ↶ vor dem Zurückgehen sind Arten und Zeichen, 2026-11-17; `KONZEPT.md` 2.5 und die Oberfläche angeglichen); Hilfe „So liest du die Zeitleiste“ per „?“ im Kopf (`TimelineHelp`: Begriffe Runde, Snapshot, Anker, Fahne, Zeichen) (5-Minuten-Striche und Zahl bei nahen Ankern probiert, vom Nutzer verworfen), Legende im Kopf, Zeitachse von der vollen Stunde vor
  dem ersten Block bis jetzt), „Wie sicher ist deine Arbeit“ (nicht committet = `git.changed`, committet nur hier =
  Summe `ahead` der Repos, „–“ ohne Remote; Anker = Snapshots), „Geschriebene Dokumente“ (aus den Sitzungen der Liste und dem Journal, also auch von Sitzungen, die nicht mehr in der Liste stehen; unabhängig vom Commit-Stand). Glocke in der Reiterleiste öffnet
  `NoticesPanel` über dem Deck: „Was geschah“ (letzte Ereignisse in Worten, Schreibvorgänge einer Sitzung in Folge als
  eine Zeile), zwei Tipps je Reiter, Fähigkeiten je KI-Werkzeug als Liste mit Haken und Kreuzen aus `capabilities` (einklappbar). Zoom der Zeitleiste (`zoomed`, `ticksIn` in `timeline.ts`): Knöpfe Vergrößern/Verkleinern/Ganzer Tag im Kopf, `Strg`+Mausrad
  zoomt am Zeiger, Ziehen verschiebt, Doppelklick setzt zurück; kürzester Ausschnitt 10 Minuten. Abweichung vom Dummy: Der Dummy
  zeigt „Claude usage“ in Activity, das kommt mit 2.4. Nur in Tests (Rust) und Vorschau geprüft; die Spuren aus echten
  Journalen sind ungesehen.
- (Hier je Paket eine Zeile mit Erkenntnissen, die die nächste Session braucht.)
- P2/P3: Übergabe besteht aus benannten Teilen (`hand_over(key, text|null, label)`, Keys `markers`, `focus`),
  alle gehen zusammen mit dem nächsten Prompt raus. Pin-Typ und `focusText` in `src/focus.ts`,
  Marker-Zustand in `src/markers.ts` (`useMarkers`, erledigt = übergebener Marker fehlt). Ob die
  Übergabe in einer echten Sitzung ankommt, prüft weiterhin P0.
- P1: Es gibt mehrere Claude-Konfigurationen (`hook::config_dirs`: `~/.claude`, `$CLAUDE_CONFIG_DIR`,
  `~/.claude-*`). Hooks werden je Konfiguration verbunden, Logs aus allen gelesen. Aus dem Log kommen
  `ai-title` (Titel), Modell, letzter Prompt und Writes. Bei neuer Sitzung und nach jedem `Stop` liest
  CodeDeck das Log über `transcript_path` aus dem Hook. Logs ohne Hook-Ereignis haben den Status `idle`
  (aus dem Log ist nicht ablesbar, ob gerade gearbeitet wird). Probelauf gegen echte Logs:
  `CODEDECK_ROOT=<pfad> cargo test real_logs -- --ignored --nocapture`.
- P5: `Point` hat die Art `compare` (from = älterer, to = neuerer Punkt), Strg+Klick im Trail (`Deck.compare`).
  Backend `Git::compare` nimmt Commits und Snapshot-Hashes. Dirq: `apps::show_patch` (`dirq - --reuse`,
  Patch über stdin), der Knopf erscheint nur, wenn `dirq` im PATH liegt. Beim Nutzer ist dirq noch nicht
  installiert, also ungetestet. Sitzungsfilter: `sessionFilter` in `Deck`, Rücksprung-Snapshots bleiben sichtbar.
- 2.5 (2026-11-17): Breiten in `~/.config/codedeck/layouts.json` je Projektpfad (`config::layout`/`set_layout`,
  Hook `useLayout` in `src/layout.ts`, Griff `Splitter.tsx` in 0-px-Grid-Spalten über der Panel-Rahmenlinie).
  Grenzen wie im Dummy (Dateien 150–460, rechts 250–600), Deck mindestens 420 px: im schmalen Fenster weichen
  die Seiten bis zu ihrem Minimum, nicht das Deck. Pfeiltasten ±16 (Umschalt ±64), Doppelklick = Standard.
  Trail-Breite und Höhen bleiben fest. Die Dateiliste hat zwei Griffe: an ihrem Rand und rechts vom Trail
  (Nutzer: der Trail gehört optisch nach links); beide lesen die Breite aus der Grid-Spalte.
- 3.3 Rest (2026-11-18): Claude Code legt je laufendem Prozess `<config>/sessions/<pid>.json` an (gesehen mit 2.1.327:
  `sessionId`, `cwd`, `procStart` = Startzeit aus `/proc/<pid>/stat`, `tmux` als `sitzung:@fenster.%pane`,
  `bridgeSessionId` für Remote Control). Liegengebliebene Dateien erkennt `place::alive` an der Startzeit. Damit
  weiß die Brücke nach einem Neustart von CodeDeck, welche Sitzungen aus den Logs noch laufen (`Harness::running`).
- Prompts vorbereiten, erster Wurf (2026-11-22): einzige eigene Editierfläche in CodeDeck, vom Nutzer ausdrücklich
  gewollt (Leitlinie „keine eigene Editierfläche“ gilt weiter für Projektdateien). Textarea reicht für den hängenden
  Einzug nicht (bricht alle Zeilen gleich um), daher CodeMirror 6 mit einem Zeilen-Schmuck (`Decoration.line` mit
  `padding-left` + negativem `text-indent`, Breite des Präfixes per Canvas gemessen, auch für Proportionalschrift).
  Ohne Sprachpaket kopiert CodeMirrors Standard-Enter die Einrückung der Vorzeile; bewusst durch `insertNewline` ersetzt.
