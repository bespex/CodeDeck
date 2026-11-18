# Styling: Farbschemata zum Auswählen

**Stand 2026-11-17: S.1 und S.2 gebaut, Familie aus neun Themes (B7)** (auf Wunsch des Nutzers vorgezogen): vier Themes, Wahl im
Einstellungsdialog mit Vorschau beim Überfahren, Glas, Verläufe, Hintergrundschimmer, „Reduce transparency“, Prüfung
`npm run themes`. Noch offen: durchscheinendes Fenster (Spike, B4a), Eingriff `selection`, „dem System folgen“,
Theme-Labor in der Vorschau (bis dahin `design/click-dummy/themes.html`), eigene Themes (C6).
Ursprünglich: Konzept für später (nach MVP 3), Entwurf vom 2026-11-17. Theme-Labor als Dummy:
`design/click-dummy/themes.html` (Aufruf wie in `design/click-dummy/README.md`, dann
`http://localhost:5392/themes.html`).

## Kurzfassung

CodeDeck bekommt **Themes**: fertige Farbgebungen, die man im Einstellungsdialog auswählt und beim
Überfahren sofort sieht. Ein Theme ist eine **kleine Datei mit Rollen statt Farben**: Man nennt Hintergrund,
Schrift, Akzent, KI-Farbe und vier Zustandsfarben, den Rest leitet CodeDeck ab. Dazu kommen wenige
**Eingriffe** mit festen Stufen (Ecken, Linien, Tönung der Bereiche, Leuchten, Tiefe, Bewegung, Glas,
Verläufe, Hintergrundschimmer). Damit
reicht die Spanne von ruhig-dunkel über hell und edel bis bunt und kontraststark, ohne dass ein Theme CSS
enthält. Eine automatische Prüfung stellt sicher, dass jedes Theme lesbar bleibt und jede Farbe ihre
Bedeutung behält.

---

## Ausgangslage

| Befund | Folge |
|---|---|
| Komponenten nutzen **Rollen** (`bg-panel`, `border-line`, `text-changed`, `bg-brand-fill` …), rund 600 Stellen, kein Hex-Wert im TSX | Themes sind fast nur eine Frage der Variablen |
| Schrift und Flächendetails laufen über die Graustufen `slate-50 … slate-950` (rund 550 Stellen), die `index.css` schon heute mit eigenen Werten belegt | Die Skala kann je Theme neu belegt werden, auch umgekehrt für hell (siehe C3) |
| Etwa 25 Stellen nutzen feste Tailwind-Farben (`text-white` auf orangem Knopf, `indigo-*`, `teal-*`, `bg-black/45`) | vorher auf Rollen umstellen |
| Das inaktive Fenster hat eine **handgeschriebene** Liste gedämpfter Farben (`:root.inactive`) | wird abgeleitet, sonst bräuchte jedes Theme eine zweite Liste |
| `color-scheme: dark` fest, Schatten auf dunkel abgestimmt | wird Teil des Themes |

---

# Teil A: Benutzeroberfläche (was du siehst)

## A1 Auswählen

- **Einstellungsdialog** (`Ctrl+,`), Abschnitt „General“, nur dort (Entscheidung des Nutzers 2026-11-17: nicht in den
  Schnelleinstellungen): die Themes als Galerie mit Farbstreifen. **Zeigen auf ein Theme zeigt es sofort im ganzen
  Fenster**, ein Klick behält es, Wegfahren stellt das alte wieder her. Später dazu
  „Follow the system (light/dark)“: dann wählt man je ein Theme für hell und für dunkel.
- Die Wahl gilt **je Rechner** für alle Fenster (wie die Sprache) und wirkt sofort in allen.

## A2 Was mitgeliefert wird

Neun Themes: die Vorgabe und acht mit je einem eigenen Gestaltungsgedanken (Beschreibung und Werte in B7).
Alle bestehen dieselbe Prüfung; keines ist nur „andere Farben“.

| Theme | In einem Satz | Hell/Dunkel |
|---|---|---|
| **CodeDeck** (Vorgabe) | ruhig, grau zuerst, Farbe nur mit Bedeutung | dunkel |
| **Paper** | Karamell und Creme nach dem Vorbild „Charamel“: warmer Rahmen, heller Inhalt, wenig Farbe | hell |
| **Colorful** | hell und bunt: jeder Bereich hat seine Farbe, Ereignisse als leuchtende Schilder | hell |
| **Moon** | Nachtblauer Rahmen, Inhalt in Graphit, Mondgold und Laternenlicht als Akzente | dunkel |
| **Forest** | Rahmen in Moos, Inhalt in Rinde, Highlights in Blüten- und Fruchtfarben | dunkel |
| **Elegance** | warmes Anthrazit im Lackrahmen, Champagnergold und Cognac, nichts leuchtet | dunkel |
| **Fancy** | Spotlight: dunkle, ruhige Bühne, nur Ereignisse leuchten in Neon | dunkel |
| **Terminal** | Festbreitenschrift, eckig, ANSI-Farben auf Schwarz, ruhig genug zum Arbeiten | dunkel |
| **Contrast** | Schwarz und Weiß, kräftige Linien, keine Effekte, für schwierige Bedingungen | dunkel |

## A3 Was ein Theme nie ändert

- **Bedeutung:** Akzent = du und deine Hauptaktion, KI-Farbe = was die KI tut, Warm = wartet auf dich,
  Rot = Problem. Ein Theme darf die Töne ändern, nicht was sie bedeuten.
- **Aufbau, Größen, Texte, Tastenkürzel.** Ein Theme ist Aussehen, kein anderes Programm.
- **Das Logo** behält seine Farben.

---

# Teil B: Gestaltungssystem

## B1 Drei Ebenen

