import { useEffect } from "react";
import { Check, ChevronDown, ChevronRight, Minus, X } from "lucide-react";
import type { AssistantState, Capabilities } from "../backend";
import { mainHarness, shortId, useSessionMarks } from "../assistant";
import { LOCALE, t } from "../i18n";
import { noticesOf, useJournal } from "../timeline";
import { useFold } from "./blocks";
import type { ViewId } from "../view";

/** Two tips for what is open: what is easy to miss in this view, not what the heading already says. */
const tips = (view: ViewId, tool: string): string[] =>
  ({
    activity: [
      t("Before {tool} writes, CodeDeck saves a snapshot. Click it on the trail to see or undo the whole turn.", { tool }),
      t("The timeline shows when each session worked and when it waited for you. Point at a block to see the prompt."),
    ],
    changes: [
      t("Point at a diff line and click the bubble to leave a note for {tool}, right where it belongs.", { tool }),
      t("Go back is safe: your current state is saved first, so you can go forward again."),
    ],
    workbench: [
      t("The scratch folder is ignored by Git. Drag a file onto a folder in the file list when it becomes a result."),
      t("Pages online stay where they are. CodeDeck only keeps the link."),
    ],
    next: [
      t("{tool} gets paths, not contents. It reads the files itself, so it always sees the current state.", { tool }),
      t("Besides the start rules, nothing reaches {tool} unless it is listed here.", { tool }),
    ],
  })[view];

/** Everything a tool could do with CodeDeck, and whether this one can: so one sees what it cannot, too. */
function abilities(c: Capabilities): { label: string; can: boolean; note?: string }[] {
  return [
    { label: t("Live status: working, waiting, done"), can: c.liveStatus },
    { label: t("Snapshots before it writes"), can: c.beforeWrite },
    {
      label: t("Attachments with the next prompt"),
      can: c.attach === "withNextPrompt",
      note: c.attach === "clipboard" ? t("only by copy and paste") : undefined,
    },
    { label: t("Start rules for every new session"), can: c.startRules },
    { label: t("Earlier sessions from its logs"), can: c.pastSessions },
    { label: t("How much of the allowance is used"), can: c.usage },
  ];
}

const Heading = ({ children }: { children: string }) => (
  <div className="text-[11px] font-semibold tracking-wider text-slate-300 uppercase">{children}</div>
);

/**
 * What would cost space elsewhere, hanging over the right of the deck: the latest events in
 * words, two tips for the open view, and what each tool can do with CodeDeck.
 */
export function NoticesPanel({ assistant, view, onClose }: { assistant: AssistantState; view: ViewId; onClose: () => void }) {
  const marks = useSessionMarks();
  const lines = useJournal(assistant);
  const tool = mainHarness(assistant).shortName;
  const who = (id: string) => marks.of(id)?.title ?? t("session {id}", { id: shortId(id) });
  const notices = noticesOf(lines, who);
  const tools = useFold("notices.tools", true);
  const Fold = tools.open ? ChevronDown : ChevronRight;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <aside
      aria-label={t("Notices and tips")}
      className="surface-overlay absolute inset-y-0 right-0 z-20 flex w-[380px] max-w-full flex-col gap-4 overflow-y-auto border-l border-overlay-line p-4 text-[13px] text-slate-200"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold text-slate-50">{t("Notices and tips")}</h2>
        <button type="button" aria-label={t("Close")} onClick={onClose} className="ml-auto rounded-md p-1.5 text-slate-300 hover:bg-overlay-hover">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Heading>{t("What happened")}</Heading>
        {notices.length === 0 ? (
          <p className="text-slate-400">{t("Nothing yet today.")}</p>
        ) : (
          notices.map((n, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="w-10 shrink-0 text-slate-400 tabular-nums">{new Date(n.at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="min-w-0 text-slate-50">{n.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Heading>{t("Good to know here")}</Heading>
        {tips(view, tool).map((text) => (
          <div key={text} className="rounded-md bg-panel px-2.5 py-2">
            {text}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <button type="button" aria-expanded={tools.open} onClick={tools.toggle} className="-ml-1 flex items-center gap-1 self-start rounded px-1 text-left hover:bg-overlay-hover">
          <Fold className="size-3.5 text-slate-400" />
          <Heading>{t("What each AI tool can do with CodeDeck")}</Heading>
        </button>
        {tools.open &&
          assistant.harnesses.map((h) => (
            <div key={h.id} className="flex flex-col gap-0.5">
              <div className="text-slate-50">{h.name}</div>
              {abilities(h.capabilities).map((a) => (
                <div key={a.label} className={`flex items-center gap-2 text-[12px] ${a.can ? "text-slate-200" : "text-slate-400"}`}>
                  {a.can ? <Check className="size-3.5 shrink-0 text-added" /> : a.note ? <Minus className="size-3.5 shrink-0 text-changed" /> : <X className="size-3.5 shrink-0 text-slate-500" />}
                  <span>{a.label}</span>
                  {a.note && <span className="text-slate-400">· {a.note}</span>}
                </div>
              ))}
            </div>
          ))}
      </div>
    </aside>
  );
}
