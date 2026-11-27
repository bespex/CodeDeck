# Sitzungen: Prüfung, Konzept und Plan (2026-11-20)

Prüfung des Stands nach „Sitzungsliste überarbeitet“ und „Sitzungen im Hintergrund“ (`docs/UMSETZUNG.md`, „Später“; Stand in `ROADMAP.md` U3–U5).
Drei Fragen des Nutzers:

1. **IST:** Welche Wege gibt es, eine KI-Sitzung zu betreiben (vor allem in tmux)? Deckt CodeDeck sie ab, und zeigt es
   sie verständlich an?
2. **Architektur:** Ist alles Werkzeugspezifische (Starten, Fortsetzen, Finden, Zustand, Türen) so gekapselt, dass ein
   zweites Werkzeug (z. B. OpenCode) dazukommen kann? Wo hängt etwas am Rechner (Wayland, KDE, andere Distributionen)?
3. **Erweiterbarkeit:** Fragt die Oberfläche jede werkzeug- oder rechnerabhängige Fähigkeit ab, und fällt eine fehlende
   leise weg statt mit einer Fehlermeldung?

Grundlage: Code-Stand vom 2026-11-20 (nach Commit `a6bb823` plus nicht committeter Hintergrund-Erkennung), Probe mit
`claude --bg` (Claude Code 2.1.329), Journal und Daemon-Dateien des Pictorix-Falls. Bewertung: ✅ abgedeckt und
verständlich · ◐ geht, aber mit Lücke · ✗ fehlt oder falsch.

---

## Teil 1: IST-Analyse der Betriebswege

### 1.1 Wo eine Sitzung läuft

| # | Weg | Was CodeDeck erkennt | Türen (hinein) | Steuern | Bewertung |
|---|---|---|---|---|---|
| W1 | **Von CodeDeck in tmux gestartet** (▶, „Neue Sitzung“, Tagesliste, „Fortsetzen“) | Alles: Hook, `CODEDECK_SESSION`, tmux-Option `@codedeck`, Startbefehl | Terminal (`tmux attach`), Desktop über Remote Control | Neu starten, Beenden, Startbefehl kopieren | ✅ |
| W2 | **Von Hand in einer eigenen tmux-Sitzung** (`tmux new -s arbeit`, darin `claude`) | Hook mit Pane und Sitzungsname; Schild „von Hand“ | Terminal hängt sich an die tmux-Sitzung, landet aber im **gerade aktiven Fenster**, nicht im Pane der KI | **Beenden/Neu starten werden angeboten und beenden die ganze tmux-Sitzung des Nutzers** (`kill-session`), samt anderer Fenster | ✗ |
| W3 | **Von Hand in einem normalen Terminal** (ohne tmux) | Hook mit Prozess; Schild „von Hand“ | Terminal holt das Fenster nach vorn, **nur unter X11**; unter Wayland Fehlermeldung | keins (richtig) | ◐ |
| W4 | **Im Hintergrund** (`/background`, `claude --bg`) | Seit heute: Schild „im Hintergrund“, Herkunft/Abzweig, Frage aus dem Daemon | Terminal öffnet `claude attach` | Fortsetzen über `attach`; Beenden nicht angeboten | ◐ (Praxistest offen; internes Daemon-Format) |
| W5 | **In der IDE** (Erweiterung von VS Code/JetBrains) | Hook mit Prozess (Vorfahr ist die IDE) | Terminal holt unter X11 die IDE nach vorn; die Karte sagt nicht, dass es die IDE ist | keins | ◐ (nicht in echt geprüft) |
| W6 | **In der Desktop-App** (lokale Code-Sitzung der App) | Nicht geprüft, ob die Hooks dort feuern | Desktop über Remote-Link, falls gemeldet | keins | ? |
| W7 | **Auf einem Server per ssh** | Bewusst nicht (D6): die KI läuft lokal und erreicht Server per ssh | – | – | ✅ (Entscheidung) |

### 1.2 Was im Leben einer Sitzung passiert

