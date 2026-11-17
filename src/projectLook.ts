// What the project window shows of its project and the AI account it runs with (the two header
// bars): the project's mark, and the account of its sessions with the tool and the model.

import { useEffect, useState } from "react";
import { myProject, onProjectChanged, type AssistantState, type HarnessInfo, type ProjectLook } from "./backend";
import { useAccounts } from "./accounts";
import type { Account } from "./backend";

/** This window's project: name, colour, mark, account. Read again when it changes in the overview. */
export function useProjectLook(path: string | undefined): ProjectLook | null {
  const [look, setLook] = useState<ProjectLook | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void myProject().then((l) => alive && setLook(l)).catch(() => {});
    load();
    const off = onProjectChanged((p) => (!path || p === path) && load());
    return () => {
      alive = false;
      off();
    };
  }, [path]);
  return look;
}

/** The account the project's sessions run with, and what is known of it. */
export interface ProjectAccount {
  account: Account | null;
  harness: HarnessInfo;
  /** The model of its latest session, as shown */
  model: string | null;
}

/**
 * Which account belongs to the project: the one the user chose for it, else the one its newest
 * session runs in, else the only one there is. The model is the one the newest session of that
 * account answered with.
 */
export function useProjectAccount(assistant: AssistantState, look: ProjectLook | null): ProjectAccount {
  const accounts = useAccounts();
  const live = assistant.sessions.filter((s) => s.status !== "ended").sort((a, b) => b.last - a.last);
  const dir = look?.account ?? live.find((s) => s.account)?.account ?? (accounts.length === 1 ? accounts[0].dir : null);
  const account = accounts.find((a) => a.dir === dir) ?? null;
  const own = live.filter((s) => !s.account || s.account === dir);
  const model = own.find((s) => s.model)?.model ?? null;
  const harness = assistant.harnesses.find((h) => h.id === account?.harness) ?? assistant.harnesses[0];
  return { account, harness, model };
}