1. **Theme-Datei:** wenige benannte Farben und Eingriffe (B4), sonst nichts.
2. **Rollen:** CSS-Variablen, aus der Datei gefüllt oder abgeleitet (B2). Nur sie benutzen die Komponenten.
3. **Komponenten:** kennen nur Rollen (`bg-panel`, `text-changed` …), nie einen Farbwert. Das ist heute
   schon fast so.

## B2 Die Rollen

**Pflicht** = muss in der Datei stehen. **Abgeleitet** = darf fehlen, CodeDeck rechnet es aus (C2).

| Rolle (Variable) | Bedeutung | Pflicht? | Regel |
|---|---|---|---|
| `bg` | Grundfarbe, aus ihr entstehen alle Flächen | Pflicht | – |
| `fg` | hellste bzw. stärkste Schrift | Pflicht | ≥ 7 : 1 auf allen Flächen |
| `base` · `panel` · `raised` | Bühne (Deck), Seitenspalten, gehobene Zeilen | abgeleitet | Deck am dunkelsten (dunkel) bzw. hellsten (hell) |
| `line` | Trennlinien und Ränder | abgeleitet | ≥ 1,5 : 1 gegen `panel` (bei `lines: strong` ≥ 3 : 1) |
| `overlay` · `overlay-hover` · `overlay-line` | Menüs, Popups, Tooltips | abgeleitet | eine Stufe näher als `raised` |
| Skala `n-50 … n-950` (heute `slate-*`) | Schrift- und Detailstufen von „stark“ bis „Grund“ | abgeleitet | 50–300 Text ≥ 4,5 : 1, 400–500 leiser Text ≥ 4 : 1, 600 nur Dekor |
| `accent` | du: wo du bist, die eine Hauptaktion | Pflicht | ≥ 3 : 1 auf `panel` |
| `accent-fill` · `accent-fill-hover` · `on-accent` | gefüllter Hauptknopf und seine Schrift | abgeleitet | `on-accent` ≥ 4,5 : 1 auf `accent-fill` |
| `accent-soft` | Akzent als Schrift | abgeleitet | ≥ 4,5 : 1 auf `panel` |
| `ai` | was die KI tut, Auswahl, Fokus | Pflicht | ≥ 3 : 1 auf `panel` |
| `wait` (heute `changed`) | geändert, wartet auf dich | Pflicht | ≥ 3 : 1; deutlich anders als `accent` und `problem` |
| `done` | eine Runde ist fertig, als Ereignis | abgeleitet (`added`) | ≥ 3 : 1; deutlich anders als `wait`, `problem`, `ai`; bei `events: loud` Schrift darauf ≥ 4,5 : 1 |
| Zonen `zone-files` · `zone-tabs` · `zone-side` · `zone-bar` | Fläche der Bereiche mit `zones` | abgeleitet | Text darauf wie auf `panel` (4,5 bzw. 4 : 1), Zustandsfarben auf der rechten Spalte ≥ 3 : 1 |
| `added` · `problem` · `moved` | neu · gelöscht/Fehler · verschoben | Pflicht | je ≥ 3 : 1 auf `panel` |
| `session-0 … 5` | Farben der Sitzungen | abgeleitet aus `ai` (oder Liste) | untereinander unterscheidbar; fern von `accent`, `wait`, `problem` |
| `area-ai` · `area-you` · `area-wait` | Grundton der Bereiche | abgeleitet | Stärke über `areaTint` (B4) |
| `focus` | Tastaturfokus | abgeleitet aus `ai` | ≥ 3 : 1 auf allen Flächen |
| `edge` | feine Kante um das Fenster | abgeleitet | – |
| `scheme` | `dark` oder `light`: native Bedienelemente, Schatten | Pflicht | – |

Das sind **neun Pflichtfarben** (`bg`, `fg`, `accent`, `ai`, `wait`, `added`, `problem`, `moved`, dazu
`scheme`). Jede abgeleitete Rolle darf ein Theme trotzdem selbst setzen, wenn es das genauer will.

## B3 Leitplanken (die automatische Prüfung)

- **Kontrast** wie in B2. Unterschreitet ein Theme eine Regel, ist es kein Fehler beim Benutzer, sondern
  beim Erstellen: Die Prüfung (C5) lehnt es ab, mitgeliefert wird nur, was besteht.
- **Unterscheidbarkeit:** `accent`, `wait`, `problem` und `ai` müssen paarweise mindestens so weit
  auseinanderliegen wie die engsten Paare der Vorgabe (Abstand in OKLab ≥ 8, in der Vorgabe ist
  `wait`/`problem` mit 9 das engste). Ebenso die Sitzungsfarben untereinander und jede Sitzungsfarbe zu
  `accent`, `wait` und `problem`. Die Schwelle ist an „CodeDeck“ geeicht: Was die Vorgabe nicht schafft,
  wird von keinem Theme verlangt.
- **Zustand nie nur über Farbe:** Symbole und Buchstaben (M/A/D/R, Icons) bleiben in jedem Theme. Das ist
  heute schon so und erlaubt Themes, die auch bei Rot-Grün-Schwäche funktionieren.
- **Keine freien Eingriffe:** Ein Theme enthält kein CSS, keine Schriftdateien, keine Bilder. Nur Farben und
  die Stufen aus B4. So kann ein Theme nichts kaputtmachen und bleibt in einer Minute geprüft.

## B4 Die Eingriffe

Wenige Regler mit festen Stufen. Jeder wirkt an genau einer Stelle, die die Komponenten schon kennen.

