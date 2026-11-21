# Dateispalte und Aufräumen der Werkbank: Vorschläge

Stand 2026-11-21, auf Wunsch des Nutzers vor dem Handbuchkapitel 9 „Dateien und Commit“. Das hier ist eine
Auswahlliste, kein beschlossener Plan: Der Nutzer wählt, was gebaut wird; danach wandert es als Schritt in
`PLAN.md`. Maßstab sind die beiden Grundsätze aus `KONZEPT.md` (Sehen, Einfach bedienen), die Regel „kein Editor“
(Dateien öffnen in eigenen Programmen und den Qiew-Betrachtern) und „keine reinen X11-Funktionen“.

## Teil A: Aufräumen in der Werkbank

### Was es heute gibt

Die Kachel Scratch-Ordner hat einen Knopf „n älter als 7 Tage löschen“ (in den Papierkorb), dazu Papierkorb je Datei
und je Ordner. Das Alter ist der einzige Maßstab.

### Woran man erkennt, was vermutlich weg kann

CodeDeck weiß über jede Datei in `.scratch/` mehr als ihr Alter:

| Anhaltspunkt | Woher | Spricht für |
|---|---|---|
| Alter, letzte Änderung | Dateisystem (`WorkFile.modified`) | weg, je älter |
| Größe | Dateisystem | weg (große Logs, Messdaten) |
| Schreibende Session und ob sie beendet ist | Journal (`after_write`), Sessions | weg, wenn die Session längst beendet ist |
| Seit dem Ende der Session nicht mehr geändert | Journal + Dateisystem | weg |
| Vom Nutzer gesehen (nicht mehr „neu“) | `news.ts` | weg eher als Ungesehenes |
| Liegt inzwischen gleich im Projekt (übernommen, aber kopiert statt verschoben) | Inhaltsvergleich, neu | weg |
| Art der Datei: Logs, Mess- und Testausgaben, Bildschirmfotos (`*.log`, `*.csv`, `*.png` in `shots/`) | Name, Endung | weg, entsteht neu |
| Art der Datei: Entwürfe und Skripte (`*.md`, `*.html`, `*.py`, `*.sh`) | Name, Endung | prüfen, oft wertvoll |
| Angehängt oder gerade offen | Anhänge, Sessions | behalten |
| Von einer laufenden Session in dieser Runde geschrieben | Sessions | behalten |

### Vorschlag: „Aufräumen…“ statt „älter als 7 Tage“ (gebaut 2026-11-21, Praxistest offen)

Ein Knopf **Aufräumen…** in der Kachel öffnet eine Liste in drei Gruppen, jede mit Grund und Größe:

1. **Kann weg** (angehakt): von beendeten Sessions, seit Tagen unverändert und gesehen; reine Ausgaben (Logs,
   Messdaten, Bildschirmfotos); Dateien, die gleich schon im Projekt liegen.
2. **Prüfen** (nicht angehakt): Entwürfe und Skripte beendeter Sessions; je Datei Ansehen mit einem Klick.
3. **Bleibt** (nur gezählt): Neues, Ungesehenes, Angehängtes, was laufende Sessions schreiben.

Unten „n Dateien (x MB) in den Papierkorb“. Alles geht in den Papierkorb, nichts wird endgültig gelöscht. Optional:
ein Hinweis in der Kachel, sobald „Kann weg“ eine Schwelle überschreitet („12 Dateien, 40 MB können vermutlich weg“).

Aufwand: mittel. Neu sind der Inhaltsvergleich mit dem Projekt und die Zusammenführung der Anhaltspunkte; alles
andere ist da.

Umgesetzt so: `src/tidy.ts` (`tidyOf`, erste zutreffende Regel entscheidet: angehängt, Session arbeitet, ungesehen,
heute geändert → bleibt; gleich im Projekt, Ausgabe → kann weg; Entwurf oder Skript → erst ansehen; älter als
7 Tage, Session beendet und seitdem unverändert → kann weg; sonst erst ansehen), `scratch.rs` `twins` (gleicher
Name und gleiche Bytes, ohne Build-Ordner, höchstens 20 000 Dateien). Der Knopf „älter als 7 Tage löschen“ ist darin
aufgegangen; der Hinweis auf eine Schwelle in der Kachel ist nicht gebaut.

