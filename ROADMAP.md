# ROADMAP: CodeDeck ersetzt das Start-Script und wird für andere benutzbar

<!-- Status: [ ] offen, [~] in Arbeit, [x] erledigt. Etappen in Reihenfolge der Umsetzung. -->

Ziel: Der Tag beginnt in CodeDeck (MVP 3), und andere können es ohne Vorwissen einrichten und nutzen (MVP 4); Maßstab sind die Grundsätze „Sehen“ und „Einfach bedienen“ aus `docs/KONZEPT.md`.
Stand: 2026-11-27

Einzelheiten je Schritt (Ziel, Dummy, Dateien, Abnahme) stehen in `docs/UMSETZUNG.md` unter derselben Nummer bzw. demselben Titel; Arbeitsweise in `CLAUDE.md`, Entscheidungen in `docs/ENTSCHEIDUNGEN.md`. „Praxistest offen“ heißt: gebaut, die Abnahme durch den Nutzer in der echten App steht aus.

## MVP 1: Der Leitstand im Projekt
Status: erledigt
Ergebnis: Ein Projekt mit von Hand gestarteten Sitzungen lässt sich im neuen Aufbau beobachten, prüfen und lenken (Schritte 1.1–1.7, Praxistests bestanden).

## MVP 2: Nichts bleibt unbemerkt
Status: erledigt
Ergebnis: Auch was außerhalb des Projekts entsteht und was über den Tag geschah, ist sichtbar (Schritte 2.1–2.5 mit Werkbank, Aufmerksamkeit, Kopf- und Seitenleiste, Fundstücken, Activity, Verbrauch, Größen; Praxistests bestanden).

## MVP 3: CodeDeck ersetzt das Start-Script
Status: in Arbeit
Ziel: Der Tag beginnt in CodeDeck; das eigene Start-Script wird nicht mehr gebraucht.
Voraussetzung: MVP 2. Reihenfolge laut Nutzer (2026-11-17): 3.0, 3.0b, 3.1, 3.3, 3.4, 3.2, dann 3.3b und 3.5.

- [x] 3.0 Ein Prozess (D25), Praxistest bestanden.
- [~] 3.0b Übersicht (in Arbeit: Praxistest der älteren Teile: Position am rechten Rand, Farben, Regel „nur lebendige Sitzungen“, Terminal-Tür für eine Hand-Sitzung).
- [x] 3.1 tmux sehen (erledigt durch Ort der Sitzung, Türen und Konten).
- [~] 3.3 Steuern: Start, Stop, Restart, New task über tmux mit sichtbarem Befehl (in Arbeit: Praxistest offen).
- [ ] 3.4 Tagesliste und Startseite (`docs/SITZUNGEN.md` A12, A13, B12): eine Sitzung je Projekt, ▶ setzt fort, „▶ All“, „at start“; ohne Projekt ist das Fenster die Startseite; Projekt schließen und letztes Fenster schließen → Startseite statt Beenden.
- [~] 3.2 Konten (in Arbeit: Praxistest offen).
- [ ] 3.3b (`docs/SITZUNGEN.md` B9; Teil 3 von `docs/praxistest-3-vorarbeit.md`).
- [~] 3.5 Bei der Anmeldung: Start im Tray über XDG-Autostart (in Arbeit: Praxistest offen).

Prüfung: CodeDeck starten, die Tagesliste läuft an, ohne dass ein Projekt aufgeht; eine wartende Sitzung ist mit Doppelklick erreichbar; alle Praxistests aus MVP 3 bestanden (`docs/praxistest-3-vorarbeit.md` Teil 1–3).

## U1: Linke Spalte zu- und aufklappen
Status: in Arbeit
Ziel: Die Dateispalte klappt auf eine 44-px-Leiste zu (`Ctrl+B`, Klick aufs Projektzeichen), je Projekt gemerkt.
Voraussetzung: keine

- [x] Gebaut 2026-11-19 (`FilesRail.tsx`, `layout.ts`), `docs/KONZEPT.md` 4.7 Regel 4 angepasst.
- [ ] Praxistest: zuklappen per Kürzel und Projektzeichen, Trail bei zugeklappter Liste, Leiste zeigt Projekt, Branch und Menüs, Neustart behält den Zustand je Projekt.

Prüfung: Praxistest bestanden.

## U2: Projektliste im Fenster statt Übersicht
Status: in Arbeit
Ziel: Links im Projektfenster eine Projektliste; ein Klick wechselt das Projekt im selben Fenster; die Übersicht als eigenes Fenster entfällt.
Voraussetzung: keine

- [x] Spalten neu geordnet; Bauschritte (a) Zustand je Projekt, (b) Projektliste im Fenster, (c) Startseite ohne Projekt, (d) Übersicht als Fenster entfernt, dazu „Zuletzt“ (2026-11-19).
- [ ] Praxistest der Spaltenordnung und der Schritte (c) und (d).

Prüfung: Praxistest bestanden. Reserve, falls der Wechsel zu träge wird: eine Webview je Projekt (Spike „Weg 2“ in `docs/UMSETZUNG.md`).

## U3: Sitzungsliste überarbeitet
Status: in Arbeit
Ziel: Rückfragen, fertige Runden und Wiederaufnehmen sind in der Sitzungsliste auf einen Blick erreichbar (D27 geändert).
Voraussetzung: keine

- [x] Gebaut 2026-11-20: eine Liste in Startreihenfolge mit „Früher“, Rückfrage mit Befehl, Schlussworte fertiger Runden, „fertig“ bis angesehen, „Fortsetzen ▶“, Knopfzeile.
- [ ] Praxistest: Rückfrage mit Bash zeigt den Befehl; fertige Runde zeigt Schlussworte und verschwindet aus der Zahl nach Hineingehen bzw. „Runde ansehen“; beendete Sitzung lässt sich fortsetzen.

