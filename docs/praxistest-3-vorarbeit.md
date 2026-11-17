# Praxistest Vorarbeit MVP 3: Ort der Sitzung, Desktop, Remote Control nach Neustart

Geprüft wird in der echten App (frischer Build, `/shared/cargo-target/debug/codeck`) mit echten Claude-Code-Sitzungen.
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

- [ ] **2.3d:** Nach mehreren Runden steht höchstens eine Desktop-Meldung je Sitzung da; die Zahl in der Taskleiste
      passt zu „Wartet auf dich“
- [ ] **2.3e:** Ein Ordner ohne Git zeigt keinen Trail, sondern „No git repository“ mit `git init`; ein Klick macht
      ihn zum Repository, der Trail erscheint

Befund:
