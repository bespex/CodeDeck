import { useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import { setUsageConnection, type AssistantState, type Connection } from "../backend";
import { useConnections } from "../assistant";
import { useNow } from "../attention";
import { LOCALE, t } from "../i18n";
import { accountName, limitsOf, resetAt, span, STANDING_FILL, STANDING_TEXT, worst, type Limit } from "../usage";
import { CLICKABLE } from "./StatusBar";

/** A small square in the colour of the account's place in the list, to tell the accounts apart (the sessions' colours). */
const mark = (i: number) => ({ background: `var(--color-session-${i % 6})` });

/** The accounts whose tool states a usage: the connections of the tools that can. */
function useAccounts(assistant: AssistantState): Connection[] {
  const { setups } = useConnections();
  const able = new Set(assistant.harnesses.filter((h) => h.capabilities.usage).map((h) => h.id));
  return (setups ?? []).filter((c) => able.has(c.harness));
}

/**
 * One limit: the figure and how it stands, a bar for what is used with a marker for how much of the
 * time is over (a bar beyond the marker means it is used faster than the time passes), and when it
 * starts over. The figure is the tool's; only the standing is worked out (see `usage.ts`).
 */
function LimitRow({ limit: l, now }: { limit: Limit; now: number }) {
  const note = l.standing === "limit" ? t("limit reached") : l.standing === "pace" ? t("at this pace used up before the reset") : "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3">
        <span className="shrink-0 whitespace-nowrap text-slate-300">{l.label}</span>
        <span className={`text-right ${l.standing === "fine" ? "text-slate-100" : STANDING_TEXT[l.standing]}`}>
          {Math.round(l.window.used)} %{note && ` · ${note}`}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-line">
        <div className={`h-1.5 rounded-full ${STANDING_FILL[l.standing]}`} style={{ width: `${Math.min(100, l.window.used)}%` }} />
        <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-100/70" style={{ left: `${Math.round(l.elapsed * 100)}%` }} />
      </div>
      <div className="flex justify-between gap-3 text-[11px] text-slate-500">
        <span>{t("resets in {time} · {at}", { time: span(l.left), at: resetAt(l.window.resetsAt, now, LOCALE) })}</span>
        <span>{t("{n} % of the time is over", { n: Math.round(l.elapsed * 100) })}</span>
      </div>
    </div>
  );
}

/** What connecting changes, said before it is done; nothing is touched without the click. */
function Connect({ account, onDone }: { account: Connection; onDone: (c: Connection[]) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await setUsageConnection(account.harness, account.dir, true));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const button = "rounded-md px-2.5 py-1 font-medium disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-panel px-3 py-2">
      <span className="text-slate-300">{t("Not set up yet. The figures come with the tool's status line.")}</span>
      {confirming ? (
        <>
          <span className="text-[12px] text-slate-400">
            {t("CodeDeck sets itself as the status line in {file}. Nothing else in the file changes. Before the first change, a backup copy is saved as {backup}.", { file: account.settings, backup: `${account.settings}.before-codedeck` })}
          </span>
          {/* Only when there is none of the user's own: then something new shows up in the tool */}
          {!account.usageKeeps && (
            <span className="text-[12px] text-slate-400">{t("The tool has no status line yet; it will show the figures, like \"5h 38% · wk 31%\".")}</span>
          )}
          <span className="text-[12px] text-slate-400">{t("Remove puts it back as it was.")}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={go} className={`${button} bg-brand-fill text-on-accent hover:bg-brand-fill-hover`}>
              {t("Set up")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={`${button} border border-line hover:bg-raised`}>
              {t("Cancel")}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${button} self-start border border-line hover:bg-raised`}>
          {t("Set up…")}
        </button>
      )}
      {error && <span className="selectable text-problem">{error}</span>}
    </div>
  );
}

/**
 * The usage of every account, in detail: the same in Activity and in the pop-up of the status bar.
 * Says what is missing instead of guessing: not connected, or no figures yet (the tool states them
 * with a running session, after its first answer). `onlySetUp` (Activity) lists just the accounts
 * that report, side by side when there is room; while there is none it falls back to the full list,
 * so that the first one can still be set up from there.
 */
export function UsageCards({ assistant, onlySetUp = false }: { assistant: AssistantState; onlySetUp?: boolean }) {
  const accounts = useAccounts(assistant);
  const hooks = useConnections();
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  if (accounts.length === 0) return <p className="text-slate-500">{t("No account found.")}</p>;
  const disconnect = async (c: Connection) => {
    setError(null);
    try {
      hooks.update(await setUsageConnection(c.harness, c.dir, false));
    } catch (e) {
      setError(String(e));
    }
  };
  const card = (c: Connection, i: number) => {
    const usage = assistant.usage.find((u) => u.account === c.dir);
    const limits = limitsOf(usage, now);
    return (
      <div key={`${c.harness} ${c.dir}`} className="flex flex-col gap-2.5 rounded-lg border border-slate-600/70 bg-raised/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={mark(i)} />
          <span className="min-w-0 truncate font-semibold text-slate-100" title={c.dir}>
            {accountName(c.dir)}
          </span>
          {/* Taken off in the status bar's pop-up; Activity only shows the figures */}
          {c.usage && !onlySetUp && (
            <button type="button" onClick={() => void disconnect(c)} className="ml-auto text-[11px] text-slate-500 hover:text-slate-200">
              {t("Remove")}
            </button>
          )}
        </div>
        {!c.usage ? (
          <Connect account={c} onDone={hooks.update} />
        ) : limits.length > 0 ? (
          limits.map((l) => <LimitRow key={l.key} limit={l} now={now} />)
        ) : (
          <span className="text-slate-500">
            {usage
              ? t("Nothing current: the limits started over since {time}.", { time: new Date(usage.seen).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) })
              : t("No figures yet. The tool states them with a running session, after its first answer.")}
          </span>
        )}
      </div>
    );
  };
  // The colour stays with the account, wherever it is listed
  const indexed = accounts.map((c, i) => ({ c, i }));
  const pending = indexed.filter(({ c }) => !c.usage);
  const active = indexed.filter(({ c }) => c.usage);
  // A band like the section headings, so the groups are told apart at a glance
  const heading = "-mx-1 rounded bg-raised px-2 py-1 text-[13px] font-semibold text-slate-100";
  if (onlySetUp && active.length > 0) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-3.5 text-[13px]">
        {active.map(({ c, i }) => card(c, i))}
        {error && <span className="selectable text-problem">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex max-w-[560px] flex-col gap-3.5 text-[13px]">
      {/* Accounts still to set up on top, apart from the ones that report */}
      {pending.length > 0 && (
        <>
          <span className={heading}>{t("Other Claude configurations: not set up yet")}</span>
          {pending.map(({ c, i }) => card(c, i))}
        </>
      )}
      {active.length > 0 && pending.length > 0 && <span className={`${heading} mt-2`}>{t("Already set up")}</span>}
      {active.map(({ c, i }) => card(c, i))}
      {error && <span className="selectable text-problem">{error}</span>}
    </div>
  );
}

/**
 * The usage in the status bar: "5h" and "wk" with their figures, coloured like the branch (bright,
 * amber when the pace would use a limit up before it starts over, red at the limit). A click opens
 * the details, the same as in Activity.
 */
export function UsageChip({ assistant, account }: { assistant: AssistantState; account?: string | null }) {
  const all = useAccounts(assistant);
  // The project's account only, once it is known: the figures of another account say nothing here
  const accounts = account && all.some((c) => c.dir === account) ? all.filter((c) => c.dir === account) : all;
  const now = useNow();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  if (accounts.length === 0) return null;

  // The index is the account's place among all of them: its colour is the same as on its card
  const shown = accounts
    .map((c, i) => ({ c, i, limits: limitsOf(assistant.usage.find((u) => u.account === c.dir), now) }))
    .filter((a) => a.c.usage && a.limits.length > 0);
  // Two accounts fit; with more only the one that is tightest, the rest are in the pop-up
  const tightest = [...shown].sort((a, b) => Number(worst(b.limits) > worst(a.limits)) - Number(worst(a.limits) > worst(b.limits)))[0];
  const chips = shown.length > 2 ? [tightest] : shown;
  const text = !accounts.some((c) => c.usage) ? t("usage: set up") : shown.length === 0 ? t("usage: no figures yet") : null;

  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${CLICKABLE} ${open ? "bg-raised" : ""}`}>
        {text !== null ? (
          <>
            <Gauge className="size-3.5 text-slate-500" />
            <span className="font-normal text-slate-500">{text}</span>
          </>
        ) : (
          chips.map(({ c, i, limits }) => (
            <span key={c.dir} className="flex items-center gap-3">
              {accounts.length > 1 && <span className="size-2 rounded-[2px]" style={mark(i)} />}
              {limits.map((l) => (
                <span
                  key={l.key}
                  title={`${l.label}: ${Math.round(l.window.used)} % · ${t("resets in {time} · {at}", { time: span(l.left), at: resetAt(l.window.resetsAt, now, LOCALE) })}`}
                  className={`flex items-center gap-1.5 ${STANDING_TEXT[l.standing]}`}
                >
                  <span className="font-normal text-slate-500">{l.key}</span>
                  {/* The bar with the marker for the time that is over, as in the details */}
                  <span className="relative h-1.5 w-16 rounded-full bg-line">
                    <span className={`absolute inset-y-0 left-0 rounded-full ${STANDING_FILL[l.standing]}`} style={{ width: `${Math.min(100, l.window.used)}%` }} />
                    <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-slate-100/70" style={{ left: `${Math.round(l.elapsed * 100)}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums">{Math.round(l.window.used)}%</span>
                </span>
              ))}
            </span>
          ))
        )}
        {shown.length > chips.length && <span className="font-normal text-slate-500">+{shown.length - chips.length}</span>}
      </button>
      {open && (
        <div className="surface-overlay absolute right-0 bottom-6 z-30 flex max-h-[70vh] w-[400px] flex-col gap-2 overflow-y-auto rounded-lg p-3 text-[12px] whitespace-normal text-slate-300">
          <UsageCards assistant={assistant} />
          <span className="text-[11px] text-slate-500">{t("The same as under Activity. The white marker shows how much of the time is over: a bar beyond it means it is used faster than the time passes.")}</span>
        </div>
      )}
    </div>
  );
}
