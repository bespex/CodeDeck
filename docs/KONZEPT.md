# CodeDeck und Claude: wie es zusammenspielt

Dieses Dokument erklärt, was CodeDeck für dich als Anwender tut (Teil 1) und wie CodeDeck und
Claude Code dafür zusammenarbeiten (Teil 2). Teil 3 nennt die Lücken des heutigen Stands, Teil 4
beschreibt das abgestimmte Zielbild. Wie es umgesetzt wird, steht in `PLAN.md`; das hier ist das Warum
und das Wie im Großen.

Teil 1 und 2 beschreiben CodeDeck, wie es heute gebaut ist. Wo Teil 4 davon abweicht (Werkstatt,
Reiter, Sitzungen starten), gilt Teil 4 als Ziel. Anschauen lässt sich das Zielbild im Click-Dummy
unter `design/click-dummy/`.

Zwei Grundsätze gelten für alles, was CodeDeck tut, und an ihnen wird jede Funktion gemessen:

> **1. Sehen.** Du siehst jederzeit, was gerade geschieht und wie der Stand ist: was die KI tut,
> was sie geändert hat, was gesichert ist und was noch nicht.
>
> **2. Einfach bedienen.** CodeDeck und KI bedienst du ohne Nachdenken: keine Befehle lernen, keine
> Konfiguration von Hand, nichts, was du dir merken musst. Was du tun kannst, siehst du dort, wo du
> hinschaust.

---

# Teil 1: Was CodeDeck für dich tut

*Stand der heutigen App. Reiter, Startseite und Sitzungsverwaltung des Zielbilds stehen in Teil 4.*

## 1.1 Das Problem

Mit Claude Code arbeitest du im Terminal: Du schreibst, was du willst, und Claude liest Dateien,
schreibt Code, führt Befehle aus. Das ist mächtig, aber das Terminal zeigt dir nur einen
durchlaufenden Text. Nach einer Viertelstunde stellen sich Fragen, die das Terminal schlecht
beantwortet:

- **Was hat Claude eigentlich alles geändert?** Die Meldungen sind längst hochgescrollt.
- **Arbeitet Claude noch, oder wartet es auf mich?** Vielleicht steht seit fünf Minuten eine
  Rückfrage im anderen Fenster.
- **Ist das gut so, oder will ich zurück?** Und wohin zurück, wenn noch nichts committet war?
- **Was davon ist schon sicher?** Committet? Gepusht? Oder nur im Arbeitsverzeichnis?
- **Wie sage ich Claude „genau hier, diesen Absatz“,** ohne Pfade abzutippen und Stellen zu
  beschreiben?
- **Was läuft in den anderen Sitzungen,** die ich gestern oder in einem zweiten Terminal gestartet
  habe?

## 1.2 Die Aufteilung: Werkstatt und Leitstand

CodeDeck ersetzt Claude Code nicht und hat keinen eigenen Chat. Die Rollen sind klar getrennt:

```
┌────────────────────────────┐   ┌──────────────────────────────────────────────────────┐
│  Claude Code (Terminal)    │   │  CodeDeck                                            │
│  = die Werkstatt           │   │  = der Leitstand daneben                             │
│                            │   │                                                      │
│  Hier sprichst du mit      │   │  Hier siehst du, was dabei herauskommt, und          │
│  Claude und gibst Aufträge.│   │  greifst ein: prüfen, zurückgehen, Hinweise geben,   │
│                            │   │  committen.                                          │
│  > Bau den Limiter um …    │   │                                                      │
│  ● Edit src/limit.rs       │   │  (Aufbau siehe unten)                                │
│  ● Edit src/main.rs        │   │                                                      │
└────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

Du redest mit Claude dort, wo du es gewohnt bist. CodeDeck läuft daneben als „stilles Radar“: Es
redet nicht dazwischen, es zeigt.

So ist CodeDeck aufgebaut:

```
┌─ Dateien ────────────┬─ Deck ──────────────────────────────────┬─ Sessions ──────────────┐
│ ▾ src            main│  Activity  Changes  Next prompt ②  …    │ Sessions                │
│   ● limit.rs         │ ┌──────────────────────────────────────┐│ ● Rate limiter fix      │
│   ● main.rs          │ │ Uncommitted changes                  ││   working · opus        │
│     util.rs          │ │  ~ src/limit.rs   +40 −12            ││   limit.rs, main.rs     │
│ ▸ docs               │ │  ~ src/main.rs    +3  −1             ││ ○ Doku überarbeiten     │
│   README.md          │ │                                      ││   turn done             │
│                      │ │  (Diff der gewählten Datei)          ││                         │
│                      │ │                                      ││ Next prompt             │
│  ● = von Claude      │ └──────────────────────────────────────┘│   📄 docs/api.md        │
│      geändert        │ Trail │ ● jetzt  ⚓ vor Claudes Runde    │   for: any session      │
├──────────────────────┴───────┴──────────────────────────────────┴─────────────────────────┤
│ main ↑1 · Claude: 1 working                                    git status --porcelain … │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Links, die Dateien:** der Projektbaum. Was Claude geändert hat, trägt einen Punkt.
- **Mitte, das Deck:** die Änderungen (was ist anders, als Baum oder als Diff), die Dokumente mit
  Hinweisen für Claude, und am linken Rand der **Trail**, die Zeitleiste des Projekts.
- **Rechts, Sessions und Next prompt:** welche Claude-Sitzungen im Projekt arbeiten und was sie tun;
  darunter, was an deinen nächsten Prompt angehängt wird.
- **Unten, die Statusleiste:** Branch, Zustand von Claude in einem Wort, der letzte Git-Befehl.

## 1.3 Ein Vormittag mit CodeDeck

Die folgenden Szenen zeigen, wie sich die Arbeit anfühlt. In jeder steht, was du tust, was du
siehst, und welcher der beiden Grundsätze dabei greift.

### Szene 1: Ankommen

Du öffnest CodeDeck im Projekt. Rechts stehen schon die Sitzungen von gestern Abend, mit dem
Titel, den Claude Code ihnen gegeben hat („Rate limiter fix“), dem Modell und den Dateien, die sie
geschrieben haben. Im Dateibaum tragen diese Dateien einen Punkt. Auf dem Trail siehst du, was
davon committet ist und was nicht.

*Sehen:* Du weißt in zwei Sekunden, wo du gestern aufgehört hast, ohne ein Terminal hochzuscrollen.

### Szene 2: Einen Auftrag geben

Im Terminal schreibst du: „Bau den Limiter auf Token-Bucket um.“ In CodeDeck pulsiert die Sitzung
rechts: **working**. Sobald Claude die erste Datei anfasst, erscheint auf dem Trail ein **⚓ Snapshot**:
CodeDeck hat den Stand unmittelbar *davor* gesichert. Dann bekommt `limit.rs` im Baum seinen Punkt,
die Sitzung listet die Datei, die Trail-Linie oben wird amber: Hier gibt es Änderungen, die noch
nirgends gesichert sind außer im Snapshot.

*Sehen:* Du verfolgst live, welche Dateien Claude anfasst. *Einfach:* Du hast nichts dafür getan,
der Snapshot entsteht von selbst.

### Szene 3: Claude wartet auf dich

Claude will einen Befehl ausführen und fragt um Erlaubnis. Du bist gerade in einem anderen
Fenster. In CodeDeck wird der Punkt der Sitzung orange: **waiting for you**, darunter steht, worauf
sie wartet; die Statusleiste zeigt es auch.

*Sehen:* Keine Sitzung wartet mehr unbemerkt minutenlang auf eine Antwort.

### Szene 4: Das Ergebnis prüfen

Die Sitzung meldet **turn done**. Du klickst rechts auf `limit.rs`, und das Deck zeigt den Diff.
Die Ansicht **Changes → Structure** zeigt dir als Baum, was neu, gelöscht, verschoben oder geändert
ist, also die Form der Änderung statt hundert Zeilen Diff. Wer es nebeneinander will, öffnet den
Diff mit einem Knopf in Dirq.

*Sehen:* Erst die Übersicht, dann das Detail. *Einfach:* Ein Klick auf die Datei, wo immer sie steht.

### Szene 5: Das war nichts, zurück

Der Umbau gefällt dir nicht. Du klickst auf dem Trail auf den ⚓ von vorhin: CodeDeck zeigt, was
sich seitdem geändert hat, und bietet **Go back to here** an. Nach einer Rückfrage stehen die
Dateien wieder wie vor Claudes Runde, auch neu angelegte sind wieder weg. Vorher hat CodeDeck den
aktuellen Stand selbst noch einmal gesichert (↶ auf dem Trail): Wenn du es dir anders überlegst,
gehst du damit wieder vorwärts.

*Sehen:* Du siehst vorher, was zurückgenommen wird. *Einfach:* Kein `git stash`, kein
`git checkout --`, kein Risiko, etwas endgültig zu verlieren.

### Szene 6: Hinweise direkt im Dokument

Du liest `docs/api.md` in deinem Editor und denkst: „Dieser Absatz braucht ein Beispiel.“ Statt es
Claude umständlich zu beschreiben, schreibst du an die Stelle:

```markdown
<!-- @ai: Hier ein kurzes Beispiel mit curl ergänzen -->
```

Der Reiter **Next prompt** zeigt sofort eine ①. Dort stehen alle solchen Hinweise des Projekts mit Datei und
Zeile. Du klickst **Attach**. Beim nächsten Prompt, den du im Terminal abschickst (auch nur
„mach weiter“), bekommt Claude die Hinweise mitgeliefert und arbeitet sie ab. Sind die Kommentare
danach aus den Dateien verschwunden, zeigt Next prompt **1 of 1 done**.

*Einfach:* Du markierst dort, wo du gerade liest, in deinem gewohnten Editor. *Sehen:* Du siehst,
was übergeben ist, was wartet und was erledigt ist.

### Szene 7: Claude gezielt auf Dateien lenken

Für den nächsten Schritt soll Claude sich an `docs/api.md` und dem Ordner `src/http/` orientieren.
Du ziehst beide auf **Next prompt** (oder klickst im Baum die Büroklammer); damit sind sie angehängt.
Mit dem nächsten Prompt bekommt Claude die Pfade und liest selbst, was es braucht. Bis dahin stehen
sie in „Next prompt“, und du kannst jeden Anhang wieder entfernen.

*Einfach:* Ziehen statt Pfade tippen. *Sehen:* Claude bekommt nie heimlich Kontext. Nur was du
ausdrücklich übergibst, und du siehst, dass es wartet.

### Szene 8: Sichern

Du committest (Klick auf den Branch am Repo-Ordner oder in der Statusleiste; vor dem Ausführen
zeigt CodeDeck den genauen Git-Befehl). Die Trail-Linie wird gestrichelt amber: committet, aber
nur auf deinem Rechner. Nach dem Push wird sie ruhig grau, und am obersten Commit steht `origin`.

*Sehen:* Die Farbe der Linie sagt dir ohne Lesen, wie sicher deine Arbeit gerade ist.

## 1.4 Der Mehrwert auf einen Blick

| Deine Frage | Im Terminal allein | In CodeDeck |
|---|---|---|
| Was hat Claude geändert? | Hochscrollen, `git status` | Punkte im Baum, Liste je Sitzung, Changes-Ansicht |
| Arbeitet Claude oder wartet es? | Ins richtige Terminal schauen | Status je Sitzung, orange bei Rückfrage |
| Wie komme ich zurück? | `git stash`/`checkout`, nur für Committetes sicher | ⚓ vor jeder Runde, „Go back“, auch wieder vorwärts |
| Wie sicher ist meine Arbeit? | `git status`, `git log origin..` | Drei Farben auf dem Trail |
| Wie zeige ich Claude eine Stelle? | Pfad und Stelle beschreiben | `@ai`-Kommentar an die Stelle, „Attach“ |
| Was sieht Claude zusätzlich? | Unklar | Nur was an den nächsten Prompt angehängt ist (sichtbar bis zum Absenden), und die festen Startregeln |
| Was lief gestern, was läuft parallel? | Mehrere Terminals durchsehen | Alle Sitzungen des Projekts rechts, mit Titel |

## 1.5 Was CodeDeck bewusst nicht tut

- **Keinen eigenen Chat.** Mit Claude sprichst du in Claude Code. Zwei Orte zum Reden wären einer
  zu viel.
- **Keinen Editor.** Gelesen und bearbeitet wird in den Programmen, die du dafür hast (für viele
  Formate die Qiew-Viewer).
- **Keinen Kontext ohne dein Zutun.** Claude bekommt von CodeDeck nur, was du übergibst. Im Zielbild
  kommen wenige feste Startregeln hinzu, die du wörtlich einsehen kannst (4.5).
- **Nichts an Git vorbei.** Jeder Git-Befehl läuft sichtbar über die Kommandozeile und steht im
  Protokoll; deine Branches und dein Index bleiben unberührt, auch beim Sichern.
- **Die KI nicht ausbremsen.** Claude schreibt direkt („optimistic flow“), es gibt keine
  Genehmigungsschleife je Änderung. Abgesichert wird durch die Snapshots: lieber hinterher einfach
  zurück, als vorher jedes Mal fragen.

---

# Teil 2: Wie CodeDeck und Claude zusammenarbeiten

*Stand der heutigen App. Hooks, Logs, Git und Übergabe bleiben im Zielbild die Grundlage; hinzu kommen
tmux und die Startregeln (Teil 4).*

## 2.1 Die Beteiligten und ihre Wege

```
                         du
            ┌────────────┴─────────────┐
            │ tippst Aufträge          │ schaust, prüfst, klickst
            ▼                          ▼
     ┌─────────────┐  ① Hooks    ┌─────────────┐
     │ Claude Code │ ──────────▶ │  CodeDeck   │
     │             │ ◀────────── │             │
     │             │ ④ Übergabe  │             │
     └──────┬──────┘  (mit dem   └──┬───────┬──┘
            │        nächsten Prompt)│       │
            │ schreibt Dateien       │ ③ Git │ ② Logs lesen
            ▼                        ▼       ▼
     ┌──────────────────────────────────┐  ┌──────────────────────┐
     │ Projekt: Dateien + Git-Repos     │  │ Claude-Code-Logs     │
     │ (+ Snapshots unter refs/codedeck/)   │  │ (~/.claude/projects) │
     └──────────────────────────────────┘  └──────────────────────┘
```

CodeDeck hat vier Wege, um zu wissen, was geschieht, und einen, um etwas zurückzugeben:

1. **Hooks: Claude meldet sich.** In festen Momenten (Prompt abgeschickt, gleich wird
   geschrieben, wartet auf dich, Runde fertig) ruft Claude Code ein kleines Programm auf, das
   CodeDeck Bescheid gibt. Das ist der Live-Kanal.
2. **Logs: CodeDeck liest nach.** Claude Code schreibt jede Sitzung in eine Logdatei. Daraus holt
   CodeDeck Titel, Modell und geschriebene Dateien, auch für Sitzungen, die schon liefen, bevor
   CodeDeck offen war.
3. **Git: die Wahrheit über die Dateien.** Was wirklich geändert, committet und gepusht ist, sagt
   Git. Darauf beruhen Trail, Changes und Snapshots.
4. **Anhänge: CodeDeck gibt Claude etwas mit.** Den Prompt schreibst du in Claude; CodeDeck hängt
   angepinnte Dateien, Zeilenkommentare und Hinweise an deinen nächsten Prompt an.

Der Dateiwächter kommt als Hilfe dazu: Ändert sich eine Datei, schaut CodeDeck sofort neu nach,
egal ob Claude, du oder ein anderes Programm sie geändert hat.

## 2.2 Hooks: wie Claude CodeDeck Bescheid gibt

Claude Code kann in seiner Konfiguration (`settings.json`) für bestimmte Ereignisse einen Befehl
eintragen, einen „Hook“. **Connect** in CodeDeck (Statusleiste → *Claude*) trägt dort den Befehl
`codeck hook` ein; vorher wird die Datei als `settings.json.before-codedeck` gesichert,
**Disconnect** trägt ihn wieder aus.

Bei jedem Ereignis startet Claude Code `codeck hook` kurz und gibt ihm eine Beschreibung des
Ereignisses mit (welche Sitzung, welches Verzeichnis, welches Werkzeug, welche Datei, ohne
Dateiinhalte). `codeck hook` reicht das an jedes offene CodeDeck-Fenster weiter, und jedes
Fenster nimmt nur, was sein Projekt betrifft.

| Ereignis bei Claude Code | Was CodeDeck daraus macht | Was du siehst |
|---|---|---|
| Sitzung beginnt | Sitzung anlegen, Log lesen | Neue Zeile rechts |
| Prompt abgeschickt | Status *working*; wartende Übergabe ausliefern | Punkt pulsiert; Übergabe verschwindet aus „wartet“ |
| Gleich wird geschrieben (Edit, Write, Bash) | Beim ersten Mal in der Runde: Snapshot setzen | ⚓ auf dem Trail |
| Wurde geschrieben | Datei der Sitzung zuordnen, neu nachsehen | Punkt im Baum, Datei unter der Sitzung |
| Claude braucht dich | Status *waiting*, mit Grund | Orange, „waiting for you“ |
| Runde fertig | Status *turn done*, Log nachlesen (Titel); hat die Runde etwas geändert: Snapshot für ihr Ende, mit Claudes Abschlussnachricht | Grau, Titel aktualisiert, ⚑ auf dem Trail, „Turn n“ in Changes |
| Sitzung endet | Status *ended* | Zeile wird blass |

Zwei Dinge sind dabei wichtig:

- **Ohne CodeDeck passiert nichts.** Ist kein Fenster offen, beendet sich `codeck hook` sofort.
  Claude Code arbeitet dann wie immer.
- **CodeDeck bremst Claude nicht.** Der Hook antwortet sofort; nur beim Snapshot wartet Claude die
  Sekundenbruchteile, bis der Stand gesichert ist, denn darum geht es ja: *vor* dem Schreiben.

## 2.3 Eine Runde Schritt für Schritt

So läuft Szene 2 und 5 technisch ab:

```
 du             Claude Code           codeck hook          CodeDeck-Fenster        Git
 │ Prompt ───────▶│                        │                      │                   │
 │                │── Prompt abgeschickt ─▶│── weiterreichen ────▶│ working           │
 │                │◀─ (Übergabe, falls da) │◀─────────────────────│                   │
 │                │ denkt nach …           │                      │                   │
 │                │── gleich: Edit ───────▶│─────────────────────▶│ erste Änderung    │
 │                │                        │                      │ dieser Runde? ───▶│ Snapshot sichern
 │                │◀─────────────────────── OK ───────────────────│◀──────────────────│ (refs/codedeck/…)
 │                │ schreibt limit.rs      │                      │                   │
 │                │── geschrieben ────────▶│─────────────────────▶│ ● limit.rs        │
 │                │── gleich: Edit ───────▶│─────────────────────▶│ (schon gesichert) │
 │                │ schreibt main.rs       │                      │                   │
 │                │── fertig ─────────────▶│─────────────────────▶│ turn done,        │
 │                │                        │                      │ Log nachlesen     │
 │ prüft in CodeDeck, klickt ⚓, „Go back“ ─────────────────────────▶│ Stand sichern (↶) │
 │                │                        │                      │ Dateien zurück ──▶│ wie im Snapshot
```

## 2.4 Der Rückweg: warum „mit dem nächsten Prompt“

CodeDeck kann nicht in Claudes Terminal tippen, und das soll es auch nicht: Du sollst immer wissen,
was Claude gesagt bekommt. Claude Code erlaubt aber eines: Beim Ereignis „Prompt abgeschickt“ darf
der Hook Text anhängen, den Claude zusammen mit deinem Prompt liest. Genau das nutzt CodeDeck.

Hängst du etwas an (**Attach**, Büroklammer, Zeilenkommentar), legt CodeDeck den Text bereit. Schickst du den nächsten Prompt ab,
holt `codeck hook` ihn ab und gibt ihn mit. Zu deinem Prompt „Mach weiter.“ bekommt Claude dann
diesen Text (so baut CodeDeck ihn heute):

```
Work in these comments that I left for you in files of this project (lines beginning with `@ai`, or with a comment that begins with it).
Change the text around each one as it asks, then remove the comment. Leave a comment in place if you are unsure, and tell me why.

- docs/api.md:42: Hier ein kurzes Beispiel mit curl ergänzen

For my next request, focus on these parts of the project; read them as far as you need:

- docs/api.md
- src/http/ (folder)
```

- Mehrere Anhänge (Dateien, Änderungen, Zeilenkommentare, Hinweise) können gleichzeitig warten; alle gehen mit demselben Prompt raus.
- Auch eine **Änderung** lässt sich anhängen (Büroklammer an einer Runde, einem Commit, einem Snapshot, einem
  Vergleich oder an einer Datei darin). Angehängt wird nicht der Diff, sondern der Git-Befehl, der ihn zeigt,
  z. B. „Turn 2: `git diff 3f2a… 9c1b…`“; Claude liest selbst, was es braucht. Eine neue Datei, die Git noch
  nicht kennt, steht nicht in `git diff`; sie wird deshalb als Pfad angehängt.
- Was angehängt ist, sieht man an drei Stellen: in „Next prompt“ (rechts und im Reiter), am Ursprung (Büroklammer
  im Dateibaum und an der Änderung, „attached“ an Zeile und Hinweis) und danach je Sitzung unter „Got from
  CodeDeck“.
- Einheitliche Begriffe (D20, D21): Es gibt einen Vorgang, **anhängen** („Attach“), und einen Ort, **Next prompt**
  (Reiter ausführlich, rechte Spalte kurz). Anpinnen ist anhängen, es gibt keine Sammelliste davor. Was jede
  Sitzung beim Start bekommt (Startregeln), ist kein Anhang und steht getrennt.
- Übergeben werden **Pfade, keine Inhalte**: Claude liest selbst, was es braucht. Das hält den
  Prompt klein und Claude auf dem aktuellen Stand.
- Bis zur Abholung siehst du die wartende Übergabe und kannst sie zurücknehmen.
- Wer sie bekommt, wählst du: „any session“ (die Sitzung im Projekt, die zuerst einen Prompt schickt) oder
  eine bestimmte. Kommentierst du eine Zeile in einer Runde, ist deren Sitzung vorgewählt. Endet die
  gewählte Sitzung, geht die Übergabe an jede, und CodeDeck sagt es.
- Als Hinweis zählt eine Zeile, die mit `@ai` beginnt (Leerraum davor zählt nicht), oder mit einem
  Kommentar, der mit `@ai` beginnt: nach `<!--`, `//`, `/*`, `*`, `#`, `--`, `;` oder `%`. Nach `@ai` folgt
  Leerraum, ein Doppelpunkt oder nichts (`@ai.tool` ist kein Hinweis). Steht davor
  anderer Text, ist es kein Hinweis; so werden Texte *über* die Schreibweise (Code, Doku) nicht
  mitgezählt, und Beispiele in Markdown-Codeblöcken auch nicht.
- „Erledigt“ erkennt CodeDeck daran, dass ein übergebener Kommentar aus der Datei verschwunden ist.

## 2.5 Snapshots: sichern, ohne Git durcheinanderzubringen

Ein Snapshot ist eine vollständige Kopie des Arbeitsverzeichnisses eines Repos, auch mit
neuen, noch nicht hinzugefügten Dateien. Damit dein echter Stand unberührt bleibt, geht CodeDeck so
vor:

```
 echter Index ──kopieren──▶ Kopie ──(alle Dateien hinzu)──▶ Baum ──▶ Commit ──▶ refs/codedeck/snapshots/<zeit>
      │                                                                              │
      └── bleibt unverändert; Branch, Staging, Push: alles wie vorher                 └── nur CodeDeck schaut hier hin
```

- Die Snapshots hängen an keinem Branch, werden nie gepusht und tauchen nur in `git log --all` auf.
- Es gibt nur ein Wort dafür, drei Arten, an ihrem Zeichen und ihrer Rolle zu erkennen: ⚓ vor der Runde (in
  der Zeitleiste ▲), ⚑ am Ende der Runde, ↶ vor dem Zurückgehen. (Früher hieß der ⚓ „Anker“; das Wort ist
  weggefallen, weil es neben „Snapshot“ dasselbe Ding zweimal benannte.)
- Es gibt sie nur, wo es etwas zu sichern gibt: je Runde und Repo ein Snapshot vor der ersten
  Änderung (⚓) und, wenn die Runde etwas geändert hat, einer an ihrem Ende (⚑). Die beiden grenzen
  die Runde ab: Was dazwischen liegt, hat sie geändert. Der Snapshot am Ende trägt Claudes
  Abschlussnachricht. Gleiche Stände werden zusammengelegt (die nächste Runde beginnt dann am Ende
  der vorigen); 50 je Repo bleiben 14 Tage.
