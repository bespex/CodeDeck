# Entscheidungsnotiz: ein Prozess je Fenster oder einer für alle (D25)

Stand 2026-11-16, Entwurf zur Entscheidung durch den Nutzer. Anlass: Review „Steht die Architektur?“. Die
Fensterfunktionen von 2.1c (globale Kürzel) brauchten schon ein eigenes Protokoll zwischen den Prozessen, und
MVP 3 (Startseite, Konten, Profile) braucht noch mehr Austausch zwischen den Fenstern.

## Kurz

**Empfehlung: Option B, ein Prozess mit mehreren Fenstern.** Umsetzung als eigener Schritt nach der Testsession
und vor MVP 3, am besten direkt vor oder mit 2.5. Aufwand: etwa ein bis zwei Sessions. Die Kernlogik (`Inner`,
Git, Snapshots, Adapter) bleibt, umgebaut wird die Verdrahtung. Vorher sollte der gemeinsame Einstellungsspeicher
stehen (Review B2), weil er dieselben Stellen berührt.

## Wie es heute ist

- **Jedes Fenster ist ein Prozess.** `open_window` startet das eigene Programm neu, in einer eigenen
  Prozessgruppe. Jeder Prozess hat genau ein Fenster mit dem festen Namen `main`.
- **Der Zustand gilt je Prozess global:**
  - `Current` (das Projekt) kommt in 15 Commands vor, `Bridge` (Sitzungen, Anhänge, Fundstücke, Journal) in 9.
  - Dazu `Watch`, `Git`, `TitlePrefix`, `FullPlace` und `Shortcuts`.
  - Die 20 Ereignisse an das Frontend gehen an „die App“, also an das eine Fenster.
- **Hooks:** `codeck hook` schickt jede Meldung an **alle** Sockets im Runtime-Ordner. Jedes Fenster entscheidet
  in `take_in`, ob sie sein Projekt betrifft. Antworten mehrere, werden doppelte Texte entfernt.
- **Austausch zwischen den Fenstern** bisher über drei Wege:
  - Botschaften über die Sockets (`{"window": …}`, für die globalen Kürzel);
  - Dateien im Runtime-Ordner (`front`, `last-used` für die Kürzel, `turns.json` für den Neustart);
  - gemeinsame Dateien in `~/.config/codedeck`. Diese werden atomar ersetzt; vorher wird neu gelesen und nur das
    eigene Projekt geändert.
- **Doppelte Arbeit:** Jedes Fenster liest beim Start die Logs aller Konfigurationen und prüft regelmäßig seinen
  Git-Status. Das ist richtig, weil jedes nur sein Projekt kennt, kostet aber mit vielen Fenstern mehr.

### Was heute schon klemmt

- **Einstellungen gelten nur im Fenster, in dem sie geändert wurden.** Sprache (`localStorage`) und Meldungen
  (`attention.json`, beim Start gelesen) erfahren die anderen Fenster erst nach einem Neustart. Ein Beispiel:
  Schaltet man in Fenster A „Runde fertig“ ab, meldet Fenster B sie weiter. Das lässt sich unabhängig von dieser
  Entscheidung schnell beheben (auf die Datei achten bzw. auf das Ereignis `storage`), siehe unten.
- **Globale Kürzel:** Das erste Fenster hält sie und gibt sie per Socket an die anderen weiter. Die anderen
  versuchen alle 15 s, sie zu übernehmen. Wer vorn ist, steht in Dateien. Das funktioniert, ist aber die
  fehleranfälligste Stelle von 2.1c.

## Was kommt und Austausch braucht

| Schritt | braucht |
|---|---|
| „Wartet“ aus anderen Projekten (Review A4) | die Zahlen aller Fenster |
| 3.2 Konten | dieselbe Liste der Konten und Farben in jedem Fenster |
| 3.3 Steuern (tmux) | eine Stelle, die Sitzungen startet und den Überblick behält |
| 3.4 Profile | mehrere Projekte auf einmal öffnen, „falsches Konto“ projektübergreifend erkennen |
| 3.5 Startseite | Sitzungen und „Wartet auf dich“ **aller** Projekte, ein Klick springt ins richtige Fenster |
| Einstellungen | Änderungen wirken sofort in allen Fenstern |
| Später: Tray (be-spex-Familie, PocketTray) | ein Symbol für alle Projekte, auch ohne offenes Fenster |

## Die Optionen

### A: bei Prozessen bleiben, Austausch ausbauen

Jede Funktion über Fenstergrenzen bekommt Botschaften über die Sockets oder gemeinsame Dateien. Für die
Startseite fragt ein eigenes Fenster alle anderen ab, oder jedes Fenster meldet seinen Stand in eine Datei.

- **Dafür:** kein Umbau. Ein Absturz trifft nur ein Fenster. Was heute läuft, bleibt, wie es ist.
- **Dagegen:**
  - Jede neue Funktion bringt eigene Botschaften, Wettläufe und „wer ist zuständig“ mit, wie bei den Kürzeln.
  - Die Startseite wäre ein Sonderfall, weil sie zu keinem Projekt gehört und darum nirgends ihren Zustand hat.
  - Die doppelte Arbeit bleibt.
  - Einstellungen müssen über Dateien abgeglichen werden.

### B: ein Prozess, mehrere Fenster (Empfehlung)

Tauri kann mehrere Fenster in einem Prozess. Der Zustand wird **je Fenster** geführt, statt global zu gelten.

- **Projekt je Fenster:** `Windows: HashMap<Fensterlabel, Fenster>`, darin Projekt, `Inner`, Watch und
  Git-Ansicht. Ein Command bekommt das aufrufende `WebviewWindow` und sucht sein Fenster heraus. Ereignisse gehen
  mit `emit_to` an das Fenster, das sie betreffen.
- **Ein Socket für alle Hooks.** `codeck hook` schickt eine Meldung einmal, der Prozess verteilt sie an die
  Fenster der passenden Projekte. Das doppelte Entfernen entfällt.
- **Zweiter Aufruf** `codeck <ordner>`: Der laufende Prozess öffnet ein neues Fenster
  (`tauri-plugin-single-instance` oder eine Botschaft über den Socket). „Neues Fenster“ wird zu
  `WebviewWindowBuilder`.
- **Globale Kürzel** gehören dem einen Prozess. Halter, 15-s-Übernahme, `front` und `last-used` entfallen
  (`window.rs` wird etwa 150 Zeilen kürzer). Wer vorn ist, weiß der Prozess aus den Fokus-Ereignissen seiner
  Fenster.
- **Startseite** ist ein weiteres Fenster (Label `start`), das den Zustand aller Projekte im selben Prozess liest.
- **Einstellungen:** einmal im Prozess; eine Änderung geht als Ereignis an alle Fenster.
- **Gemeinsames einmal:** Logs der Konfigurationen, Konten, Fundstücke- und Identitätsdateien. Git-Status bleibt
  je Projekt.

Abwägung:

- **Dafür:**
  - Die Funktionen von MVP 3 werden gewöhnlicher Code statt Protokoll.
  - Die fehleranfällige Abstimmung der Kürzel verschwindet.
  - Weniger doppelte Arbeit.
  - Die Startseite ist kein Sonderfall.
- **Dagegen:**
  - **Ein Absturz nimmt alle Fenster mit.** Im Release steht `panic = "abort"`. Gegenmittel: Panics in Threads
    abfangen statt `unwrap()` auf Sperren (heute 17-mal `lock().unwrap()` in `bridge.rs`). Die laufenden Runden
    überleben einen Neustart schon (`turns.json`).
  - Umbau der Verdrahtung, siehe Aufwand.
  - **Entwicklung:** Eine Dev-Version und die installierte Version müssen nebeneinander laufen. Dafür braucht es
    getrennte Socket-Namen je Programm. Das Erkennen von „meldet an ein anderes CodeDeck“ gibt es schon.

### C: Hintergrunddienst und Fenster als Gäste

Ein Dienst (`codeck daemon`) hält Hooks, Sitzungen, Journal, Kürzel und Meldungen für alle Projekte; Fenster sind
nur Ansichten.

- **Dafür:** am mächtigsten. Meldungen und Kürzel wirken auch ohne offenes Fenster. Tray und Startseite fallen
  von selbst ab.
- **Dagegen:** der größte Umbau (Dienst, Anmeldung beim Login, Protokoll zwischen Dienst und Fenstern). Für einen
  Nutzer heute zu viel. B lässt sich später zu C ausbauen, wenn der Prozess nach dem letzten Fenster im
  Hintergrund weiterläuft.

## Aufwand für B

| Teil | Änderung |
|---|---|
| `lib.rs` (etwa 50 Commands) | `State<Arc<Current>>` usw. → das Fenster des Aufrufers; `set_title` je Fenster |
| `bridge.rs` | Socket und Verteilung einmal; `Inner` je Projekt (bleibt, wie es ist, und bleibt testbar) |
| `watch.rs`, `git.rs` | je Fenster bzw. je Projekt statt global |
| `hook.rs` | ein Socket statt aller; Spur bleibt |
| `window.rs` | Abstimmung zwischen Prozessen entfällt; Kürzel und „vorn“ im Prozess |
| `open_window`, Start | neues Fenster statt neuer Prozess; zweiter Aufruf öffnet im laufenden |
| Frontend | fast nichts: Es spricht weiter mit „seinem“ Backend; Einstellungen hören auf das Ereignis |
| Tests | `Inner`-Tests bleiben; neu ein Test für die Verteilung an mehrere Projekte |

Etwa ein bis zwei Sessions, ohne neues Verhalten. Danach prüft ein Praxistest Mehrfenster, Kürzel und Hooks.

## Unabhängig davon, sofort

Einstellungen in allen Fenstern gleich halten (siehe „Was heute schon klemmt“): Die Sprache hört auf das
`storage`-Ereignis, die Meldungen achten auf `attention.json` (Watch oder Abfrage bei Fokus). Das ist klein und
geht auch bei Option A. Bei B wird es später durch das Ereignis im Prozess ersetzt.

## Fragen an den Nutzer

1. **Option B** (ein Prozess) als nächster großer Schritt vor MVP 3? Vorschlag: ja.
2. **Letztes Fenster geschlossen:** Programm beenden (wie heute) oder im Hintergrund weiterlaufen lassen, damit
   Kürzel und Meldungen wirken (Weg zu C)? Vorschlag: vorerst beenden, Hintergrund später mit dem Tray.
3. **Absturz trifft alle Fenster:** in Kauf nehmen, mit den Gegenmitteln oben? Vorschlag: ja.
4. **Zeitpunkt:** nach der Testsession, vor 2.3 oder erst vor MVP 3? Vorschlag: nach der Testsession, zusammen
   mit dem Einstellungsspeicher, dann 2.3.