| # | Ereignis | Verhalten heute | Bewertung |
|---|---|---|---|
| E1 | Erster Start in einem neuen Ordner: das Werkzeug fragt „Ordner vertrauen?“ und meldet nichts | Zeile „Wird gestartet…“, nach 20 s „fragt vielleicht“, Terminal-Werkzeug | ✅ |
| E2 | Arbeitet, fragt um Erlaubnis | „fragt · 3 min“, Befehl darunter, „Antworten“ | ✅ |
| E3 | Runde fertig | Schlussworte, „Runde fertig · vor 6 min“, „Runde ansehen“, wartet bis angesehen | ✅ |
| E4 | Abgelehnt und Esc (kein Hook) | Logende wird alle 3 s gelesen (`cut_short`) | ✅ |
| E5 | Limit des Kontos erreicht | „wartet auf Reset · 17:00“ | ✅ |
| E6 | `/clear` oder `/background`: neue ID im selben Prozess | Seit heute: alte Sitzung gilt als beendet, Verweis auf den Abzweig | ◐ (Praxistest offen) |
| E7 | Nutzer beendet das Werkzeug im CodeDeck-tmux (`exec`, das Pane schließt) | Hook „Ende“ → beendet, unter „Früher“, „Fortsetzen“ | ✅ |
| E8 | Nutzer schließt nur das Terminal-Fenster eines `tmux attach` | Sitzung läuft weiter, Karte unverändert | ✅ |
| E9 | Von Hand gestartete Sitzung beendet, die Shell im Pane bleibt | Prozess weg → `alive: false` → „Fortsetzen“ | ✅ |
| E10 | CodeDeck neu gestartet, Sitzungen laufen weiter | `<config>/sessions/<pid>.json` macht sie sofort zu laufenden; CodeDeck-Starts erkennt es an der Umgebung | ✅ |
| E11 | Rechner neu gestartet: tmux und Daemon weg | Sitzungen aus den Logs unter „Früher“, „Fortsetzen“ | ✅ |
| E12 | Dieselbe Unterhaltung läuft zweimal (z. B. `claude --resume` in einem zweiten Terminal) | CodeDeck verweigert eigenes Doppel-Fortsetzen; ein Doppel von Hand erkennt es nicht, der Ort springt zwischen beiden Prozessen | ◐ (selten) |
| E13 | Hooks des Kontos nicht verbunden | Sitzung nur aus dem Log, „aus dem Log“, unter „Früher“; Hinweis zum Verbinden im Kopf | ✅ |
| E14 | tmux ist nicht installiert | Start schlägt mit roher Fehlermeldung fehl; ▶ wird trotzdem angeboten | ✗ |
| E15 | Terminal-Programm `x-terminal-emulator` fehlt (alles außer Debian/Ubuntu/Mint) | Jede Terminal-Tür schlägt fehl: „no terminal could be started“ | ✗ |
| E16 | tmux-Sitzung des Nutzers auf eigenem Socket (`tmux -L`) | Hook kennt das Pane, `tmux attach` findet es nicht | ◐ (selten) |
| E17 | Arbeitsbaum (Worktree) innerhalb des Projekts | Zählt zum Projekt; Snapshots je Repo, Trail ohne eigene Darstellung | ◐ (P6/4.5) |

### 1.3 Anzeige

- **Verständlich:** Zustand mit Zeit, Frage mit Befehl, Schlussworte, „Runde ansehen“, ein Hauptknopf, „Früher“ mit
  „Fortsetzen“. Gut für die üblichen ein bis drei Sitzungen.
- **Unklar:**
  - W2: die Karte bietet Beenden an, als wäre es eine eigene Sitzung.
  - W3 unter Wayland, W5: der Knopf „Terminal“ verspricht, was er nicht hält.
  - E14/E15: rohe Fehlermeldungen auf Englisch statt eines Hinweises, was fehlt.
- **Doppelte Logik:** Was eine Karte anbietet (Türen, Neu starten, Beenden), steht zweimal im Frontend: Sitzungskarte
  (`SessionsPanel.tsx`) und Projektliste (`OverviewApp.tsx`), dazu beim Kontowechsel (`HeaderBar.tsx`), jeweils mit
  eigenen Bedingungen. Der Fehler aus W2 steckt an allen drei Stellen.

---

## Teil 2: Architektur-Analyse

### 2.1 Die Schnittstelle heute

`src-tauri/src/harness/mod.rs`, Trait `Harness` (ein Adapter je Werkzeug, mitkompiliert, `harness::all()`):

| Gruppe | Methoden | Neutral? |
|---|---|---|
| Name, Fähigkeiten | `id`, `name`, `short_name`, `capabilities` | ✅ |
| Verbinden (Hooks) | `connections`, `connect`, `follow_program` | ✅ |
| Ereignisse | `translate` (Rohmeldung → `Event`), `reply` (Text in den Prompt) | ✅ |
| Verbrauch | `translate_usage`, `connect_usage` | ✅ |
| Logs | `past_sessions`, `read_log`, `cut_short` | ✅ |
| Konten | `account_kind`, `desktop_profiles`, `new_desktop_profile` | ✅ |
| Starten, Fortsetzen | `launch` (Befehl und Umgebung; tmux macht `tmux.rs`) | ✅ |
| Orte, Türen | `remote_link`, `desktop_command`, `running`, `background_job`, `parked`, `attach` | ✅ |
| Dateien | `is_own_file`, `page_hosts` | ✅ |

