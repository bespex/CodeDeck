# Praxistest Schritte 1.5 bis 2.1 und Übersetzung

Stand: nach Commit `42b9313` plus Übersetzung (2026-11-15). Geprüft wird in der echten App mit echten
Claude-Code-Sitzungen im Terminal (die Desktop-App feuert keine Hooks, siehe Notiz zu 1.1 im Plan). Die
Bezeichnungen unten sind die deutschen der Oberfläche, in Klammern die englischen.

**So benutzen:** Jeden Punkt abhaken (`[x]`), wenn er wie erwartet funktioniert. Wenn nicht: Kästchen
leer lassen und unter **Befund** aufschreiben, was stattdessen passiert ist (gern mit Uhrzeit, dann
lässt sich die Hook-Spur `$XDG_RUNTIME_DIR/codedeck/hook-trace.log` zuordnen). Wird ein Punkt bewusst
übersprungen: `[-]`.

---

## 0. Vorbereitung

- [ ] CodeDeck aus dem Repo starten: `./dev` (baut Oberfläche und Backend neu)
- [ ] Ein Testprojekt öffnen, das ein Git-Repo ist (gern ein Wegwerf-Repo oder CodeDeck selbst)
- [ ] Statusleiste unten rechts: Claude ist verbunden („Verbunden“ im Panel, das ein Klick öffnet). Falls
      nicht: dort verbinden
- [ ] Eine **neue** Claude-Code-Sitzung im Terminal im Projektordner starten (nicht `--resume`)

Befund:

---

## 1. Sprache (Übersetzung)

- [ ] Die Oberfläche erscheint auf Deutsch (folgt der Systemsprache). Falls nicht: Klick auf den
      Projektnamen oben links, unten „Sprache“ (Language) → „Deutsch“
- [ ] Umschalten auf „English“ und zurück: Die Oberfläche wechselt sofort, ohne Neustart; Angehängtes unter
      „Nächster Prompt“ bleibt erhalten
- [ ] CodeDeck schließen und neu starten: Die gewählte Sprache bleibt
- [ ] Datumsangaben (Trail, Commits) stehen deutsch („Heute“, „Gestern“, Wochentage, `15.11.2026`)
- [ ] Beim Durchklicken fällt kein englischer Rest auf (außer Fachwörtern wie Commit, Push, Snapshot,
      Prompt, Diff, Repo, Meldungen von Claude Code selbst und Texten, die an Claude gehen). Was auffällt:
      unter Befund notieren
- [ ] Die deutschen Begriffe passen („Änderungen“, „Werkbank“, „Nächster Prompt“, „Anhängen“, „Runde“, „Im
      Index“ für staged …). Was holpert, unter Befund

Befund:

---

## 2. Werkbank (Workbench, Schritt 2.1 und D23)

### 2.1 Ignorier-Eintrag

- [ ] Git-Befehle öffnen (Strg+Umschalt+G oder Klick auf den letzten Befehl in der Statusleiste): Dort
      steht `echo '.scratch/' >> .git/info/exclude`
- [ ] `.git/info/exclude` enthält die Zeile `.scratch/` genau einmal, auch nach einem Neustart von
      CodeDeck; eine ältere Zeile `.scratch/` (aus früheren Tests) ist verschwunden
- [ ] `.gitignore` des Projekts ist unverändert

Befund:

### 2.2 Startregel und Anzeige

- [ ] Die Sitzung bitten: „Schreib mir ein kleines Wegwerf-Script, das die Zeilen in README.md zählt.“
      Das Script landet in `.scratch/` (nicht in `/tmp` oder im Projekt)
- [ ] Reiter **Werkbank**, Kachel „Scratch-Ordner“: Die Datei erscheint sofort, ohne Neuladen
- [ ] Die Zeile zeigt Alter („heute hh:mm“), das Schild der Sitzung und die Größe
- [ ] Im Dateibaum links steht `.scratch` gedimmt; Maus darauf zeigt eine kurze Erklärung
- [ ] `git status` im Terminal zeigt nichts aus `.scratch/`
- [ ] Reiter **Änderungen**: nichts aus `.scratch/` taucht als Änderung auf

Befund:

### 2.3 Ins Projekt übernehmen (Ziehen)

- [ ] Eine Datei aus dem Reiter Werkbank mit der Maus auf einen Ordner im Dateibaum ziehen: Der Ordner
      leuchtet beim Darüberfahren auf
- [ ] Loslassen: Die Datei liegt danach in diesem Ordner, die Werkbank meldet „Ins Projekt verschoben: …“,
      die Zeile ist aus der Liste verschwunden