| Eingriff | Stufen | Wirkt auf | Vorgabe |
|---|---|---|---|
| `radius` | `sharp` · `default` · `round` | Ecken von Knöpfen, Zeilen, Popups (Tailwinds `--radius-*`) | `default` |
| `lines` | `subtle` · `clear` · `strong` | Helligkeit von `line` und `overlay-line` (nicht die Stärke: Layout bleibt gleich) | `subtle` |
| `areaTint` | 0 bis 20 % | wie stark die Bereiche KI, du, Warten getönt sind | 5–9 % |
| `surfaceTint` | 0 bis 30 % | wie viel Farbe (`tint`) in den Grautönen steckt | 0 |
| `glow` | `none` · `soft` · `bright` | Leuchten des KI-Punkts im Dateibaum, Hervorhebung in „Wartet auf dich“ | `soft` |
| `depth` | `flat` · `soft` · `deep` | Schatten der Popups und Menüs | `deep` |
| `motion` | `calm` · `lively` | Pulsieren neuer Einträge, Übergänge (Systemeinstellung „weniger Bewegung“ gilt immer) | `calm` |
| `selection` | `fill` · `bar` | ausgewählte Zeile als getönte Fläche oder mit Balken am Rand | `fill` |
| `font` | `system` · `inter` · `rounded` · `mono` | Schriftfamilie der Oberfläche aus einer festen Liste (nur, was installiert ist) | `system` |
| `zones` | 0 bis 20 % | jeder Bereich des Fensters bekommt seinen Ton: Dateispalte (Projekt), Reiterleiste (Deck), rechte Spalte (KI), Statusleiste (du); Farbquellen aus `zoneColors`, sonst `moved`, `tint`, `ai`, `accent`; wo Beimischen nicht reicht, setzt `zoneSurfaces` die Fläche genau. Die Zone „Reiterleiste“ umfasst die ganze obere Leiste (Pfad, Reiter, Kopf der rechten Spalte). Technisch wird in jeder Zone `--color-panel` neu belegt, die Komponenten merken nichts | 0 |
| `events` | `quiet` · `clear` · `focus` · `loud` | wie stark Ereignisse auffallen: `clear` färbt die Worte; `focus` ist nur laut bei dem, was auf dich wartet (Frage, „wartet auf dich“, Fensterrand), alles andere wie `clear` („Runde fertig“ in `done`, „arbeitet“ in `ai`); `loud` macht gefüllte, leuchtende Schilder, tönt die Zeilen unter „Wartet auf dich“, lässt neue Einträge in ihrer Farbe aufblinken, färbt die Zähler an den Reitern und lässt den **Fensterrand leuchten**, solange etwas wartet (Frage vor fertig, auch bei inaktivem Fenster); wie breit der Schein ist, folgt `glow` | `quiet` |
| `glass` | `none` · `soft` · `strong` | schwebende Flächen (Menüs, Popups, Tooltips) durchscheinend mit Weichzeichner dahinter: Deckkraft 100 / 86 / 72 %, Weichzeichner 0 / 10 / 18 px | `none` |
| `gradient` | `none` · `subtle` · `vivid` | Verläufe auf dem Hauptknopf und der Markierung des aktiven Reiters (Akzent → `accent2`), Licht von oben auf Leisten und Spalten, Bereiche, die zum Rand hin auslaufen | `none` |
| `backdrop` | `none` · `glow` · `aurora` | weicher Farbschimmer hinter dem Deck, aus `ai` und `tint`, 0 / 6 / 12 % Deckkraft; nie unter Text stärker als die Prüfung erlaubt | `none` |
| `window` | `opaque` · `translucent` | das ganze Fenster zu 92 % deckend, der Desktop scheint durch (nur mit Compositor, siehe B4a) | `opaque` |

Bewusst **nicht** regelbar: Schriftgröße und Dichte (das ist Zoom und Barrierefreiheit, gehört in eine
eigene Einstellung), Abstände, Anordnung, Icons.

## B4b „Wartet auf dich“ und „neu“: Karten statt Flächen

Für alle Themes (Nutzer 2026-11-17, Variante B aus `design/click-dummy/attention.html`): Einträge unter „Wartet auf
dich“ sind erhabene Karten (`raised`) mit feiner Umrandung, bernsteinfarben (`wait`), wenn die Sitzung fragt. Der
Bereich selbst wird nicht mehr getönt, denn Bernstein auf Grau wird braun. Ein neuer Eintrag gleitet herein, seine
Umrandung leuchtet kurz in der Farbe des Ereignisses und beruhigt sich. Dieselbe Form zeigt **Neues in der Werkbank**
(noch nicht gesehen, `src/news.ts`): Karte mit Umrandung in der KI-Farbe und dem Wort „neu“ bzw. „geändert“.
Laute Themes (`events: loud`) tönen die Karten zusätzlich; `focus` tut das nicht mehr.

Die übrigen Bereiche der rechten Spalte (Sitzungen, Nächster Prompt) haben **keine eigene Tönung** mehr: Sie standen
sonst stärker hervor als „Wartet auf dich“, in Farben, die sonst nirgends vorkommen. Die Zahl in der Überschrift von
„Wartet auf dich“ ist bernsteinfarben, solange eine Sitzung fragt, sonst neutral. Die Bereichsfarbe `area-you` bleibt,
wo sie etwas bedeutet: deine Zeilenkommentare im Diff. Themes mit `zones` färben die Spalte als Ganzes.

## B4a Transparenz und Verläufe: was erlaubt ist

Beides macht Themes lebendiger, gefährdet aber zwei Grundsätze: Lesbarkeit (was hinter einer Fläche liegt,
ändert ihren Kontrast) und Bedeutung (ein Verlauf darf keine neue Farbe ins Spiel bringen). Darum:

**Glas (`glass`)**
- Nur für **schwebende** Flächen: Menüs, Popups, Tooltips, die Schnelleinstellungen. Nicht für Spalten,
  Zeilen oder das Deck: Dort liegt Text auf Text, und ein Weichzeichner kostet bei jeder Bewegung.
- Immer mit Weichzeichner. Durchscheinen ohne Weichzeichner macht Text unter Text unlesbar.
- Die Prüfung rechnet den schlechtesten Fall: die Fläche über der hellsten Schrift darunter, deren Einfluss
  der Weichzeichner etwa halbiert (`overlay` gemischt mit `n-50` zu (100 − Deckkraft) / 2). Auch dort
  muss leiser Text 4 : 1 halten.

