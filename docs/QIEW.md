# CodeDeck und die Qiew-Betrachter

Stand 2026-11-21. Die Betrachter von be spex (Qiew: Marq, Jayq, Xaq, Hyqe, Cusq, Dirq, Maiqe, Trisq) bleiben eigenständige
Programme. CodeDeck nutzt ihre gemeinsame Befehlszeile (`<app> [<datei> | -] [--line <n>] [--geometry WxH+X+Y] [--reuse]`,
Qiew `crates/frame/src/launch.rs`); alles Zusätzliche wirkt nur, wenn CodeDeck sie startet.

## Gebaut (2026-11-21, Praxistest offen)

- **Bevorzugen:** Zum Ansehen nimmt CodeDeck, wo keine Wahl getroffen ist, den Betrachter von be spex für die Endung
  (`apps.rs` `QIEW`), vor dem Standard des Systems; in „Ansehen mit…“ steht er oben und gilt als empfohlen.
- **`--reuse`:** Jeder Start aus CodeDeck nutzt das offene Fenster des Betrachters weiter.
- **`--geometry`:** Zum Ansehen öffnet der Betrachter über dem Deck (Rechteck aus dem Frontend, `open_file` `place`,
  in physische Pixel umgerechnet). Unter Wayland setzt der Fenstermanager die Position nicht; die Größe gilt.
- **`--line`:** `openFile(path, "view", line)`; heute bei den @ai-Hinweisen (Doppelklick auf einen Hinweis).
- **Dirq bekommt den Zusammenhang:** Vor dem Patch steht ein Kopf wie bei `git format-patch` (`src/dirq.ts`): bei einer
  Runde Runde, Session, Prompt und Schlussworte; bei einem Commit dessen Betreff, Autor, Datum, Nachricht; bei einem
  Snapshot, beim nicht Committeten und beim Vergleich, was es ist.
- **Rechner-Check:** alle acht Betrachter mit ihrem Zweck für CodeDeck.

## Geplant

1. **Rückweg „An CodeDeck“** (in Qiew vorgesehen, README „Working with CodeDeck“): CodeDeck startet mit
   `CODEDECK_SOCKET`; nur dann zeigt der Betrachter den Knopf und schickt die Auswahl (Textstelle, jq-Ergebnis, Zeilen,
   Hunk, Fehler) als Anhang mit Herkunft. CodeDeck hat Socket und Anhangsart „Textstelle“ schon.
3. **Mitlesen:** auf Wunsch ein Dokument, das eine Session schreibt, mit `--reuse` in Marq oder Hyqe öffnen.
4. **Stand eines Snapshots ansehen:** `git show <snapshot>:<pfad> | marq -`.
7. **Gleiches Aussehen:** Farbschema und Sprache beim Start mitgeben.
