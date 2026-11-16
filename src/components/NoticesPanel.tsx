import { useEffect } from "react";
import { X } from "lucide-react";
import type { AssistantState, Capabilities } from "../backend";
import { mainHarness, shortId, useSessionMarks } from "../assistant";
import { LOCALE, t } from "../i18n";
import { noticesOf, useJournal } from "../timeline";
import type { ViewId } from "../view";

/** Two tips for what is open: what is easy to miss in this view, not what the heading already says. */
const tips = (view: ViewId, tool: string): string[] =>
  ({
    activity: [
      t("Before {tool} writes, CodeDeck saves an anchor. Click it on the trail to see or undo the whole turn.", { tool }),
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

/** What a tool can do with CodeDeck, in one line, from what its adapter says it can. */
function abilities(c: Capabilities): string {
  const parts = [
    c.liveStatus ? t("live status") : t("file changes only"),
    c.beforeWrite && t("anchors before it writes"),
    c.attach === "withNextPrompt" ? t("attachments with the next prompt") : c.attach === "clipboard" ? t("attachments by copy and paste") : false,
    c.pastSessions && t("earlier sessions"),
  ].filter(Boolean);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
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
        <Heading>{t("What each AI tool can do with CodeDeck")}</Heading>
        {assistant.harnesses.map((h) => (
          <div key={h.id}>
            <div className="text-slate-50">{h.name}</div>
            <div className="text-[12px] text-slate-300">{abilities(h.capabilities)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