## Teil B: Die Dateispalte aufwerten

### Was es heute gibt

Baum mit Ordnern zuerst; Filter nur über geöffnete Ordner; Dateien und Ordner mit nicht committeten Änderungen
farbig; Punkt in der Farbe der Session für kürzlich geänderte Dateien (verschwindet nach zwei Minuten); Branch am Ordner
jedes Repositorys mit den Git-Aktionen; Werkzeuge beim Überfahren (Büroklammer, als Projekt öffnen, Dateimanager,
Ansehen, Bearbeiten); Kontextmenü (Dateimanager, Ansehen, Bearbeiten, Ansehen mit…, Bearbeiten mit…); Ziehen aus
der Werkbank; Ziehen auf Nächster Prompt. Nur `.git` ist ausgeblendet: `node_modules`, `target` und andere
ignorierte Ordner stehen gleichrangig im Baum.

### a) Visualisieren

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| A1 | **Ignoriertes gedimmt** (`git status --ignored`), auf Wunsch ausgeblendet | Der Baum zeigt, was zum Projekt gehört; Build-Ordner stören nicht | klein |
| A2 | **Art der Änderung** an der Datei: neu, geändert, gelöscht, umbenannt als kleines Zeichen (wie in Änderungen), gelöschte Dateien bleiben grau sichtbar | Man sieht im Baum, *was* passiert ist, nicht nur *dass* | klein |
| A3 | **Zahl an Ordnern**: Änderungen darin (zugeklappt) | Zugeklappte Ordner verraten, wo gearbeitet wurde | klein |
| A4 | **Wer seit dem letzten Commit geändert hat**: Punkte in den Farben aller Sessions, die die Datei geändert haben, dauerhaft bis zum Commit (statt nach zwei Minuten zu verschwinden); „du“ als eigene Farbe | Mehrere Sessions im Projekt bleiben auseinanderzuhalten | mittel |
| A5 | **Marken für Angehängtes und @ai-Hinweise** an Datei und Ordner (Büroklammer in Ruhe gibt es; Hinweise fehlen) | Was die KI bekommen wird oder tun soll, steht im Baum | klein |
| A6 | **Diese Runde hervorheben**: beim Überfahren einer Runde oder Session (geht schon für Sessions) und dauerhaft für die gewählte Runde in Änderungen | Baum und Deck zeigen dasselbe | klein |

### b) Intuitive Bedienung

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| B1 | **Geänderte Datei → ihr Diff**: Werkzeug „Änderung zeigen“ öffnet den Reiter Änderungen an dieser Datei | Der häufigste Weg nach einer Runde ist ein Klick | klein |
| B2 | **Im Baum zeigen** von überall: aus Änderungen, Sessions, Dokumenten, Werkbank springt der Baum zur Datei und öffnet die Ordner | Man verliert nie den Ort einer Datei | klein |
| B3 | **Tastatur**: Pfeile, Enter = ansehen, Strg+Enter = bearbeiten, Leertaste = anhängen, Strg+F = Filter | Schnell ohne Maus | mittel |
| B4 | **Mehrfachauswahl** (Strg/Umschalt+Klick) für Anhängen, Papierkorb, Pfade kopieren | Mehrere Dateien auf einmal an die KI | mittel |
| B5 | **Kontextmenü erweitern**: Pfad kopieren (relativ, absolut), Umbenennen, Neue Datei/Neuer Ordner, In den Papierkorb, Im Terminal öffnen, Von Git ignorieren (`info/exclude` oder `.gitignore`, mit Nachfrage) | Die kleinen Handgriffe ohne Dateimanager; alles über `Git::execute` bzw. Papierkorb, nichts endgültig | mittel |
| B6 | **Ziehen auf eine Session-Karte**: hängt für genau diese Session an | Ziel und Inhalt in einer Bewegung | klein |
| B7 | **Aus dem Dateimanager hereinziehen**: Datei in einen Ordner des Projekts kopieren, oder als Kopie in `.scratch/` und anhängen (Idee „Externe Dateien anhängen“ aus `PLAN.md`) | Fremdes Material kommt ohne Umweg zur KI | mittel |

### c) Übersicht und Auswertung

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| C1 | **Filter-Chips** über dem Baum: Geändert · Diese Runde · Von Session X · Angehängt · Mit @ai · Neu seit gestern; der Baum zeigt dann nur die Treffer mit ihren Ordnern | Aus hunderten Dateien die fünf, um die es geht | mittel |
| C2 | **Suche über das ganze Projekt** (nicht nur geöffnete Ordner), unscharf wie Strg+P, über `git ls-files` plus Ungetracktes | Datei finden, ohne den Ort zu kennen | mittel |
| C3 | **Ordner-Steckbrief beim Überfahren**: Dateien, Größe, Änderungen, letzte Änderung, beteiligte Sessions, geschätzte Tokens | Vor dem Anhängen sehen, was ein Ordner kostet | klein |
| C4 | **Verlauf einer Datei** im Deck: wann welche Runde, Session oder welcher Commit sie geändert hat (Journal + `git log --follow`), je Eintrag der Diff | „Was ist mit dieser Datei passiert?“ in einer Ansicht | mittel |
| C5 | **Brennpunkte**: die in den letzten Tagen am häufigsten geänderten Dateien (Journal), als Liste oder Wärme im Baum | Sieht, wo die KI ständig umbaut | mittel |

### d) Neue Funktionen

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| D1 | **Eine Datei zurücksetzen** auf den Stand eines Snapshots oder Commits (statt das ganze Projekt), vorher Snapshot der Gegenwart | Die KI hat eine Datei verdorben, der Rest der Runde ist gut: der häufigste Fall | mittel |
| D2 | **Datei mit Snapshot/Commit vergleichen** aus dem Kontextmenü (Auswahl aus dem Verlauf der Datei) | Gezielt nachsehen, ohne den Trail zu durchsuchen | klein (mit C4) |
| D3 | **Favoriten**: angeheftete Ordner und Dateien oben in der Spalte, je Projekt | In großen Projekten die drei Orte, an denen man arbeitet | klein |
| D4 | **Anhang-Vorlagen**: eine Auswahl von Dateien als benannte Gruppe merken („API-Kontext“) und mit einem Klick anhängen | Wiederkehrender Kontext ohne Sammeln | mittel |
| D5 | **Aus dem Projekt in den Scratch-Ordner** (Gegenstück zum Hineinziehen): Kopie zum Experimentieren | Die KI probiert an einer Kopie | klein |

### Empfehlung

Zuerst, weil klein und sofort spürbar: **A1** (Ignoriertes gedimmt), **A2/A3** (Art der Änderung, Zahl an Ordnern),
**B1** (Datei → Diff), **B2** (Im Baum zeigen), **C3** (Ordner-Steckbrief). Danach der größte Nutzen für die Arbeit
mit der KI: **D1** (eine Datei zurücksetzen) mit **C4/D2** (Verlauf und Vergleich), dann **C1/C2** (Filter und Suche)
und **B5** (Kontextmenü). Teil A (Aufräumen…) lässt sich unabhängig davon bauen.

Nicht vorgeschlagen, weil gegen die Regeln: Dateien in CodeDeck bearbeiten (kein Editor), eigene Vorschau-Ansicht
für Dateiinhalte im Deck (dafür sind die Qiew-Betrachter da), Funktionen, die nur unter X11 gehen.

## Beschlossen 2026-11-21 (Nutzer): erster Schritt der Dateispalte, gebaut 2026-11-21 (Praxistest offen)

Umgesetzt wie unten beschrieben, mit diesen Abweichungen: Beim Überfahren Stift (Bearbeiten), Büroklammer und ⋯
(Nutzer: Mittelklick ist nicht offensichtlich); in Änderungen ebenso, „Im Baum zeigen“, Ansehen, Dirq und Verwerfen
im ⋯. „Wichtig“ als farbiges Band hinter der Zeile und fetter Name. Verzeichnis in den Papierkorb fragt als Untermenü
nach. Gelöschte Dateien stehen grau und durchgestrichen im Baum.

- **Begriff „Ausblenden“** (nicht „ignorieren“, das gehört zu Git): Kontextmenü „Ausblenden“ / „Wieder einblenden“ für
  Verzeichnisse und Dateien. Liste je Projekt (Vorschlag: eigene Datei `~/.config/codedeck/files.json`, je Projektpfad
  `hidden` und `important`, damit es auch für Projekte außerhalb der Projektliste geht) plus globale Vorgabeliste.
  `.scratch/` standardmäßig ausgeblendet.
- **Schnelleinstellungen der Dateiliste** (Symbol wie oben links): Von Git Ignoriertes ausblenden · Ausgeblendetes
  abgedunkelt zeigen oder verbergen · Sessions dauerhaft markieren (Punkt verschwindet nicht nach 2 Minuten,
  `RECENT_MS` in `FilesPanel.tsx`) · @ai-Hinweise anzeigen · Trennlinie · Einstellungen… → neuer Bereich
  **„Dateien und Verzeichnisse“** im Einstellungsfenster (globale Ausblendliste, Markierungsdauer). Gilt je Rechner.
  Git-Ignoriertes: `git status` um `--ignored` erweitern (`parse_status` in `git.rs`, Zeilen `! path`).
- **Bedienung:** Doppelklick = Ansehen, Mittelklick = Bearbeiten, Rechtsklick = Kontextmenü. Beim Überfahren nur
  Büroklammer und ⋯ (⋯ = dasselbe Menü wie Rechtsklick). Grundsatz für alle Zeilen: höchstens zwei, drei Werkzeuge,
  immer ⋯ als letztes; Markierungen sparsam, als Zeichen klar, mit Tooltip.
- **Kontextmenü** (gegliedert, `ContextMenu.tsx` braucht Trennlinien): Untermenü **„Pfad“** (relativ kopieren, absolut
  kopieren, Im Dateimanager öffnen, Im Terminal öffnen) · Umbenennen (in der Zeile) · In den Papierkorb (Verzeichnis mit
  Rückfrage) · An nächsten Prompt hängen · Ausblenden/Wieder einblenden · **Wichtig markieren** (keine Symbole, nur eine
  hervorhebende Farbe des Namens). Verzeichnis zusätzlich: Als Projekt öffnen, Neue Datei/Neuer Ordner. Datei mit
  Änderungen zusätzlich: Diff anzeigen (Reiter Änderungen an dieser Datei) und In Dirq öffnen.
  **Nicht** in diesem Schritt: „Von Git ignorieren lassen“ (Git-Aspekte gesondert), Tastenkürzel.
- **„Im Baum zeigen“** im ⋯ jeder Zeile einer Projektdatei (Änderungen, Geschriebene Dokumente, Dateien einer Session,
  Nächster Prompt, @ai-Hinweise): Dateiliste aufklappen, Ordner öffnen, in Sicht scrollen, kurz aufleuchten;
  Ausgeblendetes dabei abgedunkelt zeigen. Werkzeuge in Änderungen auf Büroklammer + ⋯ reduzieren.
- **A2/A3:** Art der Änderung gibt es als Buchstaben schon; neu: gelöschte Dateien grau im Baum, Zahl der Änderungen an
  zugeklappten Ordnern (heute nur gefärbter Name). **C3:** Steckbrief beim Überfahren eines Ordners (Dateien, Größe,
  Änderungen, Sessions, Tokens; `path_stats` gibt es).
- Danach eigener Schritt: D1/D2 (eine Datei auf einen Snapshot zurücksetzen, mit Snapshot vergleichen).