**Verläufe (`gradient`)**
- Nur aus Farben, die das Theme schon hat: Akzent → `accent2`, Fläche → etwas heller, Bereichston →
  Fläche. `accent2` ist abgeleitet (Farbton des Akzents um höchstens 35° gedreht, etwas heller) oder
  gesetzt; die Prüfung verlangt, dass es wie der Akzent von `wait`, `problem` und `ai` entfernt bleibt.
- Schrift auf einem Verlauf muss an **beiden Enden** bestehen (z. B. die Beschriftung des Hauptknopfs).
- Ein Verlauf trägt nie allein eine Bedeutung. Ausnahme ist, was schon heute so gebaut ist und gleich
  bleibt: der auslaufende Balken der Hintergrundjobs in Activity (2.3b) und die Zonen im Trail. Diese
  Verläufe gehören dem Inhalt, kein Theme schaltet sie ab oder färbt sie um.
- Keine bewegten Verläufe.

**Hintergrundschimmer (`backdrop`)**
- Zwei große, weiche Farbflecken hinter dem Deck (oben rechts in `ai`, unten links in `tint`), nur
  Stimmung. Die Prüfung rechnet Text auf `base` mit dem Schimmer an seiner stärksten Stelle.

**Durchscheinendes Fenster (`window: translucent`)**
- Das Fenster zu 92 % deckend; Flächen behalten ihre Deckkraft relativ dazu. Was dahinter liegt, kennt
  CodeDeck nicht: Die Prüfung rechnet über **reinem Weiß und reinem Schwarz**, beide müssen bestehen.
- Technisch braucht es ein Fenster, das transparent angelegt wurde (Tauri `transparent: true`), und einen
  Compositor (Cinnamon, GNOME, KDE haben einen). Ein Wechsel wirkt darum erst in neu geöffneten Fenstern;
  ohne Compositor bleibt das Fenster deckend. Den Desktop dahinter weichzeichnen kann eine Webansicht
  nicht; deshalb nur 92 %, nicht weniger.
- **Spike vor dem Bau:** WebKitGTK mit transparentem Fenster unter X11 und Wayland, Leistung beim
  Scrollen langer Diffs, Verhalten der Seitenleiste.

**Für alle:** Eine Einstellung „Reduce transparency“ (Abschnitt Appearance, vorbelegt aus der
Systemeinstellung, wo es sie gibt) macht Glas und Fenster deckend, unabhängig vom Theme. Verläufe und
Schimmer bleiben, sie sind keine Transparenz.

---

## B5 Die Vorgabe „CodeDeck“

Abgeleitet aus dem Logo: graue Kachel, indigo Lagen, orange oberste Lage. Grau zuerst; Farbe nur, wo sie
etwas bedeutet. Die Werte sind die heutigen aus `src/index.css`.

| Rolle | Wert | Warum |
|---|---|---|
| `scheme` | dark | – |
| `bg` | `#1b1e22` | Grau der Logo-Kachel, kein Blaustich |
| `fg` | `#f5f6f7` | – |
| `base` / `panel` / `raised` | `#1b1e22` / `#24272c` / `#2e3238` | Deck am dunkelsten, Spalten davor |
| `line` | `#3a3f46` | haarfein, gerade sichtbar |
| `overlay` / `-hover` / `-line` | `#32373e` / `#424850` / `#4d545c` | eine Stufe näher, tiefer Schatten; leiser Text darauf 4,3 : 1 |
| Skala `n-50 … n-950` | `#f5f6f7` … `#1b1e22` (11 Stufen, wie heute `slate-*`) | 500 ist leiser Text mit ≥ 4 : 1 |
| `accent` / `accent-soft` | `#f26500` / `#ff8a3c` | Orange der obersten Logo-Lage |
| `accent-fill` / `-hover` / `on-accent` | `#bd4f00` / `#a94600` / `#ffffff` | tiefer, damit Weiß mit Luft lesbar ist (4,9 : 1) |
| `ai` | `#818cf8` | Indigo der mittleren Logo-Lage |
| `wait` / `added` / `problem` / `moved` | `#e0a868` / `#9cc39a` / `#e66a78` / `#8fb1cf` | gedämpft, sitzen mit dem Grau; Fehler in Himbeerrot, damit er nicht wie „wartet“ aussieht |
| `session-0 … 5` | `#7f95ff` `#c08cf5` `#4fc9bd` `#e391d0` `#62b6ee` `#c3cf6c` | kühl, fern von Orange, Warm und Rot; Sitzung A nicht genau das KI-Indigo |
| Eingriffe | radius `default` (6 px), lines `subtle`, areaTint 5 / 6 / 9 %, surfaceTint 0, glow `soft`, depth `deep`, motion `calm`, font `system`, **events `focus`** | ruhig, eher Werkzeug als Bühne; laut wird nur, was auf dich wartet |

Verfeinert am 2026-11-17 mit den Erfahrungen aus der Familie: `events: focus`, Fehler in Himbeerrot (vorher kaum von
„wartet“ zu unterscheiden), Hauptknopf eine Spur tiefer, Menügrund etwas dunkler für leisen Text, Sitzung A und das
vierte Sitzungsrosa abgesetzt. In Ruhe sieht die Vorgabe aus wie zuvor.

Als Datei (alles Abgeleitete weggelassen):

```json
{
  "id": "codedeck", "name": "CodeDeck", "scheme": "dark",
  "bg": "#1b1e22", "fg": "#f5f6f7",
  "accent": "#f26500", "ai": "#818cf8",
  "wait": "#e0a868", "added": "#9cc39a", "problem": "#e08a80", "moved": "#8fb1cf",
  "style": { "radius": "default", "lines": "subtle", "areaTint": 6, "glow": "soft", "depth": "deep" }
}
```