Das Muster trägt: Alles Claude-Spezifische steht in `harness/claude.rs` (Hook-Felder, `settings.json`, Logformat,
Prozess- und Daemon-Dateien, `claude attach`, `claude://`). Außerhalb kommt „claude“ nur in Tests, Beispieldaten und
der erlaubten Ausnahme `history.rs` `AI_MARKS` vor. Ein Test-Adapter (`harness/fake.rs`) beweist, dass der Kern ohne
Claude Sitzungen kennt.

### 2.2 Wo die Kapselung leckt

| # | Stelle | Problem | Gewicht |
|---|---|---|---|
| A1 | `lib.rs:842` `start_in` | Startet immer mit dem **ersten** Werkzeug (`harness::all().first()`), nicht mit dem des Projekts (das Konto kennt sein Werkzeug: `accounts.rs` `harness`) | hoch, sobald es zwei gibt |
| A2 | `Capabilities` | Kennt `live_status`, `before_write`, `attach`, `start_rules`, `past_sessions`, `usage`, `desktop_profiles`. **Fehlt:** Starten, Fortsetzen, Desktop-Tür, Hintergrund. Die Oberfläche erfährt erst beim Klick, dass es nicht geht | hoch |
| A3 | Konto = Konfigurationsordner | Passt für Claude (`CLAUDE_CONFIG_DIR`). OpenCode hat keine Konten in diesem Sinn (eine Konfiguration, mehrere Anbieter). Ein Werkzeug ohne Konten muss „ein Standardkonto“ liefern können | mittel |
| A4 | UI-Texte | „Claude usage“ (`ActivityView.tsx:62`), „Other Claude configurations…“ (`UsagePanel.tsx:178`) fest im Code statt Name des Werkzeugs | klein |
| A5 | Ort einer Sitzung (`Place`) | tmux ist ein Feld des Kerns, „im Hintergrund“ ein Griff des Werkzeugs. Das passt. Aber die **Entscheidung, welche Tür gilt**, fällt verteilt: `enter_session` (`lib.rs`), `doors.rs`, drei Stellen im Frontend | mittel |
| A6 | Hook-Weg | Setzt voraus, dass das Werkzeug ein Programm je Ereignis aufruft (`codedeck hook --harness <id>`, Rohmeldung über stdin). Für ein Werkzeug mit Plugin- oder Server-Schnittstelle braucht es einen kleinen Vermittler (Plugin, das `codedeck hook` aufruft). Der Weg bleibt derselbe | klein (Doku) |

### 2.3 Gedankenspiel: OpenCode als zweites Werkzeug

Nach der öffentlichen Doku von OpenCode; **vor dem Bau in einer Probe prüfen**.

| CodeDeck braucht | Bei OpenCode vermutlich | Folge |
|---|---|---|
| Ereignisse je Schritt (`live_status`) | Plugin-Ereignisse (Sitzung untätig, Erlaubnis, Werkzeug vor/nach) in einem JS/TS-Plugin; Server-Modus mit Ereignisstrom | Kleines Plugin, das `codedeck hook --harness opencode` mit JSON aufruft. Adapter übersetzt |
| Vor dem Schreiben (`before_write`) | „Werkzeug vor Ausführung“ im Plugin | Snapshots möglich, wenn das Plugin auf die Antwort wartet |
| Text in den Prompt (`attach`, `start_rules`) | Unklar, ob ein Plugin die Nachricht ändern kann | Sonst `Attach::Copy` (Kopieren) als Rückfall, der Code kennt ihn |
| Logs früherer Sitzungen | Gespeicherte Sitzungen im Datenordner von OpenCode | `past_sessions`, `read_log` |
| Starten, Fortsetzen in tmux | TUI mit Option zum Fortsetzen einer Sitzung | `launch` |
| Desktop, Remote, Hintergrund, Verbrauch | Eher nicht | Fähigkeiten aus, Knöpfe weg |

Ergebnis: Der Adapter ist machbar. Gelingen kann er aber nur, wenn die Oberfläche Fähigkeiten konsequent abfragt
(Teil 3) und der Start das Werkzeug des Projekts nimmt (A1).

### 2.4 Abhängigkeiten vom Rechner (Wayland, KDE, Distributionen)

