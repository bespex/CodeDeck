# Sitzungen führen: überall bedienen, in CodeDeck im Blick

Konzept für MVP 3 (Schritte 3.1 bis 3.5), Entwurf vom 2026-11-17 zur Abstimmung; Tagesliste und Startseite
(A12, A13, B12) mit dem Nutzer abgestimmt am selben Tag.
Click-Dummy: `design/click-dummy/sessions.html` (Aufruf wie in `design/click-dummy/README.md`, dann
`http://localhost:5392/sessions.html`).

## Kurzfassung

Eine Sitzung hat **ein Zuhause und viele Türen**. Das Zuhause ist der Ort, an dem der Prozess läuft. Was
CodeDeck startet, läuft im Hintergrund in tmux, mit Remote Control. Die Türen sind die Wege hinein:
Terminal, Claude Desktop, Browser, Handy, ssh. CodeDeck startet, beobachtet und führt zur richtigen Tür,
spricht aber selbst nie mit der KI. Ein Doppelklick auf eine Sitzung bringt dich hinein; was dort zu
sehen ist, zeigt das Werkzeug selbst.

Damit wird das heutige Muster „tmux + Remote Control + Desktop“ zum eingebauten Standardweg. Das
Start-Script und das Suchen nach Fenstern entfallen.

Für den Alltag gibt es eine **Tagesliste**: die Projekte, an denen du jeden Tag arbeitest, mit einer
Sitzung je Projekt. Ein Klick startet ein Projekt oder alle, auf Wunsch von selbst beim Start von
CodeDeck. Dabei öffnet sich kein Projektfenster. Ohne offenes Projekt ist das Fenster die **Startseite**
in Leistenform: „Wartet auf dich“ über alle Projekte und die Tagesliste. Sitzungen, die du von Hand
startest, erkennt CodeDeck weiter von selbst.

---

## Ausgangslage und Bewertung

### Was das bekannte Muster leistet

`ai.sh` startet Claude Code in tmux; Remote Control macht die Sitzung in Claude Desktop, auf claude.ai und
in der Claude-App sichtbar; ssh + `tmux attach` geht von jedem Gerät. Das ist im Kern richtig. Es hat aber
diese Schwächen:

- Man muss wissen, welche tmux-Sitzung zu welchem Projekt gehört, und wo das Fenster gerade ist.
- Konto (Konfigurationsordner) und Desktop-Profil muss man selbst passend halten.
- Den Remote-Link sucht man im Terminal oder in der Liste der App.
- Was nicht über das Script lief (Terminal von Hand, Desktop), ist ein anderer Fall mit anderen Regeln.

### Die Wege im Vergleich

| Zuhause | Überlebt Fenster zu | Von unterwegs | CodeDeck sieht live | Alle KI-Werkzeuge | Bewertung |
|---|---|---|---|---|---|
| Terminal von Hand | nein | nein | ja (Hooks) | ja | wird erkannt, aber nicht empfohlen |
| **tmux + Remote Control** | **ja** | **ja (App, Web, ssh)** | **ja** | **tmux ja, Remote nur Claude** | **Standard** |
| Claude-Hintergrund (`claude --bg`, `claude agents`) | ja | über `attach` | ja | nein | nicht als Zuhause, siehe B7 |
| Claude Desktop (eigene Sitzung) | solange die App läuft | nein | **nein** (Praxistest 1.1: keine Hooks) | nein | wird erkannt, nur aus dem Log |
| Cloud (`--cloud`) | ja | ja | nein (keine lokalen Hooks) | nein | außerhalb von CodeDeck |

Der Grund für tmux: Es ist das einzige Zuhause, das für alle Werkzeuge gleich funktioniert (Claude,
Codex, opencode, goose), per ssh von jedem Gerät erreichbar ist, nicht nach einer Stunde Leerlauf anhält
und das CodeDeck vollständig sehen kann. Remote Control kommt bei Claude hinzu und öffnet die
Türen Desktop, Browser und Handy.

---

# Teil A: Benutzeroberfläche (was du siehst)

## A0 Das heutige Start-Script (`~/.local/bin/ai`, angesehen 2026-11-17)

`ai [tool]` legt **eine tmux-Sitzung je Werkzeug** an (`ai-claude`), nicht je Projekt, im aktuellen Ordner,
tippt den Befehl per `send-keys` hinein und hängt sich an; läuft sie schon, hängt es sich nur an (`ai -c`
bzw. `aic`: nur verbinden). Remote Control kommt nicht vom Script, sondern aus der Einstellung
`remoteControlAtStartup: true` (in `~/.claude` und `~/.claude-private`); das Konto aus der Umgebung der
Shell. Für 3.1 heißt das: Sitzungen in `ai-*` werden über ihren Ordner (cwd des Panes) dem Projekt
zugeordnet, nicht über den Namen. Die Tagesliste (3.4) ersetzt das Script.

## A1 Zwei Begriffe

- **Läuft in** (Zuhause): *Hintergrund* (von CodeDeck gestartet, tmux), *Terminal* (von dir selbst
  geöffnet), *Desktop* (in Claude Desktop gestartet). Ein kleines Symbol rechts in der Sitzungszeile zeigt
  es; der Tooltip sagt in einem Satz, was das bedeutet.
- **Öffnen in** (Türen): *Terminal*, *Desktop*, *Browser*, *Handy*, *ssh*. Welche es gibt, hängt vom
  Zuhause ab. Ein türkiser Bogen neben dem Symbol heißt: **von überall erreichbar** (Remote Control).

Im Text der Oberfläche steht nie „tmux-Pane“ oder „Bridge“, sondern das, was es für dich bedeutet.

## A2 Die Sitzungsliste rechts

Bleibt, wie sie ist (zwei Zeilen, Farbe, Kurzname, „Earlier“), mit drei Ergänzungen:

| Bedienung | Wirkung |
|---|---|
| **Klick** | Wählt aus und klappt die Details auf (wie heute) |
| **Doppelklick** oder **Enter** | **Hingehen:** öffnet die Sitzung auf dem Standardweg (Einstellung, vorgegeben *Desktop*, wo es ihn gibt, also mit Remote Control und Desktop-Profil des Kontos; sonst *Terminal*) |
| **Mittelklick** | öffnet immer das *Terminal* (Nutzer 2026-11-17) |
| **Doppelklick auf „Needs you“** | dasselbe: von der Frage direkt zur Sitzung |
| **„+ New“** im Kopf der Liste (`Ctrl+Shift+N`) | Neue Sitzung in diesem Projekt |

Die Fußzeile nennt knapp, was im Hintergrund läuft: „2 in background · 2 reachable from anywhere“.

## A3 Details einer Sitzung

- **Läuft in:** Zuhause, Konto (Farbe, Name), seit wann.
- **Öffnen in:** die Türen als kleine Knöpfe; die Standardtür trägt ein „2×“. Geht eine Tür nicht, ist sie
  ausgegraut und der Tooltip sagt warum.
- **Steuern** (nur für Hintergrundsitzungen): *Restart* (gleiche Unterhaltung, frischer Prozess, etwa nach
  dem Verbinden oder einem Update), *Stop* (Unterhaltung bleibt erhalten), *New task* (siehe A4).
- **„Show how it was started“**: der genaue Befehl. Nichts geschieht verdeckt (Grundsatz *Sehen*).

## A4 Neue Sitzung, Fortsetzen, neue Aufgabe

- **„+ New“** öffnet ein kleines Feld: Name (optional), Konto (vorbelegt mit dem zuletzt im Projekt
  benutzten), „Reachable from anywhere“ (vorgegeben an). Enter startet. Die Sitzung steht sofort in der
  Liste („starting…“), dann meldet sie sich.
- **Beendete Sitzungen** (auch von Hand oder in Desktop gestartete) bekommen „Continue in background“:
  dieselbe Unterhaltung, ab jetzt im Hintergrund. So wird jede Sitzung nachträglich zu einer, die von
  überall erreichbar ist.
- **New task** tippt **nicht** in die laufende Sitzung (kein `/clear`). Es öffnet „+ New“ vorbelegt; die
  alte Sitzung bleibt und lässt sich später fortsetzen. CodeDeck schreibt damit nie in eine Sitzung hinein,
  auch nicht für Steuerungen (schärfer als D5, einfacher zu erklären).

## A5 Aufmerksamkeit führt zur Sitzung

Die Desktop-Meldung („A needs your permission: npm test“) bekommt den Knopf **Open**. Er öffnet nicht nur
CodeDeck, sondern gleich die Sitzung auf dem Standardweg: dort, wo die Frage beantwortet wird. Die
Erlaubnis selbst gibt man im Werkzeug (D13 bleibt offen).

## A6 Unterwegs

- **Handy…** zeigt den Remote-Link als QR-Code und als Text. Die Claude-App listet die Sitzung ohnehin,
  solange der Rechner läuft; der QR-Code spart das Suchen.
- **ssh** kopiert `ssh -t <rechner> tmux attach -t =<sitzung>`.
- CodeDeck selbst wird unterwegs nicht gebraucht (`KONZEPT.md` 4.1).

## A7 Sitzungen, die CodeDeck nicht gestartet hat

- **Terminal von Hand:** CodeDeck kennt Prozess und Fenster und holt es mit Doppelklick nach vorn (unter
  Wayland nicht möglich: dann sagt eine Meldung, wo sie läuft). Hinweis in den Details: „Closing that window
  ends the session.“ Nach dem Ende: „Continue in background“.
- **Claude Desktop:** „known from log“, Tür *Desktop*. Hinweis: Wer live sehen will, startet hier und
  bedient in Desktop über Remote Control. Das ist der empfohlene Weg für Desktop-Nutzer.

## A8 Einstellungen (Abschnitt „Sessions“)

- Doppelklick öffnet: *Desktop* (Vorgabe) · *Terminal* · *Browser* (fällt zurück auf die nächste mögliche Tür). Mittelklick: immer Terminal.
- Terminalprogramm: automatisch gefunden, wählbar.
- Neue Sitzungen von überall erreichbar: an/aus (Vorgabe an).
- Desktop-Profil je Konto: unter Konten (3.2), damit ein Desktop-Link im richtigen Konto landet.

## A9 Was es bewusst nicht gibt

- Kein eingebettetes Terminal und kein Eingabefeld für Prompts. CodeDeck bleibt das stille Radar.
- Keine eigene Liste von tmux-Sitzungen neben der Sitzungsliste: eine Sitzung ist eine Zeile, egal wo sie
  läuft.
- Kein „Übergeben an Desktop“ (Terminal schließen, in Desktop fortsetzen): Damit verlöre die Sitzung
  Hintergrund und Live-Status. Desktop kommt über Remote Control dazu, ohne dass etwas umzieht.

## A10 Neustart des Rechners

Ein Neustart (oder Abmelden) beendet tmux und damit alle Hintergrundsitzungen. Die Unterhaltungen bleiben
erhalten; verloren gehen der laufende Prozess, eine gerade laufende Runde und die Verbindung für Handy und
Desktop.

- **Vorher:** Arbeitet eine Sitzung gerade, steht CodeDeck im Abmelde-/Herunterfahren-Dialog des Systems:
  „CodeDeck: 2 sessions are working“. Man kann trotzdem neu starten, merkt es aber.
- **Danach:** Oben in der Sitzungsliste steht: „Computer restarted. 2 sessions were running in the
  background. Their conversations are kept.“ Darunter **Restore all** und **Not now**. Die betroffenen
  Sitzungen stehen als „stopped by restart“ in der Liste, jede mit „Continue in background“.
- **Abgebrochene Runde:** Lief bei einer Sitzung gerade eine Runde, sagt die Zeile das („turn cut off at
  09:58“) und verweist auf Changes: Der Sicherungspunkt vom Anfang der Runde zeigt, was bis dahin
  geändert war, und erlaubt das Zurückgehen. Fortgesetzt wird die Unterhaltung, nicht die Runde: den
  nächsten Prompt schreibst du.
- **Ganz ohne Klick:** Einstellung „After a restart: ask · restore automatically · do nothing“ (Vorgabe:
  ask). Mit „restore automatically“ und CodeDeck im Autostart sind die Sitzungen nach der Anmeldung
  wieder da, auch für Handy und Desktop, ohne dass man an den Rechner muss.
- Was du selbst beendet hast (Stop in CodeDeck, `/exit`), kommt nicht wieder.
- **Handy und Desktop:** Remote Control kommt nach dem Fortsetzen oft nicht von selbst wieder (B11).
  CodeDeck wartet aufs Netz, prüft die Verbindung und verbindet notfalls neu. Danach steht die Sitzung in
  der Claude-App unter einem **neuen** Eintrag; der alte bleibt dort als getrennt stehen.

## A11 Von überall erreichbar: nur, wenn es stimmt

Der türkise Bogen heißt „jetzt erreichbar“, nicht „war mal so gestartet“. Geht die Verbindung verloren
(Netz, Ruhezustand, nach etwa 30 Minuten ohne Server), wird er orange: „Not reachable from your phone“.
In den Details steht der Grund und der Knopf **Reconnect** (startet die Sitzung kurz neu, die
Unterhaltung bleibt). Arbeitet die Sitzung gerade, fragt CodeDeck vorher.

## A12 Tagesliste

Die Projekte, an denen du jeden Tag arbeitest. Jedes hat **eine** Sitzung, die CodeDeck für dich führt
(weitere startest du wie bisher mit „+ New“).

- **In die Liste:** Stern an einem Projekt, in der Startseite oder im Projektmenü. Je Projekt gelten
  Startwerte: Konto (vorbelegt mit dem zuletzt benutzten), „von überall erreichbar“ (an).
- **▶ an einem Projekt** startet seine Sitzung im Hintergrund (tmux, Remote Control). Dabei öffnet sich
  kein Projektfenster; die Zeile zeigt „starting…“, dann den Status.
- **„▶ All“** startet alle Projekte der Liste nacheinander. Projekte, in denen schon eine Sitzung läuft,
  werden übersprungen, auch wenn du sie von Hand gestartet hast. Es läuft also nichts doppelt.
- **„at start“** (Haken an der Liste): „▶ All“ geschieht von selbst, wenn CodeDeck startet.
- **Fortsetzen statt neu:** ▶ setzt die letzte Unterhaltung des Projekts fort, wenn du sie nicht selbst
  beendet hast; sonst beginnt eine frische. Wer frisch beginnen will, nimmt danach *Restart* oder *New
  task* (A3, A4). Die Zeile sagt vorher, was ▶ tun wird („continues ‚Auth refactor‘“).
- **Die Zeile eines Projekts:** Schild und Status seiner Sitzung, Symbol für das Zuhause und den Bogen
  (A1), „+2 more“, wenn dort weitere Sitzungen laufen. **Doppelklick** geht zur Sitzung (wie A2),
  **Klick auf den Namen** öffnet das Projekt.
- Später kann es weitere Listen geben („Arbeitszeit“, „Freizeit“, mit Konto je Liste); das ist der Rest
  des früheren Schritts „Profile“.

## A13 Startseite und Projektfenster

> **Überholt durch `docs/UEBERSICHT.md` (Entwurf 2026-11-17), sofern abgestimmt:** Die Startseite ist dort
> eine eigene, immer verfügbare Übersicht für alle Projekte statt der Leiste eines Fensters ohne Projekt.

- **Kein Projekt offen:** Das Fenster ist die Startseite, immer in Leistenform. Von oben: Kopf
  (CodeDeck, Ordner öffnen, Einstellungen), „Wartet auf dich“ über **alle** Projekte (mit Projektname),
  „Today“ (die Tagesliste mit „▶ All“ und „at start“), „Other projects“ (die letzten Projekte, mit
  Sitzungen, die dort gerade laufen), unten die Zeile „3 in background · 3 reachable from anywhere“.
- **Ein Projekt offen:** keine zweite Startseite. Ihre zwei Teile stehen im Projektfenster:
  - „Wartet auf dich“ zeigt zuerst die eigenen Sitzungen, darunter die aus anderen Projekten mit
    Projektname. Doppelklick geht zur Sitzung, Klick auf den Namen öffnet das Projekt.
  - Das **Projektmenü** (Klick auf den Projektnamen im Kopf) zeigt dieselben Zeilen wie die Startseite:
    Today mit „▶ All“, Other projects, dazu „Open folder…“ und „Close project“.
- **Projekt schließen** und **letztes Projektfenster schließen** machen aus dem Fenster die Startseite;
  das Programm läuft weiter. Beendet wird über das App-Menü `⋯` → Quit (später auch über das Tray).
- Die Leistenform der Startseite ist dieselbe Spalte wie im Projekt (`docs/SEITENLEISTE.md`), nur ohne
  „Nächster Prompt“; Zeilen und „Wartet auf dich“ sind dieselben Komponenten.
- **Offen, später zu entscheiden:** CodeDeck bei der Anmeldung starten (Schalter, siehe A10) und dabei
  nur im Tray erscheinen.

---

# Teil B: Technik (wie es umgesetzt wird)

## B1 Bausteine

| Baustein | Aufgabe | Werkzeugneutral? |
|---|---|---|
| `tmux.rs` (neu) | Starten, Auflisten, Beenden; Befehl zum Anhängen; nie `send-keys` | ja |
| `terminal.rs` oder `apps.rs` | Terminalprogramm finden, mit Befehl öffnen, Fenster eines Prozesses nach vorn holen (X11) | ja |
| `hook.rs` (Transport) | Meldet zusätzlich, **wo** die Sitzung läuft (B3) | ja |
| Adapter (`harness/claude.rs`) | Startbefehl, Remote-Link, Desktop-Link, Fortsetzen | nein, je Werkzeug |
| `bridge.rs` | Feld `place` an der Sitzung; Lebenszeichen über die Prozess-ID | ja |
| Frontend | Symbole, Türen, Doppelklick, „+ New“, Einstellungen | ja (fragt `capabilities`) |

Nach 3.0 gibt es einen Prozess für alle Fenster: Start, Türen und die Liste der tmux-Sitzungen liegen
einmal im Prozess, nicht je Fenster. Das passt auch zur späteren Startseite (3.5).

## B2 Starten

```sh
tmux new-session -d -s codeck-<projekt>-<kurzname> -c <projektordner> \
  -e CODEDECK_SESSION=<uuid> -e CLAUDE_CONFIG_DIR=<konto> \
  -- claude --session-id <uuid> -n "<name>" --remote-control "<name>"
tmux set-option -t codeck-… @codedeck <uuid>      # Zuordnung überlebt einen Neustart von CodeDeck
tmux set-option -t codeck-… remain-on-exit on     # Absturz bleibt sichtbar, „Start again“ möglich
tmux set-option -t codeck-… window-size latest    # Handy und Bildschirm stören sich nicht
```

- Die **Sitzungs-ID vergibt CodeDeck** (`--session-id`). Es gibt nichts zuzuordnen; die Zeile
  „starting…“ ist sofort die richtige Sitzung.
- Den Befehl liefert der Adapter (`launch`), tmux und die Umgebung der Kern. Andere Werkzeuge bekommen
  dasselbe Zuhause ohne Remote Control.
- Fortsetzen: gleicher Aufruf mit `--resume <id>` statt `--session-id`. Restart = Stop + Fortsetzen.
- Stop: `tmux kill-session`. Claude Code speichert die Unterhaltung laufend; fortsetzen geht danach.
- Ohne tmux: Start in einem Terminalfenster (gleicher Befehl), Zuhause *Terminal*, Hinweis zur Installation.

## B3 Wo läuft eine Sitzung? Gemeldet, nicht geraten

`codeck hook` läuft als Kind des Werkzeugs. Es liest bei jeder Meldung aus seiner eigenen Umgebung,
werkzeugneutral:

- `TMUX`, `TMUX_PANE` → tmux-Sitzung,
- die Prozess-ID des Elternprozesses → Prozess der Sitzung (Lebenszeichen über `/proc`, auch ohne
  `SessionEnd` nach einem Absturz),
- `CODEDECK_SESSION` → von CodeDeck gestartet.

Werkzeugspezifisches reicht der Transport an den Adapter weiter (`Harness::place(env)`): bei Claude
`CLAUDE_CODE_BRIDGE_SESSION_ID` (ab 2.1.199, gesetzt solange Remote Control verbunden ist). Daraus folgt der
Remote-Link `https://claude.ai/code/<id>`. Das neutrale Ereignis bekommt ein Feld:

```rust
pub struct Place { pid: Option<u32>, tmux: Option<String>, launched: bool, remote: Option<String> }
```

**Gebaut (Vorarbeit, 2026-11-17):** `place.rs`, `Event.place`, `Harness::remote_link`, `Session.place`; die Details einer Sitzung zeigen tmux-Name und „von überall erreichbar“. Praxistest bestanden (2026-11-17).

Für Sitzungen, die seit dem Start von CodeDeck noch nichts gemeldet haben, liest `tmux list-panes -a -F
'#{session_name} #{pane_pid} #{@codedeck}'` einmal den Stand.

## B4 Die Türen

| Tür | Umsetzung | Grenzen |
|---|---|---|
| **Terminal** (Hintergrund) | Hängt schon ein Terminal von CodeDeck an der Sitzung: Fenster nach vorn. Sonst Terminal öffnen mit `tmux attach -t =<name>` | Unter Wayland immer ein neues Fenster (mehrere sind unproblematisch) |
| **Terminal** (von Hand) | Prozess-ID → Elternkette → Fenster über `_NET_WM_PID`, dann nach vorn (X11, `wmctrl`/`xdotool` oder direkt per X11) | Wayland: nur Meldung |
| **Browser** | Remote-Link öffnen | nur mit Remote Control |
| **Handy** | QR-Code des Remote-Links, lokal erzeugt (z. B. Crate `qrcode`) | nur mit Remote Control |
| **ssh** | Befehl kopieren | braucht ssh-Zugang zum Rechner |
| **Desktop** | siehe unten | **Spike** |

**Desktop ist der unsichere Teil.** Belegt ist:

- Remote-Control-Sitzungen erscheinen in der Liste von claude.ai/code und der Claude-App. Ob die
  Linux-Desktop-App (Beta) sie unter „Code“ zeigt, ist zu prüfen.
- `claude --desktop --resume <id>` gibt es laut Doku nur für macOS und Windows. Es zieht die Sitzung
  außerdem um, statt eine Tür zu öffnen.
- Die Desktop-App kennt `claude://`-Links. Dokumentiert ist nur `claude://code/new?…`. Die Starter der App
  nutzen zusätzlich `claude://code/continue?session=last` und `claude://code/needs-input`, und
  `claude://claude.ai/<pfad>` öffnet Seiten von claude.ai in der App.

Spike (eine Stunde, mit dem Nutzer): (1) Zeigt Desktop eine Remote-Control-Sitzung? (2) Öffnet
`claude://claude.ai/code/<session_…>` sie direkt? (3) Sonst `claude://code/needs-input` oder nur die App
nach vorn. Ergebnis bestimmt, ob *Desktop* Standardtür werden kann. Bis dahin öffnet *Desktop* die App
(und wo möglich die Sitzung), sonst ist die Tür ausgegraut.

**Ergebnis (Spike mit dem Nutzer, 2026-11-17, Claude Code 2.1.326, claude-desktop Linux):**

- `claude-desktop --user-data-dir=<profil> "claude://claude.ai/code/session_…"` holt die laufende App
  dieses Profils nach vorn und öffnet **genau diese Sitzung**. Damit kann *Desktop* Standardtür werden.
- Desktop listet die Remote-Control-Sitzung unter ihrem Projekt (Bildschirm-Symbol „auf diesem Rechner“).
- Ein Prompt aus Desktop lässt die Hooks im lokalen Prozess feuern: CodeDeck zeigt „working“, dann
  „fertig“, und die Details tmux-Name und „von überall erreichbar“. Live-Status gilt also auch, wenn man in
  Desktop tippt (vom Handy noch nicht geprüft, der Weg ist derselbe).
- Konto der Sitzung: tmux erbt `CLAUDE_CONFIG_DIR` vom Server; CodeDeck muss es darum ausdrücklich setzen
  (`-e`), wie in B2 vorgesehen.

**Konten und Desktop-Profile:** Bei zwei Profilen (`--user-data-dir`) gehört `claude://` immer nur
einem. CodeDeck öffnet Links darum nicht über `xdg-open`, sondern startet die App des Kontos:
`claude-desktop --user-data-dir=<profil> <link>`. Das Profil steht am Konto (3.2), sonst gilt der Standard.
Beim Nutzer: `~/.claude` ↔ `~/.config/claude-desktop-btc`, `~/.claude-private` ↔
`~/.config/claude-desktop-privat` (Starter `claude-btc.sh`, `claude-privat.sh`; `xdg-mime` zeigt auf
eines von beiden, das ist für CodeDeck egal).

**Hooks bei Remote Control:** Die Sitzung läuft weiter lokal, die Hooks feuern also im lokalen Prozess.
Die Doku sagt es nicht ausdrücklich; der Praxistest von 3.1 prüft es mit einem Prompt vom Handy.

## B5 Schnittstelle der Adapter

```rust
pub trait Harness {
    // … wie heute …
    fn launch(&self, l: &Launch) -> Launched;            // argv + env; Launch: ordner, konto, id, name, remote, resume
    fn place(&self, env: &HashMap<String, String>) -> Option<String>; // Remote-Link aus der Umgebung des Hooks
    fn desktop_link(&self, s: &SessionInfo) -> Option<String>;      // nach dem Spike
}
pub struct Capabilities { /* … */ pub launch: bool, pub resume: bool, pub remote: bool, pub desktop: bool }
```

Codex oder opencode liefern nur `launch` (und vielleicht `resume`). Sie bekommen Hintergrund, Terminal und
ssh; Browser, Handy und Desktop fehlen, weil `remote` fehlt. Das Frontend zeigt die Türen nach
`capabilities`.

## B6 Steuern ohne Hineintippen

Alle Steuerungen laufen über tmux und den Startbefehl, keine über `send-keys`: Start, Stop
(`kill-session`), Restart (Stop + `--resume`), Fortsetzen (`--resume`), New task (neue Sitzung). Das
erfüllt D5, ohne Grenzfälle wie „tippt CodeDeck gerade, während du tippst“.

## B7 Claudes eigene Hintergrundsitzungen

Claude Code bringt `--bg`, `claude agents` (Forschungsvorschau), `attach`, `logs`, `stop` und `respawn`
mit. Bewertet und **nicht** als Zuhause gewählt:

- nur Claude; CodeDeck braucht dasselbe Zuhause für alle Werkzeuge,
- unbeaufsichtigte Sitzungen halten nach etwa einer Stunde Leerlauf an. Dann ist auch Remote Control weg,
  also Handy und Desktop,
- Forschungsvorschau: die Schnittstelle kann sich ändern,
- je Konfigurationsordner ein eigener Supervisor.

Solche Sitzungen erkennt CodeDeck trotzdem (die Hooks feuern). Ihr Zuhause ist dann *Claude im
Hintergrund*, Tür *Terminal* über `claude attach <id>`. `claude agents --json` kann später als
zusätzliche Quelle für den Zustand dienen. Wird die Funktion stabil und deckt Remote Control ab, lässt sich
die Wahl neu prüfen.

## B8 Risiken und offene Fragen

