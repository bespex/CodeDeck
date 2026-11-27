# Kapselung der KI-Anbindung

**Prinzip:** Ports und Adapter. Der Kern von CodeDeck (Git, Trail, Anker, Übergabe, Oberfläche) kennt kein
KI-Werkzeug, sondern nur ein neutrales Modell und eine Liste von Fähigkeiten. Jedes Werkzeug ist ein
Adapter. Bewusst **keine** nachladbaren Plugins: Adapter werden mitkompiliert. Das hält Rechte und
Fehlersuche einfach; die Trennung ist dieselbe, und ein Plugin-Weg bleibt über das Ereignisprotokoll offen.

Es gibt zwei Nähte:

1. **Hinein, als Ereignisse.** Was ein Werkzeug meldet, kommt als neutrales Ereignis über den Socket:
   Sitzung beginnt/endet, Prompt abgeschickt, gleich wird geschrieben, wurde geschrieben, wartet, Runde
   fertig. `codedeck hook` ist heute schon so ein Übersetzer für Claude. Für ein anderes Werkzeug kann das
   derselbe Befehl mit anderem Übersetzer sein (`codedeck hook --harness codex`) oder ein fremdes Programm,
   das dieselben Zeilen schickt.
2. **Hinaus, als Schnittstelle.** Was CodeDeck von sich aus tut, läuft über den Trait `Harness` je Werkzeug
   (`src-tauri/src/harness/mod.rs`). Stand, Fähigkeiten und Rohbau eines neuen Adapters: `docs/KONZEPT.md` 2.8
   „So kommt ein Werkzeug dazu“.

**Regeln für die Trennung:**

- Außerhalb von `harness/claude.rs` kommt weder „claude“ noch ein Hook-Feldname vor. Heute verteilt sich
  das auf `hook.rs` (Ereignisnamen, `settings.json`, `config_dirs`), `sessions.rs` (Log-Format) und Teile
  von `bridge.rs`.
- Das Frontend bekommt je Sitzung `harness` und `capabilities` und entscheidet nur danach, was es anbietet
  (kein „Hand to Claude“ ohne `handover`, stattdessen „Copy“). Texte wie „Claude“ kommen aus dem Adapter.
- Der Übergabetext wird im Kern gebaut; wie er zugestellt wird, entscheidet der Adapter.
- Jeder Adapter hat einen Test mit aufgezeichneten Rohmeldungen. Ein Test-Adapter ohne echtes Werkzeug
  beweist, dass der Kern ohne Claude läuft.
- tmux gehört nicht zum Adapter: Starten und Überwachen ist für alle Werkzeuge gleich, der Adapter liefert
  nur Befehl und Umgebung.