| # | Funktion | Heute | Wayland | KDE / GNOME / andere Distributionen | Gewicht |
|---|---|---|---|---|---|
| R1 | Terminal öffnen (`doors.rs`, zweimal) | `x-terminal-emulator -e …` | geht | **Gibt es nur in der Debian-Familie.** Fedora, Arch, openSUSE: Terminal-Tür und `attach` gehen nicht. Auch dort, wo es das gibt, unterscheiden sich die Argumente je Terminal (`-e` vs. `--`) | hoch |
| R2 | Fenster einer Hand-Sitzung nach vorn (`raise_window_of`) | X11 `_NET_ACTIVE_WINDOW` | geht nicht, Fehlermeldung | KDE/X11 geht | mittel; widerspricht der Regel „keine reinen X11-Funktionen“ |
| R3 | CodeDeck nach vorn (Tray-Klick, Meldung, `Ctrl+Alt+L`; `window::obey`) | X11-Weg plus Tauri-Fokus | Fokus wird oft verweigert (KWin, GNOME zeigen nur „ist bereit“) | – | mittel |
| R4 | Globales Kürzel `Ctrl+Alt+L` | `tauri-plugin-global-shortcut` | geht nicht (wird als Zustand gemeldet) | – | mittel |
| R5 | Fensterposition (Startseite links, Fenster daneben; `set_compact`, `place_beside_overview`) | `set_position` | wird übergangen | – | klein |
| R6 | Markierung am Taskleisten-Symbol (Pille/Punkt, `icon.rs`) | Fenster-Icon zur Laufzeit | Wayland nimmt das Icon aus der `.desktop`-Datei, die Markierung fehlt | KDE/X11 geht | klein (Titel und Dringlichkeit bleiben) |
| R7 | Tray (`ksni`, StatusNotifierItem) | – | geht | KDE nativ; GNOME nur mit Erweiterung (AppIndicator) | klein (Fenster geht ohne) |
| R8 | Desktop-Meldungen mit Klick (`notify-rust`) | – | geht | KDE, GNOME, Cinnamon geht | ✅ |
| R9 | Autostart (`~/.config/autostart`) | XDG | geht | überall | ✅ |
| R10 | Desktop-App öffnen (Claude) | `claude-desktop` bzw. `xdg-open claude://` | geht | Linux-Paket der App ist inoffiziell; der Programmname hängt am Paket | klein, im Adapter |
| R11 | tmux | vorausgesetzt | geht | muss installiert sein (E14) | mittel |
| R12 | Login-Shell für Starts (`$SHELL -lc`) | POSIX-Quoting | – | fish und zsh vertragen das Quoting; `nu` oder `xonsh` nicht | klein |

---

## Teil 3: Erweiterbarkeits-Analyse

### 3.1 Jede abhängige Funktion: woran sie hängt, und was passiert, wenn es fehlt

| Funktion | Hängt an | In der Oberfläche abgefragt? | Wenn es fehlt, heute | Bewertung |
|---|---|---|---|---|
| Zustand je Schritt, „Wartet auf dich“ | `live_status` | ja | „aus dem Log“, unter „Früher“ | ✅ |
| Snapshots vor dem Schreiben | `before_write` | intern | keine Snapshots, Trail zeigt Runden ohne Anfang | ✅ |
| Anhänge, Startregeln | `attach`, `start_rules` | ja | Kopieren statt Anhängen | ✅ |
| Verbrauch | `usage` | ja (Panel) | Texte nennen trotzdem „Claude“ (A4) | ◐ |
| Desktop-Profile | `desktop_profiles` | ja | Einstellung fehlt | ✅ |
| ▶ Starten, Neue Sitzung, Tagesliste | `launch` + tmux | **nein** | Klick → „CodeDeck cannot start sessions of this tool“ bzw. tmux-Fehler | ✗ |
| Fortsetzen | `launch` (bzw. `attach` im Hintergrund) + tmux | **nein** (`resumable` prüft nur den Prozess) | Fehlermeldung beim Klick | ✗ |
| Neu starten, Beenden | tmux-Sitzung + **von CodeDeck gestartet** | prüft nur „läuft in tmux“ | beendet fremde tmux-Sitzungen (W2) | ✗ |
| Terminal-Tür | tmux / Hintergrund (`attach`) / X11 + Terminalprogramm | prüft nur „nicht beendet“ | Fehlermeldung (R1, R2) | ✗ |
| Desktop-Tür | Remote-Link + `desktop_command` | prüft den Link | geht, wenn der Link da ist | ✅ |
| Remote-Zeichen | `remote_link` | ja (Link vorhanden) | fehlt still | ✅ |
| Frage am Rundenende (Hintergrund) | `parked` | intern | „Runde fertig“ mit den Schlussworten | ✅ |
| Abbruch erkennen (Esc) | `cut_short` | intern | Status bleibt bis zum nächsten Prompt stehen | ✅ |
| Globales Kürzel | Rechner (R4) | ja (Zustand) | Hinweis in der Hilfe | ◐ |

### 3.2 Ergebnis

Was der Kern über Werkzeuge wissen muss, ist gut gekapselt (Teil 2). Die Schwäche sitzt an der **Kante zur
Oberfläche**: Die Steuerung (Starten, Fortsetzen, Beenden, Türen) wird angeboten, ohne dass Werkzeug **und** Rechner
gefragt werden. Das führt zu Fehlermeldungen beim Klick (E14, E15, R1, R2) und in einem Fall zu Schaden (W2). Dass die
Bedingungen an drei Stellen im Frontend stehen, macht es schlimmer.

---

## Teil 4: Konzept

**K1 – Zwei Arten von Fähigkeiten, beide aus dem Backend.**
- **Werkzeug:** `Capabilities` wird vollständig: dazu kommen `launch` (starten und fortsetzen in tmux), `background`
  (Hintergrund-Sitzungen, `attach`), `desktop` (Desktop-App öffnen). Abgeleitet aus dem Adapter, nicht von Hand
  gepflegt: Ein Adapter, der `launch` nicht liefert, hat die Fähigkeit nicht.
- **Rechner:** neu `Platform`, einmal beim Start ermittelt:
  - tmux vorhanden
  - Terminal-Starter gefunden (welcher)
  - Fenster nach vorn holen möglich (X11)
  - globale Kürzel möglich
  - Fenster positionieren möglich
  - Wayland ja/nein

**K2 – Türen und Aktionen entscheidet das Backend, je Sitzung.** `Session` bekommt `doors` (z. B. `desktop`,
`terminal` mit Art `tmux` / `attach` / `window`) und `actions` (`continue`, `restart`, `stop`), jeweils nur, was
**jetzt wirklich geht** (Werkzeug × Rechner × Ort × Eigentum). Sitzungskarte, Projektliste und Kontowechsel zeigen nur
diese Listen; die Bedingungen im Frontend entfallen. `enter_session` und `doors.rs` nehmen dieselbe Entscheidung.

**K3 – Eigentum: Was CodeDeck nicht gestartet hat, beendet es nicht.** Neu starten und Beenden nur für tmux-Sitzungen
mit `@codedeck` bzw. `CODEDECK_SESSION`. Bei Hand-Sitzungen in fremdem tmux zielt die Terminal-Tür auf das Pane
(`attach` plus Fenster und Pane wählen). Beenden steht dort nicht, der Tooltip sagt „Endet, wo sie läuft“.

**K4 – Terminal-Starter statt `x-terminal-emulator`.** Reihenfolge:
1. Einstellung „Terminal“ (Rechner-Einstellung)
2. `$TERMINAL`
3. `xdg-terminal-exec` (der neue Freedesktop-Weg)
4. `x-terminal-emulator`
5. bekannte Programme mit ihrer Argumentform: konsole, gnome-terminal/kgx, kitty, alacritty, wezterm, foot, xterm

Ein Modul (`terminal.rs`), beide Stellen in `doors.rs` nutzen es. Findet sich keins, fällt die Terminal-Tür weg
(K1/K2), und die Einstellungen sagen, warum.

**K5 – Wayland und andere Desktops: lieber weglassen als versprechen.**
- R2: Die Tür „Fenster nach vorn“ gibt es nur, wenn `Platform` sie erlaubt. Sonst zeigt die Karte „läuft in einem
  Terminal“ ohne Knopf, und die Notizen nennen den Weg über tmux.
- R3/R4: Neuer Aufruf `codedeck --toggle` (CodeDeck nach vorn oder weg, über den Socket an die laufende Instanz). Den
  kann jeder Desktop als Tastenkürzel binden. Die Hilfe sagt das unter Wayland statt „geht nicht“.
- R5/R6: Unter Wayland keine Positionierung. Die Markierung läuft über Titel und Dringlichkeit, ohne Fehlermeldung.

**K6 – Werkzeug je Projekt.** Gestartet wird mit dem Werkzeug des Projektkontos (`accounts.rs` `harness`), sonst mit
dem einzigen, sonst mit der Rückfrage „Mit welchem Werkzeug?“. Werkzeuge ohne Konten liefern ein Standardkonto (A3).

**K7 – Adapter-Vertrag prüfbar machen.**
- Gemeinsame Konformitätstests, die jeder Adapter bestehen muss: `translate` liefert für jede Ereignisart ein `Event`,
  `launch` passt zu `capabilities.launch`, fehlende Fähigkeiten liefern `None`.
- In der Browser-Vorschau ein zweites Beispiel-Werkzeug mit wenigen Fähigkeiten (kein Start, kein Desktop, kein
  Live-Zustand). So ist sichtbar, dass nichts Kaputtes angeboten wird.
- Die Glocke zeigt bereits „Fähigkeiten je KI-Werkzeug“; sie zeigt künftig auch die Rechner-Fähigkeiten.

**K8 – Texte über den Namen des Werkzeugs.** Keine festen „Claude“-Texte in der Oberfläche (A4).

---

## Teil 5: Plan zur Überarbeitung

Jeder Schritt einzeln, mit Praxistest, nach „So läuft jeder Schritt“ in `CLAUDE.md`.