| Frage | Folge | Wann klären |
|---|---|---|
| Zeigt Desktop (Linux) Remote-Sitzungen, öffnet ein Link sie? | Desktop als Standardtür | **geklärt 2026-11-17: ja** (B4) |
| Feuern Hooks bei Prompts aus Desktop/vom Handy? | Live-Status unterwegs | **Desktop geklärt: ja**; Handy im Praxistest 3.1 |
| Desktop-eigene Sitzungen ohne Hooks (1.1) | bleiben „nur aus dem Log“ | später, mit neuer Desktop-Version |
| Wayland | kein Nach-vorn-Holen fremder Fenster | hinnehmen, neues Terminal |
| `CLAUDE_CODE_BRIDGE_SESSION_ID` erst nach dem Verbinden gesetzt | Link fehlt in den ersten Sekunden | Link bei der nächsten Meldung |

## B9 Vorschlag für den Plan

| Schritt | Inhalt |
|---|---|
| 3.1 Sehen und Hingehen | `Place` aus dem Hook, Symbole, Doppelklick (Desktop, sonst Terminal), Mittelklick (Terminal), Türen Terminal, Desktop, Browser, Handy, ssh; Desktop-Profil je Konto zunächst als einfache Zuordnung in den Einstellungen; Meldung mit „Open“ |
| 3.2 Konten | wie geplant, dazu das Desktop-Profil je Konto |
| 3.3 Starten und Steuern | „+ New“, Continue, Restart, Stop, New task; Einstellungen „Sessions“ |
| 3.3b Neustart überstehen | Liste der Hintergrundsitzungen, Erkennen nach Neustart, „Restore all“, Warnung beim Herunterfahren, Autostart; Remote Control prüfen und neu verbinden (B11) |
| 3.4 Tagesliste und Startseite | A12, A13, B12: Startseite in Leistenform ohne offenes Projekt, Tagesliste mit ▶, „▶ All“, „at start“; Projektmenü mit denselben Zeilen; „Wartet auf dich“ über alle Projekte; Projekt schließen → Startseite |
| 3.5 Startseite ausbauen | weitere Listen (Arbeitszeit/Freizeit, Konto je Liste), Warnungen mit Behebung, Anmelde-Autostart und Tray (nach Entscheidung) |

## B10 Neustart: merken, erkennen, wiederherstellen

**Merken.** CodeDeck führt je Projekt eine kleine Liste der Hintergrundsitzungen, die es gestartet hat
(`~/.config/codedeck/background.json`: Sitzungs-ID, Werkzeug, Konto, Name, Ordner, Remote an/aus, tmux-Name,
zuletzt gesehener Status). Ein Eintrag verschwindet nur, wenn die Sitzung **gewollt** endet: Stop in
CodeDeck oder ein `session_ended` mit einem Grund, den der Adapter als „vom Nutzer“ einstuft (bei Claude
`SessionEnd.reason` = `prompt_input_exit`, `clear`, `logout`; neutral als `Event.by_user`).

**Erkennen.** Beim Start von CodeDeck (und wenn der Prozess einer Sitzung verschwindet) gilt für jeden
Eintrag: tmux-Sitzung fehlt → unterbrochen. Liegt der Systemstart (`btime` in `/proc/stat`) nach dem
letzten Lebenszeichen, war es ein Neustart; sonst ein Absturz oder `tmux kill-server`. Beides wird gleich
behandelt, nur der Text unterscheidet sich. Stand der letzte Status auf `working`, war die Runde
abgebrochen; ihr Sicherungspunkt am Rundenanfang existiert schon (`snapshot.rs`).

**Wiederherstellen.** Jeder Eintrag wird mit dem Startbefehl aus B2 fortgesetzt, mit `--resume <id>` statt
`--session-id`, unter demselben tmux-Namen. Der Remote-Link kann sich dabei ändern; CodeDeck liest ihn
wie immer aus der nächsten Meldung (B3). Nacheinander mit kurzer Pause, nicht alle gleichzeitig.

**Vorher warnen.** Solange eine Sitzung `working` ist, hält CodeDeck eine Sperre bei logind
(`org.freedesktop.login1.Manager.Inhibit`, `what=shutdown:sleep`, `mode=delay`, Grund „2 sessions are
working“). Cinnamon und GNOME zeigen sie im Dialog. Mit `delay` blockiert CodeDeck nichts, es verzögert
höchstens um wenige Sekunden. Endet die Runde, gibt CodeDeck die Sperre frei. Optional, klein, nur Linux.

**Autostart.** Ein Eintrag in `~/.config/autostart/` (Schalter in den Einstellungen) startet CodeDeck bei
der Anmeldung, damit „restore automatically“ ohne Zutun wirkt. Ohne Anmeldung gibt es keine
Wiederherstellung; das bleibt bewusst so (kein Systemdienst).

**Warum nicht tmux-resurrect o. Ä.:** Solche Werkzeuge stellen Fenster und Befehle wieder her, kennen aber
weder Sitzungs-ID noch Konto. Ein bloßes `claude` würde eine **neue** Sitzung beginnen. Nur CodeDeck weiß,
welche Unterhaltung wohin gehört.

| Offen | Klären im Praxistest |
|---|---|
| Fortsetzen nach abgebrochener Runde: verhält sich Claude Code sauber (halbe Werkzeugaufrufe)? | einmal mitten in einer Runde `tmux kill-server` |
| Ruhezustand statt Neustart | tmux überlebt; laut Doku verbindet Remote Control von selbst wieder |

## B11 Remote Control: was schiefgeht und was CodeDeck dagegen tut

Der lokale Teil einer Sitzung übersteht einen Neustart gut. Schwach ist der Weg zu Handy und Desktop.
Die Doku (https://code.claude.com/docs/en/remote-control) und offene Fehlerberichte zeigen:

| Problem | Beleg |
|---|---|
| `claude --resume` versucht, die **alte** Remote-Sitzung wieder anzubinden. Ist sie weg, kommt „Previous session is unavailable — run /remote-control“: die Sitzung läuft dann **nur lokal**, ohne Handy und Desktop. Behebt man das mit `/remote-control` ohne Neustart, fehlt der neuen Remote-Sitzung die bisherige Unterhaltung | Doku, Troubleshooting |
| Wiederanbinden geht nur begrenzt lange (beim Server-Modus etwa vier Stunden nach dem Stopp) | Doku, „Resume sessions after stopping the server“ |
| `claude --remote-control --resume <id>` hängt manchmal ohne Fehler, wenn die Remote-Sitzung abgelaufen ist | Fehlerbericht #77749 |
| Gleich nach der Anmeldung ist das Netz oft noch nicht da: „Couldn't verify your organization's policy“, Remote Control bleibt aus | Doku, Troubleshooting |
| Nach etwa 30 Minuten ohne Kontakt zum Server trennt eine Sitzung von selbst; Abhilfe nur `/remote-control` **in der Sitzung** | Doku, Limitations |
| Getrennte Einträge bleiben in der Liste der App stehen und lassen sich dort nicht entfernen | Fehlerbericht #61525 |

Gemeinsam ist allen: Behoben wird es in der Sitzung selbst (`/remote-control` tippen), also am Rechner.
Genau das will man unterwegs nicht, und CodeDeck tippt nicht in Sitzungen (B6). Was CodeDeck stattdessen
tut:

1. **Ehrlich anzeigen.** Der türkise Bogen erscheint nur, wenn Remote Control **wirklich** verbunden ist,
   nicht schon, weil es beim Start verlangt war. Quellen: `CLAUDE_CODE_BRIDGE_SESSION_ID` in der Umgebung
   jeder Hook-Meldung (gesetzt nur bei Verbindung), und das Logende der Sitzung: Claude Code schreibt den
   Grund einer Trennung in die Unterhaltung. Das Logende liest die Brücke für 2.3c schon; der Adapter
   erkennt dort die Trennung (genaue Form im Praxistest belegen). Ist die Verbindung weg, wird der Bogen
   orange: „Not reachable from your phone“, mit Grund im Tooltip.
2. **Neu verbinden per Neustart statt per Tippen.** Knopf **Reconnect** an der Sitzung: Stop, dann neu
   starten mit `--resume <id> --fork-session --remote-control "<name>"`. `--fork-session` gibt der
   Unterhaltung eine neue ID; damit gibt es keine tote Bindung, die Claude Code wiederbeleben will, und
   Remote Control legt eine neue Sitzung **mit** der bisherigen Unterhaltung an (es ist ein frischer
   Prozess, nicht `/remote-control` mitten in der Sitzung). Die neue ID erfährt CodeDeck über
   `CODEDECK_SESSION` aus der ersten Meldung (B3). Für dich bleibt es dieselbe Zeile in der Liste, mit
   derselben Farbe und demselben Kurznamen.
3. **Beim Wiederherstellen nach dem Neustart automatisch.** Erst warten, bis das Netz da ist (z. B.
   NetworkManager meldet „online“, oder höchstens zwei Minuten). Dann fortsetzen wie in B10. Kommt binnen
   etwa 60 Sekunden keine Meldung mit Remote-ID (Bindung tot) oder gar keine (hängt, #77749), führt
   CodeDeck den Reconnect aus Punkt 2 einmal von selbst aus. Gefahrlos, weil nach einem Neustart noch
   niemand in der Sitzung tippt. Klappt auch das nicht: Sitzung läuft lokal, Bogen orange, Hinweis.
4. **Unterwegs bemerken.** Trennt sich eine Sitzung, während niemand am Rechner ist, kann CodeDeck sie
   **nicht** wiederbeleben, ohne neu zu starten. Neustart einer Sitzung, die vielleicht gerade arbeitet,
   macht CodeDeck nie von selbst. Eine wartende oder fertige Sitzung (`idle`) darf es nach einer
   Einstellung („Reconnect idle sessions automatically“, Vorgabe aus) selbst neu verbinden; dann ist sie
   nach wenigen Sekunden auf dem Handy wieder da, unter neuem Eintrag.
5. **Alte Einträge:** Nach einem Reconnect steht der alte Eintrag in der App noch da. CodeDeck kann das
   nicht ändern; der Hinweis an der Sitzung sagt, welcher Eintrag der aktuelle ist (gleicher Name, in der
   App oben).

Spike dazu (mit dem Desktop-Spike aus B4): (a) Bindet `--resume` nach einem echten Neustart die alte
Remote-Sitzung an, und wie lange danach noch? (b) Trägt `--resume --fork-session --remote-control` die
Unterhaltung in die neue Remote-Sitzung? (c) Lässt sich `--fork-session` mit `--session-id` kombinieren
(dann vergibt CodeDeck auch die neue ID selbst)? (d) Wie sieht die Trennung im Log aus?

**Ergebnis (2026-11-17, ohne echten Neustart):**

- (a) teilweise: `tmux kill-session`, dann sofort `--resume <id> --remote-control` bindet **dieselbe**
  Remote-Sitzung wieder an, mit ganzer Unterhaltung. Wie lange das nach einem echten Neustart noch geht,
  bleibt für den Praxistest von 3.3b.
- (b) ja: `--resume <id> --fork-session --remote-control` legt eine neue Remote-Sitzung an, Desktop zeigt
  darin die bisherige Unterhaltung, ein Prompt von dort läuft und meldet sich bei CodeDeck.
- (c) ja: `--resume <alt> --fork-session --session-id <neu>` verwendet genau die neue ID (Log
  `<neu>.jsonl`). CodeDeck vergibt also auch bei Reconnect die ID selbst und braucht kein Zuordnen.
- In der Liste von Desktop stand danach **nur ein** Eintrag „CodeDeck Spike“, kein toter alter. Punkt 5
  oben (alte Einträge) ist damit zumindest bei kurzem Abstand kein Problem.
- (d) offen: braucht eine echte Trennung (Netz weg, Ruhezustand); Praxistest 3.3b.
- Nebenwirkung: Während des Spikes kam eine Mail „A computer was registered to your Claude account“
  (Zeit und Gerät passten). Im Praxistest 3.3b prüfen, ob sie bei jedem Start/Reconnect kommt oder nur
  einmal je Rechner; bei jedem Mal wären „▶ All“ und Reconnect lästig, dann in der Oberfläche darauf
  hinweisen.

## B12 Tagesliste und Startseite

**Projekte ohne Fenster.** Nach 3.0 nimmt ein Prozess alle Hook-Meldungen an. Heute nimmt jedes Fenster
nur die seines Projekts; die anderen gehen verloren (`hook.rs` `forward`). Für die Tagesliste hält der
Prozess ein `Inner` je **bekanntem** Projekt (Tagesliste, offene Fenster, Projekte mit laufender
Sitzung), unabhängig davon, ob ein Fenster es zeigt. Ein Fenster, das ein Projekt öffnet, bekommt dessen
`Inner`, statt ein neues anzulegen. Meldungen aus unbekannten Ordnern legen ein Projekt nur an, wenn der
Ordner zu einem Repo gehört (wie heute `project.rs`).

**Speichern.** In `~/.config/codedeck/projects.json` (oder als Felder an `recent.rs`): je Projekt
`daily`, Konto, Remote an/aus; dazu der Haken `start_daily`. Dieselbe Datei nimmt später weitere Listen
auf (3.5).

**Starten.** ▶ ruft denselben Start wie „+ New“ (B2), mit festem tmux-Namen `codeck-<projekt>` für die
Sitzung der Tagesliste (weitere: `codeck-<projekt>-<kurzname>`). Fortsetzen: Der Eintrag in
`background.json` (B10) bzw. die letzte Sitzung des Projekts aus dem Log, wenn sie nicht mit einem
Grund „vom Nutzer“ endete (`Event.by_user`); dann `--resume <id>`, sonst `--session-id <neu>`. „▶ All“
startet nacheinander mit kurzer Pause (wie das Wiederherstellen in B10) und überspringt Projekte mit
einer lebenden Sitzung, gleich welchen Zuhauses (`Session.place`, Prozess lebt).

**„at start“ und Neustart.** Beim Start von CodeDeck läuft zuerst die Wiederherstellung (B10), dann
„▶ All“ für das, was danach noch fehlt. Damit startet nichts doppelt, und die Sitzungen der Tagesliste
werden nach einem Neustart fortgesetzt statt neu begonnen.

**Fenster.** Ohne Projekt lädt das Fenster die Startseite (eigener Zustand im Frontend, kein
`Current`-Projekt); die Leistenform ist dann fest. „Close project“ und das Schließen des letzten
Projektfensters wechseln dorthin, statt das Programm zu beenden (ändert die Regel aus 3.0). Quit steht im
App-Menü.

## Zu entscheiden

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Zuhause für von CodeDeck gestartete Sitzungen | **entschieden (Nutzer, 2026-11-18):** tmux, mit Remote Control (B7 begründet, warum nicht `--bg`) |
| 2 | Standardtür beim Doppelklick | **entschieden (Nutzer, 2026-11-17):** Desktop, wo vorhanden, sonst Terminal; Mittelklick immer Terminal; änderbar in den Einstellungen |
| 3 | CodeDeck tippt nie in eine Sitzung, auch nicht für New task | **entschieden (Nutzer, 2026-11-18):** ja |
| 4 | Remote Control für neue Sitzungen vorgegeben an | **entschieden (Nutzer, 2026-11-18):** ja |
| 5 | Kein „Umziehen nach Desktop“ | **entschieden (Nutzer, 2026-11-18):** ja, Desktop kommt über Remote Control dazu |
| 6 | Nach einem Neustart | fragen (Vorgabe), wahlweise automatisch; Warnung beim Herunterfahren, solange eine Sitzung arbeitet |
| 7 | Remote Control wiederherstellen | per Neustart mit `--fork-session` (neuer Eintrag in der App), nie per Tippen; automatisch nur beim Wiederherstellen nach dem Neustart, sonst Knopf |
| 8 | Tagesliste | **entschieden (Nutzer, 2026-11-17):** eine Sitzung je Projekt; ▶ setzt fort, frisch beginnen über Restart/New task; „▶ All“ überspringt Laufendes |
| 9 | Automatischer Start der Tagesliste | **entschieden:** beim Start von CodeDeck reicht („at start“) |
| 10 | Startseite | **entschieden:** ohne offenes Projekt die Leiste als Startseite; mit Projekt keine eigene Startseite, sondern „Wartet auf dich“ über alle Projekte und die Tagesliste im Projektmenü; Projekt schließen → Startseite |
| 11 | CodeDeck bei der Anmeldung starten, nur im Tray | **entschieden (Nutzer, 2026-11-18):** ja, als Einstellung; gebaut mit 3.5. Weitere Listen und Warnungen mit Behebung vorerst nicht |
