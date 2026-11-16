# Praxistest Seitenleiste (2.1c), Fundstücke und Links (2.2)

Stand: nach Diagnose und Journal (2026-11-16). Geprüft wird in der echten App mit echten Claude-Code-Sitzungen
im Terminal (die Desktop-App feuert keine Hooks, siehe Notiz zu 1.1 im Plan). Die Bezeichnungen sind die deutschen
der Oberfläche.

**So benutzen:** Jeden Punkt abhaken (`[x]`), wenn er wie erwartet funktioniert. Wenn nicht: Kästchen leer lassen
und unter **Befund** aufschreiben, was stattdessen passiert ist, mit Uhrzeit. Bei allem, was mit Sitzungen,
Fenstern oder Kürzeln zu tun hat: direkt danach `⋯` → **Diagnose kopieren** und unter den Befund einfügen. Bewusst
übersprungen: `[-]`.

Was CodeDeck nebenbei mitschreibt, liegt im **Journal** (`~/.local/state/codedeck/journal/<Projektpfad>.jsonl`,
der genaue Pfad steht in der Diagnose): jedes Ereignis der Sitzungen mit Uhrzeit. Es hilft beim Nachvollziehen und
ist das Material für die Zeitleiste in 2.3.

---

## 0. Vorbereitung

- [ ] CodeDeck aus dem Repo starten: `./dev`
- [ ] Ein Testprojekt öffnen, das ein Git-Repo ist; Claude verbunden (Schnelleinstellungen → KI-Werkzeug)
- [ ] `⋯` → **Diagnose kopieren**, irgendwo einfügen: Version mit Commit, `x11`, Verbindungen, „Global shortcuts:
      Ctrl+Alt+C here, Ctrl+Alt+L here“ (bei „taken“: ein anderes Programm hält das Kürzel, bitte notieren)
- [ ] Eine neue Claude-Code-Sitzung im Terminal im Projektordner starten

Befund:

---

## 1. Seitenleiste im Fenster

- [ ] Knopf ganz rechts in der Kopfleiste (Tooltip „Seitenleiste · Strg+Umschalt+L“): das Fenster wird zur schmalen
      Leiste (400 px) **am rechten Rand seines Bildschirms**, über die volle Höhe, ohne Flackern auf einem anderen
      Bildschirm; auch aus dem maximierten Fenster
- [ ] Oben die Übersicht: Branch mit offenen Dateien, Runden mit letztem Snapshot, Hinweise/Scratch/„woanders
      abgelegt“ (nur wenn es welche gibt); darunter Wartet auf dich, Sitzungen, Nächster Prompt, Statusleiste
- [ ] Knopf (jetzt „Volles Fenster“) oder `Strg+Umschalt+L`: volles Fenster **an derselben Stelle und Größe** wie vorher
- [ ] Dasselbe aus einem **maximierten** Fenster: zurück kommt es wieder maximiert
- [ ] Breite der Leiste mit der Maus ändern, zurück aufs volle Fenster, wieder zur Leiste: die neue Breite bleibt
- [ ] In der Leiste: Klick auf eine Zeile der Übersicht, auf „Öffnen“ beim Nächsten Prompt oder auf eine geschriebene
      Datei an einer Sitzung: volles Fenster, passender Reiter bzw. Datei ausgewählt
- [ ] In der Leiste: Schnelleinstellungen, `⋯`, Projektmenü, `Strg+,` (Einstellungen) und `F1` sind bedienbar und
      passen in die Breite
- [ ] Eine Sitzung fragt um Erlaubnis, während die Leiste neben dem Terminal steht: Eintrag unter „Wartet auf dich“
      leuchtet auf

Befund:

---

## 2. Globale Kürzel

- [ ] CodeDeck ist zu sehen, ein anderes Programm hat den Fokus: `Strg+Alt+C` blendet CodeDeck aus
- [ ] Noch einmal `Strg+Alt+C`: CodeDeck ist wieder da, in derselben Form (Leiste oder voll), **mit Fokus**
- [ ] Ausgeblendet, dann über die Taskleiste geholt: der nächste Druck blendet wieder aus
- [ ] Aus einem anderen Programm `Strg+Alt+L`: CodeDeck kommt nach vorn und wechselt die Form; noch einmal: zurück
- [ ] Einstellungen → Allgemein → „Globale Tastenkürzel“ zeigt beide ohne Warnung

**Mit zwei Fenstern** (zweites Projekt über `⋯` → Neues Fenster oder `Strg+Umschalt+O`):

- [ ] `Strg+Alt+C`: beide verschwinden; noch einmal: beide kommen, vorn das zuletzt benutzte
- [ ] `Strg+Alt+L` wirkt auf das zuletzt benutzte Fenster
- [ ] Das **erste** Fenster schließen, 15 Sekunden warten: im verbliebenen wirken beide Kürzel weiter

Befund:

---

## 3. Woanders abgelegt

- [ ] Die Sitzung bitten: „Schreib eine kurze Notiz nach /tmp/codedeck-test.md“ (Write). Nach dem Schreiben:
      Reiter Werkbank zählt eins mehr, oben die Kachel **Woanders abgelegt** mit Pfad, Uhrzeit und Sitzung
- [ ] Die Sitzung bitten, per Shell zu schreiben: „Führe `echo hallo > /tmp/codedeck-shell.txt` aus“: erscheint
      ebenfalls
- [ ] „In den Scratch-Ordner“: die Zeile zeigt „Kopiert nach .scratch/…“, die Kopie steht im Scratch-Ordner,
      das Original liegt noch in `/tmp`; die Zahl am Reiter sinkt
- [ ] Öffnen (Pfeil) und „Im Dateimanager zeigen“ (Ordner) funktionieren
- [ ] Vergessen (×): Zeile verschwindet, die Datei bleibt
- [ ] Die Sitzung eine Datei in einem **anderen Git-Repo** schreiben lassen: erscheint **nicht**
- [ ] Datei in `/tmp` löschen: Zeile verschwindet beim nächsten Ereignis von selbst
- [ ] Fällt etwas auf, das nicht hingehört (Dateien anderer Programme, Konfiguration)? Notieren

Befund:

---

## 4. Veröffentlichte Seiten

- [ ] Die Sitzung eine Seite veröffentlichen lassen (z. B. ein Artefakt oder ein Gist). Am Ende der Runde nennt
      sie den Link (Startregel); danach steht er unter **Veröffentlichte Seiten** mit Titel, Adresse, Uhrzeit und
      Sitzung
- [ ] Öffnen im Browser, Link kopieren, Vergessen
- [ ] Ein gewöhnlicher Link in einer Antwort (Doku, Crate) erscheint **nicht**

Befund:

---

## 5. Nach einem Neustart

- [ ] CodeDeck schließen und wieder öffnen: Woanders abgelegtes und veröffentlichte Seiten sind noch da
- [ ] Diagnose kopieren: der Pfad des Journals steht darin; die Datei enthält die Ereignisse des Tests

Befund:
