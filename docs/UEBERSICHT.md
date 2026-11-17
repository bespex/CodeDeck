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

## Gestaltungsgrundsätze (Nutzer, 2026-11-17)

Die Übersicht ist der Ort für alles, was man projektübergreifend oder ohne ein bestimmtes Projekt schnell
tun will. Damit dort viel Platz findet, ohne unübersichtlich zu werden:

1. **Auf einen Blick, ohne zu suchen:** was auf mich wartet; welche Projekte und Sitzungen gerade laufen
   und in welchem Zustand; welche Projektfenster offen sind. Nur das steht dauerhaft sichtbar da.
2. **Ein Klick für das Häufige:** zur Sitzung (Desktop, sonst Terminal), Projektfenster nach vorn, Frage
   beantworten, Projekt der Tagesliste starten, Projekt öffnen.
3. **Gelegentliches nimmt keinen Platz weg:** Werkzeugleiste aus Icons oben, Aktionen, die erst beim
   Überfahren einer Zeile erscheinen, Menüs hinter einem Icon, Tooltips statt Text. Dazu gehören Git-Zustand,
   Nächster Prompt, Werkbank, Verbrauch, „im Hintergrund“, alle Projekte, Einstellungen.
4. **Ruhig, bis etwas ist:** keine Zahlen oder Chips im Ruhezustand. Ein Punkt oder ein Wort erscheint erst,
   wenn es etwas bedeutet (Frage, Runde fertig, Git-Fehler), in den Farben, die überall gelten.
5. **Wenige Abschnitte:** „Wartet auf dich“ (nur wenn etwas wartet) und eine Liste der Projekte. Was weder
   offen ist noch läuft noch auf der Tagesliste steht, erscheint nur über die Werkzeugleiste.

## Aufbau

Von oben nach unten:

| Bereich | Inhalt |
|---|---|
| **Werkzeugleiste** | nur Icons: ▶ Tagesliste starten (mit Menü: „beim Start von CodeDeck“, Liste bearbeiten), ＋ Projekt öffnen (Suche über alle Projekte und Ordner), Einstellungen, `⋯` (Verbrauch, im Hintergrund, About, Quit) |
| **Wartet auf dich** | nur wenn etwas wartet: Karten wie heute (`docs/STYLING.md` B4b) mit der Marke des Projekts. Doppelklick führt zur Sitzung (Desktop, sonst Terminal; Mittelklick Terminal), Klick auf die Marke holt das Projektfenster |
| **Projekte** | eine Liste: zuerst die mit offenem Fenster, dann die mit laufender Sitzung, dann die übrigen der Tagesliste |

**Zeile eines Projekts:** Marke, Name; ein kleines Fenster-Symbol, wenn sein Fenster offen ist (Projekte ohne
Fenster sind leicht zurückgenommen); rechts nur ein Statuspunkt, wenn etwas ist (bernstein fragt, grün fertig,
rot Git-Fehler). Beim Überfahren erscheinen Icons für Git, Nächster Prompt und Werkbank (Tooltip mit dem
Zustand, Klick öffnet den Reiter im Projektfenster) und ▶ für ein Projekt der Tagesliste ohne Sitzung. Klick
auf die Zeile holt das Fenster nach vorn bzw. öffnet das Projekt.

**Darunter die Sitzungen**, einzeilig: Schild, Titel, Status als farbiges Wort. Beim Überfahren erscheinen
rechts die Türen (Desktop, Terminal) statt des Zuhause-Symbols. Doppelklick und Mittelklick wie oben, Klick
öffnet die Details der Sitzung im Projektfenster. Ein Projekt ohne laufende Sitzung hat keine Sitzungszeilen.

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

## Marke je Projekt

Jedes Projekt bekommt eine **Marke**: einen Kreis in seiner Farbe, darauf ein Zeichen (Nutzer 2026-11-17).
Sie steht überall dort, wo der Projektname steht, und macht Projekte auf einen Blick unterscheidbar.

- **Zeichen**, frei wählbar im Dialog „Mark for …“ (Klick auf die Marke):
  - **Icons:** alle Lucide-Icons (rund 2.000, schon im Programm, gleicher Stil wie die Oberfläche),
    weiß auf der Projektfarbe, mit einer Vorauswahl von etwa 70 passenden. **Suche** über Namen und die
    Schlagwörter, die Lucide zu jedem Icon pflegt (`tags.json` aus `lucide-static`, etwa 550 KB, nur zur
    Laufzeit der Suche gebraucht): Wortanfänge statt Teilwörter (sonst findet „car“ auch „card“), Treffer im
    Namen vor Treffern in den Schlagwörtern, kürzere Namen zuerst. Deutsche Wörter über eine Liste von
    Übersetzungen der häufigsten Begriffe (im Dummy etwa 80). Gemessen: „bill“, „chat“, „weather“,
    „health“ finden über den Namen nichts, über die Schlagwörter 30 bis 40 passende Icons;
  - **Emoji:** kuratierte Gruppen ohne Smileys (Technik, Natur, Tiere, Orte, Dinge, Essen, Symbole), auf
    der Projektfarbe, aufgehellt;
  - **Buchstabe:** der erste des Projektnamens. Das ist die Vorgabe für jedes neue Projekt.
- **Farbe:** aus einer Palette passend zu den Themes; Vorgabe aus dem Pfad, damit Projekte von Anfang an
  verschieden aussehen.
- **Wo sie erscheint:** Fenster-Icon in der Taskleiste (mit dem Statuspunkt), Kopf der rechten Spalte im
  Projektfenster, Übersicht (Blöcke, Today, Other projects, Projektname an den Karten von „Wartet auf
  dich“), Projektmenü, Desktop-Meldung (als deren Icon).
- **Emoji auch im Titel:** Ein gewähltes Emoji steht zusätzlich vorn im Fenstertitel (`📚 docs-site ● 1
  asking`). So hilft es auch, wo die Taskleiste Fenster unter einem Icon gruppiert.
- **Gespeichert** je Projekt in `~/.config/codedeck/projects.json` (dieselbe Datei wie die Tagesliste, B12).
- **Technik:** Die Oberfläche zeichnet das Fenster-Icon (Kreis, Lucide-SVG oder Emoji mit der
  System-Schrift, Statuspunkt) auf eine Zeichenfläche und gibt die Pixel an das Backend (`set_window_icon`);
  Rust kann keine Schrift und keine SVGs zeichnen. `icon.rs` aus dem Spike entfällt dann bis auf die
  Vorgabefarbe.
- **Zu bedenken:** Die Schilder der Sitzungen sind ebenfalls farbige Kreise mit Buchstaben (A, B, …).
  Damit Projekt und Sitzung nicht verwechselt werden, ist die Marke etwas größer und trägt standardmäßig den
  Buchstaben fett; Alternative: Marke als abgerundetes Quadrat (Entscheidung 8).

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
| 7 | Marke je Projekt | **Richtung abgestimmt (Nutzer 2026-11-17):** Kreis in der Projektfarbe mit Lucide-Icon, Emoji oder Buchstabe; überall, wo der Projektname steht; Emoji auch im Titel |
| 8 | Form der Marke | Kreis (Wunsch des Nutzers). In der App sind die Schilder der Sitzungen abgerundete Quadrate (`SessionBadge`), Kreis und Quadrat unterscheiden sich also schon; im Dummy waren beide Kreise |
