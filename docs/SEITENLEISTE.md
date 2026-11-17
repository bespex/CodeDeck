# Kurzkonzept: CodeDeck als Seitenleiste

> **Ersetzt 2026-11-17 durch `docs/UEBERSICHT.md`:** Statt einer Leiste je Projektfenster gibt es eine Übersicht für
> alle Projekte (`Ctrl+Alt+L`). Die Leistenform der Projektfenster ist entfernt (Schritt 3.0b (e)); was hier zur
> Platzierung am Rand und zu den Kürzeln steht, gilt für die Übersicht weiter.

Stand 2026-11-16, Idee des Nutzers, Entscheidungen vom selben Tag eingearbeitet. Alle drei Schritte sind gebaut:
C als 2.1a, A als Kopfleiste 2.1b (`docs/KOPFLEISTE.md`), B als 2.1c. Was davon abweicht, steht unter „Gebaut“ am Ende.

## Idee

Ein Tastenkürzel verkleinert das Fenster auf die rechte Spalte, die dann als schmale Leiste neben Claude Code
oder dem Editor steht. Dasselbe Kürzel bringt das volle Fenster zurück, in derselben Größe und an derselben
Stelle. Die Leiste ist kein neues Design, sondern **die rechte Spalte** mit wenigen Anpassungen: oben ein Kopf mit
Menü und einer kleinen Übersicht. Das passt zum „stillen Radar“ (`CLAUDE.md`). Im Alltag reicht meist die
Frage „Wartet jemand auf mich, was geht mit dem nächsten Prompt raus?“. Für alles andere klappt man auf.

## Entscheidungen (Nutzer, 2026-11-16)

| Frage | Entscheidung |
|---|---|
| Immer im Vordergrund? | Nein. Stattdessen zwei Tastenkürzel: eines wechselt zwischen Leiste und vollem Fenster, eines blendet CodeDeck ein und aus (egal in welcher Form) |
| Aufmerksamkeit bei „Wartet auf dich“? | Ja. Wer über Statusänderungen informiert werden will, bekommt sie deutlich angezeigt |
| Kopf der Leiste? | Ein kleines Menü (Projekt, Einstellungen, About, …), darunter eine kurze Übersicht als eigene kleine Komponente. Zu prüfen: Wandert die Projektauswahl auch im vollen Fenster von links oben nach rechts oben? |

## Aufbau

Von oben nach unten, in beiden Formen gleich. Nur die Übersicht gibt es allein in der Leiste:

| Bereich | Inhalt |
|---|---|
| **Kopf** (neu) | Logo, Projektname mit Menü (siehe unten), rechts Knopf „Leiste / Aufklappen“ |
| **Übersicht** (in beiden Formen, seit 2026-11-16) | Komponente `SidebarSummary`, siehe unten |
| Wartet auf dich | unverändert |
| Sitzungen | unverändert |
| Nächster Prompt | Dashboard unverändert |
| **Fuß** (nur in der Leiste) | KI-Werkzeug mit Verbindung (öffnet `HookPanel`), „git“ rot bei Fehler. Im vollen Fenster gilt die Statusleiste wie heute |

Die Grundregel lautet: Alles, was die Leiste selbst zeigt, bleibt dort bedienbar. Jeder Sprung ins Deck oder in
den Dateibaum klappt zuerst auf. Das gilt für „Öffnen“ beim Nächsten Prompt, eine Zahl im Dashboard, eine
geschriebene Datei an einer Sitzung und jeden Eintrag der Übersicht. Dafür reicht eine Stelle: `openView` und
`onShowFile` schalten im Zustand `compact` vorher auf das volle Fenster.

**Was in der Leiste fehlt:**
- Ziehen von Dateien auf „Nächster Prompt“, denn die Quelle ist der Dateibaum. Es käme mit „Externe Dateien
  anhängen“ (PLAN, „Später“) aus dem Dateimanager zurück.
- Hervorheben beim Überfahren einer Sitzung, denn das wirkt auf Trail und Dateibaum.

### Projektauswahl nach rechts oben, auch im vollen Fenster

> Ausgearbeitet in `docs/KOPFLEISTE.md` (2026-11-16): Leiste mit Projekt, Schnelleinstellungen und App-Menü, dazu
> About und Einstellungsdialog. Was hier folgt, ist der erste Gedanke dazu.

Empfehlung: **ja.** Die rechte Spalte ist der Teil, der in beiden Formen bleibt. Steht Projekt und Menü dort,
gibt es eine einzige Stelle dafür, und beim Umschalten springt nichts. Das volle Fenster liest sich dann so:
links „wo“ (Dateien), Mitte „was“ (Deck), rechts „wer und ich“ (Sitzungen, Prompt, App).

- **Links oben** bleibt der Pfad (Brotkrumen, Klick öffnet einen Elternordner) zusammen mit dem Filter. Die
  44 px hohe Kopfzeile bleibt, damit die Linien weiter auf einer Höhe liegen.
- **Rechts oben** steht `ProjectHeader` ohne Pfad: Logo, Projektname, Menü. Das Menü übernimmt alles, was
  heute dort steht, und wird gegliedert:
  - **Projekt:** zuletzt benutzte Projekte, „Ordner öffnen…“ (Ctrl+O), „In neuem Fenster…“ (Ctrl+Shift+O),
    Pfad kopieren.
  - **Ansicht:** Leiste / volles Fenster mit Kürzel, „Kürzel…“ (die beiden globalen ändern).
  - **Benachrichtigungen:** wobei und wie (siehe „Aufmerksamkeit“).
  - **Einstellungen:** Sprache (heute schon im Menü), später die Einstellungsseite (PLAN, „Später“).
  - **Verbindung:** Zustand der Hooks, öffnet das `HookPanel`.
  - **About:** Version, Link zu be spex, Lizenz.
- **Gegenprüfung (Bestand):** Ctrl+O, Ctrl+Shift+O, Ctrl+Klick für ein neues Fenster und der Sprachumschalter
  bleiben erhalten, sie wandern nur mit. Der Kopf der rechten Spalte wird 44 px hoch wie die anderen beiden.

### Übersicht in der Leiste (`SidebarSummary`)

Zwei bis drei kurze Zeilen mit dem, was im vollen Fenster Dateibaum, Trail und Reiter zeigen und in der Leiste
sonst fehlt. Jeder Eintrag ist anklickbar und klappt an die passende Stelle auf:

- **Git:** Branch, Zahl der nicht committeten Dateien (amber) und der nicht gepushten Commits, rot bei einem
  Fehler. Ein Klick öffnet Änderungen.
- **Arbeit der Sitzungen:** wie viele Dateien die laufenden Runden geändert haben, letzter Snapshot mit Uhrzeit.
  Ein Klick öffnet die Runde in Änderungen.
- **Werkbank:** offene `@ai`-Hinweise und neue Dateien in `.scratch/`, nur wenn es welche gibt. Ein Klick öffnet
  die Werkbank.

Die Zahlen liegen schon im Frontend vor (`useGit`, `turns.ts`, `markers.ts`, `scratch.ts`). Die Komponente
setzt sie nur zusammen und braucht kein neues Backend.

## Tastenkürzel

Zwei **globale** Kürzel. Sie wirken auch, wenn CodeDeck nicht den Fokus hat oder ausgeblendet ist, sonst
nützen sie nichts. Dafür kommt das Plugin `tauri-plugin-global-shortcut` dazu, das unter X11 geht (die Sitzung
des Nutzers). Unter Wayland gibt es keine globalen Kürzel für Anwendungen; dort bleiben nur die Kürzel im
Fenster und der Menüeintrag.

| Kürzel (Vorschlag, änderbar) | Wirkung |
|---|---|
| `Ctrl+Alt+C` („CodeDeck“) | **Einblenden/Ausblenden:** Ist CodeDeck verborgen, wird es gezeigt und bekommt den Fokus. Ist es sichtbar, aber hinter anderen Fenstern, kommt es nach vorn. Nur wenn es schon vorn ist, wird es ausgeblendet. So holt ein Druck es immer her, und ein zweiter Druck schickt es weg |
| `Ctrl+Alt+L` („Leiste“) | **Leiste ↔ volles Fenster.** Steht CodeDeck nicht vorn, kommt es zuerst nach vorn |

- **Mehrere Fenster (je Projekt eines):** Einblenden/Ausblenden wirkt auf alle CodeDeck-Fenster gemeinsam.
  Leiste ↔ voll wirkt auf das zuletzt benutzte Fenster.
- **Belegt:** Ist ein Kürzel schon vergeben (der Desktop meldet das beim Registrieren), sagt das Menü es deutlich
  und bietet an, ein anderes zu wählen. Es geht nicht stillschweigend verloren.
- **Im Fenster** gilt zusätzlich `Ctrl+Shift+L` für Leiste ↔ voll, ohne Plugin.

## Aufmerksamkeit

Der Nutzer wählt im Menü unter „Benachrichtigungen“, **wobei** er informiert werden will und **wie**.

**Wobei**, mit Vorschlag für die Voreinstellung:
- eine Sitzung fragt um Erlaubnis (an),
- eine Runde ist fertig (an),
- eine Sitzung ist abgebrochen oder hat einen Fehler gemeldet (an),
- ein Git-Befehl ist fehlgeschlagen (aus).

**Wie**, in Stufen, die sich ergänzen:
1. **Immer, ohne Einstellung:** Der Fenstertitel trägt die Zahl, z. B. „● 2 warten · orbit-api – CodeDeck“. Er
   ist in Taskleiste und Fensterwechsler sichtbar, auch bei einem ausgeblendeten Fenster in der Liste.
2. **Taskleiste:** Das Fenster verlangt Aufmerksamkeit (Tauri `request_user_attention`, unter X11 das
   Urgent-Flag, der Eintrag blinkt oder färbt sich). Es endet, sobald CodeDeck den Fokus bekommt.
3. **Desktop-Benachrichtigung:** eine Meldung mit Sitzungsname und Grund über `tauri-plugin-notification`
   (libnotify). Der Klick darauf soll CodeDeck nach vorn holen und die Sitzung zeigen. Ob das Plugin unter Linux
   Klicks meldet, ist ungeprüft. Das klärt ein kurzer Spike, sonst bleibt die Meldung ein reiner Hinweis.
4. **In CodeDeck selbst:** Ein neuer Eintrag unter „Wartet auf dich“ leuchtet kurz auf. In der Leiste ist das
   die oberste Stelle und damit deutlich genug.

Nicht benachrichtigt wird, wenn CodeDeck den Fokus hat und der Eintrag sichtbar ist. Dann sieht der Nutzer ihn
ohnehin. Mehrere Ereignisse in kurzer Zeit werden zu einer Meldung zusammengefasst.

## Technik und Aufwand

- **Form umschalten:** Ein Tauri-Command `set_compact(on)` in `lib.rs` merkt sich Größe und Position des vollen
  Fensters, setzt die Mindestbreite herunter (heute 1040 in `tauri.conf.json`, Leiste etwa 320) und ändert die
  Breite. Die Höhe bleibt. In `App.tsx` kommt ein Zustand `compact` dazu: nur die rechte Spalte, Dateibaum und
  Deck werden nicht gerendert. Ihr Zustand liegt in `App` und den Modulen und bleibt erhalten.
- **Merken:** Form und Breite der Leiste je Rechner (`localStorage`), Kürzel und Benachrichtigungen in der
  Config (`config.rs`), damit alle Fenster dieselben haben.
- **Neue Abhängigkeiten:** `tauri-plugin-global-shortcut`, `tauri-plugin-notification`. Jeder neue Command
  bekommt einen Mock in `backend.ts`.

Aufteilung in drei Schritte, jeder für sich nützlich:

| Schritt | Inhalt | Umfang |
|---|---|---|
| A Kopf rechts | `ProjectHeader` in die rechte Spalte, Menü gegliedert, Pfad und Filter links | eine halbe Session |
| B Leiste | `set_compact`, Zustand `compact`, `SidebarSummary`, Fuß, beide globalen Kürzel | eine Session |
| C Aufmerksamkeit | Fenstertitel, Taskleiste, Desktop-Meldung (vorher Spike zu Klicks), Einstellungen im Menü | eine Session |

## Einordnung

- **C** passt in MVP 2 („Nichts bleibt unbemerkt“) und ist auch ohne Leiste wertvoll.
- **A und B** berühren dieselbe Stelle in `App.tsx` wie 2.5 („Größen“: Bereiche zuklappen, per Tastenkürzel).
  Am besten baut man sie zusammen mit 2.5 oder direkt danach. Die Leiste ist dann der Sonderfall „alles außer der
  rechten Spalte zu, Fenster schmal“.

## Gebaut (2.1c) und Abweichungen

- **Fuß:** keine eigene Fußzeile, die Statusleiste bleibt auch in der Leiste. Sie ist einzeilig und gibt in der
  schmalen Breite von selbst nach (Branch, git, KI-Werkzeug bleiben).
- **Übersicht:** Git (Branch, ↑↓, offene Dateien, Fehler), Runden seit dem Commit mit den laufenden und letztem
  Snapshot, Werkbank (`@ai`-Hinweise, Scratch-Dateien der letzten 24 Stunden). Statt „Dateien der laufenden Runden“
  steht die Zahl der Runden da; die Dateien bräuchte einen Vergleich je Runde.
- **Form merken:** nur die Breite der Leiste, nicht die Form; ein neues Fenster startet voll.
- **`Ctrl+Alt+L`** holt das zuletzt benutzte Fenster nach vorn **und** schaltet um (ein Druck statt zwei).
- **Kürzel ändern:** noch nicht; Einstellungen und `F1` zeigen sie und sagen, wenn ein anderes Programm sie hält.
- **Dialoge** passen in die Leiste: Einstellungen mit den Bereichen als Reihe oben, jede Einstellung untereinander.
- **Platz:** immer am rechten Rand des Bildschirms, auf dem CodeDeck ist, über die volle Höhe des Arbeitsbereichs,
  400 px breit (Nutzer, nach dem ersten Test). `Strg+Alt+C`: sichtbar → ausblenden, ausgeblendet → zurückholen
  (statt „vorn“), Fokus über `_NET_ACTIVE_WINDOW`. Messungen und Gründe: Notizen in `PLAN.md`.