## B6 Beispiel „Signal“: bunt und kontraststark

Zeigt, wie weit die Regler tragen, ohne die Bedeutung zu brechen. Grund ist ein tiefes Indigo statt Grau,
die Schrift reines Weiß, alle Linien klar sichtbar, die Bereiche deutlich getönt, die Zustandsfarben
gesättigt. Normaler Text erreicht ≥ 7 : 1 (AAA).

| Rolle | CodeDeck | Signal | Was sich ändert |
|---|---|---|---|
| `bg` | `#1b1e22` | `#0b0820` | fast schwarz, mit Indigo statt neutral |
| `fg` | `#f5f6f7` | `#ffffff` | maximaler Kontrast |
| `surfaceTint` | 0 | 22 % (Ton `#5b3dff`) | Flächen werden violett-blau, nicht grau |
| `lines` | `subtle` | `strong` | Ränder sind deutlich, Struktur lesbar ohne Schatten |
| `accent` | `#f26500` | `#ff7a1a` | heller, leuchtender Orange; bleibt die Markenfarbe |
| `on-accent` | `#ffffff` | `#0b0820` | dunkle Schrift auf hellem Knopf: 8 : 1 statt 4,5 : 1 |
| `ai` | `#818cf8` | `#3df5ff` | Cyan: hebt sich vom violetten Grund ab |
| `wait` | `#e0a868` | `#ffd400` | Signalgelb |
| `added` / `problem` / `moved` | gedämpft | `#39ff88` / `#ff4f6d` / `#6aa8ff` | gesättigt |
| Sitzungen | kühl, gedämpft | `#3df5ff` `#c58bff` `#00e5b0` `#ff8ae2` `#6fb3ff` `#d4ff3d` | kräftig, aber fern von Orange, Gelb, Rot |
| `areaTint` | 5–9 % | 16 % | Bereiche KI / du / Warten sind auf einen Blick getrennt |
| `glow` · `depth` · `motion` | soft · deep · calm | bright · flat · lively | Tiefe durch Linien und Leuchten statt Schatten |
| `glass` | none | strong | Popups durchscheinend mit Weichzeichner: der Schimmer bleibt sichtbar |
| `gradient` | none | vivid | Hauptknopf und aktiver Reiter von Orange nach Rotorange, Leisten mit Licht von oben, Bereiche laufen aus |
| `backdrop` | none | aurora | Cyan- und Violettschimmer hinter dem Deck |
| `window` | opaque | translucent | der Desktop scheint zu 8 % durch |

```json
{
  "id": "signal", "name": "Signal", "scheme": "dark",
  "bg": "#0b0820", "fg": "#ffffff", "tint": "#5b3dff",
  "accent": "#ff7a1a", "onAccent": "#0b0820", "ai": "#3df5ff",
  "wait": "#ffd400", "added": "#39ff88", "problem": "#ff4f6d", "moved": "#6aa8ff",
  "sessions": ["#3df5ff", "#c58bff", "#00e5b0", "#ff8ae2", "#6fb3ff", "#d4ff3d"],
  "style": { "radius": "default", "lines": "strong", "areaTint": 16, "surfaceTint": 22,
             "glow": "bright", "depth": "flat", "motion": "lively",
             "glass": "strong", "gradient": "vivid", "backdrop": "aurora", "window": "translucent" }
}
```

Die anderen Richtungen in Kürze: **Paper** = `scheme: light`, `bg #f7f7f5`, `fg #15171a`, sonst die
Bedeutungsfarben der Vorgabe, abgedunkelt bis sie 3 : 1 auf Weiß haben, depth `soft`. **Graphite** = `bg
#141414`, `fg #ecebe8`, `accent #c9a227` (Gold, mit dunkler Schrift auf dem Knopf), `ai #9aa6c8`, `wait
#e0946a` (Pfirsich, damit es nicht wie das Gold aussieht), `problem #d9655f`, Sitzungen abgeleitet, radius
`round`, glow `none`, selection `bar`, areaTint 3. Im Labor bestehen alle vier Themes die Prüfung.

## B7 Die Theme-Familie

Jedes Theme verfolgt eine Idee und setzt die Eingriffe dafür ein. Die Werte stehen in `src/themes/*.json`; hier
das Warum. Alle neun bestehen `npm run themes` (55 bis 61 Regeln je Theme).

**Paper: Karamell und Creme.** Vorbild ist das Thunderbird-Theme „Charamel“ (Wunsch des Nutzers 2026-11-17). Zwei
Ebenen wie Papier auf einem Pult: der **Rahmen** in warmem Karamell (Spalten `#eee0d2`, obere Leiste und Statusleiste
eine Stufe tiefer `#e8d6c3`, mit Licht von oben), der **Inhalt** in Cremeweiß (`#fdf9f4`), Menüs fast weiß mit weichen
Schatten. Runde Ecken, weiche Linien in Sandbeige, Schrift Braungrau statt Schwarz (eigene Grauskala mit warmem
Ton, damit leiser Text auch auf Karamell 4 : 1 hält). Farbe sparsam wie dort: **Orange** für die Hauptaktion,
**Himmelblau** für Auswahl, Fokus und die KI, Git in gedeckten Tönen. Laut ist nur, was dich braucht (`events:
focus`): „fragt“ als honigfarbene Schilder; „fertig“ in Petrol als Wort.

**Colorful: Farbräume.** Weißer, leicht warmer Grund, und jeder Bereich hat seine Farbe (`zones: 18`). Die Töne sind
eine Familie: gleiche Helligkeit und Sättigung in OKLCH (L 0,74, C 0,11), nur der Farbton wechselt, darum wirken sie
bunt und doch ruhig: Dateispalte Petrol (das Projekt), Reiterleiste Rosé (das Deck), rechte Spalte Lavendel (die KI),
Statusleiste Aprikose (du). Die Bedeutungsfarben folgen derselben Regel eine Stufe dunkler (L 0,55): Akzent
Koralle, KI Lavendel, „fertig“ Tannengrün, „wartet“ Honig, Fehler Himbeere. Ereignisse sind laut: gefüllte Schilder,
getönte Zeilen, Blinken in der Farbe des Ereignisses, leuchtender Fensterrand. Runde Ecken, runde Schrift (wo
installiert), lebhafte Bewegung. Das Deck selbst bleibt weiß: Dort wird gelesen.

