# Konzept: Kopfleiste rechts oben, Einstellungen, About

Stand 2026-11-16. Entscheidungen des Nutzers: Einstellungen als Dialog über dem Deck, App-Menü hinter `⋯`, das
Verbindungs-Panel bleibt zusätzlich in der Statusleiste, „Nicht stören“ gleich mit. Gebaut als Schritt 2.1b (siehe
PLAN); was davon noch fehlt, steht unten unter „Umsetzung“. Ersetzt in `docs/SEITENLEISTE.md` Schritt A („Kopf rechts“)
durch einen ausgearbeiteten Vorschlag. Entwurf zum Ansehen: `.scratch/menu-draft/draft.png`.

## Anlass

Alles, was keinen eigenen Ort hat, landet heute im Projektmenü links oben: zuletzt Sprache und „Melden, wenn ich
woanders bin“. Mit der Seitenleiste (nur die rechte Spalte bleibt), der Startseite (3.5), Konten (3.2) und Profilen
(3.4) wird das mehr. Es braucht einen festen Ort für **Projekt**, **Einstellungen** und **die App selbst**, der in
jeder Form von CodeDeck gleich bleibt.

## Grundsatz

**Die Kopfleiste gehört zur rechten Spalte**, weil die rechte Spalte in jeder Form bleibt: volles Fenster,
Seitenleiste, später neben der Startseite. Links oben bleibt, was zu den Dateien gehört: Pfad und Filter.

Drei Fragen, drei Orte, nicht mehr:

| Ort | Frage | Inhalt |
|---|---|---|
| **Projekt** (links in der Leiste, breit) | Wo bin ich? | Projektname, Wechsel, zuletzt benutzte, öffnen, neues Fenster; später Startseite und Profile |
| **Schnelleinstellungen** (Icon) | Wie verhält sich CodeDeck gerade? | was man oft umschaltet, ohne Dialog; unten „Alle Einstellungen…“ |
| **App-Menü** (Icon) | Was ist CodeDeck? | About, Tastenkürzel, Hilfe, Neuigkeiten, Fehler melden, Git-Befehle |

Dazu ein Knopf, der keine Liste öffnet: **Seitenleiste ↔ volles Fenster**.

## Die Leiste

```
volles Fenster (rechte Spalte, 44 px hoch wie die Köpfe daneben)
┌───────────────────────────────────────────────────┐
│ ▣ orbit-api ▾                     ◧   ⚙ ▾   ⋯     │
└───────────────────────────────────────────────────┘
  │                                 │    │     └ App-Menü
  │                                 │    └ Schnelleinstellungen
  │                                 └ Seitenleiste ↔ volles Fenster (Ctrl+Shift+L)
  └ Logo und Projekt: Projektmenü

Seitenleiste (≈ 340 px): dieselbe Leiste; ein langer Projektname wird gekürzt, die Icons bleiben.
Startseite (3.5): links steht „Alle Projekte“ statt des Projekts; im Projekt ein Rückweg „‹ Alle Projekte“.
```

- Zustände an den Icons, ohne Text: ⚙ trägt einen Punkt, wenn „Nicht stören“ an ist oder die Verbindung zum
  KI-Werkzeug fehlt. So sieht man Ausnahmen, ohne das Menü zu öffnen.
- Alles per Tastatur: `Ctrl+O` Projekt öffnen, `Ctrl+,` Einstellungen, `Ctrl+Shift+L` Seitenleiste, `F1`
  Tastenkürzel. Die Menüs öffnen mit Enter und schließen mit Esc wie heute.

## 1 Projektmenü

```
┌ orbit-api ──────────────────────────────┐
│ ~/projects/orbit-api            ⧉ Kopieren│  Pfad, Klick auf einen Teil öffnet ihn als Projekt
├──────────────────────────────────────────┤
│ ⌂ Alle Projekte              2 warten    │  ab 3.5 (Startseite), mit der Zahl über alle Projekte
├ ZULETZT ─────────────────────────────────┤
│ billing-web   ~/projects/billing-web  ●1 │  ab 3.5: wartende Sitzungen je Projekt
│ orbit-cli     ~/projects/orbit-cli    ⧉  │  ⧉ = in neuem Fenster
│ notes         ~/notes                    │
├──────────────────────────────────────────┤
│ 🗀 Ordner öffnen…                 Ctrl+O │
│ ⧉ In neuem Fenster…         Ctrl+Shift+O │
│ ⇱ Im Dateimanager zeigen                 │
├ PROFIL ──────────────────────────────────┤  ab 3.4
│ ◉ Arbeitszeit  ○ Freizeit                │
└──────────────────────────────────────────┘
```

Was heute dort steht und bleibt: zuletzt benutzte Projekte, Ordner öffnen, neues Fenster, Strg+Klick. Was
**auszieht**: Sprache und Benachrichtigungen (in die Schnelleinstellungen). Was **hinzukommt**: der Pfad mit
Kopieren (die Brotkrumen links bleiben trotzdem), „Im Dateimanager zeigen“, später Startseite und Profil.

## 2 Schnelleinstellungen

Nur, was man im Lauf eines Tages umschaltet. Jede Zeile wirkt sofort und ist für diesen Rechner gemerkt.

```
┌ Schnelleinstellungen ────────────────────┐
│ 🔕 Nicht stören                 [ 1 Std ▾]│  Meldungen pausieren: 30 Min, 1 Std, bis morgen, aus
├ MELDEN, WENN ICH WOANDERS BIN ───────────┤
│ ☑ eine Sitzung fragt                     │
│ ☑ eine Runde ist fertig                  │
│ ☐ ein Git-Befehl scheitert               │
│ wie:  ☑ Taskleiste  ☑ Meldung            │
├ ANSICHT ─────────────────────────────────┤
│ ◧ Seitenleiste           Ctrl+Shift+L    │
│ Sprache                [English|Deutsch] │
├ KI-WERKZEUG ─────────────────────────────┤
│ ● Claude: verbunden (2 Konfigurationen) › │  öffnet das Verbindungs-Panel (heute in der Statusleiste)
├──────────────────────────────────────────┤
│ ⚙ Alle Einstellungen…            Ctrl+,  │
└──────────────────────────────────────────┘
```

„Nicht stören“ ist neu, aber klein und gehört zu 2.1a: Wer gerade präsentiert oder sich konzentriert, schaltet
Meldungen und Taskleiste für eine Weile ab; der Fenstertitel zählt weiter.

## 3 App-Menü

```
┌──────────────────────────────────────────┐
│ ⓘ Über CodeDeck                          │  About-Dialog
│ ⌨ Tastenkürzel                       F1  │  Übersicht als Overlay
│ ? Hilfe                                  │  codedeck.bespex.run (Website) bzw. README
│ ✦ Neu in 0.2                             │  Änderungen seit der zuletzt gesehenen Version
├──────────────────────────────────────────┤
│ ⌘ Git-Befehle                Ctrl+Shift+G│  wie „git“ in der Statusleiste
│ 🐞 Fehler melden…                        │  GitHub-Issue mit Version und System vorbelegt
├──────────────────────────────────────────┤
│ ⧉ Neues Fenster                          │
└──────────────────────────────────────────┘
```

Das Icon: `⋯` (drei Punkte) ist allgemein verständlich. Alternative: das kleine Stapel-Icon von CodeDeck als
Knopf, dann trägt die Leiste die Marke. Vorschlag: `⋯`, weil das Logo schon links beim Projekt steht.

## 4 About-Dialog

Nach `brand/README.md` §11, als kleiner Dialog über dem Fenster (in der Seitenleiste über der Spalte):

```
          [Stapel-Icon 72 px]
              co de ck              ← Schriftzug, „de“ orange
   AI session radar for Linux · sprich „Codeck“
   Version 0.1.1 · Commit fdffba4 · Tauri 2, WebKitGTK 2.48
   codedeck.bespex.run · Quellcode · Lizenz MIT
   ───────────────────────────────────────────
   Version kopieren                     be spex
```

„Version kopieren“ legt Version, Commit, Betriebssystem und WebKitGTK-Version in die Zwischenablage, für
Fehlermeldungen.

## 5 Einstellungsdialog

Ein Dialog über dem Deck, links die Bereiche, rechts die Einstellungen. Jede Einstellung sagt, **wofür sie gilt**:
*dieser Rechner* (`~/.config/codedeck/settings.json`) oder *dieses Projekt* (`.codedeck.toml`). Änderungen wirken
sofort, es gibt kein „Speichern“.

| Bereich | Einstellungen (heute fest im Code → künftig einstellbar) | Gilt für |
|---|---|---|
| **Allgemein** | Sprache · beim Start öffnen: letztes Projekt / Startseite (ab 3.5) · Projekt öffnet in Reiter (D14) | Rechner |
| **Meldungen** | wobei, wie (wie in den Schnelleinstellungen) · Nicht stören · Ruhezeiten (z. B. 20–8 Uhr) | Rechner |
| **Sitzungen** | wie lange eine fertige Runde unter „Wartet auf dich“ steht (heute 30 Min, `DONE_SHOWN_MS`) · ab wann untätige unter „Früher“ (6 h, `EARLIER_AFTER_MS`) · Startregeln anzeigen (nur lesen) | Rechner |
| **Snapshots** | wie viele je Repo (50, `snapshot.rs` `KEEP`) · wie lange (14 Tage) | Projekt |
| **Werkbank** | „älter als“ für `.scratch/` (7 Tage) · `.scratch/` im Dateibaum zeigen | Projekt |
| **KI-Werkzeuge** | Verbindungen je Konfiguration (heute im Statusleisten-Panel) · später Konten mit Name und Farbe (3.2) | Rechner |
| **Programme** | welche Viewer für welche Dateiart (Qiew), „Öffnen mit“-Standards, Marq/Dirq gefunden oder nicht | Rechner |
| **Tastenkürzel** | die globalen (Einblenden, Seitenleiste) ändern, Konflikte anzeigen | Rechner |
| **Profile** (ab 3.4) | Arbeitszeit/Freizeit: Projekte × Konto | Rechner |

