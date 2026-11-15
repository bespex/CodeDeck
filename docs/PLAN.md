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

## Stand (2026-11-15, Commit `c428158`)

Das Zielbild ist abgestimmt (Click-Dummy, `KONZEPT.md` Teil 4), umgesetzt ist davon noch nichts.

Fertig in der App (P1, P2, P3, P5, siehe „Ältere Pakete“): Trail mit drei Zonen (nicht committet / nicht
gepusht / gepusht) und Remote-Chip, Vergleich zweier Punkte · Hook-Brücke `codedeck hook` → Socket je
Fenster, Hooks je Claude-Konfiguration · rechte Spalte „Sessions & Focus“ mit Sitzungen (auch aus den
Logs) und Fokus-Übergabe, von der KI geschriebene Dateien im Dateibaum markiert · Sicherungspunkte vor dem ersten Schreiben einer Runde, im Trail sichtbar, mit
„Go back“ · Docs-Ansicht für `@ai`-Marker, die man kopieren oder an den nächsten Prompt übergeben kann ·
Korrektur für „racy git“ im `ScratchIndex`.

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
| D2 | Quelle für den Token-/Zeitfenster-Monitor | offen, klärt Schritt 2.4 (Spike aus P4) |
| D3 | Sicherungspunkte als Refs (in `git log --all` sichtbar) | entschieden: Refs, sonst löscht `gc` sie |
| D4 | Darf CodeDeck Sitzungen starten und überwachen? | entschieden 2026-11-15: ja, in tmux, statt des Start-Scripts. Die KI läuft weiter außerhalb von CodeDeck |
| D5 | Darf CodeDeck mit tmux-Sitzungen kommunizieren? | entschieden 2026-11-15: nur zum Lesen nötiger Informationen und für bewusste Steuerungen (Start, Stop, Restart, New task). Nie Prompts |
| D6 | Wo laufen Sitzungen und CodeDeck? | entschieden 2026-11-15: beide auf der Arbeitsstation. Server erreicht die KI per ssh aus einem lokalen Ordner; kein CodeDeck-Teil auf Servern |
| D7 | Wer verwaltet KI-Konten? | entschieden 2026-11-15: Der Nutzer bringt sie mit. Konto = Name + Werkzeug + Startweise; CodeDeck speichert keine Zugangsdaten |
| D8 | Deck-Reiter | entschieden 2026-11-15: Activity, Changes, Workbench, Handover. Tests und Docs gehen darin auf |
| D9 | Temporäres außerhalb des Projekts | entschieden 2026-11-15: Standardordner im Projekt (Arbeitsname `.workbench/`), per Startregel mitgeteilt; claude.ai-Seiten nur als Link |
| D10 | Profile | entschieden 2026-11-15: „Arbeitszeit“ und „Freizeit“ |
| D11 | KI-Anbindung | entschieden 2026-11-15: hinter einer Schnittstelle gekapselt, siehe „Kapselung der KI-Anbindung“ |
| D12 | Name des Standardordners (`.workbench`, `.drafts`, `.scratch`) | offen, vor Schritt 2.1 klären |
| D13 | Erlaubnisfragen aus CodeDeck beantworten („Allow once“) | offen. Im Dummy gezeigt; berührt D5 |
| D14 | Öffnet ein Projekt in Activity oder in Changes? | entschieden 2026-11-15: Changes (Activity gibt es erst mit 2.3). Am Ende von MVP 2 noch einmal prüfen, ist leicht zu ändern |
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
| 1.2a Sitzungs-Identität ☐ | D15: Jede Sitzung bekommt Farbe und Kurzname, überall gleich (Liste, Trail, Snapshots, Dateien); Hover hebt Zugehöriges hervor; feste Reihenfolge nach Start statt nach Aktivität; Umbenennen (Titel, Kurzname) je Projekt. Titel aus dem Log: zuerst `custom-title`, dann `ai-title` | rechte Spalte, Trail | `bridge.rs` (`sort_by last`), `harness/claude.rs` (Log), `config.rs`, `SessionsPanel.tsx`, `Trail.tsx` | Zwei Sitzungen sind in Liste, Trail und Dateibaum an Farbe und Kurzname zu unterscheiden; die Liste springt nicht mehr; ein vergebener Name überlebt den Neustart |
| 1.3 Grundgerüst ☐ | Projekt öffnet in Changes (D14). Vier Reiter mit ihrer Frage, Bereichsfarben, die fünf Erscheinungsformen als wiederverwendbare Bausteine (Werkzeugleiste, Abschnitt, Zeile, Dokument, Entscheidung). Bestehende Ansichten einsortieren: Docs → Handover, Workspace/Map/Tests entfallen als Reiter | Projektansicht, alle Reiter | `Deck.tsx`, `views/*`, `index.css`, `App.tsx` | Alle heutigen Funktionen sind im neuen Gerüst erreichbar; Vorschau zeigt vier Reiter |
| 1.4 Rechte Spalte ☐ | „Needs you“, Sitzungen als zwei Zeilen mit aufklappbaren Details, „Next prompt“ mit Vorschau des Textes und Empfangsbestätigung | rechte Spalte, Szenen 2–7 | `SessionsPanel.tsx`, `assistant.ts`, `bridge.rs` (Übergabe abgeholt melden) | Wartende Sitzung erscheint oben mit Grund; nach dem nächsten Prompt steht „Delivered“ |
| 1.5 Changes je Runde ☐ | Auswahl „Turn n / All uncommitted“ (macht den Strg+Klick-Vergleich entdeckbar, ersetzt ihn nicht), Kurzbericht aus dem Log, Datei abhaken, „Claude“ oder „You“ je Datei, Zeile kommentieren | Changes, Szenen 4–7 | `ChangesView.tsx`, `DiffParts.tsx`, `history.rs`, `sessions.rs`, `focus.ts` | Ein Zeilenkommentar landet in „Next prompt“ und kommt bei Claude an |
| 1.6 Handover ☐ | Reiter mit Warteschlange, genauem Text, Quellen, `@ai`-Hinweisen; Startregeln (abhängig von 1.1) sichtbar | Handover | `DocsView.tsx` → Handover, `markers.ts`, `hook.rs` | Regeln stehen wörtlich im Reiter und kommen in einer neuen Sitzung an |

### MVP 2: Nichts bleibt unbemerkt

*Nutzen danach:* Auch was außerhalb des Projekts entsteht und was über den Tag geschah, ist sichtbar.

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 2.1 Workbench-Ordner ☐ | Ordner anlegen und lokal ignorieren (`.git/info/exclude`, nicht `.gitignore`), Inhalt mit Größe und Alter, Öffnen, ins Projekt übernehmen, löschen, „älter als … löschen“. D12 vorher klären | Workbench | neu `workbench.rs`, `views/WorkbenchView.tsx`, `watch.rs` | Eine Datei im Ordner erscheint sofort, Aufräumen löscht nur Altes |
| 2.2 Fundstücke und Links ☐ | Schreibvorgänge außerhalb des Projekts der Sitzung zuordnen und melden; claude.ai-Seiten als Link merken (je nach Ergebnis von 1.1 über Hook oder über die Startregel) | Workbench: „Still somewhere else“, „Pages on claude.ai“ | `bridge.rs`, `sessions.rs`, Adapter | Eine in `/tmp` geschriebene Datei wird gemeldet und lässt sich holen |
| 2.3 Activity und Hinweise ☐ | Zeitleiste der Sitzungen aus den Ereignissen, „How safe is your work“, geschriebene Dokumente; Panel „Notices and tips“ | Activity, Glocke | neu `views/ActivityView.tsx`, `bridge.rs` (Ereignisse merken) | Ein Vormittag ist als Zeitleiste nachvollziehbar |
| 2.4 Verbrauch ☐ | P4: erst den Spike. Ohne verlässliche Quelle entfällt die Anzeige, nicht schätzen | Activity, Statusleiste | siehe P4 | D2 ist entschieden und umgesetzt oder gestrichen |
| 2.5 Größen ☐ | Bereiche ziehen und zuklappen, wichtigste per Tastenkürzel, Aufteilung je Projekt merken; Trennlinien haarfein | Trennlinien (im Dummy nur angedeutet) | `App.tsx`, `Deck.tsx`, `config.rs` | Aufteilung überlebt einen Neustart |

### MVP 3: CodeDeck ersetzt das Start-Script