**Moon: Nacht, Mond und Laterne.** Blau ist der Rahmen, nicht der Inhalt (überarbeitet 2026-11-17 nach den
Erfahrungen mit Forest: 16 % Blau in allen Flächen und Grautönen machten Blau bedeutungslos). **Nachtblau** sind nur die
obere Leiste, die Statusleiste und die Menüs (mit leichtem Glas). **Der Inhalt ist mondbeschienenes Graphit:** Deck,
Spalten, Knöpfe und die Grautöne der Schrift fast neutral kühl (4 % Tönung). Warmes Gegenstück ist **Mondgold** für
deine Hauptaktion; die KI ist **Flieder** (nicht Blau, damit sie sich vom Rahmen abhebt), „fertig“ Mint, Git in
gedämpftem Silberblau und Mint. **Laut ist nur, was dich braucht** (`events: focus`): „fragt“ in
Laternen-Pfirsich, als Schild und als Linie am Fensterrand. Kein Schimmer hinter dem Deck, runde Ecken, tiefe
Schatten.

**Forest: Moos, Rinde und Blüten.** Grün und Erde haben getrennte Aufgaben, und Grün ist knapp (Nutzer 2026-11-17:
„insgesamt sehr grün“). **Moosgrün ist nur der Rahmen der Bedienung:** obere Leiste über alle Spalten, Statusleiste,
Menüs und Popups. **Alles andere ist warmes, fast neutrales Braungrau** (Rinde): Deck, beide Spalten, Knöpfe und
Hover, Linien, und auch die Grautöne der Schrift (nur 5 % Tönung, sonst wirkt alles oliv). Die rechte Spalte ist
ruhig wie die linke (`areaTint: 3`), gegliedert über ihre Abschnitte. **Farbe kommt nur aus Blüten und Früchten, laut
nur bei dem, was dich braucht** (`events: focus`): „fragt“ als sonnenblumengelbe Schilder,
der Fensterrand als gelbe Linie; „fertig“ in Kornblume und „arbeitet“ in Flieder als Worte; du in Kürbis, Fehler in
Kirsche, neue Dateien in Blattgrün. Allgemeine Lehre aus Forest, Paper und Moon: **Eine Farbe trägt Bedeutung nur, wenn sie nicht überall ist.** Rahmen
(Bedienung) und Inhalt bekommen getrennte Töne; Flächen und Grautöne bleiben nahezu neutral; Farbe gehört den
Akzenten. Gelernt außerdem: Ein breiter gelber Schein um das Fenster färbt auf Braun alles oliv;
darum hängt die Breite des Scheins jetzt an `glow` (`soft`: eine Linie, `bright`: ein Schein).

**Elegance: zurückhaltend, maßgeschneidert.** Warmes Anthrazit als Inhalt, eingefasst von einem fast schwarzen
**Lackrahmen** (obere Leiste und Statusleiste, `zoneSurfaces`; die Spalten bleiben ausdrücklich Anthrazit, damit
keine Bereichsfarbe einsickert). Champagnergold als Akzent mit dezentem Goldverlauf auf dem Hauptknopf, kaum
Bereichstönung (3 %), nichts leuchtet, Schrift Inter (wo installiert), runde Ecken, leichtes Glas. **Wartet auf dich**
ist **Cognac** (überarbeitet 2026-11-17: das frühere Rosé war neben dem Fehlerrot kaum zu unterscheiden) und als
einziges laut (`events: focus`): ein Schild und eine feine Linie am Fensterrand ohne Schein.

**Fancy: Spotlight.** Das Gegenteil von Colorful: Die Bühne ist fast schwarz und neutral (kaum Tönung, keine Zonen,
kein Schimmer), damit Farbe nur dort erscheint, wo etwas **geschieht**. Ereignisse als Neon-Schilder mit hellem
Leuchten (fertig in Neongrün, Frage in Gelb, Arbeit in Cyan), der Fensterrand glüht in der Farbe des Ereignisses,
Zähler an den Reitern in Pink, starkes Glas für Menüs, kräftiger Verlauf auf dem Hauptknopf. Wer die Ruhe von
CodeDeck mag, aber nichts übersehen will. Entstanden aus „Signal“ (B6), das nur noch Beispiel ist.

**Terminal: ein gutes Terminal-Schema.** Charakter aus Form, angenehm in der Farbe (überarbeitet 2026-11-17: Grün in
Schrift und Flächen und überall leuchtende Schilder ermüdeten). Fast schwarzer Grund mit einem Hauch Phosphor (6 %),
weiche, kaum grüne Schrift, Festbreitenschrift überall (`font: mono`), eckig, klare Linien, kein Schatten, kein
Schimmer. Die Farben sind die **ANSI-Farben mit ihrer üblichen Bedeutung**: Gelb für Geändertes und Wartendes (wie
Git), Grün für Neues, Rot für Fehler, Blau für Verschobenes, Cyan für die KI, **Magenta für dich** (wie der Prompt
vieler Shells), Seegrün für „fertig“. Laut nur, was dich braucht (`events: focus`): ein gelbes, invertiertes Schild
wie im Terminal und eine gelbe Linie am Fensterrand. Die Festbreitenschrift macht die Oberfläche breiter; Titel
werden früher gekürzt. Das ist der Preis des Charakters.

