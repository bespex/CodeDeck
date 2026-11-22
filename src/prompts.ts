// Prepared prompts (docs/PLAN.md, "Prompts vorbereiten"): named prompts written over time, one Markdown
// file each in `.scratch/prompts/` (`prompts.rs`). Listed in the Next prompt area of the session column;
// one at a time is open in its editor there. Handing one over is copy and paste for now.

import { useCallback, useEffect, useState } from "react";
import { onPromptsChanged, promptList, type PreparedPrompt } from "./backend";

/** The prepared prompts, last changed first; read again when they change on disk. */
export function usePreparedPrompts(): { prompts: PreparedPrompt[] | null; error: string | null; reload: () => void } {
  const [prompts, setPrompts] = useState<PreparedPrompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    promptList()
      .then((list) => {
        setPrompts(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    reload();
    let timer: ReturnType<typeof setTimeout>;
    const stop = onPromptsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [reload]);
  return { prompts, error, reload };
}