- **Go back** sichert zuerst den aktuellen Stand als eigenen Snapshot (↶) und stellt dann die Dateien
  her. Zurückgehen ist also selbst wieder rückgängig zu machen.

## 2.6 Mehrere Fenster, Sitzungen und Konfigurationen

- **Jedes CodeDeck-Fenster** hat eine eigene Empfangsstelle (einen Socket). `codeck hook` meldet
  an alle, jedes Fenster filtert nach seinem Projekt. Zwei Projekte nebeneinander stören sich nicht.
- **Mehrere Sitzungen im selben Projekt** erscheinen nebeneinander rechts, jede mit ihren Dateien.
  Der Filter *only this session* zeigt auf dem Trail nur die Snapshots einer Sitzung.
  Jede Sitzung trägt eine eigene Farbe und einen Kurznamen (A, B, C …), überall gleich: als Schild in
  der Liste, am Snapshot auf dem Trail, im Kopf eines Sicherungspunkts, am Punkt im Dateibaum. Fährst du
  über eine Sitzung in der Liste, treten ihre Snapshots und Dateien hervor, der Rest tritt zurück. Die
  Liste steht in der Reihenfolge, in der die Sitzungen kamen (neueste oben), und springt nicht. Über
  den Stift gibst du einer Sitzung einen eigenen Titel und Kurznamen; beides bleibt je Projekt erhalten.
- **Mehrere Claude-Konfigurationen** (z. B. `~/.claude` und ein privates `~/.claude-private`):
  Eine Sitzung meldet sich nur über die Konfiguration, mit der sie läuft. Deshalb listet *Connect*
  jede Konfiguration einzeln.

## 2.7 Und andere KI-Werkzeuge?

Der Kern von CodeDeck hängt nicht an Claude: Trail, Changes, Snapshots beim Zurückgehen, Docs-Hinweise
zum Kopieren funktionieren mit jedem Werkzeug, das Dateien schreibt. Was sich ändert, ist nur der
Live-Kanal. Damit ein anderes Werkzeug genauso eingebunden ist, braucht es:

| Was CodeDeck braucht | Wofür | Ohne das |
|---|---|---|
| Ereignis „gleich wird geschrieben“, auf das das Werkzeug wartet | Snapshot *vor* der Änderung | Snapshot nur von Hand oder beim nächsten Ereignis, also zu spät |
| Ereignisse „arbeitet / wartet / fertig“ | Status je Sitzung | Kein Live-Status, nur Änderungen über den Dateiwächter |
| Text an den nächsten Prompt anhängen | Übergabe | „Copy task“ und selbst einfügen |
| Logs mit Titel und Dateien | Sitzungen von vorher | Nur Sitzungen ab dem Verbinden |

Die Ereignisse, die CodeDeck intern verarbeitet, sind schon unabhängig von Claude formuliert. Für
ein weiteres Werkzeug käme nur ein Übersetzer dazu, der dessen Hooks in diese Ereignisse übersetzt
(im Plan: „Kapselung der KI-Anbindung“, Schritt 1.2 und „Später“).

---

# Teil 3: Wo es die beiden Grundsätze schon erfüllt, und wo nicht

Ehrliche Bestandsaufnahme der heutigen App vom 2026-11-15. Wo das Zielbild die Lücke schließt, steht
unter den Tabellen.

## Sehen

| Erfüllt | Lücke |
|---|---|
| Status je Sitzung, live, mit Grund beim Warten | Sitzungen, die nur aus den Logs bekannt sind (ohne Hook), zeigen immer *turn done*, auch wenn sie gerade arbeiten |
| Geänderte Dateien im Baum und je Sitzung | Nicht zu sehen, *was Claude gerade vorhat* (welcher Befehl als Nächstes läuft); das steht nur im Terminal |
| Trail mit drei Zonen, Snapshots vor und nach jeder Runde | Innerhalb einer Runde gibt es keine Zwischenstände. Arbeiten zwei Sitzungen gleichzeitig oder änderst du während einer Runde selbst etwas, steht das im selben Diff |
| Wartende Übergabe ist sichtbar | Keine Bestätigung, dass sie angekommen ist; sie verschwindet nur aus „wartet“ |
| Jeder Git-Befehl im Protokoll | Verbrauch und Limits von Claude unbekannt (Schritt 2.4 im Plan, Datenquelle offen) |

## Einfach bedienen

| Erfüllt | Lücke |
|---|---|
| Ein Klick auf eine Datei, wo immer sie steht, zeigt ihren Diff | *Connect* muss je Konfiguration gemacht werden, und laufende Sitzungen merken es erst nach einem Neustart; das sagt die Oberfläche nicht deutlich |
| Hinweise im eigenen Editor, Focus per Ziehen | Die Schreibweise `<!-- @ai: … -->` muss man kennen; es gibt keinen Weg, einen Hinweis aus CodeDeck heraus zu setzen |
| „Go back“ mit Rückfrage und Rückweg | Vergleichen zweier Punkte geht nur mit Strg+Klick, was man nicht entdeckt |
| Git-Befehl wird vor dem Ausführen gezeigt | Dass die Übergabe erst mit dem *nächsten Prompt* rausgeht, steht nur im Tooltip |

So schließt das Zielbild diese Lücken (Schritte aus `PLAN.md`, „Zielbild: MVP-Phasen“):

| Lücke | Schritt |
|---|---|
| Was Claude gerade tut und vorhat | 1.4 Sitzungszeile mit aktuellem Schritt und Plan |
| Keine Bestätigung der Übergabe; „mit dem nächsten Prompt“ nur im Tooltip | 1.4 „Next prompt“ mit Vorschau und Empfangsbestätigung, 1.6 Handover |
| `@ai`-Schreibweise muss man kennen | 1.5 Zeile im Diff kommentieren |
| Vergleichen nur per Strg+Klick | 1.5 Auswahl „Turn n / All uncommitted“ |
| Verbrauch unbekannt | 2.4 |
| *Connect* je Konfiguration, Neustart nötig | 3.2 Konten, 3.3 Neustart aus CodeDeck, 4.1 Ersteinrichtung |
| Sitzungen aus Logs zeigen immer *turn done* | 3.1 und 3.3: von CodeDeck gestartete oder neu gestartete Sitzungen melden live |
| Keine Zwischenstände innerhalb einer Runde | nicht eingeplant |

---

# Teil 4: Das Zielbild

Abgestimmt am 2026-11-15, sichtbar im Click-Dummy (`design/click-dummy/`). Der Dummy ist die Vorlage;
bei der Umsetzung wird jeder Schritt noch einmal gegen die Technik, die bestehenden Funktionen und
die Gestaltungsregeln aus 4.7 geprüft.

## 4.1 Die Werkstatt ist nicht mehr das Terminal daneben

So wird tatsächlich gearbeitet: Je Projektordner läuft eine Claude-Code-Sitzung in tmux, mit Remote
Control, dauerhaft im Hintergrund. Manche laufen mit dem Arbeits-Konto, manche mit dem privaten.
Bedient wird Claude fast nur über Claude Desktop oder Claude Web; wer will, hängt sich per tmux an
und hat das volle Terminal. Alles läuft auf der Arbeitsstation, auf der auch CodeDeck läuft. Für
Server gibt es lokal einen Ordner mit dem Wissen über den Server; die KI arbeitet von dort per ssh.

Daraus folgt:

- **CodeDeck startet und überwacht die Sitzungen** und ersetzt damit das Start-Script. Das
  widerspricht nicht „CodeDeck führt die KI nicht aus“: Die KI läuft weiter in tmux und bleibt für
  Desktop, Web und Terminal offen. CodeDeck tut nur, was man sonst von Hand täte.
- **CodeDeck ist kein weiterer Gesprächsweg.** Mit tmux-Sitzungen spricht es nur, um nötige
  Informationen zu lesen und für bewusste Steuerungen, die hier einfacher sind als anderswo: starten,
  stoppen, neu starten, neue Aufgabe beginnen. Prompts kommen immer von dir. Offen ist, ob das
  Beantworten einer Erlaubnisfrage dazugehört (D13 im Plan); der Click-Dummy zeigt es als Idee.
- **Unterwegs schaut niemand auf CodeDeck.** Wer Claude von außen bedient, sieht CodeDeck nicht;
  dafür muss CodeDeck nichts leisten.
- **Was per ssh auf einem Server geschieht, decken die Snapshots nicht ab.** CodeDeck sagt das an der
  Sitzung, statt Sicherheit vorzutäuschen.

## 4.2 Startseite: alle Projekte auf einmal

Über der Projektansicht liegt eine Startseite. Sie zeigt je Sitzung eine Kachel: Zustand der Sitzung,
Konto, Branch mit Stand, Zustand der tmux-Sitzung, dazu die Sprungziele *Open* (Projektansicht),
*Desktop* und *tmux*. Darüber steht, was über alle Projekte hinweg auf dich wartet.

- **Profile** legen fest, welche Projekte mit welchem Konto laufen. Zwei sind vorgesehen:
  *Arbeitszeit* und *Freizeit*. Ein Profil ist die Liste, die bisher im Start-Script stand.
- **Warnungen stehen in der Kachel**, mit einem Knopf zum Beheben, wo es einen gibt: Kontext fast
  voll (*New task*), falsches Konto für das Profil (*Restart with …*), tmux-Sitzung beendet
  (*Start again*).
- **Konten** verwaltet eine schwebende Seitenleiste am rechten Rand. Ein Konto ist ein Name für die
  Art, wie ein Werkzeug gestartet wird (bei Claude der Konfigurationsordner). CodeDeck findet die
  vorhandenen Konfigurationen und fragt nur nach Name und Farbe. Angemeldet wird im Werkzeug selbst;
  CodeDeck speichert keine Passwörter oder Schlüssel.

## 4.3 Projektansicht: vier Reiter für vier Fragen

Das Deck in der Mitte hat vier Reiter. Jeder beantwortet eine Frage, die sich bei der Arbeit mit der
KI stellt, und die Frage steht in der Reiterleiste.

| Reiter | Frage | Inhalt |
|---|---|---|
| **Activity** | Was tun die Sitzungen? | Zeitleiste aller Sitzungen, Sicherheit der Arbeit, Verbrauch, heute geschriebene Dokumente |
| **Changes** | Was hat Claude geändert? | Auswahl je Runde, Kurzbericht, Testergebnis, Diff; Zeile kommentieren, Datei abhaken, zurückgehen, committen |
| **Workbench** | Was ist sonst entstanden, das noch nicht zum Projekt gehört? | siehe 4.4 |
| **Next prompt** | Was hänge ich an meinen nächsten Prompt? | Anhänge, der genaue Text, was man anhängen kann, `@ai`-Hinweise; getrennt davon die Startregeln |

Ein Projekt öffnet in Changes (D14 im Plan; wird geprüft, sobald Activity mehr zeigt). Die vier Reiter
gibt es seit Schritt 1.3; Activity zeigt seit 2.3 die Zeitleiste der Sitzungen (aus dem Journal), die Sicherheit der Arbeit und die geschriebenen Dokumente; der Verbrauch folgt mit 2.4. Die Glocke in der Reiterleiste öffnet „Notices and tips“.

**Changes je Runde** (seit Schritt 1.5): Über den Diffs steht die Auswahl „Turn 1 · Turn 2 · All
uncommitted“ mit den Runden seit dem letzten Commit. Eine Runde zeigt, was du gefragt hast, Claudes
Abschlussnachricht (die ersten drei Zeilen im Wortlaut, das Ganze formatiert über „Read in Marq“;
CodeDeck fasst nichts selbst zusammen) und den Diff zwischen ihren
beiden Snapshots; das ist dasselbe wie Strg+Klick auf zwei Punkte im Trail. In „All uncommitted“ trägt
jede Datei das Schild der Sitzung, deren Runde sie zuletzt geändert hat, sonst „You“. Jede Datei
lässt sich abhaken („looked at“); der Haken verschwindet, sobald sich die Datei wieder ändert. An
jeder Zeile eines Diffs lässt sich ein Kommentar schreiben, der mit Datei, Zeile und Zeilentext
an „Next prompt“ angehängt wird.

