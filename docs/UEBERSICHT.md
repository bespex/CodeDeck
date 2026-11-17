# Eine Leiste für alle Projekte: die Übersicht

Entwurf vom 2026-11-17 zur Abstimmung, Anlass: Praxistest 3.0 (Nutzer). Click-Dummy:
`design/click-dummy/overview.html` (Aufruf wie in `design/click-dummy/README.md`, dann
`http://localhost:5392/overview.html`). Ersetzt die Leiste je Projekt (`docs/SEITENLEISTE.md`, Form B) und
wird die Startseite aus `docs/SITZUNGEN.md` A13.

## Kurzfassung

Seit 3.0 läuft CodeDeck als ein Prozess mit einem Fenster je Projekt. Mit der Leiste je Projekt hieße das:
drei Projekte, drei Leisten, die man alle im Blick behalten muss. Das widerspricht der Idee einer Leiste.

Stattdessen gibt es **eine Übersicht**: ein schmales eigenes Fenster am rechten Bildschirmrand, für alle
Projekte zugleich, immer verfügbar, auch ganz ohne offenes Projekt. Sie beantwortet die Fragen des Radars:
*Wartet jemand auf mich, egal wo? Was läuft in meinen Projekten? Was starte ich?* Für alles Weitere führt
ein Klick in das Fenster des Projekts. Projektfenster gibt es nur noch als volles Fenster.

## Aufbau

Von oben nach unten:

| Bereich | Inhalt |
|---|---|
| **Kopf** | CodeDeck, „Open folder…“, Einstellungen, App-Menü `⋯` (About, Quit) |
| **Wartet auf dich** | Karten aller Projekte wie heute (`docs/STYLING.md` B4b), jede mit Projektname. Doppelklick führt zur Sitzung (Desktop, sonst Terminal; Mittelklick Terminal), Klick auf den Namen holt das Projektfenster |
| **Offene Projekte** | Ein Block je Projektfenster, siehe unten |
| **Today** | Projekte der Tagesliste ohne offenes Fenster: Status ihrer Sitzung, ▶, „▶ All“, „at start“ (A12) |
| **Other projects** | Die letzten Projekte, zugeklappt; zeigt laufende Sitzungen dort (auch von Hand gestartete) |
| **Fuß** | „3 in background · 3 reachable from anywhere“, Verbrauch als kleine Zahl (öffnet das Popup aus 2.4) |

**Block eines offenen Projekts:**

- Kopfzeile: Farbe oder Emoji des Projekts (dieselbe Marke wie im Fenster-Icon), Name, rechts knapp der
  Zustand: Git (`3 uncommitted · ↑2`, rot bei Fehler), Zahl im Nächsten Prompt, „2 new“ aus der Werkbank.
  Klick holt das Fenster nach vorn, Klick auf eine Zahl öffnet dort den passenden Reiter.
- Darunter die Sitzungen, **einzeilig**: Schild, Titel, Status, Symbol für Zuhause und Bogen. Doppelklick und
  Mittelklick wie oben, Klick öffnet die Details der Sitzung im Projektfenster.
- Zuklappbar; zugeklappt bleibt die Kopfzeile mit einem Statuspunkt.
- Ein Projekt der Tagesliste trägt einen Stern; ohne Fenster steht es unter „Today“.

## Bedienung

- **Zeigen und verbergen:** `Ctrl+Alt+L` (bisher: Leiste umschalten) und ein Knopf in der Kopfleiste jedes
  Projektfensters (ersetzt den Leisten-Knopf). `Ctrl+Alt+C` zeigt oder verbirgt wie heute alle Fenster, die
  Übersicht eingeschlossen.
- **Ort:** am rechten Rand des Bildschirms, auf dem sie zuletzt stand, volle Höhe der Arbeitsfläche, Breite
  ziehbar (wie die Leiste heute, `window.rs` `set_compact` liefert die Platzierung).
- **Start:** `codeck` ohne Ordner öffnet nur die Übersicht. `codeck <ordner>` öffnet das Projekt; ob die
  Übersicht dazu aufgeht, ist eine Einstellung (Vorgabe: ja).
- **Schließen:** Das Programm endet, wenn das letzte Fenster zugeht, die Übersicht eingeschlossen. Wer
  Projektfenster schließt und die Übersicht offen lässt, behält CodeDeck als Radar. Quit im Menü `⋯` beendet
  alles. Später kann das Tray die Übersicht ersetzen, wenn sie zu ist.

## Was im Projektfenster bleibt

Alles, was zum Arbeiten an einem Projekt gehört: die vier Reiter, der Dateibaum, die rechte Spalte mit den
Details der Sitzungen und dem Dashboard des Nächsten Prompts. Die rechte Spalte zeigt nur das eigene
Projekt; „Wartet auf dich“ dort bleibt auf das Projekt beschränkt (anders als in A13 geplant), denn das
Projektübergreifende steht in der Übersicht.

## Was das ändert

| Bisher | Neu |
|---|---|
| Leiste je Projektfenster (`Ctrl+Shift+L`, `Ctrl+Alt+L`) | eine Übersicht; Projektfenster immer voll |
| `SidebarSummary` oben in der Leiste | Kopfzeile des Projekt-Blocks |
| A13: Fenster ohne Projekt wird zur Startseite | die Übersicht ist die Startseite, immer da |
| A13: Projektmenü mit Tagesliste, „Wartet“ über alle im Projektfenster | Projektmenü bleibt klein (letzte Projekte); Projektübergreifendes nur in der Übersicht |

## Technik

- **Fenster `overview`** im selben Prozess, gleiche Oberfläche mit eigenem Einstieg
  (`index.html?view=overview`); kein Projekt, kein `Win`.
- **Zustand aller Projekte:** Command `overview_state` sammelt aus allen `Win` die Sitzungen
  (`Bridge::state`) und eine kleine Zusammenfassung, die jedes Projektfenster selbst meldet (Git, Nächster
  Prompt, Werkbank; `report_summary`), denn das Frontend kennt diese Zahlen schon. Projekte ohne Fenster
  (Tagesliste) kommen mit B12 aus `SITZUNGEN.md` dazu (`Inner` ohne Fenster).
- **Ereignisse:** Jede Änderung, die ein Projektfenster bekommt (`assistant_changed`, Zusammenfassung), geht
  zusätzlich als `overview_changed` an die Übersicht.
- **Sprung:** `focus_project(label)` holt ein Projektfenster nach vorn (`window::obey` mit `Front`) und
  öffnet auf Wunsch einen Reiter oder die Details einer Sitzung (Ereignis an das Fenster).
- **Wiederverwendung:** Platzierung am Rand aus `set_compact`; Karten aus `SessionsPanel`; Zeilen der
  Tagesliste aus dem Dummy `sessions.html`. Weg fallen: Leistenform des Projektfensters (`compact.ts`, Teil
  von `set_compact`), `SidebarSummary` als eigene Kopfzeile.

## Einordnung in den Plan

Vorschlag: neuer Schritt **3.0b Übersicht** gleich nach 3.0, nur mit offenen Projekten (Wartet auf dich,
Blöcke, Sprung ins Fenster, Doppelklick zur Sitzung, sobald 3.1 die Türen bringt; bis dahin nur Sprung ins
Projektfenster). 3.4 hängt dann die Tagesliste und „Other projects“ in die Übersicht, statt eine Startseite
zu bauen. Die Leiste je Projekt wird mit 3.0b entfernt.

## Zu entscheiden

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Eine Übersicht statt einer Leiste je Projekt | ja |
| 2 | `codeck` ohne Ordner | öffnet nur die Übersicht |
| 3 | Übersicht beim Öffnen eines Projekts | geht mit auf (Einstellung) |
| 4 | Programmende | wenn das letzte Fenster zugeht, Übersicht eingeschlossen; Quit im Menü |
| 5 | „Wartet auf dich“ im Projektfenster | nur das eigene Projekt (A13 entsprechend ändern) |
| 6 | Zeitpunkt | 3.0b direkt nach 3.0, vor 3.1 |
| 7 | Marke je Projekt (Farbe oder Emoji) | Farbe als Vorgabe, Emoji wählbar; dieselbe Marke im Fenster-Icon (Spike) und in der Übersicht |