- [ ] Auf einem **zugeklappten** Ordner kurz verweilen: Er klappt auf, man kann tiefer ziehen
- [ ] Auf die freie Fläche unter dem Dateibaum ziehen: Die Datei landet in der Projektwurzel
- [ ] Auf einen Ordner ziehen, in dem schon eine gleichnamige Datei liegt: Fehlermeldung „already there“
      (Meldung des Backends, bleibt englisch), nichts wird überschrieben

Befund:

### 2.4 Aufräumen

- [ ] Mülleimer an einer Datei: Sie verschwindet aus der Liste und liegt im **Papierkorb** des Systems
- [ ] (Wenn eine Datei älter als 7 Tage vorhanden ist, z. B. mit `touch -d '10 days ago' .scratch/alt.txt`
      angelegt): Knopf „n älter als 7 Tage löschen“ erscheint und löscht nur die alten in den Papierkorb
- [ ] Ordner-Symbol oben rechts öffnet `.scratch/` im Dateimanager

Befund:

---

## 3. Startregeln (Schritt 1.6)

- [ ] In der neuen Sitzung fragen: „Welche Regeln von CodeDeck hast du zu Beginn bekommen? Gib sie
      wörtlich wieder.“ Claude nennt **beide** Regeln (`.scratch/` und Link zu veröffentlichten Seiten); der Text
      ist englisch, das ist gewollt
- [ ] Reiter **Nächster Prompt**, ganz unten der Abschnitt „Startregeln“ (immer sichtbar, mit „zuletzt um …
      an <Sitzung>“): Dort steht genau der Text, den Claude wiedergibt
- [ ] In den Details der Sitzung (rechte Spalte, Sitzung aufklappen) steht unter „Von CodeDeck bekommen“
      der Eintrag „Startregeln“
- [ ] In der Sitzung `/clear` eingeben, dann dieselbe Frage: Claude kennt die Regeln wieder
- [ ] Eine beendete Sitzung mit `claude --resume` fortsetzen: Es kommt **kein** zweiter Eintrag
      „Startregeln“ unter „Von CodeDeck bekommen“ (fortgesetzte Sitzungen haben die Regeln schon)

Befund:

---

## 4. Runden in Änderungen (Schritt 1.5)

- [ ] Claude um eine kleine Änderung an einer vorhandenen Datei bitten. Während es arbeitet, zeigt
      Änderungen oben „Runde n“ und „arbeitet noch“
- [ ] Nach dem Ende der Runde: Im Trail erscheint ein Endpunkt ⚑, die Runde zeigt „fertig hh:mm“
- [ ] Die Runde zeigt „Du hast gefragt: …“ und darunter den Anfang von Claudes Abschlussnachricht;
      „In Marq lesen“ (falls Marq installiert) zeigt sie ganz
- [ ] Der Diff der Runde enthält genau, was Claude in dieser Runde geändert hat
- [ ] „Alles nicht Committete“: jede Datei trägt das Schild der Sitzung oder „Du“
- [ ] Haken „angesehen“ an einer Datei setzen; die Datei danach ändern lassen: Der Haken verschwindet
- [ ] „Vor dieser Runde…“ öffnet den Anfangspunkt mit „Hierher zurückgehen“
- [ ] Mit **zwei** Sitzungen gleichzeitig arbeiten lassen: Ist für dich nachvollziehbar, was „Runde n“
      zeigt? (Antwort unter Befund)

Befund:

---

## 5. Anhängen an den nächsten Prompt (Schritte 1.6a, 1.6b, 1.7)

### 5.1 Die einzelnen Anhänge

- [ ] **Datei:** Büroklammer an einer Datei im Dateibaum: Rechts unter „Nächster Prompt“ zählt „Dateien“ hoch,
      im Reiter Nächster Prompt steht sie im Abschnitt „Dateien“; im Dateibaum bleibt die Büroklammer sichtbar
- [ ] **Zeilenkommentar:** In Änderungen eine Zeile eines Diffs kommentieren: Rechts zählt „Kommentare“ hoch,
      im Reiter steht er im Abschnitt „Zeilenkommentare“ mit Datei, Zeile und Text; an der Zeile steht „angehängt“
- [ ] **Änderung:** Knopf „Anhängen“ am Kopf einer Runde: Im Reiter steht sie im Abschnitt „Änderungen“ als
      „Runde n (…)“ mit dem `git diff …`-Befehl darunter; „In Änderungen ↗“ springt dorthin
- [ ] **Änderung einer einzelnen Datei:** kleine Büroklammer an einer Datei im Diff (erscheint beim
      Überfahren); bei einer **neuen** Datei sagt der Tooltip „Eine neue Datei: als Pfad angehängt“
- [ ] **Hinweis:** In eine Datei des Projekts eine Zeile `@ai Beispiel ergänzen` schreiben und speichern.
      Reiter **Werkbank**, Kachel „Hinweise in deinen Dateien“: Der Hinweis erscheint; die Zahl am Reiter
      Werkbank zählt die offenen Hinweise. Beim Überfahren erscheint rechts eine Büroklammer: Klick hängt ihn an
      (Büroklammer bleibt hell), noch ein Klick nimmt ihn wieder heraus
