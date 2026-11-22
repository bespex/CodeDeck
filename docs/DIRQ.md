# Dirq als Review-Werkzeug: Vorschläge

> **Stand 2026-11-22:** Gebaut sind A1, A3, A6, A7, A8, B4 (Dirq-Seite, ohne Schalter in CodeDeck), B1 (Kommentare in Dirq
> werden Zeilenkommentare, `--annotate`) und A9/B9 (`--repo`). Mit installiertem Dirq ersetzt es die eingebetteten Diffs im
> Reiter Änderungen (Doppelklick auf eine Datei). Einzelheiten: `docs/QIEW.md`, Qiew `docs/ANNOTATE.md`, `apps/dirq/PLAN.md`.

Stand 2026-11-21, auf Wunsch des Nutzers: Wie kann Dirq das Prüfen von Änderungen erheblich besser unterstützen, allein und
mit CodeDeck? Auswahlliste, nichts davon ist beschlossen. Der Teil für Dirq allein gehört später ins Qiew-Repo.

**Was Dirq heute kann** (README): nebeneinander oder untereinander, geänderte Wörter markiert, Kopf mit Betreff, Autor,
Datum, Nachricht und Trailern (seit heute mit Runde, Session und Prompt aus CodeDeck, `src/dirq.ts`), Dateiliste mit Status
und Zahlen, Springen von Änderung zu Änderung (F7), Leerzeichen ignorieren, viele Formate, Suche, Kopieren, Export als HTML,
Live-Reload.

**Grenzen, die bleiben:** Dirq bleibt ein Betrachter. Es schreibt nie in Dateien oder ein Repository. Was es sich merkt
(gesehen, Notizen), liegt bei Dirq, nicht im Patch. Was in ein Repository wirkt (eine Änderung zurücknehmen), tut CodeDeck,
und nur auf ausdrücklichen Wunsch.

## A. Dirq allein

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| A1 | **Syntaxhervorhebung** je Sprache, auf beiden Seiten | Code liest sich im Review erst mit Farben flüssig; der größte Einzelgewinn | mittel |
| A2 | **Datei als gesehen abhaken**, Fortschritt „3 von 7“, Sprung zur nächsten ungesehenen Datei; gemerkt je Inhalt der Datei im Patch, so dass Live-Reload es erhält und eine geänderte Datei wieder ungesehen ist | Bei großen Änderungen nichts übersehen, nichts doppelt lesen | klein |
| A3 | **Tastatur für das Review**: nächste/vorige Datei, Hunk, ungesehene Datei; abhaken; Notiz; alles aufklappen | Ein Review ohne Maus | klein |
| A4 | **Notizen an Zeilen**, bei Dirq gespeichert, und **Review exportieren** als Markdown (Datei, Zeile, Code, Notiz) zum Einfügen in einen Pull Request oder Chat | Gedanken beim Lesen festhalten, ohne ein anderes Programm | mittel |
| A5 | **Verschobener Code** erkannt und als „verschoben“ markiert statt als gelöscht und neu (wie `git diff --color-moved`) | Umbauten der KI zeigen oft Verschiebungen; sonst wirkt das Diff doppelt so groß | mittel |
| A6 | **Generiertes zuklappen**: Lock-Dateien, minifizierte Dateien, Snapshots von Tests eingeklappt mit Hinweis | Das Wesentliche zuerst | klein |
| A7 | **Dateiliste filtern und sortieren**: nach Status, Pfad, Größe der Änderung, nur ungesehene | Große Patches gezielt durchgehen | klein |
| A8 | **Gliederung aus den Hunk-Köpfen** (`@@ … fn name`): geänderte Funktionen als Liste je Datei | Sieht, *was* angefasst wurde, bevor man liest | klein |
| A9 | **Mehr Kontext aufklappen** um einen Hunk, wenn das Repository bekannt ist (`--repo <pfad>`, oder der Patch liegt in einem): die fehlenden Zeilen aus dem Blob | Eine Änderung im Zusammenhang verstehen | mittel |
| A10 | **Serien**: mehrere Commits in einer Datei (mbox, `format-patch`-Serie) als Liste mit Schritt für Schritt | Mehrere Runden oder Commits in einem Fenster | mittel |
| A11 | **Diff von Diffs (interdiff)**: zwei Fassungen eines Patches vergleichen | „Was hat sich seit meinem letzten Review am Vorschlag geändert?“ | groß |

## B. Mit CodeDeck

Nur wenn CodeDeck Dirq startet (`CODEDECK_SOCKET`, siehe `docs/QIEW.md`, Rückweg), sonst ändert sich nichts.

| Nr. | Vorschlag | Nutzen | Aufwand |
|---|---|---|---|
| B1 | **Notiz an eine Zeile wird Zeilenkommentar** für den nächsten Prompt (Datei, Zeile, Code), wie die Sprechblase in Änderungen | Review in Dirq, Rückmeldung an die KI ohne Umweg | klein (mit Rückweg) |
| B2 | **„Gesehen“ abgeglichen** zwischen Dirq und dem Reiter Änderungen | Ein Stand, egal wo man liest | klein |
| B3 | **Hunk oder Datei anhängen** aus Dirq | Der KI genau die Stelle zeigen | klein |
| B4 | **Die laufende Runde live**: CodeDeck schickt den Diff der laufenden Runde bei jeder Änderung neu (`--reuse --id`, **die Kennung ist gebaut**, der Schalter „Live in Dirq“ noch nicht), Dirq behält Ort und Gesehenes | Der KI beim Schreiben zusehen, nebeneinander | klein |
| B5 | **Alle Runden seit dem Commit als Serie** (A10): von Runde zu Runde blättern, jede mit ihrem Kopf | Die Arbeit einer Session als Geschichte lesen | klein (mit A10) |
| B6 | **Wer hat welchen Hunk geschrieben**: Session je Datei oder Hunk im Patch (Trailer `X-CodeDeck-Session`), farbig wie in CodeDeck | Bei mehreren Sessions sofort zuordnen | mittel |
| B7 | **„An dieser Zeile bearbeiten“**: CodeDeck öffnet die Datei im gewählten Editor | Vom Lesen zum Ändern | klein |
| B8 | **Hunk zurücknehmen**: Dirq bittet, CodeDeck nimmt den Hunk aus dem Arbeitsordner zurück (`git apply -R` des Hunks, vorher ein Snapshot) | Den guten Teil einer Runde behalten, den schlechten verwerfen; feiner als D1 in `docs/DATEISPALTE.md` | mittel |
| B9 | **Repository mitgeben** (`--repo`): Dirq kann Kontext aufklappen (A9) und Dateien ganz zeigen | Review mit allem Zusammenhang | klein (mit A9) |

## Empfehlung

1. **A1, A2, A3**: Syntaxhervorhebung, abhaken mit Fortschritt, Tastatur. Das macht Dirq allein zu einem Review-Werkzeug.
2. **Rückweg aus `docs/QIEW.md` mit B1, B2, B3**: Notiz wird Zeilenkommentar, Gesehenes abgeglichen, anhängen. Das verbindet
   das Review in Dirq mit der nächsten Runde der KI.
3. **A4, A5, A6, A8**: Notizen mit Export, verschobener Code, Generiertes zuklappen, Gliederung.
4. **A9/B9, A10/B5, B4, B8**: Kontext, Serien und Runden, live, Hunk zurücknehmen.
5. **A11** zuletzt.
