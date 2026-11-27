# Praxistest Vorarbeit MVP 3: Ort der Sitzung, Desktop, Remote Control nach Neustart

Geprüft wird in der echten App (frischer Build, `/shared/cargo-target/debug/codedeck`) mit echten Claude-Code-Sitzungen.
Jeden Punkt abhaken (`[x]`); wenn etwas nicht stimmt oder anders ist als erwartet, unter **Befund** aufschreiben,
mit Uhrzeit, dazu `⋯` → **Diagnose kopieren**. Teil 2 und 3 sind Erkundungen: Es gibt kein „falsch“, gesucht ist,
was tatsächlich passiert. Die Ergebnisse entscheiden die Fragen 2 und 7 in `docs/SITZUNGEN.md` („Zu entscheiden“).

Vorbereitung: ein Testprojekt (z. B. dieses), in CodeDeck geöffnet, Hooks verbunden. Die Sitzungs-ID einer
Sitzung steht im Log-Pfad bzw. in `claude --resume`; die Remote-ID im Link (`session_…`).

## 1. Ort der Sitzung (gebaute Vorarbeit)

- [ ] `tmux new -s cd-test -c <projekt>`, darin `claude --remote-control "CD Test"`, einen Prompt schicken: Die
      aufgeklappte Sitzung zeigt unten „tmux cd-test“ und „von überall erreichbar“
- [ ] Tooltip auf „tmux cd-test“ nennt `tmux attach -t cd-test`; Klick auf „von überall erreichbar“ öffnet die
      Sitzung auf claude.ai im Browser
- [ ] In derselben Sitzung `/remote-control` ausschalten (bzw. trennen), dann einen Prompt: „von überall
      erreichbar“ verschwindet, „tmux cd-test“ bleibt
- [ ] Eine Sitzung in einem normalen Terminal ohne tmux: weder „tmux“ noch „erreichbar“ in den Details
- [ ] Spürbare Verzögerung beim Prompt durch den Hook? (erwartet: nein)

Befund:

## 2. Claude Desktop (Erkundung, Frage 2)

Mit der Remote-Sitzung „CD Test“ aus Teil 1 (wieder verbunden), Desktop im Profil des passenden Kontos.

- [ ] Zeigt Claude Desktop unter „Code“ die Remote-Sitzung „CD Test“? Lässt sie sich dort bedienen, während das
      Terminal offen bleibt? Kommt ein Prompt aus Desktop in CodeDeck an (Status „arbeitet“)?
- [ ] `claude-desktop --user-data-dir=<profil> "claude://claude.ai/code/<session_…>"`: öffnet die Sitzung direkt?
      Nur die App? Eine Fehlerseite?
- [ ] Zum Vergleich `"claude://code/needs-input"` und `"claude://code/continue?session=last"`: was zeigen sie?
- [ ] Mit `xdg-open "claude://…"` statt des Profils: landet der Link im anderen Profil?
- [ ] `claude --desktop --continue` (laut Doku nicht für Linux): Fehlermeldung oder öffnet es doch etwas?

Befund:

## 3. Remote Control nach einem „Neustart“ (Erkundung, Frage 7)

`tmux kill-server` ersetzt den Neustart des Rechners (beendet alle tmux-Sitzungen hart). Vorher die Sitzungs-ID
von „CD Test“ notieren.

- [ ] Nach `tmux kill-server`: Wie steht „CD Test“ in der Claude-App bzw. auf claude.ai (getrennt, verschwunden)?
      Und in CodeDeck (Status bleibt stehen, „ended“)?
- [ ] `tmux new -s cd-test -c <projekt>`, darin `claude --resume <id> --remote-control "CD Test"`: Verbindet es die
      alte Remote-Sitzung wieder (gleiche `session_…` im Link)? Meldung „Previous session is unavailable“? Hängt es?
- [ ] Dasselbe nach einer Pause von mindestens 30 Minuten (oder am nächsten Morgen): Ergebnis gleich?
- [ ] Wieder `tmux kill-server`, dann `claude --resume <id> --fork-session --remote-control "CD Test"`: neue
      `session_…`? Zeigt die Claude-App die **ganze** bisherige Unterhaltung?
- [ ] Geht `--fork-session` zusammen mit `--session-id <neue-uuid>`, und trägt die Sitzung dann diese ID?
- [ ] Mitten in einer laufenden Runde `tmux kill-server`, dann fortsetzen: kommt Claude Code sauber zurück
      (keine Fehlermeldung zu halben Werkzeugaufrufen)? Zeigt Changes den Sicherungspunkt der abgebrochenen Runde?