Tests sind kein eigener Ort: Das Ergebnis gehört zur Runde und steht in Changes. Die frühere
Docs-Ansicht geht auf: Hinweise sind etwas, das man anhängt (Next prompt), geschriebene Dokumente sind
Ergebnisse (Activity).

Die Spalten von links nach rechts (Entscheidung 2026-11-19, vorher Dateien links, Sitzungen rechts):
Projekte, Sitzungen, Deck, Trail, Dateien. Sie lesen sich vom Allgemeinen zum Einzelnen: welches
Projekt, welche Sitzung, was sie getan hat, die Dateien zum Nachschlagen; alles, was auf dich wartet,
steht links an einem Ort. Die Projektliste (300 px) zeigt oben das Projekt dieses Fensters in seiner
Farbe mit den Menüs, darunter alle Projekte ohne ihre Sitzungen und „Wartet in anderen Projekten“; ein
Klick zeigt ein Projekt hier, Strg+Klick in einem neuen Fenster, ein Klick auf das Projektzeichen klappt
sie auf eine Leiste mit den Zeichen zu (siehe `docs/PLAN.md` „Projektliste im Fenster statt Übersicht“).
Ohne offenes Projektfenster zeigt CodeDeck nur die Liste, als Startseite. Der Trail gehört zu den
Dateien und steht links neben ihnen; der Dateibaum ist anfangs zugeklappt. Unter der Kopfleiste der
Sitzungsspalte steht in einer Zeile der Verbrauch der KI. Die Sitzungsspalte hat drei Bereiche:

- **Needs you:** alles, was auf dich wartet, mit der Handlung direkt daran. Farbig nur, wenn etwas
  wartet. Eine Sitzung steht dort, wenn sie etwas fragt oder ihre Runde beendet hat; eine beendete
  Runde lässt sich weglegen und verschwindet nach einer halben Stunde von selbst.
- **Sessions:** je Sitzung zwei Zeilen: Titel mit Zustand, darunter das eine, was gerade zählt (beim
  Arbeiten der aktuelle Schritt, beim Warten die Frage, danach das Ergebnis). Plan, Dateien, Kontext
  und Steuerung klappen auf. Beendete, nur aus dem Log bekannte und seit Stunden untätige Sitzungen
  liegen eingeklappt unter *Earlier*; *Remove from list* nimmt eine Sitzung heraus, bis sie sich
  wieder meldet.
- **Next prompt:** die Kurzform des gleichnamigen Reiters, immer sichtbar: alle Anhänge, für wen, Empfangsbestätigung.

Ein schwebendes Panel **Notices and tips** (Glocke in der Reiterleiste) sammelt, was sonst Fläche
kosten würde: die letzten Ereignisse, zwei Tipps passend zur offenen Ansicht, und zum Nachschlagen,
was jedes KI-Werkzeug mit CodeDeck kann.

## 4.4 Workbench: was noch nicht zum Projekt gehört

Sitzungen legen Entwürfe, Mock-ups, Hilfsscripts und Messdaten gern außerhalb des Projekts ab: in
temporären Ordnern oder als Seite auf claude.ai. Das blieb bisher unbemerkt.

Der Reiter **Werkbank** sammelt das in Kacheln (D23):

- **Der Scratch-Ordner im Projekt**, `.scratch/` (seit Schritt 2.1, bis D23 `.workbench/`). Git ignoriert
  ihn lokal: CodeDeck trägt ihn beim Öffnen eines Projekts in `.git/info/exclude` ein (nie in `.gitignore`,
  die gehört dem Projekt), sichtbar im Git-Protokoll. Die Kachel zeigt Inhalt, Größe, Alter und welche
  Sitzung eine Datei schrieb. Ins Projekt übernimmt man eine Datei, indem man sie auf einen Ordner im Dateibaum
  zieht; aufgeräumt wird in den Papierkorb („Delete n older than 7 days“ oder einzeln). Im Dateibaum
  steht der Ordner gedimmt. Snapshots enthalten ihn nicht, „Go back“ lässt ihn stehen.
- **Hinweise in deinen Dateien:** die `@ai`-Kommentare. Auch sie gehören nicht für immer zum Projekt; sie
  verschwinden, wenn Claude erledigt hat, worum sie bitten. Die Büroklammer an einem Hinweis hängt ihn an
  den nächsten Prompt, wie im Dateibaum (beim Überfahren sichtbar, angehängt bleibt sie hell).
- **Außerhalb des Projekts** ist eine Kachel mit zwei Gruppen, oben in der Werkbank, solange es etwas gibt.
  **Online** (claude.ai, Gists, Pastes): Seiten bleiben, wo sie sind. CodeDeck merkt sich Titel, Link
  und Sitzung, so wie die Sitzung den Link am Ende ihrer Runde nennt (das verlangt die Startregel). Kopiert wird
  nicht, weil solche Seiten oft nur dort laufen. Das Konto kommt mit den Konten (3.2).
- **Woanders abgelegt:** Was eine Sitzung trotzdem außerhalb ablegt (nicht in einem anderen Repo, nicht in den
  eigenen Dateien des Werkzeugs), meldet CodeDeck mit einer Zahl am Reiter und bietet an, es in den
  Scratch-Ordner zu holen. Geholt wird als Kopie, das Original bleibt.

## 4.5 Regeln, die jede Sitzung beim Start bekommt

CodeDeck gibt jeder verbundenen Sitzung beim Start wenige kurze, feste Regeln mit: Temporäres gehört
nach `.scratch/` (seit Schritt 2.1), und eine veröffentlichte Seite wird mit Link genannt (seit 1.6). Technisch gibt der Hook „Sitzung
beginnt“ den Text aus, sofern ein CodeDeck-Fenster das Projekt offen hat; eine fortgesetzte Sitzung
(`resume`) bekommt ihn nicht erneut, eine geleerte oder verdichtete (`clear`, `compact`) schon. Die Regeln sind immer an, es gibt
keinen Schalter, und sie stehen wörtlich im Reiter Next prompt, getrennt von den Anhängen. Damit bleibt der Grundsatz gewahrt: Claude bekommt nichts, was du nicht siehst.
`CLAUDE.md` wird dafür nicht angefasst, sie gehört dem Projekt.

## 4.6 Andere KI-Werkzeuge

