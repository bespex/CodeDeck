# CodeDeck – Umsetzungsplan

So arbeitet eine Session damit: „Stand“ und „Entscheidungen“ lesen, das nächste offene Paket aus der
Reihenfolge nehmen und **nur** die dort genannten Dateien lesen (die Karte steht in `CLAUDE.md`). Danach
den Status hier aktualisieren: Paket abhaken, Erkenntnisse in einer Zeile unter „Notizen“ festhalten.
Den Hintergrund liefert `docs/codedeck_claude_konzeption_hebel_ausbauphasen.md` (Gemini-Konzept); den
braucht man nur bei Grundsatzfragen.

## Stand (2026-11-14, Commit `3db551a`)

Fertig (dazu P1, P2, P3, P5, siehe Pakete): Trail mit drei Zonen (nicht committet / nicht gepusht / gepusht) und Remote-Chip · Hook-Brücke
`codedeck hook` → Socket je Fenster · Sitzungsliste in der Statusleiste, von der KI geschriebene Dateien
im Dateibaum markiert · Sicherungspunkte vor dem ersten Schreiben einer Runde, im Trail sichtbar, mit
„Go back“ · Docs-Ansicht für `@ai`-Marker, die man kopieren oder an den nächsten Prompt übergeben kann ·
Korrektur für „racy git“ im `ScratchIndex`.

Leitlinien (aus dem Konzept übernommen und festgelegt): CodeDeck führt die KI nicht selbst aus, Claude
Code tut das. Keine eigene Editierfläche, angezeigt und bearbeitet wird in externen Apps (Qiew).
Kontext bekommt die KI nur, wenn der Nutzer ihn ausdrücklich setzt, nie automatisch.
Optimistic Flow: Die KI schreibt direkt, abgesichert wird über die Sicherungspunkte.

## Entscheidungen

| ID | Frage | Status |
|---|---|---|
| D1 | Rechte Spalte: Context- und Assistant-Mock durch eine Spalte „Sessions & Focus“ ersetzen? | entschieden 2026-11-14: ja, eigener Chat entfällt |
| D2 | Quelle für den Token-/Zeitfenster-Monitor | offen, klärt P4 |
| D3 | Sicherungspunkte als Refs (in `git log --all` sichtbar) | entschieden: Refs, sonst löscht `gc` sie |

## Reihenfolge

P0 → P3 → P2 → P1 → P5 → P4 → P6 → P7 → P8. P9 und P10 sind zurückgestellt.

---

### P0 Praxistest der Brücke `[S]` · offen · braucht den Nutzer
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

### P4 Token-/Zeitfenster-Monitor `[Spike S, dann S]` · offen
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

### P6 Parallele Spuren / Worktrees `[L]` · offen
**Ziel:** Mehrere Sitzungen in verschiedenen Worktrees überblicken und vergleichen.
**Dateien:** `git.rs` (`worktree_of`, `discover`), `bridge.rs` (Sitzung → Repo über `cwd`), Sitzungs-UI (P2).
**Schritte:** Jeder Sitzung ihr Repo/Worktree zuordnen und im Dateibaum am Repo-Ordner ein Sitzungs-Badge
zeigen. Linked Worktrees ausdrücklich als Spur darstellen. Vergleich zweier Worktree-Branches über den
Diff aus P5a.
**Fertig wenn:** Zwei Sitzungen in zwei Worktrees werden getrennt angezeigt und lassen sich vergleichen.

### P7 Rückkanal aus den Qiew-Viewern `[L]` · offen · betrifft auch das Qiew-Repo
**Ziel:** In jayq/xaq/hyqe/marq etwas markieren und mit „Send to CodeDeck“ in den Fokus legen.
**Protokoll (steht im Qiew-README):** CodeDeck startet die Viewer mit `CODEDECK_SOCKET=<pfad>`; der Viewer
schickt eine JSON-Zeile `{"action":"add_to_context","source","file","selector","content"}`.
**CodeDeck-Seite:** `apps.rs` setzt beim Start eines Viewers die Variable auf den eigenen Socket
(`Bridge::socket`). `bridge.rs::serve` unterscheidet nach dem Feld `action` und erzeugt einen Pin
(Event an das Frontend, Pin-Zustand aus P2). Der Viewer muss nach dem Senden seine Schreibseite schließen,
denn `serve` liest bis EOF.
**Qiew-Seite:** eigenes Paket im Qiew-Repo (dort Englisch, **keine KI-Zeilen** in Commits).
**Fertig wenn:** Ein Knoten aus jayq landet als Pin in CodeDeck.

### P8 Workspace-Ansicht echt `[S–L]` · offen
**Ziel:** Die Mock-Karten in `WorkspaceView.tsx` durch echte Daten ersetzen: `.codedeck.toml` (Format erst
festlegen; heute wird die Datei nur erwähnt, nicht gelesen), Hook-Status, Socket-Pfad, gewählte Programme
(`apps.json`), ignorierte Ordner (`SKIP` in `git.rs`).
**Fertig wenn:** Keine Daten aus `mock.ts` mehr in dieser Ansicht.

### P9 Karte / Blast Radius `[XL]` · zurückgestellt
Braucht für jede Sprache einen Abhängigkeits-Scanner. Erst angehen, wenn P0–P6 im Alltag tragen. Ein
möglicher Einstieg: nur Ordner-Ebene, Kanten aus Imports von Rust und TS.

### P10 Andere KI-Harnesses `[XL]` · zurückgestellt
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

## Notizen

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
