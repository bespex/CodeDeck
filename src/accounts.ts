// The tools' accounts with the names and colours the user gave them (step 3.2), shared by every
// component: the overview, the project's menu, the sessions, the settings.

import { useEffect, useState } from "react";
import { accountsList, onAccountsChanged, type Account } from "./backend";

let shared: Account[] | null = null;
const listeners = new Set<(a: Account[]) => void>();
const publish = (accounts: Account[]) => {
  shared = accounts;
  listeners.forEach((l) => l(accounts));
};
const reload = () => void accountsList().then(publish).catch(() => {});

let watching = false;

export function useAccounts(): Account[] {
  const [accounts, setAccounts] = useState<Account[]>(shared ?? []);
  useEffect(() => {
    listeners.add(setAccounts);
    if (!shared) reload();
    if (!watching) {
      watching = true;
      onAccountsChanged(reload);
    }
    return () => void listeners.delete(setAccounts);
  }, []);
  return accounts;
}

/** An account's folder name without the leading dot, for one CodeDeck has not listed. */
export const folderName = (dir: string) => dir.replace(/\/+$/, "").split("/").pop()!.replace(/^\./, "");

/** Name and colour of the account a folder belongs to; the folder's name and grey when unknown. */
export function accountLook(accounts: Account[], dir: string): { name: string; color: string; mark: Account["mark"] } {
  const a = accounts.find((x) => x.dir === dir);
  return a ? { name: a.name, color: a.color, mark: a.mark } : { name: folderName(dir), color: "#6b7178", mark: null };
}
