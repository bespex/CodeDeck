# Rezepte, Fallen und Notizen

Erkenntnisse aus der Umsetzung, je eine Zeile unter „Notizen“. Bis 2026-11-27 Teil von `docs/PLAN.md`.

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

- Kein eigener Status „Praxistest offen“ (Nutzer, 2026-11-27: einfach ist besser, mehrere Schritte werden oft zusammen getestet): Die Konvention bleibt bei offen / in Arbeit / erledigt. Der Plan klappt „Ebenfalls in Arbeit: n Etappen“ zu einer Liste mit Titel und nächstem Schritt auf und schreibt „nur der Praxistest ist offen“, wenn alle offenen Schritte einer Etappe Praxistests sind (`onlyTestLeft`, erkennt „Praxistest“/„practical test“); solche Etappen stehen unten. U8.6 entfällt.
- Werkbank kompakter (2026-11-27, Nutzer): „Neu“ eine Zeile je Datei (`ZoneLine`: Größe in fester Spalte, Werkzeuge beim Überfahren über dem rechten Rand), „Zu tun“ nach Quelle gruppiert mit einer Überschrift je Gruppe (keine Wiederholung „TODO.md · offener Punkt“); beide zweispaltig ab 32rem Zonenbreite (Container `@container/zone`). Außerhalb: Marke „außerhalb“ unter „Neu“, farbige Zahlen in der Ablage. Plan: Zähler mit Farbpunkt als Legende, Tooltip mit Text, Zustand und Datei:Zeile auf jedem Punkt und jeder Zeile (`StepTip`).
- Lange Listen unter „Neu“ (2026-11-27, Test des Nutzers: eine Git-Sicherung im Scratch-Ordner gab 450 Zeilen mit Objekt-IDs): Einheit `unit_of`/`unitOf` (Ordner mit „backup“ im Namen oder auf `.git`) wird als Ganzes gezeigt, gezählt („1 Sicherung“) und abgelaufen (nach der neuesten Datei darin); andere Ordner ab 4 neuen Nicht-Bild-Dateien eine Zeile; je Gruppe höchstens 6 Vorschaubilder (dann „+n“ zur Dateiliste) und 5 Zeilen (dann „alle n“). Titel aus Leitdateien bis 400 Zeichen, die Oberfläche begrenzt auf drei Zeilen.
- Plan ohne Roadmap (2026-11-27, Nutzer): die nächsten 3 Einträge der TODO (Aufgaben vor offenen Punkten), sonst die ersten 3 Ideen, als Karten (`LooseCards` in `PlanTile.tsx`, Raster `auto-fill minmax(12rem,1fr)`); Ideen ohne Büroklammer bis U9.1. Vorschau: `?plan=todo|ideas|none`. Ältere Links (`Dialogs`, `Welcome`, `ChangesView`) auf `action-text` umgestellt, kein `hover:underline` mehr im Frontend.
- Anklickbarer Text (2026-11-27, Kritik des Nutzers: nichts war als anklickbar erkennbar): `@utility action-text` in `index.css`, zuerst im Plan, in der Scratch-Zeile und am „Für den nächsten Prompt“; ältere Stellen mit `hover:underline` nach und nach umstellen. Der nächste Schritt im Plan steht bis dreizeilig auf einer leisen Fläche in der Akzentfarbe (`bg-brand/[0.07]`). Build-Warnung „chunk > 500 kB“ per `chunkSizeWarningLimit: 1500` stillgelegt (lokal geladen, ein Chunk von 1,2 MB kostet Millisekunden).
- Nicht registrierte Befehle (2026-11-27): Ein `#[tauri::command]`, der in `generate_handler!` fehlt, kompiliert ohne Warnung, und die Vorschau verdeckt es mit ihrem Mock; so fehlten `guide_plan`, `scratch_thumbnail` und `scratch_expire` in der App (Plan leer, keine Vorschaubilder, kein Ablauf). Seither prüft der Test `registration::every_command_is_registered` in `lib.rs` die Liste.
- Scratch-Ablauf (U8.5, 2026-11-27): Entscheidung im Backend (`scratch::due`/`expire`, Rechner-Einstellung `scratchExpiry`, Behaltenes in `FileMarks.kept`, Leitdateien des Hauptordners als „genannt“ über `guides::top_texts`), was nur das Fenster weiß (angehängt, ungesehen, von laufender Session geschrieben), schickt `useScratchExpiry` als `protected` mit; läuft 30 s nach dem Öffnen eines Projektfensters, dann stündlich, auch ohne offene Werkbank. Journal-Zeile `scratch_expired` (Anzahl in `text`), die Glocke sagt es. Arten doppelt: `scratch.rs` `kind_of` und `src/scratch.ts` `scratchKind` müssen gleich bleiben. Startregel um „Wegwerfbares selbst löschen“ ergänzt (Vorschau-Mock in `backend.ts` mitgezogen).
- Werkbank in Zonen (U8.4, 2026-11-27): Vorschaubilder als `data:`-Adresse über `scratch_thumbnail` (bis 1,5 MB; die CSP erlaubt `data:`, der Asset-Weg von Tauri ist nicht freigeschaltet). Unter „Neu“ ist alles neu, daher keine Karte und kein Wort „neu“, nur „geändert“. Zeilenkommentare sind ab dem Schreiben angehängt; in „Zu tun“ führt ihre Büroklammer in den Nächsten Prompt statt sie zu entfernen. Die Ablagen unten behalten jede bisherige Funktion; ihre Klappzustände haben neue Schlüssel (`outside.store`, `scratch.zone`), zu Beginn zu. `HintsTile.tsx` ist in `TodoZone.tsx` aufgegangen.
- Plan aus den Leitdateien (U8.3, 2026-11-27): `guides.rs` liest nachsichtig (HTML-Kommentare mit Beispiel-Checkboxen übersprungen, eingerückte Checkboxen sind keine Schritte, `**Titel**` wird zum Titel, Status deutsch oder englisch). Aktuelle Etappe = erste „in Arbeit“, sonst erste offene; nächster Schritt = erster offener, sonst erster in Arbeit. Die Projektliste liest je Aktualisierung nur den Hauptordner (`line_at`), nie den ganzen Baum. Text an die KI je Eintrag mit Art, Datei:Zeile und Etappe (`plan.ts`).
- Leitdateien (U8.2, 2026-11-27): Rollen Anweisungen, Beschreibung, Aufgaben, Ideen, Roadmap (`guides.rs`). Namen je Rolle als Rechner-Einstellung `guides`, je Projekt `guides` in `files.json` (eine Datei je Rolle, nur Anweisungen addieren sich), Anweisungsdateien vom Adapter (`Harness::instruction_files`, zählen immer, in jedem Ordner). Der Dateiwächter meldet jede Änderung mit ihrem Ordner, daher liest das Frontend die Leitdateien nur bei geänderten `.md`/README-Pfaden neu (`useGuides`); `.scratch/` zählt nie.
- Reiter „Theme“ in den Einstellungen (2026-11-26, Nutzer): Auswahl über die Breite mit eigenen Überschriften, darunter Ereignisse mit drei Stufen (Ruhig, Deutlich, Laut, Vorgabe Deutlich); Transparenz entfallen. Projektliste ist Bereich `zone-files` (wie die Dateispalte: das Projekt rahmt die Arbeit ein), nicht mehr `zone-side` wie die Sitzungen.
- Themes aus dem be spex kit (2026-11-25, Wunsch des Nutzers: dieselben Themes in allen Apps): Farbthema und Stil getrennt, Auswahl `<sx-appearance>` des Kits in Einstellungen → Benutzeroberfläche (nur die Achsen Form, Gliederung, Farbigkeit, Effekte), daneben „Ereignisse“ als eigene Einstellung (früher `events` des Themes). Rechner-Einstellungen `appearance` und `events`; eine alte `theme`-Wahl wird übersetzt. `docs/STYLING.md` Stand-Zeile.
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
