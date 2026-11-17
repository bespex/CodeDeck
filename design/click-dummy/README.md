# Click-Dummy: das Zielbild von CodeDeck

Abgestimmter Entwurf vom 2026-11-15. Er zeigt, wie CodeDeck später aussieht und bedient wird, und ist
die **Vorlage** für den Stufenplan in `docs/PLAN.md` (Abschnitt „Zielbild“). Das Warum steht in
`docs/KONZEPT.md`, Teil 4.

## Ansehen

```sh
python3 -m http.server 5392 -d design/click-dummy    # dann http://localhost:5392
node tools/shot.mjs http://localhost:5392/index.html /tmp/x text:Weiter snap:szene1   # Screenshots
```

Die helle Leiste oben gehört nicht zum Produkt. Sie beginnt auf der Startseite („S“) und spielt dann
einen Vormittag in 8 Szenen im Beispielprojekt `orbit-api` durch; „Weiter“ löst aus, was sonst bei
Claude passiert. Alles darunter ist klickbar. Orange „idea“-Schilder markieren, was es in der App
noch nicht gibt (`?ideas=0` blendet sie aus). Wo der Dummy endet, sagt eine Leiste unten, was die
echte App täte.

## Dateien

| Datei | Inhalt |
|---|---|
| `Main.dc.html` | Der Dummy: oben das Markup (`<x-dc>`), unten die Logik (`renderVals`), alles in einer Datei |
| `index.html` | Kleiner lokaler Betrachter für `Main.dc.html` |
| `canvas.json` | Anordnung und Notizzettel der Fassung auf claude.ai |
| `usage.html` | Verbrauch (Schritt 2.4): Statusleiste, Popup, Activity; Zustände per Knopf |
| `sessions.html` | Sitzungen überall bedienen (MVP 3, `docs/SITZUNGEN.md`): Zuhause und Türen, Doppelklick, „+ New“, Handy, Einstellungen |
| `themes.html` | Theme-Labor (`docs/STYLING.md`): CodeDeck, Paper, Graphite, Signal; Wahl in den Schnelleinstellungen mit Vorschau beim Überfahren, Theme-Datei live bearbeiten, Prüfbericht, inaktives Fenster |

`Main.dc.html` ist für die Design-Leinwand auf claude.ai geschrieben (Fassung dort:
https://claude.ai/artifact/RD82dLeX2U3xf2vPRipzE2, privat). Das Format: `{{name}}` holt einen Wert aus
`renderVals()`, `<sc-if value>` zeigt bedingt, `<sc-for list as>` wiederholt, `onClick="{{fn}}"` bindet
Ereignisse. `index.html` versteht genau das und zeichnet bei jeder Änderung alles neu; das Ziehen der
Trennlinien funktioniert deshalb lokal nicht.

## Was der Dummy ist und was nicht

- Er ist Vorlage für Aufbau, Benennung, Abläufe und die Gestaltungsregeln, nicht für Pixel und Texte.
- Er zeigt **nicht alles, was CodeDeck heute schon kann**: Aktionen im Datei-Navigator (Kontextmenü,
  Öffnen mit, Drag in den Fokus), Git-Aktionen je Repo, das Git-Protokoll, mehrere Repos im Projekt,
  Vergleich zweier Trail-Punkte. Das bleibt erhalten und wird beim Umbau eingeordnet.
- Seine Farben und Maße stammen aus `src/index.css`; bei Abweichungen gilt die App.
- Kein React, kein Tailwind: Bei der Umsetzung wird nichts kopiert, sondern in den bestehenden
  Komponenten nachgebaut.