- [ ] „Alle anhängen“ hängt alle an, danach heißt der Knopf „Alle entfernen“; das (?) erklärt die Schreibweise
- [ ] Eine Zeile wie `x = 1  # @ai nicht gemeint` oder `@ai.tool` wird **nicht** als Hinweis gezählt

Befund:

### 5.2 Vorschau und Absenden

- [ ] Reiter Nächster Prompt: Je Art ein Abschnitt (Dateien, Änderungen, Zeilenkommentare, Hinweise), jede
      Zeile mit Herkunft darunter, ohne Rahmen und Hintergrund; „Der genaue Text“ lässt sich mit „Zeigen“
      aufklappen und zeigt den vollständigen (englischen) Text
- [ ] Rechts unten „Nächster Prompt“ zeigt nur Zahlen (Dateien, Änderungen, Kommentare, Hinweise), die
      Token-Schätzung, „Für …“ und den Zustand; ein Klick auf eine Zahl oder „Öffnen ↗“ öffnet den Reiter
- [ ] Die Zahl am Reiter stimmt mit der Summe der vier Zahlen rechts überein
- [ ] Die Auswahl „Für …“ ist dunkel (eigene Liste); rechts unten klappt sie nach oben auf und wird nicht
      abgeschnitten
- [ ] Werkbank im großen Fenster: Scratch-Ordner und Hinweise stehen nebeneinander, sonst untereinander
- [ ] In der Sitzung einen Prompt schicken, z. B. „Was habe ich dir angehängt? Fasse es kurz zusammen.“
      Claude kennt Dateien, Kommentar, Änderung und Hinweis
- [ ] Claude kann die angehängten `git diff …`-Befehle ausführen (ggf. nach einer Erlaubnisfrage).
      Wenn es fragt: notieren
- [ ] Danach sind die Zahlen rechts 0, und dort sowie in der Leiste oben im Reiter steht „Um hh:mm gesendet an
      <Sitzung>“
- [ ] Die Büroklammern im Dateibaum und am Hinweis sowie „angehängt“ an der Zeile sind verschwunden
- [ ] In den Sitzungsdetails unter „Von CodeDeck bekommen“ steht die Sendung mit Uhrzeit
- [ ] In der Werkbank steht im Kopf der Hinweise „0 von 1 gesendeten erledigt“; entfernt Claude den
      Kommentar aus der Datei, wird daraus „1 von 1 gesendeten erledigt“

Befund:

### 5.3 Entfernen und Wettlauf

- [ ] × an einem Anhang im Reiter Nächster Prompt: Er verschwindet, die Büroklammer am Ursprung auch;
      „alle entfernen“ an einem Abschnitt leert nur diesen
- [ ] Eine Datei anhängen, einen Prompt abschicken und **sofort** danach (während Claude schon arbeitet)
      eine zweite Datei anhängen: Die zweite bleibt unter Nächster Prompt stehen und geht erst mit dem
      nächsten Prompt raus

Befund:

---

## 6. Zielsitzung (Schritt 1.6)

- [ ] Zwei Sitzungen im Projekt laufen lassen. Etwas anhängen; bei „Für …“ (rechts unten oder oben im
      Reiter) eine **bestimmte** Sitzung wählen
- [ ] In der **anderen** Sitzung prompten: Dort kommt nichts an, der Anhang wartet weiter
- [ ] In der gewählten Sitzung prompten: Dort kommt alles an
- [ ] Wieder etwas anhängen, eine Sitzung wählen und diese Sitzung beenden (`/exit`): CodeDeck sagt
      „… gibt es nicht mehr, darum geht es jetzt an jede Sitzung“
- [ ] Einen Zeilenkommentar in einer Runde schreiben, solange nichts angehängt ist: Die Sitzung dieser
      Runde ist schon vorgewählt

Befund:

---

## 7. Allgemeiner Eindruck

- [ ] Tooltips (z. B. das (?) bei den Hinweisen, „Anhängen“ in Änderungen) werden **nicht** abgeschnitten
- [ ] Der Reiter Nächster Prompt ist übersichtlich: oben, was rausgeht; darunter der genaue Text; ganz
      unten die Startregeln. Rechts unten steht nur die Zusammenfassung, nichts doppelt
- [ ] Die Hinweise wirken in der Werkbank richtig aufgehoben
- [ ] Die Begriffe sind klar: Den Prompt schreibt man in Claude, „Nächster Prompt“ zeigt, was CodeDeck
      anhängt, die Startregeln stehen getrennt davon

Was war verwirrend, was fehlt, was stört?

Befund:
