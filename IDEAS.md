# IDEAS

<!-- Entwürfe. Nicht ohne ausdrückliche Freigabe umsetzen. -->

## Woran habe ich am Tag X gearbeitet?
Idee des Nutzers (2026-11-15): CodeDeck weiß mehr als Git allein (Sitzungen mit Titel, Prompts, Zeiten, geschriebene Dateien, Sicherungspunkte, Commits je Projekt). Ein MCP-Server-Teil könnte das einer KI bereitstellen, um Arbeitszeiten und -themen zu erkennen. Braucht ein dauerhaftes Ereignisprotokoll je Projekt und eine Antwort darauf, was das Gerät verlassen darf.

## Externe Dateien anhängen
Idee des Nutzers (2026-11-15, bei 2.1 zurückgestellt): eine Datei von außerhalb des Projekts als Kopie nach `.scratch/attached/` holen und ihren Pfad anhängen, per Ziehen aus dem Dateimanager auf den Nächsten Prompt oder Knopf „Attach a file from elsewhere…“. Nur der Pfad ginge auch, dann fragt Claude meist um Erlaubnis. Siehe auch `docs/DATEISPALTE.md` B7.

## Einstellungsseite für Zeiten
Wunsch des Nutzers (2026-11-15): einstellbar, wie lange eine fertige Runde als wartend gilt und ab wann Sitzungen unter „Früher“ einklappen.

## Vorbereitete Prompts übergeben
Eine neue Sitzung mit einem vorbereiteten Prompt starten (Startprompt über `Harness::launch`, nie `send-keys`; vorher klären, ob und wie Claude Code einen Startprompt nimmt) und ihn einer wartenden Sitzung als Anhang des nächsten Prompts geben. Berührt D20 und D21.

## Anhänge an einen Entwurf
Büroklammer-Menü mit „nächster Prompt“ oder „Entwurf …“, damit sich Anhänge an einem vorbereiteten Prompt sammeln.

## Entwürfe aus vorhandenen Quellen
Einen Entwurf aus „Noch offen“ im Schlussbericht, aus `@ai`-Hinweisen oder aus Dirq-Kommentaren anlegen; Bezug auf eine Runde; Vorlagen; „frische Sitzung mit Zusammenfassung“ (siehe Roadmap U7).