Prüfung: Praxistest bestanden.

## U4: Sitzungen im Hintergrund
Status: in Arbeit
Ziel: Sitzungen nach `/background` bleiben auffindbar und erreichbar (`claude attach`).
Voraussetzung: keine

- [x] Gebaut 2026-11-20: `Place.background`, `Harness::parked`, `Harness::attach`, Schild „im Hintergrund“, Verweise zwischen Ursprungs- und Hintergrund-Sitzung.
- [ ] Praxistest: `/background` in einer Sitzung; alte als beendet mit Verweis, neue „im Hintergrund“; „Terminal“ öffnet `claude attach`; Frage am Rundenende erscheint als „fragt“; nach Neustart von CodeDeck wieder da.

Prüfung: Praxistest bestanden.

## U5: Sitzungen: Prüfung und Überarbeitung
Status: in Arbeit
Ziel: Betriebswege, Kapselung je KI-Werkzeug und Fallbacks der Sitzungen sind geprüft und überarbeitet (Befunde, Konzept K1–K8, Schritte S1–S9 und Entscheidungen in `docs/SITZUNGEN-PRUEFUNG.md`).
Voraussetzung: U3, U4

- [~] S1: Beenden/Neu starten nur für Sitzungen in CodeDecks eigenen tmux-Sitzungen, Terminal-Tür wählt Fenster und Pane (in Arbeit: Praxistest offen).
- [ ] Gruppen G1–G4 nach der Tabelle in `docs/SITZUNGEN-PRUEFUNG.md`, eine Sitzung je Gruppe, Praxistest am Ende jeder Gruppe (darin S7: Hinweisdialog unter Wayland mit „Weiterhin anzeigen“).

Prüfung: Praxistests aller Gruppen bestanden.

## U6: Prompts vorbereiten
Status: in Arbeit
Ziel: Prompts über längere Zeit vorformulieren und daran feilen, ohne Gefahr, sie vorzeitig abzuschicken.
Voraussetzung: keine

- [x] Erster Wurf 2026-11-22: benannte Prompts als Markdown in `.scratch/prompts/`, Bereich „Vorbereitet“ im Nächsten Prompt, Editor CodeMirror 6 ohne Schreibhilfen.
- [ ] Praxistest des ersten Wurfs.

Prüfung: Praxistest bestanden. Weiteres (Übergeben, Anhänge an Entwürfe, Entwürfe aus Schlussbericht) steht in `IDEAS.md`.

## U7: Token sparen
Status: offen
Ziel: CodeDeck macht sichtbar, wo Tokens bleiben, und gibt dem Nutzer Mittel, weniger in den Kontext zu geben (vorgesehen, Nutzer 2026-11-22).
Voraussetzung: 2.4 (Nutzung aus der Statuszeile); vorher klären, welche Zahlen die Protokolle je Nachricht und Werkzeugaufruf liefern, woher die Kontextgröße kommt und wie `permissions.deny` mit vorhandenen Einstellungen zusammenspielt

- [ ] Tokens je Runde sichtbar, im Kurzbericht der Runde.
- [ ] Kontextgröße je Sitzung auf der Karte; bei vollem Kontext eine frische Sitzung mit Zusammenfassung anbieten.
- [ ] Teure Lesezugriffe sperren (Lock-Dateien, `dist/`, Generiertes) über die Berechtigungen des Werkzeugs, vorbelegt mit Dirqs Mustertabelle.
- [ ] Warnung bei großen Anhängen.
- [ ] Kosten der Startregeln und der `CLAUDE.md` je Sitzung zeigen.
- [ ] Modellwahl beim Start einer Sitzung, Kosten je Runde daneben.

Prüfung: Je Runde und Sitzung ist der Verbrauch sichtbar; eine gesperrte Datei wird nicht mehr gelesen. Einzelheiten in `docs/UMSETZUNG.md`, „Token sparen“.

## MVP 4: Für andere benutzbar
Status: in Arbeit
Ziel: Ein neuer Nutzer kommt ohne Vorwissen bis zur ersten Sitzung und findet ein Handbuch.
Voraussetzung: MVP 3 (4.3 darf vorgezogen werden)

- [ ] 4.1 Ersteinrichtung nach `KONZEPT.md` 4.8 (löst P8 ab).
- [ ] 4.2 Tutorial: fünf Schritte auf der echten Oberfläche mit Beispielprojekt.
- [ ] 4.3 Tests je Runde: Testbefehl je Projekt, Ergebnis in Changes, roter Test in den nächsten Prompt (zum Vorziehen empfohlen).
- [ ] 4.4 Qiew-Rückkanal (P7).
- [ ] 4.5 Worktrees (P6, soweit nach MVP 3 noch offen).
- [~] 4.6 Handbuch auf der Webseite (in Arbeit: Einleitung de fertig, englische Struktur angelegt; weiter nach der Reihenfolge in `docs/UMSETZUNG.md`, 4.6).

Prüfung: Auf einem frischen Benutzerkonto führt eine Seite bis zur ersten Sitzung; alle Handbuchseiten ohne `draft: true`, vom Nutzer abgenommen.

## Später
- Zweites KI-Werkzeug: zuerst Codex CLI, dann opencode, je als Adapter (`docs/KI-ANBINDUNG.md`); erst dann zeigt sich, ob die Schnittstelle trägt.
- Karte / Blast Radius (P9), zurückgestellt.