Im vollen Fenster liegt der Dialog über dem Deck. In der Seitenleiste klappt CodeDeck vorher auf (Grundregel der
Seitenleiste: Sprünge ins Deck klappen auf). Ein eigenes Fenster wäre auch möglich, ist aber bei „ein Fenster je
Projekt“ unnötig verwirrend.

## Startseite (3.5) und später

- **Die Leiste bleibt dieselbe**, nur das linke Element wechselt: auf der Startseite „⌂ Alle Projekte“, im Projekt
  der Projektname mit einem Rückweg. Damit ist die Frage aus 3.5 („ein Hauptfenster oder Startseite als eigenes
  Fenster“) für die Leiste egal: Sie funktioniert in beiden Fällen.
- **Konten** (3.2) bekommen im Konzept eine schwebende Seitenleiste; ihr Einstieg wäre das Personen-Icon des
  Dummys. Vorschlag: kein viertes Icon, sondern Einträge in Schnelleinstellungen (Zeile „KI-Werkzeug“) und im
  Einstellungsdialog, damit die Leiste nicht wächst.
- **Befehlspalette** (`Ctrl+K`, Idee für später): alle Befehle aus diesen Menüs per Suche, praktisch in der schmalen
  Seitenleiste. Die Menüs werden dafür aus einer Liste von Befehlen gebaut, nicht von Hand: Projektmenü,
  Schnelleinstellungen, App-Menü und Palette lesen dieselbe Liste.

## Umsetzung (Vorschlag, ein Schritt „Kopfleiste“ statt Seitenleiste A)

1. `ProjectHeader` in die rechte Spalte, links bleiben Pfad und Filter (`FilesPanel`).
2. Schnelleinstellungen mit dem, was es gibt (Meldungen, Sprache, Verbindung) und „Nicht stören“.
3. App-Menü mit About-Dialog, Tastenkürzel-Übersicht, Hilfe, Git-Befehle, Fehler melden.
4. Einstellungsdialog mit den Bereichen, deren Einstellungen es schon gibt (Allgemein, Meldungen, KI-Werkzeuge);
   die übrigen Bereiche, sobald ihre Werte einstellbar werden. Speicher: `settings.json` (Rechner) und
   `.codedeck.toml` (Projekt), Backend-Befehle mit Mocks in `backend.ts`.
5. Der Seitenleisten-Knopf erscheint, sobald die Seitenleiste (Schritt B) gebaut ist.

## Gebaut (2.1b) und offen

Gebaut: Leiste mit Projektmenü (Pfad mit Kopieren, zuletzt benutzte, öffnen, neues Fenster, im Dateimanager zeigen),
Schnelleinstellungen (Nicht stören, Meldungen, Sprache, KI-Werkzeug, „Alle Einstellungen…“; Punkt am Knopf bei „Nicht
stören“ oder fehlender Verbindung), App-Menü (Über, Tastenkürzel, Hilfe, Git-Befehle, Fehler melden, neues Fenster),
About-Dialog (Version mit Commit aus `build.rs`, Version kopieren), Tastenkürzel-Übersicht, Einstellungsdialog mit
Allgemein, Meldungen, KI-Werkzeuge. Links oben nur noch der Pfad.

Mit 2.1c dazu: der Knopf Seitenleiste ↔ volles Fenster ganz rechts, globale Kürzel unter Allgemein.

Offen: Bereiche Sitzungen, Snapshots, Werkbank, Programme, Tastenkürzel im
Dialog (sobald ihre Werte einstellbar sind; dann auch `settings.json` und `.codedeck.toml`), „Neu in …“ (braucht ein
Änderungsprotokoll), Startseite, Profile, Konten, Befehlspalette. Die Hilfe öffnet vorerst die README auf GitHub, der
About-Dialog die Website-Seite `bespex.github.io/codedeck/` (bis `codedeck.bespex.run` eingerichtet ist).

## Fragen an den Nutzer (beantwortet 2026-11-16)

1. **Einstellungen als Dialog über dem Deck** (Vorschlag) oder als eigenes Fenster?
2. **App-Menü-Icon:** `⋯` (Vorschlag) oder das Stapel-Icon?
3. **Verbindungs-Panel:** bleibt es zusätzlich in der Statusleiste („Claude“)? Vorschlag: ja, denn dort sieht man den
   Zustand; Schnelleinstellungen und Einstellungen führen zum selben Panel.
4. **„Nicht stören“** gleich mit bauen (Vorschlag) oder später?