- [ ] Eine verbundene Sitzung, Rechner in den Ruhezustand und wieder wach: verbindet Remote Control von selbst?
- [ ] Wie sieht eine Trennung im Log aus? (`~/.claude…/projects/<projekt>/<id>.jsonl`, Ende der Datei; die Zeile
      hier einfügen)

Befund:

## 4. Offene Praxistests aus MVP 2

Erledigt: Beide gelten laut `docs/UMSETZUNG.md` als bestanden (2026-11-17), hier nur nicht abgehakt.

- [x] **2.3d:** Nach mehreren Runden steht höchstens eine Desktop-Meldung je Sitzung da; die Zahl in der Taskleiste
      passt zu „Wartet auf dich“
- [x] **2.3e:** Ein Ordner ohne Git zeigt keinen Trail, sondern „No git repository“ mit `git init`; ein Klick macht
      ihn zum Repository, der Trail erscheint

Befund:

## 5. Schritt 3.3 Steuern (gebaut 2026-11-17/18)

- [ ] Übersicht, ▶ an einem Projekt: Die Zeile „Wird gestartet …“ steht sofort da (nicht erst nach Sekunden), mit
      „startet“; meldet sich die Sitzung, wird sie zur normalen Sitzungszeile
- [ ] Eine Sitzung, die eine Frage stellt (Ordner noch nicht vertraut): nach etwa 20 s „fragt vielleicht“
- [ ] Projektfenster, Sitzung in tmux aufklappen: Zeile „Gestartet mit“ zeigt `claude …`, der Tooltip den ganzen
      tmux-Befehl; Kopieren-Symbol daneben, der kopierte Befehl startet von Hand dieselbe Sitzung
- [ ] Sitzungskarte überfahren: Werkzeugleiste rechts in der dritten Zeile (Desktop, Terminal | Neu starten,
      Beenden | `⋯`), keine Zeile ändert ihre Höhe, nur ein Tooltip je Symbol; Tooltip von Beenden nennt den Stoppbefehl; `⋯` und Rechtsklick: Umbenennen,
      Startbefehl kopieren, Aus der Liste nehmen (ausgegraut, solange sie läuft)
- [ ] Rechte Spalte ganz schmal ziehen: die Angaben der aufgeklappten Karte stehen je Zeile, nichts bricht Wort für
      Wort um
- [ ] Übersicht, Sitzung überfahren → Kopieren-Symbol: Startbefehl in der Zwischenablage, Meldung unten
- [ ] Neu starten und Beenden an einer tmux-Sitzung (nicht während sie arbeitet); die Unterhaltung bleibt
- [ ] Einstellungen → Allgemein → „Tagesliste: Mit CodeDeck starten“ an, CodeDeck beenden und neu starten: Projekte der Tagesliste ohne
      laufende Sitzung starten von selbst, die Übersicht meldet „Gestartet: …“
- [ ] Dasselbe, während eine Sitzung der Tagesliste ruhig in einem Terminal läuft (keine Runde): Sie wird **nicht**
      ein zweites Mal gestartet
- [ ] Gestartete Sitzung in Claude Desktop bedienbar (Doppelklick auf die Sitzung)

Befund:

## 6. Schritt 3.5 Bei der Anmeldung (gebaut 2026-11-18)

- [ ] Einstellungen → Allgemein → „Bei der Anmeldung: Im Tray“: `~/.config/autostart/codedeck.desktop` entsteht und
      startet das laufende Programm mit `--tray`; „Aus“ entfernt die Datei
- [ ] Ab- und wieder anmelden: CodeDeck läuft im Tray, kein Fenster; Linksklick auf das Tray-Symbol zeigt die
      Übersicht am rechten Rand
- [ ] Mit „Tagesliste: Mit CodeDeck starten“: nach dem Anmelden laufen die Sitzungen der Tagesliste (Remote Control
      kurz nach der Anmeldung prüfen: das Netz ist dann oft noch nicht da, `SITZUNGEN.md` B8)
- [ ] `codedeck --tray`, während CodeDeck schon läuft: nichts passiert, kein zweites CodeDeck
- [ ] Eintrag von einem anderen Build (z. B. Paket statt Dev-Binary): der Dialog nennt das Programm

Befund:
