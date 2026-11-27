# TODO

## Offene Punkte & Prüfungen
<!-- Fragestellungen, offene Entscheidungen und notwendige Abklärungen -->
- [ ] **D13: Erlaubnisfragen aus CodeDeck beantworten** („Allow once“)? Im Dummy gezeigt; berührt D5 (`docs/ENTSCHEIDUNGEN.md`).
- [ ] **Umgang mit dem Git-Index** (Nutzer, 2026-11-19). Heute merkt CodeDeck nie selbst vor; liegt etwas im Index, committet ✓ Commit still nur das (`commitSteps` in `src/git.ts`), sonst vorher `git add -A`; das sagt nur der Tooltip, und das Label „im Index“ täuscht bei teilweise Vorgemerktem (`MM`). Zu klären, bevor gebaut wird:
  1. Ist gezieltes Vormerken ein echter Anwendungsfall, oder reicht „alles committen“ mit klarer Ansage?
  2. Wenn ja, wie flexibel: Klartext in der Commit-Zeile („Nur 2 von 7 im Index“ + „Alle 7 committen“), Auswahl je Datei, oder Vorgemerktes/Nicht vorgemerktes getrennt im Diff (Richtung Stage-Werkzeug, bisher ausdrücklich nicht gewollt)?
  3. Label je Datei: „im Index“ / „teilweise im Index“ mit Feld `unstaged` (Spalte Y) aus `git.rs`.
  4. Dateien, die eine Sitzung vorgemerkt hat: anzeigen, wer es war?

## Geplante Aufgaben & Anpassungen
<!-- Konkrete Features, Refactorings und umsetzbare Arbeitspakete -->
- [ ] **Binärdateien in älteren Änderungen ansehen** (Nutzer, 2026-11-26). In „jetzt“ gebaut (`FileSection` in `ChangesView.tsx`). Offen für Runde, Commit, Snapshot und Vergleich: den Stand aus Git holen (`git show <rev>:<pfad>` über `Git::run`) und als temporäre Datei mit gleicher Endung im Viewer öffnen; neuer Befehl mit Mock in `backend.ts`; Knopf „vorher“, wenn es einen alten Stand gibt; gelöschte Binärdateien zeigen so den alten Stand. Dabei klären, ob der Knopf „Dirq“ Binärdateien aus dem Patch weglässt.