Unterstützt wird heute nur Claude Code, aber alles Claude-Spezifische liegt hinter einer Schnittstelle
(Architektur in `PLAN.md`, „Kapselung der KI-Anbindung“). Ein Konto ist deshalb allgemein „Werkzeug +
Startweise“, und die Oberfläche fragt nach Fähigkeiten statt nach dem Werkzeug: Kann es vor dem
Schreiben Bescheid geben? Nimmt es Text zum nächsten Prompt an? Vorgemerkt zum späteren Einbinden und
Testen sind **Codex CLI** (ähnlich gebaut, prüft den Schnitt) und **opencode** (Konto ist ein Anbieter
mit Schlüssel, Einbindung über Erweiterungen statt Hooks). Aider passt als Beobachtungsfall schlecht,
weil man ihm die Dateien einzeln nennt und es selbst committet.

## 4.7 Gestaltungsregeln

1. **Bereiche sind farblich getrennt, innen ruhig.** Jeder Bereich hat einen leisen Grundton, und die
   Farbe bedeutet etwas: Grau ist das Projekt, Indigo ist die KI, Orange ist dein Handeln, ein warmer
   Ton heißt „wartet auf dich“ und erscheint nur dann.
2. **Was verschiedene Aufgaben hat, sieht verschieden aus.** Gleichberechtigte Kacheln lenken das
   Auge nicht. Stattdessen gibt es fünf Erscheinungsformen:

   | Aufgabe | Erscheinung |
   |---|---|
   | Auswählen und Auslösen | Werkzeugleiste oben, bündig, im Grau der Seitenspalten |
   | Berichten und Erklären | Fließtext direkt auf der Fläche, ohne Rahmen |
   | Aufzählen | schlichte Zeilen mit Haarlinie, nur die gewählte ist hinterlegt |
   | Der eigentliche Gegenstand (Diff, Zeitleiste, Übergabetext) | das einzige umrahmte Element der Ansicht |
   | Eine Entscheidung von dir | heller, mit Schatten, erscheint nur bei Bedarf |

   Kacheln sind richtig, wo gleichartige Dinge nebeneinanderstehen und jedes für sich zählt: die
   Sitzungen auf der Startseite, eine Kachel je Sitzung.
3. **Auf einen Blick, dann auf Wunsch.** Jede Zeile zeigt das eine, was zählt, in fester Länge.
   Einzelheiten klappen auf, stehen im Tooltip oder im schwebenden Panel. Lange Texte dürfen keine
   Übersicht sprengen.
4. **Größen gehören dem Benutzer.** Dateiliste und Sitzungsspalte lassen sich in der Breite ziehen
   (Doppelklick: zurück zur Standardbreite). Die Dateiliste lässt sich außerdem zuklappen, mit
   `Strg+B` oder dem Knopf in ihrer Kopfzeile (Entscheidung 2026-11-19, ersetzt die vom
   2026-11-17). Zugeklappt bleibt eine schmale Leiste, nicht nichts: das Baum-Symbol, das die Liste
   wieder aufklappt (mit Punkt, wenn kürzlich etwas geändert wurde), unten wie in der Statusleiste das
   Git-Log und der Branch für die Git-Aktionen. Projektfarbe und Menüs stehen in der Projektliste. Die Statusleiste der Dateien reicht immer unter dem Trail durch bis zu seinem linken Rand. Zuklappen verbirgt also nur
   den Baum, nie das Projekt oder ein Menü. Wer eine Datei im Baum zeigen will, klappt ihn damit auf.
   Die Sitzungsspalte klappt nicht zu: Sie ist das Radar, und wer fragt, soll immer zu sehen sein. Die
   Trennlinien bleiben haarfein und zeigen sich erst beim Überfahren, damit sie keine Unruhe ins Bild
   bringen. Der Trail öffnet sich nach links über das Deck (reicht der Platz links
   nicht, ragt er nach rechts). Der Inhalt passt sich fließend an; Aufteilung und Zugeklapptes werden je
   Projekt gemerkt, beim Aufklappen kommt die zuletzt gezogene Breite zurück.
5. **Schwebend statt eingebaut**, wenn etwas selten gebraucht wird: Konten, Hinweise und Tipps
   liegen in Seitenleisten, die ein kleiner Knopf öffnet.

## 4.8 Ersteinrichtung und Tutorial

Beides ist schlank: eine Seite zum Einrichten, fünf Schritte zum Verstehen, alles überspringbar und
später aus *Notices and tips* wieder aufrufbar.

**Ersteinrichtung.** CodeDeck sieht selbst nach und zeigt das Ergebnis, statt zu fragen:

| Block | Was CodeDeck tut |
|---|---|
| **Nötig** | Sucht `git`, `tmux` und Claude Code. Was fehlt, wird gemeldet, mit dem Installationsbefehl zum Kopieren. Ohne tmux gibt es keine Sitzungsverwaltung, alles andere läuft. |
| **Konten** | Listet die gefundenen Claude-Konfigurationen, fragt nach Name und Farbe und verbindet die Hooks für alle mit einem Klick. |
| **Hilfreich** | Sucht die Qiew-Werkzeuge (jayq, xaq, hyqe, marq, dirq) und verknüpft die gefundenen innerhalb von CodeDeck mit ihren Dateitypen. Fehlende werden empfohlen, mit Weg zur Installation. |
| **Projekte** | Schlägt die zuletzt benutzten Ordner vor; daraus entsteht das erste Profil. |

**Tutorial.** Es läuft auf der echten Oberfläche mit einem Beispielprojekt, hebt je Schritt einen
Bereich hervor und sagt einen Satz dazu. Es erklärt nicht die Technik, sondern das Bild im Kopf:

1. **Was CodeDeck ist und was nicht:** der Leitstand neben der Werkstatt. Kein Chat, kein Editor;
   mit Claude sprichst du, wo du es gewohnt bist.
2. **Sehen:** rechts die Sitzungen und was auf dich wartet.
3. **Prüfen:** der Trail mit den Snapshots, Changes je Runde, und der Weg zurück.
4. **Mitgeben:** eine Zeile kommentieren, eine Datei anheften; es geht mit deinem nächsten Prompt
   raus, und nur das.
5. **Aufräumen und sichern:** die Workbench und die drei Farben der Trail-Linie.

Die Szenenleiste des Click-Dummys ist das Muster dafür.
