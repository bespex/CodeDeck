# CodeDeck & Claude: Grundprinzip, Hebel und Ausbauphasen

> **Leitlinie dieses Konzepts:** Fokus auf *Benutzung, Bedienung und echten Mehrwert* im Arbeitsalltag (Programmierung, Konzeption, Dokumentation) – bewusst ohne technische Implementierungsdetails, aber realistisch vorgeprüft auf Machbarkeit in den Komplexitätsstufen **S** (klein/schnell), **L** (substanziell) und **XL** (anspruchsvoll).

## 1. Das Grundprinzip der Zusammenarbeit

Wenn Entwickler heute ausschließlich im KI-Chat (Claude Desktop oder Terminal) arbeiten, entsteht fast immer dasselbe Problem: **Der Tunnelblick des Zeitstroms.** Ein Chat verläuft linear von oben nach unten – je länger eine Sitzung dauert, desto schwerer wird es zu überblicken, was die KI gerade verändert hat, welche Dokumente entstanden sind und wie viel Kontingent noch übrig ist.

Das Grundprinzip von **CodeDeck** lautet daher **Arbeitsteilung zwischen Zeitstrom und Fokus-Schaltstelle**:

* **Die KI-Engine (Claude & andere Harnesses) arbeitet im *Zeitstrom*:** Sie führt Dialoge, plant Schritte, schreibt Code und Dokumente und setzt Änderungen direkt um (**Optimistic Flow**).
* **CodeDeck ist das *stille Radar* und die *Kommunikationsstelle für den Fokus*:** Es zeigt unaufdringlich den aktuellen Zustand des Projekts (letzte Dokumente, betroffene Module, Token-Kontingent) und delegiert das Anzeigen und Editieren konsequent an spezialisierte externe Apps (**Unix-Ensemble**). CodeDeck ist ausdrücklich **keine Editierfläche** für Dokumente oder Code.
* **Null-Ballast-Regel:** Standardmäßig arbeitet die KI frei und ohne vorab geschnürtes Kontext-Paket. Kontext wird nur dann mitgegeben, wenn du ihn bewusst und optional als Fokus setzt.

## 2. Die fünf Themenfelder der Konzeption

Um CodeDeck systematisch zu durchdenken, gliedert sich das Produkt in fünf klar getrennte Handlungsfelder:

1. **Fokus, Kontingent & Schnellsteuerung:** Wie behalte ich meinen Tokenverbrauch im Blick, wechsle mühelos das Modell, schalte bei Bedarf Remote Control zu und gebe der KI nur dann gezielten Fokus, wenn es nötig ist?
2. **Makro-Sicht & Architektur-Verständnis:** Wie erkenne ich nach einer KI-Aktion sofort die Auswirkungen auf das Gesamtsystem, bevor ich mich in Codezeilen verliere?
3. **Dokumenten-Übersicht & Marker-gestützte Redaktion:** Wie behalte ich den Überblick über neu entstandene Ergebnisdokumente, öffne sie in externen Editoren/Viewern und beauftrage die KI mit dort gesetzten Kommentar-Markern?
4. **Sicherheit, Zeit & Parallelität:** Wie bleibe ich im schnellen *Optimistic Flow*, springe bei Irrwegen risikofrei zurück und behalte parallel laufende KI-Sessions im Blick?
5. **Unix-Ensemble & Offenheit:** Wie greifen spezialisierte Einzelwerkzeuge (z. B. `marq`, `jayq`, `xaq`, `hyqe`, `dirq`) und verschiedene KI-Harnesses nahtlos ineinander?

## 3. Die größten Hebel für den Benutzer

Die folgenden sieben Hebel erzeugen den größten praktischen Mehrwert – von schnellen Alltags-Helfern bis zu neuen architektonischen Einblicken:

### Hebel A: Optionaler Fokus & Minimal-Kontext `[Komplexität: S]`
* **Bedienung:** Im Normalbetrieb arbeitet die KI ganz ohne zusätzliches Kontext-Paket aus CodeDeck. Nur wenn du eine Aufgabe gezielt eingrenzen möchtest, wählst du im Dashboard (oder aus einem Spezial-Viewer heraus) optional einzelne Dateien, Dokumente oder Ausschnitte als Fokus aus. Es gibt bewusst keine automatischen oder „intelligenten“ Kontext-Vorschläge, die ablenken.
* **Mehrwert:** Kein Pflegeaufwand vor dem Prompten, kein Kontext-Ballast – und volle Kontrolle in den Momenten, in denen du die KI bewusst auf eine Stelle lenken willst.

### Hebel B: Architektur-Drill-Down & „Blast-Radius“-Radar `[Komplexität: L]`
* **Bedienung:** Statt dich mit 20 geänderten Dateien auf einmal zu erschlagen, zeigt dir CodeDeck auf Paket- und Modulebene eine ruhige Landkarte. Nach jedem Durchlauf der KI leuchtet im Radar auf, welche Module verändert wurden und welche Nachbarbereiche davon abhängen. Per Klick zoomst du von der Paket-Übersicht in die betroffene Datei und übergibst den Diff bei Bedarf an `dirq`.
* **Mehrwert:** Du behältst die Architekten-Perspektive, während das Radar still im Hintergrund mitläuft.

### Hebel C: Dokumenten-Radar & Marker-Redaktion (via Unix-Ensemble) `[Komplexität: S]`
* **Bedienung:** CodeDeck listet die zuletzt erzeugten oder geänderten Ergebnisdokumente (Pläne, Konzepte, Spezifikationen) übersichtlich auf. Da CodeDeck selbst keine Editierfläche ist, öffnest du das Dokument mit einem Klick in deiner externen App (z. B. `marq` oder deinem Editor), kommentierst dort direkt im Text mit **festgelegten Markern** (z. B. `<!-- @ai: ... -->` oder `[!AI: ...]`) und beauftragst die KI über das Dashboard, diese Marker zu lesen und einzuarbeiten. Wo sinnvoll, stehen zudem einfache Freigabe-Optionen bereit.
* **Mehrwert:** Du arbeitest beim Lesen und Kommentieren in deinen vertrauten, schnellen Linux-Werkzeugen, während CodeDeck die Rückkopplung zur KI und den Status der Dokumente zusammenhält.

### Hebel D: Parallel-Spuren für gleichzeitige KI-Sessions `[Komplexität: L]`
* **Bedienung:** Wenn du mehrere Aufgaben parallel vorantreibst (z. B. ein Feature in Claude Desktop, einen schnellen Fix im Terminal und einen mobilen Auftrag von unterwegs), zeigt CodeDeck jede laufende Aufgabe als eigene „Spur“ an. Du siehst auf einen Blick, wo die KI gerade arbeitet und welche Dokumente/Module dort berührt wurden.
* **Mehrwert:** Klare Orientierung über parallele Arbeitsstränge ohne gedankliches Chaos.

### Hebel E: Visuelle „Time Machine“ im Optimistic Flow `[Komplexität: L]`
* **Bedienung:** Im **Optimistic Flow** setzt die KI ihre Änderungen direkt um, damit du ohne Reibung vorankommst. Vor größeren Eingriffen setzt CodeDeck im Hintergrund automatisch einen sichtbaren Ankerpunkt auf einer vertikalen Zeitleiste. Gefällt dir eine Richtung nach mehreren Schritten nicht, springst du per Klick auf einen früheren Punkt zurück – ganz ohne Git-Befehle eintippen zu müssen.
* **Mehrwert:** Maximale Arbeitsgeschwindigkeit durch Optimistic Flow bei gleichzeitigem Sicherheitsnetz.

### Hebel F: Convenient-Cockpit für den Alltag `[Komplexität: S]`
* **Token- & Zeitfenster-Monitor:** Zeigt deinen aktuellen Tokenverbrauch in **Prozent der jeweiligen Zeitfenster** an und warnt rechtzeitig bei Knappheit, bevor du mitten in einer Aufgabe ausgebremst wirst.
* **1-Klick-Modellwahl:** Schnelles Umschalten zwischen den verfügbaren Modellen (z. B. Sonnet, Opus, Haiku) direkt aus dem Dashboard heraus.
* **Remote-Control-Schalter (`/rc`):** Ein direkter Schalter im Dashboard, um Remote Control einzuschalten, wenn du den Arbeitsplatz verlässt und mobil weiterarbeiten möchtest.
* **Unix-Ensemble-Launcher:** Öffnet JSON, XML, Markdown, HTML, TSX oder Diffs sofort in der passenden Spezial-App (`jayq`, `xaq`, `marq`, `hyqe`, `dirq`, TSX-Viewer) und nimmt markierte Stellen bei Bedarf als optionalen Fokus entgegen.

### Hebel G: Austauschbare KI-Steckplätze (Harness-Offenheit) `[Komplexität: XL]`
* **Bedienung:** Claude (Desktop, CLI, Remote) ist das Herzstück, aber CodeDeck behandelt die KI-Engine als austauschbaren Steckplatz. Perspektivisch lässt sich für einzelne Aufgaben oder Gegenprüfungen auch ein anderer KI-Harness einhängen.
* **Mehrwert:** Zukunftssicherheit ohne Lock-in und die Möglichkeit, verschiedene KI-Stärken gezielt zu kombinieren.

## 4. Konzeptionelle Leitentscheidungen & Abgrenzung

Für die Ausgestaltung der Bedienung sind die vier zentralen Weichenstellungen wie folgt festgelegt:

| Gestaltungsfrage | Verworfene / Zurückgestellte Alternative | Festgelegte Linie für CodeDeck |
| :--- | :--- | :--- |
| **1. Rolle im Alltag** | Schweres, dauerhaft steuerndes Aktions-Cockpit für jeden einzelnen Arbeitsschritt. | **Stilles Radar zuerst.** CodeDeck beobachtet im Hintergrund; aktive Eingriffe beschränken sich zunächst auf die gezielten Convenient-Funktionen (Token-Monitor, Marker-Auftrag, Remote Control, Modellwahl). |
| **2. Umgang mit KI-Änderungen** | **Vorschlags-Paket (Gatekeeper):** Jede Code-Änderung wird vor dem Schreiben auf die Platte blockiert und einzeln abgenickt. | **Optimistic Flow.** Änderungen werden direkt angewendet; Rücksprünge erfolgen über die Zeitleiste. Einfache Freigabe-Optionen werden nur dort ergänzt, wo sie bei Dokumenten sinnvoll und leicht umsetzbar sind. |
| **3. Zusammenstellung des Kontexts** | **Intelligente Kontext-Vorschläge** oder ein verpflichtender Kontext-Warenkorb vor jedem Prompt. | **Optional, ansonsten ohne Kontext.** Intelligente Vorschläge sind ausgeschlossen. Ohne Auswahl arbeitet die KI frei; Kontext wird nur bei Bedarf manuell gesetzt. |
| **4. Fenster-Philosophie** | **All-in-One-Editor:** Anzeigen und Bearbeiten von Dokumenten und Code direkt in CodeDeck. | **Unix-Ensemble.** Das Dashboard zeigt die letzten Dokumente an, delegiert Anzeige und Bearbeitung an externe Apps (`marq`, `jayq`, `xaq`, `hyqe`, `dirq`, Editor) und bleibt reine Kommunikations- und Fokus-Schaltstelle. |

## 5. Ausbauphasen: Vom stillen Radar zur KI-Schaltstelle

Der Aufbau gliedert sich in fünf logische Stufen, die jeweils sofort nutzbaren Mehrwert liefern:

### Phase 1: Stilles Radar, Dokumenten-Übersicht & Convenient-Steuerung `[Komplexität: S]`
* **Ziel:** Sofortige Übersicht und praktische Alltagshilfen neben Claude Desktop – ohne Eingriff in den gewohnten Schreibfluss.
* **Passiv (Stilles Radar):**
  * Öffnen eines Projekts ohne Einrichtung (ein Ordner genügt).
  * Übersicht der zuletzt erzeugten oder geänderten Dokumente und Dateien (inkl. Live-Markierung berührter Dateien).
  * Öffnen von Dokumenten und Spezialformaten in externen Apps (`marq`, `jayq`, `xaq`, `hyqe`, `dirq`, Editor) – keine eigene Editierfläche in CodeDeck.
  * Optionales Setzen von Fokus/Kontext (ansonsten arbeitet die KI ohne Kontext-Vorgabe).
* **Aktiv (Erste Ausbaustufe):**
  * **Token- & Zeitfenster-Monitor:** Einsicht in den aktuellen Tokenverbrauch (in Prozent der Zeitfenster) inklusive rechtzeitiger Warnung bei Knappheit.
  * **Marker-Kommentierung & KI-Auftrag:** Erkennen von festgelegten Kommentar-Markern in extern bearbeiteten Ergebnisdokumenten und 1-Klick-Beauftragung an die KI, diese Marker zu lesen und umzusetzen (ggf. ergänzt um einfache Dokument-Freigaben).
  * **Remote Control (`/rc`) Schnellschalter:** Aktivieren von Remote Control direkt aus dem Dashboard für mobiles Arbeiten von unterwegs.
  * **Modell-Umschalter:** Schnelle, unkomplizierte Auswahl des gewünschten KI-Modells.
  * **Convenient-Bedienung:** Schlanke Schnellaktionen (z. B. Fokus-Übergabe, Schnellstart/Sprung in die aktive Session).

### Phase 2: Erweiterte Dokumenten-Workflows & Freigabe-Schritte `[Komplexität: S–L]`
* **Ziel:** Den Redaktions- und Abstimmungsprozess zwischen externen Editoren und der KI weiter verfeinern.
* **Was der Benutzer bekommt:**
  * Übersicht offener und erledigter Kommentar-Marker über alle aktuellen Ergebnisdokumente hinweg.
  * Leichtgewichtige Freigabe-Optionen für Dokumente (z. B. *Entwurf → In Prüfung → Freigegeben*) als klares Signal für die KI.
  * Gepinnte Projekt-Entscheidungen, die dauerhaft als Leitplanke hinterlegt bleiben.

### Phase 3: Architektur-Drill-Down & Visuelle Time Machine `[Komplexität: L]`
* **Ziel:** Vom Zeilen-Denken in die Architekten-Perspektive wechseln und den *Optimistic Flow* mit einem schnellen Rücksprung absichern.
* **Was der Benutzer bekommt:**
  * Automatische Paket- und Modul-Landkarte des Projekts mit live leuchtendem **Blast Radius** nach KI-Änderungen.
  * Stufenloser Drill-Down: *Modul-Karte ➔ Datei-Übersicht ➔ Diff (intern oder extern in `dirq`)*.
  * Vertikale **Time Machine** am Rand zum Vergleichen und Zurückspringen zwischen KI-Schritten im *Optimistic Flow*.

### Phase 4: Multi-Session-Radar & Parallel-Spuren `[Komplexität: L]`
* **Ziel:** Mehrere parallel laufende KI-Sessions (Desktop, Terminal, Remote-Aufträge) mühelos überblicken.
* **Was der Benutzer bekommt:**
  * Übersichtliche Spur-Leiste für alle aktiven Aufgaben im Projekt (inkl. Status: *arbeitet*, *wartet*, *fertig*).
  * 1-Klick-Umschalten zwischen parallelen Worktrees/Arbeitssträngen und direkter Vergleich zweier Lösungsansätze.
  * Nahtlose Sichtbarkeit von Remote-Läufen, die nach dem Aktivieren von `/rc` von unterwegs gestartet wurden.

### Phase 5: Harness-Offenheit & Zweitmeinungs-Workflows `[Komplexität: XL]`
* **Ziel:** Zukunftssichere Offenheit für weitere KI-Werkzeuge und optionale Gegenprüfungen.
* **Was der Benutzer bekommt:**
  * Konfigurierbare KI-Steckplätze pro Spur (Claude als Standard, weitere CLI-/Agent-Harnesses zuschaltbar).
  * **„Second-Opinion“-Knopf:** Lässt einen zweiten KI-Agenten ein Ergebnisdokument oder einen Architektur-Umbau kritisch gegenprüfen.

---

## 6. Integrations-Architektur: Wie CodeDeck und die KI kommunizieren

Damit CodeDeck als **stilles Radar** und **Fokus-Schaltstelle** funktioniert, ohne die Arbeitsweise von Claude Desktop oder Claude Code CLI zu verbiegen, basiert die Kopplung auf einem **asymmetrischen, losen Integrationsmodell**. Beide Systeme bleiben eigenständig und tauschen nur genau die Signale aus, die für Übersicht, Steuerung und Fokus notwendig sind.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       KI-ENGINE (Claude Desktop / CLI)                  │
│   Dialog • Planung • Tool-Ausführung • Subagents • Remote Control (/rc) │
└───────────────┬─────────────────────────────────────────▲───────────────┘
                │                                         │
   (A) KI ➔ CodeDeck                         (B) CodeDeck ➔ KI
   • Session- & Plan-Dateien (~/.claude/)    • MCP-Server (Pull bei Bedarf)
   • Datei- & Git-Änderungen (Optimistic)    • Marker-Aufträge (<!-- @ai: -->)
   • Token-/Zeitfenster-Telemetrie           • Optionaler Fokus & Doc-Status
   • Optionale Hook-/MCP-Signale             • Modellwahl & /rc-Steuerung
                │                                         │
                ▼                                         │
┌─────────────────────────────────────────────────────────────────────────┐
│                     CODEDECK (Fokus- & Radar-Cockpit)                   │
│   Dokumenten-Liste • Token-Monitor • Marker-Trigger • Zeit-Ankerpunkte  │
└───────────────┬─────────────────────────────────────────▲───────────────┘
                │                                         │
                └──────► UNIX-ENSEMBLE (IPC-Socket) ◄─────┘
                         marq • jayq • xaq • hyqe • dirq • Editor
```

### 6.1 Integration von KI in CodeDeck (`KI ➔ CodeDeck`)

Hier geht es darum, wie CodeDeck erfährt, was die KI gerade tut, welche Dokumente entstanden sind und wie es um das Kontingent steht – **ohne** dass du etwas manuell pflegen musst.

#### Was ist notwendig?
1. **Ein gemeinsamer Blick auf den Arbeitsbereich:** CodeDeck muss Zugriff auf den Projektordner, die Git-Historie und das lokale Laufzeitverzeichnis der KI (z. B. `~/.claude/`) haben.
2. **Kein Eingriff in den Schreibfluss:** Da der *Optimistic Flow* gilt, fängt CodeDeck keine Datei-Writes ab, sondern registriert sie verzögerungsfrei im Hintergrund.
3. **Telemetrie-Quelle für Kontingente:** Zugriff auf die laufenden Session-Protokolle und Rate-Limit-Informationen, um den Tokenverbrauch in Prozent der Zeitfenster darzustellen.

#### Wie kommunizieren sie und was wird übertragen?

| Kanal | Mechanismus | Was wird konkret übertragen? |
| :--- | :--- | :--- |
| **1. Laufzeit- & Session-Beobachtung** *(Passiv)* | Live-Überwachung der KI-Metadaten (z. B. `~/.claude/plans/`, Session-Logs `.jsonl`, aktive Worktrees) | • Neu erzeugte oder aktualisierte Pläne & Konzeptdokumente<br>• Aktiver Session-Status (*arbeitet*, *wartet*, *bereit*) & aktives Modell<br>• Parallele Spuren / Worktrees (ab Phase 4) |
| **2. Projekt- & Git-Radar** *(Passiv)* | Dateisystem-Überwachung + Git-Status-Abgleich im Hintergrund | • Liste der zuletzt geänderten Dokumente und Code-Dateien<br>• Betroffene Pakete/Module (für den Blast-Radius in Phase 3)<br>• Automatische Sicherungspunkte vor größeren KI-Läufen (Time Machine) |
| **3. Token- & Zeitfenster-Monitor** *(Passiv)* | Auswertung der Verbrauchs-Metadaten aus Session-Logs & API-/Plan-Limits | • Verbrauchter Anteil in **Prozent** je Zeitfenster (z. B. Kurzzeit-Fenster & Wochen-Kontingent)<br>• Schwellenwert-Warnung bei drohender Knappheit |
| **4. Ereignis-Signale der KI** *(Optional aktiv)* | Leichtgewichtige KI-Hooks (z. B. nach Abschluss eines Laufs) oder MCP-Benachrichtigung | • Signal *„Ergebnisdokument X ist bereit zur Durchsicht“*<br>• Hinweis, falls die KI eine Rückfrage oder Freigabe benötigt |

---

### 6.2 Integration von CodeDeck in die KI (`CodeDeck ➔ KI`)

Hier geht es darum, wie deine aktiven Steuerimpulse aus CodeDeck (Kommentar-Marker, Modellwahl, Remote Control, optionaler Fokus) sauber in die KI-Engine gelangen – unter strikter Wahrung der **Null-Ballast-Regel**.

#### Was ist notwendig?
1. **Abruf-Schnittstelle nach dem Pull-Prinzip:** Die KI holt sich Informationen aus CodeDeck nur dann, wenn sie danach gefragt wird oder ein Auftrag aus CodeDeck angestoßen wurde.
2. **Definierte Marker-Konvention:** Eine eindeutige, maschinenlesbare Syntax für Kommentare in Ergebnisdokumenten (z. B. `<!-- @ai: Bitte Abschnitt 2 präzisieren -->` in Markdown/HTML oder `[!AI: ...]` in Texten), damit die KI Anweisungen sicher vom restlichen Text trennt.
3. **Steuerkanal zur Session-Verwaltung:** Möglichkeit, der laufenden KI-Session Modellwechsel, Remote-Control-Aktivierung (`/rc`) oder einen gezielten Arbeitsauftrag zu übergeben.

#### Wie kommunizieren sie und was wird übertragen?

| Kanal | Mechanismus | Was wird konkret übertragen? |
| :--- | :--- | :--- |
| **1. Marker-Auftrag** *(Aktiv – Phase 1)* | CodeDeck scannt das gewählte Dokument nach Kommentar-Markern und sendet einen kompakten Arbeitsauftrag an die KI (via Session-Bridge / MCP / Zwischenablage-Handoff) | • Dateipfad des Ergebnisdokuments<br>• Extrahierte Liste aller offenen `@ai`-Kommentare samt Absatzbezug<br>• Anweisung, die Marker einzuarbeiten und nach Erledigung als abgeschlossen zu kennzeichnen |
| **2. CodeDeck MCP-Server** *(Pull bei Bedarf)* | Lokaler Model Context Protocol (MCP) Server, der in Claude Desktop / CLI eingebunden ist | • `get_focus()`: Liefert **nur dann** Dateien/Snippets, wenn du explizit einen optionalen Fokus gesetzt hast (sonst leer)<br>• `get_markers(file)`: Liefert offene Kommentare und den Freigabe-Status eines Dokuments |
| **3. Session- & Convenient-Steuerung** *(Aktiv – Phase 1)* | Direkte Steuerung der CLI-/Desktop-Konfiguration bzw. Session-Kommandos | • **Remote Control (`/rc`):** Startet/aktiviert den Remote-Tunnel für die aktuelle Session<br>• **Modell-Umschalter:** Setzt das gewünschte Modell für den nächsten Lauf<br>• **Dokument-Status:** Übergibt Freigaben (*Entwurf* vs. *Freigegeben*, Phase 2) |
| **4. Projekt-Leitplanke** *(Statisch/Leichtgewichtig)* | Kompakter Hinweisblock in `CLAUDE.md` (oder Harness-Instruktion) | • Erklärt der KI die Marker-Syntax (`<!-- @ai: ... -->`), die Bedeutung freigegebener Dokumente und die vorhandenen CodeDeck-MCP-Werkzeuge |

---

### 6.3 Zusammenspiel mit dem Unix-Ensemble (`marq`, `jayq`, `xaq`, `hyqe`, `dirq`)

Da CodeDeck bewusst **keine Editierfläche** ist, bildet ein lokaler **Unix Domain Socket** die Brücke zwischen dem Dashboard und deinen Spezial-Werkzeugen:

1. **Öffnen aus dem Dashboard:** Ein Klick auf ein Dokument oder eine Datei startet das passende Werkzeug (`marq` für Markdown, `jayq` für JSON, `xaq` für XML, `hyqe` für HTML, `dirq` für Diffs oder deinen Standard-Editor) und übergibt den Socket-Pfad.
2. **Kommentieren & Fokus zurückmelden:**
   * In Markdown/Text setzt du im externen Editor deine `@ai`-Marker und speicherst – CodeDeck erkennt die neuen Marker sofort automatisch über den File-Watcher und aktiviert den Button **„Marker an KI übergeben“**.
   * In Struktur-Viewern (`jayq`, `xaq`, `hyqe`) kannst du bei Bedarf einen einzelnen Knoten markieren und per Tastenkürzel über den Socket als **optionalen Fokus** an CodeDeck senden.

---

### 6.4 Umsetzung entlang der Ausbauphasen (Architektur-Fahrplan)

Um die Komplexität gering zu halten und sofort in **Phase 1 (`S`)** arbeitsfähig zu sein, werden die Integrations-Bausteine schrittweise zugeschaltet:

| Ausbauphase | Integrations-Bausteine (`KI ↔ CodeDeck`) | Technischer Fokus |
| :--- | :--- | :--- |
| **Phase 1** `[S]` | • **File-Watcher** auf Projektordner & `~/.claude/` (letzte Dokumente & Marker-Erkennung)<br>• **Token-Monitor** (Auslesen der Zeitfenster-Prozente & Warnlogik)<br>• **Convenient-Bridge** (Marker-Auftrag an KI, `/rc`-Schalter, Modell-Umschalter, App-Launcher) | Rein lokale Datei-/Log-Auswertung + direkte Session-Übergabe ohne komplexe Dauerverbindungen. |
| **Phase 2** `[S–L]` | • **CodeDeck MCP-Server (Basis)** für `get_markers()` und Dokument-Freigabestatus<br>• Projektweite Aggregation offener/erledigter `@ai`-Marker | Standardisierte Rückkopplung zwischen Dokumenten-Redaktion und Claude Desktop. |
| **Phase 3** `[L]` | • **Git-Timeline-Engine** (automatische Vorher/Nachher-Ankerpunkte im Optimistic Flow)<br>• **Paket-Abhängigkeits-Scanner** für das Blast-Radius-Radar + `dirq`-Integration | Git-Metadaten und Modul-Struktur werden mit den KI-Änderungsläufen verknüpft. |
| **Phase 4** `[L]` | • **Multi-Session- & Worktree-Tracker** (Erkennen paralleler Sessions in Desktop, CLI & `/rc`) | Zuordnung von Dateien, Tokenverbrauch und Status zu einzelnen parallelen Spuren. |
| **Phase 5** `[XL]` | • **Abstrakter Harness-Adapter** (einheitliche Schnittstelle für Claude, Codex CLI, OpenCode, Aider) | Entkopplung von Claude-spezifischen Pfaden hin zu austauschbaren KI-Steckplätzen. |