// How a session CodeDeck started in tmux was started and how it is ended: nothing happens out of
// sight (docs/SITZUNGEN.md A3 "Show how it was started"). Shown as one line in a session's details
// (the tool's part, to be read at a glance); the full command is in its tooltip and is what is copied.

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { sessionCommands, type SessionCommands as Commands } from "../backend";
import { t } from "../i18n";
import { useCopy } from "./GitLog";

/** The commands of the tmux session `name`: `undefined` while asked or without a name, `null` for one CodeDeck did not start. */
export function useSessionCommands(project: string | undefined, name: string | undefined): Commands | null | undefined {
  const [commands, setCommands] = useState<Commands | null | undefined>(undefined);
  useEffect(() => {
    if (!project || !name) return setCommands(undefined);
    let alive = true;
    void sessionCommands(project, name)
      .then((c) => alive && setCommands(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project, name]);
  return commands;
}

/** The start command as one line of a details list: the tool's part, cut short, and a copy button. */
export function StartCommand({ commands }: { commands: Commands }) {
  const [copied, copy] = useCopy();
  if (!commands.start) return <span className="text-slate-500">{t("(started before CodeDeck kept the command)")}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <code title={commands.start} className="selectable min-w-0 flex-1 truncate font-mono text-slate-300">
        {commands.tool ?? commands.start}
      </code>
      <button
        type="button"
        title={t("Copy the command (the full tmux command)")}
        aria-label={t("Copy the command")}
        onClick={(e) => {
          e.stopPropagation();
          copy(commands.start!);
        }}
        className="grid size-4 shrink-0 place-items-center rounded text-slate-500 hover:bg-overlay-hover hover:text-slate-100"
      >
        {copied ? <Check className="size-3 text-added" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}