| Schritt | Inhalt | Dateien | Fertig, wenn |
|---|---|---|---|
| **S1 Eigentum und Pane** ✅ (Praxistest offen) | K3: Neu starten und Beenden nur für von CodeDeck gestartete Sitzungen, an allen drei Stellen (Karte, Projektliste, Kontowechsel) und im Backend (`stop_session` verweigert fremde tmux-Sitzungen). Terminal-Tür zielt in fremdem tmux auf Fenster und Pane | `lib.rs` (`stop_session`), `doors.rs`, `SessionsPanel.tsx`, `OverviewApp.tsx`, `HeaderBar.tsx` | Von Hand: `tmux new -s test`, zweites Fenster, darin `claude`. Kein Beenden an der Karte; Terminal öffnet genau das Pane |
| **S2 Terminal-Starter** ✅ (Praxistest offen) | K4: `terminal.rs` mit Erkennung und Argumentform (ohne sichtbare Einstellung, Entscheidung 1) | neu `terminal.rs`, `doors.rs`, `backend.ts` | Unter Mint wie bisher; mit `TERMINAL=kitty` öffnet kitty; ohne jedes Terminal kein Knopf, der About-Dialog sagt es |
| **S3 Fähigkeiten des Rechners** ✅ (Praxistest offen) | K1 (Teil Rechner): `Platform` beim Start ermitteln (tmux, Terminal, X11/Wayland, Kürzel, Positionieren), an die Oberfläche geben; Glocke und About-Dialog zeigen sie („Erkannt auf diesem Rechner“) | neu `platform.rs`, `lib.rs`, `backend.ts`, `NoticesPanel.tsx`, `Dialogs.tsx` | In der Vorschau mit „Wayland, kein tmux“: kein ▶, kein Terminal für Hand-Sitzungen, Hinweise in der Glocke |
| **S4 Fähigkeiten des Werkzeugs vervollständigen** ✅ (Praxistest offen) | K1 (Teil Werkzeug): `launch`, `background`, `desktop` in `Capabilities`, aus dem Adapter abgeleitet | `harness/mod.rs`, `harness/claude.rs`, `harness/fake.rs`, `backend.ts` | Konformitätstest grün; der Test-Adapter meldet „kein Start“ |
| **S5 Türen und Aktionen aus dem Backend** ✅ (Praxistest offen) | K2: `Session.doors`, `Session.actions` (Werkzeug × Rechner × Ort × Eigentum); Frontend zeigt nur diese; `enter_session` nutzt dieselbe Entscheidung. Ersetzt die Bedingungen aus S1 im Frontend | `bridge.rs` (oder neu `doors.rs` erweitert), `lib.rs`, `SessionsPanel.tsx`, `OverviewApp.tsx`, `HeaderBar.tsx`, `backend.ts` | Kein Knopf führt zu „geht nicht“; zweites Beispiel-Werkzeug in der Vorschau zeigt nur, was es kann |
| **S6 Werkzeug je Projekt** ✅ (Praxistest offen) | K6: Start mit dem Werkzeug des Projektkontos; Standardkonto für Werkzeuge ohne Konten; Texte über den Namen (K8) | `lib.rs` (`start_in`), `accounts.rs`, `ActivityView.tsx`, `UsagePanel.tsx`, `i18n.de.ts` | Test: Projekt mit dem Konto des Test-Adapters startet dessen Befehl |
| **S7 Wayland-Wege** ✅ (Praxistest offen) | K5: `codedeck --toggle`; keine Positionierung und kein Fenster-nach-vorn unter Wayland; Hilfe zeigt den Kürzel-Weg; Hinweisdialog unter Wayland beim Start mit „Weiterhin anzeigen“ (Entscheidung 4, Wahl in den Rechner-Einstellungen) | `lib.rs` (`run`), `hub.rs`, `window.rs`, `config.rs`, `Dialogs.tsx` | Auf dem Wayland-Rechner: Hinweis beim ersten Start, nach Abwahl nicht mehr; keine Fehlermeldungen; Kürzel im Desktop gebunden holt CodeDeck nach vorn |
| **S8 Vertrag und Vorschau** ✅ | K7: Konformitätstests für alle Adapter; zweites Beispiel-Werkzeug in `mock.ts`/`backend.ts`; Doku der Schnittstelle (`docs/KONZEPT.md` Abschnitt Adapter, „So kommt ein Werkzeug dazu“) | `harness/*`, `backend.ts`, `docs/KONZEPT.md` | Neue Entwicklerin kann aus der Doku einen Adapter-Rohbau anlegen |
| **S9 Probe OpenCode** (nach S8, gewollt) | Ereignisse, Fortsetzen, Logs, Text in den Prompt prüfen; Ergebnis als Tabelle in diesem Dokument; Entscheidung, ob ein Adapter gebaut wird | `.scratch/` | Tabelle 2.3 mit belegten Antworten |

**Reihenfolge und Begründung:**
- **S1 sofort**, weil er Arbeit des Nutzers zerstören kann.
- **S2 und S3** machen CodeDeck auf anderen Rechnern benutzbar.
- **S4 bis S6** schaffen die Grundlage für ein zweites Werkzeug.
- **S7 und S8** runden ab.
- **S9** danach: OpenCode als Erprobung des Konzepts und für Tests.

**Gruppen (Nutzer 2026-11-20): eine Sitzung je Gruppe, Praxistest am Ende der Gruppe.** Innerhalb einer Gruppe
nach jedem Schritt `cargo test`, `tsc` und die Vorschau; am Ende eine Praxistest-Liste für die ganze Gruppe.

| Gruppe | Schritte | Warum zusammen | Praxistest am Ende |
|---|---|---|---|
| **G1 Rechner** ✅ gebaut 2026-11-20, Praxistest offen | S2, S3 (+ Praxistest S1 vorher) | Beide fragen den Rechner: Terminal, tmux, X11/Wayland; About zeigt das Erkannte | Auf Mint: Terminal-Türen wie bisher; `TERMINAL=kitty` (o. ä.) öffnet dieses; About „Erkannt auf diesem Rechner“ stimmt; ohne tmux (PATH ohne tmux) kein ▶, verständlicher Hinweis |
| **G2 Werkzeug** ✅ gebaut 2026-11-20, Praxistest offen | S4, S5, S6, dazu das zweite Beispiel-Werkzeug aus S8 | S5 braucht die Fähigkeiten aus S3/S4; das Beispiel-Werkzeug ist der Prüfstein für S5 | Jede Tür und Aktion an Karte, Projektliste, Kontowechsel funktioniert wie vorher; Vorschau mit dem Beispiel-Werkzeug zeigt nichts, was nicht geht; Start nutzt das Werkzeug des Projekts |
| **G3 Wayland und Vertrag** ✅ gebaut 2026-11-20, Praxistest offen | S7, Rest von S8 (Konformitätstests, Doku „So kommt ein Werkzeug dazu“) | Abrundung; der Wayland-Teil wird auf einem anderen Rechner geprüft | Auf Mint: nichts schlechter, `codedeck --toggle` geht; auf dem Wayland-Rechner: Hinweisdialog, „Weiterhin anzeigen“ abwählbar, keine Fehlermeldungen, Kürzel im Desktop gebunden |
| **G4 OpenCode** | S9, danach ggf. Adapter | Eigene Erprobung auf fertiger Basis | Tabelle 2.3 belegt; Entscheidung über den Adapter |

**Entscheidungen des Nutzers (2026-11-20):**
1. S2: Die automatische Erkennung reicht, keine sichtbare Einstellung „Terminal“. Der About-Dialog zeigt, was
   CodeDeck erkannt hat (Terminal, tmux, X11/Wayland, Desktop, Kürzel, Tray), siehe S3.
2. S7: Getestet wird auf einem echten Wayland-Rechner (der Tochter des Nutzers), keine VM.
3. S9: OpenCode ist das Ziel, sobald die Basis (S1 bis S8) steht: als Erprobung des Konzepts und für Tests.
4. Neu (S7): Unter Wayland erscheint beim ersten Start ein Hinweisdialog, der die Einschränkungen aus Sicht des
   Nutzers beschreibt (was nicht geht, was stattdessen geht). Er erscheint bei jedem Start wieder, bis der Nutzer
   „Weiterhin anzeigen“ abwählt. **Abgelöst 2026-11-20 (Nutzer):** Der Hinweis ist jetzt ein Warnkasten im
   Willkommensfenster (`welcome.rs`, `Welcome.tsx`), das bei jedem Start mit Fenster erscheint, bis „Beim Start
   nicht mehr zeigen“ gesetzt ist, und wieder, wenn danach etwas Essenzielles fehlt. Es listet je Programm Name
   (mit Webseite), Status, Dringlichkeit (essenziell: KI-Werkzeug, git, tmux; hilfreich: Terminal, Fenstersystem,
   Tray; nice to have: Marq, Dirq, Hyqe, Jayq, Xaq) und als Tooltip, was es für CodeDeck tut; „Erneut prüfen“
   ermittelt den Rechner neu (`platform::refresh`).

**Umsetzung G1 (2026-11-20):**
- S2: `terminal.rs` sucht `$TERMINAL`, `xdg-terminal-exec`, `x-terminal-emulator`, dann bekannte Programme (die des
  laufenden Desktops zuerst) und kennt ihre Argumentform (`-e`, `-x`, `--`, ohne, `wezterm start --`). Beide Stellen in
  `doors.rs` nutzen `terminal::open`.
- S3: `platform.rs` ermittelt beim ersten Aufruf tmux (`tmux -V`), Terminal, X11/Wayland, Desktop, Tray-Host
  (`StatusNotifierWatcher` auf dem Session-Bus); Befehl `platform`, im Frontend `src/platform.ts` (`usePlatform`,
  `canStart`, `hasTerminalDoor`, `canContinue`). Ohne tmux kein ▶/＋ (Sitzungsspalte, Projektliste, Tagesliste) und
  kein „Fortsetzen“; ohne Terminal keine Terminal-Tür; Hand-Sitzung ohne X11: „im eigenen Terminal“ statt Knopf.
  `tmux::start` meldet fehlendes tmux in Worten. Glocke und About: „Erkannt auf diesem Rechner“ (`PlatformFacts.tsx`),
  in der Glocke von selbst aufgeklappt, wenn etwas fehlt; Diagnose nennt es auch. Vorschau: `?platform=wayland,notmux,noterminal,notray`.
- Nebenbei: Eine Sitzung ohne bekannten Ort (kein Prozess, kein tmux) hat keinen Terminal-Knopf mehr; er führte nur zu
  „weiß nicht, wo sie läuft“. Diese Bedingungen im Frontend ersetzt S5 durch `Session.doors`/`actions` aus dem Backend.

**Umsetzung G2 (2026-11-20):**
- S4: `Capabilities` hat `launch`, `background`, `desktop`. Der Adapter liefert `declared()`; `capabilities()` leitet
  `launch` aus `launch()` und `background` aus `attach()` ab (`desktop` bleibt erklärt). Konformitätstest in
  `harness/mod.rs` über alle Adapter samt Test-Adapter; `Fake` meldet „kein Start“, `Starter` (nur Tests) startet.
- S5: `doors::ways` entscheidet je Sitzung `doors` (`desktop`, `tmux`, `attach`, `window`, die Vorgabe zuerst),
  `actions` (`continue`, `restart`, `stop`) und `noDoor` (`noTerminal`, `ownTerminal`) aus Werkzeug × Rechner × Ort ×
  Eigentum; `Session` trägt sie (`listed`). Karte, Projektliste und Kontowechsel zeigen nur diese Listen;
  `enter_session`, `stop_session`, `resume_session` verweigern, was nicht darin steht. „Wird gestartet…“ trägt `door`.
- S6: `projects::start_with` nimmt das Werkzeug des Projektkontos, sonst das einzige startfähige, sonst Fehler „Which
  tool…?“ (Rückfrage-Dialog erst, wenn es zwei startfähige Werkzeuge gibt). `AssistantState.canStart` (Werkzeug startet
  und tmux da) steuert ▶/＋ und die Tagesliste. „Claude usage“ u. a. über den Werkzeugnamen.
- S8 (Teil): Vorschau mit `?tool=minimal`: zweites Werkzeug ohne Start, Desktop und Live-Zustand, Sitzung F „Config
  keys“ (unter „Früher“, weil ohne Live-Zustand): nur Terminal und Beenden, kein ▶. Der Mock rechnet die Türen mit
  `mockWays` nach.
- Geändert: Beim Kontowechsel werden nur noch eigene Sitzungen beendet, die gerade nicht arbeiten (wie an der Karte);
  eine arbeitende läuft mit dem alten Konto zu Ende.

**Umsetzung G3 (2026-11-20):**
- S7: `codedeck --toggle` (über den Socket an die laufende Instanz, `hub::toggle`; ohne laufende startet CodeDeck mit
  der Startseite). Unter Wayland: keine Fensterposition (`window::place` setzt nur die Größe, `show` keine alte
  Stelle), kein X11-Aktivieren (`activate_as_pager`), Icon-Fehler sind keine Fehler. Hilfe (F1) und „Erkannt auf
  diesem Rechner“ nennen den Befehl zum Binden (`Platform.toggleCommand`, mit Pfad des Programms).
  Der Hinweisdialog „CodeDeck unter Wayland“ ist inzwischen im Willkommensfenster aufgegangen (Entscheidung 4).
  Vorschau: `?view=welcome&platform=wayland`.
- S8: Konformitätstest `translate_gives_every_kind_of_event` über `Harness::samples()` (nur Tests); Doku
  `docs/KONZEPT.md` 2.8 „So kommt ein Werkzeug dazu“; das Beispiel-Werkzeug der Vorschau kam mit G2.
- Echt geprüft (xvfb, eigene Konfiguration): zweiter Aufruf mit `--toggle` erreicht die laufende Instanz in 0,2 s,
  die Startseite erscheint. Auf Wayland nicht geprüft: ob der Compositor CodeDeck dabei wirklich nach vorn lässt
  (R3); sonst zeigt er nur „möchte Aufmerksamkeit“.