*Nutzen danach:* Der Tag beginnt in CodeDeck. Das eigene Script wird nicht mehr gebraucht.

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 3.1 tmux sehen ☐ | Laufende tmux-Sitzungen den Projekten und Claude-Sitzungen zuordnen; Sprungziele „Desktop“ und „tmux“. Vorher klären, wie das heutige Script startet (Befehl, Remote Control) | Sitzungsdetails | neu `tmux.rs`, `apps.rs` | Vom Script gestartete Sitzungen tragen ihren tmux-Namen, „tmux“ öffnet ein Terminal dort |
| 3.2 Konten ☐ | Gefundene Konfigurationen benennen und einfärben, Seitenleiste; Konto an jeder Sitzung | Startseite, Personen-Knopf | `hook.rs` (`config_dirs`), `config.rs`, Adapter | Jede Sitzung zeigt ihr Konto |
| 3.3 Steuern ☐ | Start, Stop, Restart, New task über tmux, jeweils mit sichtbarem Befehl; Neustart nach dem Verbinden der Hooks anbieten | Sitzungsdetails, Kacheln | `tmux.rs`, Adapter (`launch`) | Eine Sitzung lässt sich aus CodeDeck starten und ist danach in Desktop bedienbar |
| 3.4 Profile ☐ | „Arbeitszeit“ und „Freizeit“: Projekte × Konto; Warnung bei falschem Konto | Startseite, Umschalter | `config.rs`, `recent.rs` | Ein Profil startet alle seine Sitzungen |
| 3.5 Startseite ☐ | Eine Kachel je Sitzung über alle Projekte, „Needs you“ projektübergreifend, Warnungen mit Behebung. Vorher klären, wie das zum heutigen „ein Fenster je Projekt“ passt (ein Hauptfenster, oder Startseite als eigenes Fenster) | Startseite | `App.tsx`, `project.rs`, `bridge.rs` (Ereignisse aller Projekte) | Von der Startseite aus ist jede wartende Sitzung mit einem Klick erreichbar |

### MVP 4: Für andere benutzbar

| Schritt | Ziel | Dummy | Dateien | Fertig wenn |
|---|---|---|---|---|
| 4.1 Ersteinrichtung ☐ | Nach `KONZEPT.md` 4.8: Nötiges prüfen, Konten, Qiew-Werkzeuge suchen und verknüpfen, Projekte. Löst P8 ab | nicht im Dummy | `apps.rs`, `config.rs`, neu `setup.rs` | Auf einem frischen Benutzerkonto führt eine Seite bis zur ersten Sitzung |
| 4.2 Tutorial ☐ | Fünf Schritte auf der echten Oberfläche mit Beispielprojekt | Szenenleiste als Muster | `mock.ts`, neu `Tutorial.tsx` | Überspringbar, aus „Notices and tips“ wieder aufrufbar |
| 4.3 Tests je Runde ☐ | Testbefehl je Projekt, Ergebnis in Changes, roter Test in den nächsten Prompt | Changes, Szene 4 | neu `tests.rs`, `ChangesView.tsx` | Ein roter Test lässt sich mit einem Klick mitgeben |
| 4.4 Qiew-Rückkanal ☐ | P7 | – | siehe P7 | siehe P7 |
| 4.5 Worktrees ☐ | P6, soweit nach MVP 3 noch offen | Sitzung „API docs refresh“ | siehe P6 | siehe P6 |

### Später

- **Zweites KI-Werkzeug:** zuerst Codex CLI, dann opencode, je als Adapter (siehe unten). Erst dann zeigt
  sich, ob die Schnittstelle trägt.
- **Erlaubnis aus CodeDeck** (D13), **Karte** (P9).

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
2. **Hinaus, als Schnittstelle.** Was CodeDeck von sich aus tut, läuft über einen Trait je Werkzeug:

```rust
// src-tauri/src/harness/mod.rs (Stand nach 1.2; `launch` kommt mit 3.1, `usage` mit 2.4,
// `accounts` mit dem Schritt, der Konten braucht)
pub trait Harness {
    fn id(&self) -> &'static str;                          // "claude"
    fn name(&self) -> &'static str;                        // "Claude Code", für Texte
    fn short_name(&self) -> &'static str;                  // "Claude", für Knöpfe
    fn capabilities(&self) -> Capabilities;
    fn connections(&self) -> Vec<Connection>;              // je Konfiguration: verbunden?
    fn connect(&self, account: &str, on: bool) -> Result<(), String>; // Hooks ein-/austragen
    fn translate(&self, raw: &Value) -> Option<Event>;     // rohe Meldung → neutrales Ereignis
    fn reply(&self, event: &Event, handed: &[String]) -> Option<String>; // Zustellung der Übergabe
    fn past_sessions(&self, project: &Path) -> Vec<SessionInfo>; // aus Logs
    fn read_log(&self, log: &Path) -> Option<SessionInfo>; // ein Log (Titel, Modell, Writes)
}

pub struct Capabilities {
    pub live_status: bool,
    pub before_write: bool,        // Anker vor der Änderung möglich
    pub handover: Handover,        // WithNextPrompt | Clipboard | None
    pub start_rules: bool,
    pub past_sessions: bool,
    pub usage: bool,
}
```

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
