# CodeDeck und die Qiew-Betrachter

Stand 2026-11-22. Die Betrachter von be spex (Qiew: Marq, Jayq, Xaq, Hyqe, Cusq, Dirq, Maiqe, Trisq) bleiben eigenständige
Programme. CodeDeck nutzt ihre gemeinsame Befehlszeile (`<app> [<datei> | -] [--line <n>] [--geometry WxH+X+Y] [--reuse] [--id <text>]`,
Qiew `crates/frame/src/launch.rs`); alles Zusätzliche wirkt nur, wenn CodeDeck sie startet.

## Gebaut (2026-11-21, Praxistest offen)

- **Bevorzugen:** Zum Ansehen nimmt CodeDeck, wo keine Wahl getroffen ist, den Betrachter von be spex für die Endung
  (`apps.rs` `QIEW`), vor dem Standard des Systems; in „Ansehen mit…“ steht er oben und gilt als empfohlen.
- **`--reuse`:** Jeder Start aus CodeDeck nutzt das offene Fenster des Betrachters weiter.
- **`--id` (nur Dirq):** `show_patch` ruft `dirq - --reuse --id <Kennung>` auf (`apps.rs` `patch_options`, `src/dirq.ts`
  `dirqId`). Die Kennung sagt, **was** der Patch ist: Gleiche Kennung = neue Fassung desselben (Dirq behält Ort, Faltungen und
  Filter und zeigt, was neu ist), andere Kennung = etwas anderes. Der Patch kommt über die Standardeingabe unter immer neuem
  Namen, ein Pfad taugt dafür nicht. Kennung ist der Betreff der Ansicht (Runde, nicht Committetes, Vergleich, Snapshot), bei
  einem Commit `commit <hash>`. `--id` steht **nach** `-`; ein älteres Dirq ignoriert es dann still (Qiew
  `docs/ANNOTATE.md`, 7). Marq bekommt es nicht.
- **`--geometry`:** Zum Ansehen öffnet der Betrachter über dem Deck (Rechteck aus dem Frontend, `open_file` `place`,
  in physische Pixel umgerechnet). Unter Wayland setzt der Fenstermanager die Position nicht; die Größe gilt.
- **`--line`:** `openFile(path, "view", line)`; heute bei den @ai-Hinweisen (Doppelklick auf einen Hinweis).
- **Dirq bekommt den Zusammenhang:** Vor dem Patch steht ein Kopf wie bei `git format-patch` (`src/dirq.ts`): bei einer
  Runde Runde, Session, Prompt und Schlussworte; bei einem Commit dessen Betreff, Autor, Datum, Nachricht; bei einem
  Snapshot, beim nicht Committeten und beim Vergleich, was es ist.
- **Rechner-Check:** alle acht Betrachter mit ihrem Zweck für CodeDeck.
- **Kommentare in Marq (`--annotate`):** Öffnet CodeDeck eine Datei in Marq, gibt es `--annotate` mit (`apps.rs`
  `own_options`); Marq darf dann Kommentare an Blöcke dieser Datei schreiben (`<!-- @ai: … -->`, `@me`, `@you`;
  Qiew `apps/marq/IDEEN.md`). „In Marq lesen“ (Standardeingabe) bleibt ohne. Ein älteres Marq übergeht den Schalter.
  Die `@ai`-Kommentare sind gewöhnliche Hinweise (D18, `markers.rs`); in Markdown zählen dafür auch die Formen, die
  Marq in Listeneinträgen und Zitaten schreibt (`- <!-- @ai: … -->`, `> <!-- @ai: … -->`), und ein Kommentar über
  mehrere Zeilen kommt mit seinem ganzen Text. Abgehakte (`@ai#erledigt`) sind keine Hinweise. Der Auftrag an die KI
  sagt, dass ein solcher Kommentar dem folgenden Block gilt und danach entfernt wird (Nutzer, 2026-11-21: nicht
  abhaken, das ließe Unnützes im Text).

- **Dirq statt der eingebetteten Diffs (2026-11-22):** Ist Dirq installiert (`has_diff_viewer`, nur das Dasein zählt,
  keine Einstellung), zeigen Code- und Strukturansicht im Reiter Änderungen nur noch die Dateien. Ein Klick tut nichts,
  ein **Doppelklick** öffnet den ganzen Patch der Ansicht in Dirq an dieser Datei (`--line` = Beginn ihres Teils hinter
  dem Kopf, `src/dirq.ts` `lineBehindHeader`). Angesehen, Anhängen, Werkzeuge bleiben in CodeDeck. Ohne Dirq wie bisher.
  Gebaut in `ChangesView.tsx` (`ScopeProvider`, `openInDirq`, `DirqContext` aus `DiffParts.tsx`) und `StructureTree.tsx`.
- **`--annotate` für Dirq:** nur für Patches des Arbeitsordners (`ChangeScope.worktree`: nicht Committetes, laufende Runde,
  „seit dem Snapshot“), denn nur dort passen die Zeilennummern der neuen Seite zu den Dateien. Dazu `CODEDECK_SOCKET` = der
  Socket des Hubs und im Kopf `X-CodeDeck-Session`, wenn die Ansicht eine Session hat. Kommentare kommen als Einzeiler-JSON
  an den Hub (`hub.rs` `dirq_comment`): bekannte Aktion, `doc` = eine von CodeDeck vergebene Kennung (`remember_dirq_doc`,
  ordnet Projekt und Repository zu), Pfad relativ und im Repository, Text nicht leer, gekürzt. Das Fenster des Projekts
  bekommt `dirq_comment`; `src/dirqComments.ts` legt daraus Zeilenkommentare (`Note`, Id `dirq:<id>`) an, ersetzt sie bei
  gleicher Id und entfernt sie. Ohne Session im Kopf gilt die Session, die die Datei zuletzt schrieb. Kein Rückkanal zu Dirq.
- **`--repo` für Dirq:** bei jeder Ansicht der Ordner des Repositorys; Dirq liest daraus Zeilen um eine Änderung und
  `linguist-generated`.
- **Rechner-Check:** Marq und Dirq gelten seit 2026-11-22 als „hilfreich“ (Kommentare für die KI, Dirq zeigt die Diffs).

## Geplant

1. **Weitere Rückwege „An CodeDeck“:** Der Weg ist da (Dirqs Kommentare, `CODEDECK_SOCKET`); weitere Aktionen (Auswahl als
   Anhang mit Herkunft: Textstelle, jq-Ergebnis, Zeilen, Hunk) brauchen je eine Freigabe und eine Prüfung im Hub.
2. **Live in Dirq:** die laufende Runde bei jeder Änderung mit derselben `--id` nachschicken, ohne ein geschlossenes Fenster
   wieder zu öffnen (braucht eine Rahmen-Option wie `--if-running`).
3. **Mitlesen:** auf Wunsch ein Dokument, das eine Session schreibt, mit `--reuse` in Marq oder Hyqe öffnen.
4. **Stand eines Snapshots ansehen:** `git show <snapshot>:<pfad> | marq -`.
5. **`@ai`-Kommentare aus Marq direkt abarbeiten lassen** (aus Qiew `apps/marq/IDEEN.md`, 2026-11-22 hierher): offene
   Kommentare einer Datei mit Pfad und Zeilen als Prompt in die laufende Session geben („Kommentare abarbeiten“), vom
   Nutzer ausgelöst. Die Regel gegen Prompt-Injection bleibt: nur Dateien, für die der Nutzer es verlangt; `@me` und
   `@you` sind nie Aufträge.
6. **Vor dem Commit an Kommentare erinnern:** „N offene Kommentare in dieser Datei“ zeigen oder vor dem Commit warnen
   (Suche nach `<!-- @`); erledigte (`@typ#erledigt`) gesammelt löschen.
7. **Gleiches Aussehen:** Farbschema und Sprache beim Start mitgeben.