**Contrast: maximal lesbar.** Reines Schwarz, reines Weiß, Linien `strong`, eckig, keine Effekte (kein Glas, kein
Verlauf, kein Schimmer, kein Leuchten, keine Schatten), alle Farben voll gesättigt; leiser Text hat noch über 8 : 1.
Für helle Sonne auf dem Laptop, Beamer, und wer schlecht sieht. Kein Ersatz für ein amtliches WCAG-AAA-Theme, aber
nahe dran.

**Zonen und Ereignisse in der Familie.** Wie stark ein Theme sie nutzt, folgt seinem Gedanken:

| Theme | `zones` | `events` | Warum |
|---|---|---|---|
| CodeDeck | 0 | focus | ruhig wie bisher; Aufmerksamkeit ist der Kern von CodeDeck, darum kann die Vorgabe sie am deutlichsten |
| Paper | genau gesetzt | focus | Karamell-Rahmen um cremeweißen Inhalt; laut wird nur, was auf dich wartet |
| Elegance | genau gesetzt | focus | Lackrahmen um Anthrazit; laut nur Wartendes, in Cognac, ohne Schein |
| Moon | genau gesetzt | focus | Nachtblau nur als Rahmen, Inhalt in Graphit, laut nur Wartendes |
| Forest | genau gesetzt | focus | Moos nur als Rahmen der Bedienung, Inhalt in warmem Braungrau, Blütenfarben nur für Wartendes laut |
| Terminal | 0 | focus | invertiertes Schild nur für Wartendes; ANSI-Farben mit ihrer Bedeutung |
| Contrast | 0 | loud | kräftige Signale gehören zu einem Theme für schwierige Bedingungen; ohne Leuchten |
| Colorful | 18 | loud | Farbe ist hier der Inhalt |
| Fancy | 0 | loud | die Bühne bleibt dunkel, damit Ereignisse allein leuchten |

Was die Familie lehrt: Die schwierigste Regel ist nicht der Kontrast, sondern die **Unterscheidbarkeit**. Bei sieben
der acht Themes fielen zuerst nur Sitzungs- oder Bedeutungsfarben durch, die sich zu ähnlich waren. Darum hält die
Ableitung der Sitzungsfarben jetzt 40° Abstand zu Akzent, Warten und Fehler, und zwei Themes (Moon, Elegance)
überlassen ihre Sitzungsfarben ganz der Ableitung.

---

# Teil C: Technik

## C1 Wo es liegt

| Teil | Ort |
|---|---|
| Mitgelieferte Themes | `src/themes/*.json`, mitkompiliert (Vite-Import) |
| Ableiten, Prüfen, Anwenden | neu `src/theme.ts` |
| Wahl je Rechner | Rechner-Einstellungen (`config.rs`, `settings.json`), Schlüssel `theme` (und `themeLight`/`themeDark` beim Folgen), Änderung an alle Fenster über `window::settings_changed` wie die Sprache |
| Rollen | `src/index.css`: `@theme` verweist auf Variablen statt auf Werte |
| Prüfung | neu `tools/theme-check.mjs`, läuft vor dem Build und in `cargo test`-freien CI-Schritten (`npm run themes`) |
| Theme-Labor | Vorschau-Seite `?lab=themes` in der Browser-Vorschau: alle Bausteine auf einer Seite, Theme-Datei bearbeiten, Prüfbericht |

## C2 Ableiten

Alles wird in **OKLCH** gerechnet (gleichmäßige Helligkeit, Farbton bleibt beim Mischen stabil):

- **Skala `n-50 … n-950`:** elf Stufen zwischen `fg` und `bg`, Helligkeit nach einer festen Kurve (dicht
  bei den Textstufen, weit bei den Flächen), mit `surfaceTint` Prozent Chroma und Farbton aus `tint`.
- **Flächen:** `base` = `bg`; `panel`, `raised`, `overlay`, `overlay-hover` = feste Schritte auf der Skala
  Richtung `fg`. Bei `scheme: light` laufen die Schritte andersherum (Spalten etwas dunkler als das Deck).
- **Linien:** `line` aus der Skala, Stufe nach `lines`.
- **Akzent:** `accent-fill` = `accent`, so weit abgedunkelt (oder aufgehellt), bis `on-accent` 4,5 : 1
  hat; `on-accent` ist Weiß oder `bg`, je nachdem was mehr Kontrast gibt.
- **Bereiche:** `area-*` = `color-mix` aus Bedeutungsfarbe und `panel` mit `areaTint`.
- **Sitzungen:** ohne Liste sechs Farbtöne, so weit wie möglich über den Kreis verteilt, beginnend beim
  Farbton von `ai`; Töne näher als 28° an `accent`, `wait` oder `problem` werden übersprungen. Helligkeit
  wie `ai`, jede zweite etwas heller, Chroma mindestens 0,12, damit auch ein fast farbloses Theme sechs
  unterscheidbare Sitzungen hat (Graphite nutzt das).
- **Glas, Verläufe, Schimmer:** `accent2` (Farbton um 20° bei `vivid`, 8° bei `subtle` gedreht, und zwar in
  die Richtung, die weiter von `wait`, `problem` und `ai` wegführt; etwas heller),
  `accent-fill-2` aus `accent2` wie `accent-fill`; `panel-top` = `panel` 3 bzw. 6 % Richtung `fg`;
  Deckkraft und Weichzeichner als Variablen (`--glass-alpha`, `--glass-blur`, `--window-alpha`,
  `--backdrop-alpha`). In CSS mischt `color-mix(in srgb, var(--color-overlay) var(--glass-alpha),
  transparent)` die Deckkraft, ohne dass ein Theme RGBA-Werte schreibt.
- **Glas hält sich selbst lesbar:** Mit `glass` rückt `overlay` schrittweise Richtung `bg`, bis der schlechteste
  Fall aus B4a besteht. Ein Theme muss dafür nichts tun; im Labor fielen Graphite und Signal ohne diese
  Regel durch (3,8 und 3,7 : 1) und bestehen mit ihr.
- **Inaktives Fenster:** nicht mehr von Hand. `:root.inactive` mischt jede Bedeutungsfarbe zu 55 % mit
  `n-500` (`color-mix(in oklch, …)`), für jedes Theme gleich.

Die Ableitung ist reines JavaScript ohne Abhängigkeiten (OKLab-Umrechnung und WCAG-Kontrast, zusammen etwa
80 Zeilen) und liefert eine flache Liste `{ "--color-panel": "#…", … }`.

## C3 Anwenden

- `src/index.css` behält die Tailwind-Namen, damit die Komponenten unverändert bleiben. `@theme` verweist
  nur noch: `--color-panel: var(--t-panel)`. Die Werte von „CodeDeck“ stehen als Rückfall in `:root`.
- Die Graustufen heißen weiter `slate-50 … slate-950`, werden aber als **Kontraststufen** verstanden:
  50 = stärkster Kontrast zum Grund, 950 = Grund. Für helle Themes läuft die Skala dadurch von selbst
  andersherum, die rund 550 Stellen bleiben, wie sie sind. Für neuen Code kommen sprechende Aliasse dazu
  (`text-strong`, `text-quiet`, `text-faint`).
- `theme.ts` setzt die Liste als Variablen auf `<html>` (`style.setProperty`), dazu `color-scheme` und
  Klassen für die Eingriffe (`radius-round`, `glow-none`, `motion-lively` …), deren Regeln in `index.css`
  stehen.
- **Transparentes Fenster:** `window.rs` legt neue Fenster mit `transparent(true)` an, wenn das gewählte Theme
  es will und ein Compositor läuft; sonst deckend. `backgroundColor` in `tauri.conf.json` bleibt der
  Rückfall vor dem ersten Zeichnen.
- **Kein Aufblitzen beim Start:** Die zuletzt angewandte Liste liegt zusätzlich in `localStorage` und wird
  von einem kleinen Skript in `index.html` gesetzt, bevor React startet. Danach gleicht `theme.ts` mit den
  Rechner-Einstellungen ab.
- **Vorschau beim Überfahren:** dasselbe Setzen, nur ohne Speichern; Esc stellt die gespeicherte Liste
  wieder her.

## C4 Vorarbeit im Bestand

1. Die rund 25 festen Tailwind-Farben auf Rollen: `text-white` auf Akzentknöpfen → `text-on-accent`,
   `indigo-*` → `ai`, `teal-*` → neue Rolle `remote` (oder `ai`), `bg-black/45` → `scrim`.
2. Feste Werte in `index.css` außerhalb der Rollen: Fensterkante `rgb(255 255 255 / .13)` → `edge`,
   Schatten in `surface-overlay` → nach `depth`.
3. `:root.inactive` durch die abgeleitete Regel ersetzen (C2).
4. Prüfen, wo `slate-*` als **Fläche** benutzt wird (`bg-slate-600/700`, rund 15 Stellen): Bei hellen Themes
   kehrt sich das mit um. Im Theme-Labor sichtbar; wo es falsch wirkt, auf eine Flächenrolle umstellen.

Das ist eine Session und ändert am Aussehen von „CodeDeck“ nichts. Ein Vorher-Nachher-Vergleich der Screenshots
(`tools/shot.mjs`) belegt das.

## C5 Prüfung

`tools/theme-check.mjs` leitet jedes Theme ab und prüft B2 und B3: Kontrast jedes Text-Flächen-Paars, jeder
Zustandsfarbe auf jeder Fläche, Abstände der Bedeutungs- und Sitzungsfarben, Pflichtfelder, erlaubte Stufen.
Bei Glas, Schimmer und durchscheinendem Fenster rechnet sie die schlechtesten Fälle aus B4a. Ausgabe als Tabelle mit „ok / zu schwach (3,8 : 1, verlangt 4,5)“. Dieselbe Funktion zeigt das Theme-Labor live.

## C6 Eigene Themes der Benutzer (später)

`~/.config/codedeck/themes/*.json` im selben Format. CodeDeck liest sie beim Start, prüft sie und zeigt sie
in der Liste mit Hinweis, wenn eine Regel verletzt ist (auswählbar, aber gekennzeichnet). Da ein Theme nur
Farben und Stufen enthält, ist das ohne Risiko. Nicht Teil des ersten Schritts.

## C7 Vorschlag für den Plan

| Schritt | Inhalt |
|---|---|
| S.1 Rollen bereinigen | C4: feste Farben auf Rollen, inaktiv abgeleitet; „CodeDeck“ sieht danach gleich aus |
| S.2 Themes | `theme.ts`, Ableitung, Anwenden ohne Aufblitzen, Wahl im Einstellungsdialog, „CodeDeck“ und „Signal“ |
| S.3 Labor und weitere | Theme-Labor in der Vorschau, Prüfung als Skript, „Paper“ und „Graphite“, Folgen des Systems |

## Zu entscheiden

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Themes nur mitgeliefert, oder gleich eigene Dateien der Benutzer? | erst mitgeliefert, eigene später (C6) |
| 2 | Graustufen als Kontraststufen behalten (keine Massenänderung) oder auf neue Namen umstellen? | behalten, Aliasse für neuen Code |
| 3 | Darf ein Theme den Akzent vom Logo-Orange lösen (z. B. Gold in Graphite)? | ja; die Bedeutung bleibt, das Logo behält seine Farben |
| 4 | Welche Themes in den ersten Schritt? | CodeDeck, Signal, Paper |
| 5 | Durchscheinendes Fenster: Theme-Eingriff oder eigene Einstellung? | Theme-Eingriff, aber erst nach dem Spike (B4a); „Reduce transparency“ schaltet es immer ab |
| 6 | Wann? | nach MVP 3; S.1 kann jederzeit als kleiner Aufräumschritt dazwischen |
