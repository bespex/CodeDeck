import { useMemo, useState } from "react";
import { CircleCheckBig, ClipboardCopy, ListChecks, ListTodo, MessageSquare, Paperclip } from "lucide-react";
import { openFile, type HarnessInfo, type Marker, type Plan } from "../../backend";
import { useConnections } from "../../assistant";
import { useAttachEnabled } from "../../attachments";
import { markerKey, markers as hints, markerTask, type Markers } from "../../markers";
import { notes } from "../../notes";
import { planItems, planKey, type PlanItem } from "../../plan";
import { hintKey, markSeen, useNews } from "../../news";
import { NewsTag, newsClass } from "../News";
import { openView } from "../../view";
import { Tooltip, TooltipHint } from "../Tooltip";
import { plural, T, t } from "../../i18n";
import { MoreButton, Zone, ZoneEmpty, ZoneHead, ZoneRow } from "./zones";

/** How many entries of each group show before "all". */
const SHOWN = 6;

/**
 * "To do" in the Workbench (roadmap U8.4): everything you asked of the AI that is not done yet, in
 * one list: the `@ai` comments in your files, your comments on lines of the changes, and the open
 * points of the project's TODO file. Each says where it stands: open (the paperclip on hover),
 * attached (lit), or handed over and not done yet (counted below, by the session that has it). The
 * Next prompt view shows what goes now; this view what is still asked.
 */
export function TodoZone({ marks, harness, plan }: { marks: Markers; harness: HarnessInfo; plan: Plan | null }) {
  const news = useNews();
  const { markers, error, sent, done } = marks;
  const attachedHints = hints.use();
  const comments = notes.use();
  const planned = planItems.use();
  const enabled = useAttachEnabled();
  const { connected } = useConnections();
  const canAttach = enabled && connected;
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const open = useMemo(() => markers ?? [], [markers]);
  const hintOn = (m: Marker) => attachedHints.some((a) => markerKey(a) === markerKey(m));
  const allHintsOn = open.length > 0 && open.every(hintOn);
  const questions: PlanItem[] = (plan?.tasks?.questions ?? []).map((e) => ({ kind: "question", path: plan!.tasks!.path, line: e.line, text: e.text }));
  const planOn = (i: PlanItem) => planned.some((p) => planKey(p) === planKey(i));
  // Sent with a prompt in this window and still in the files: handed over, not done yet
  const waiting = sent.filter((m) => !done.has(markerKey(m)) && open.some((o) => markerKey(o) === markerKey(m)));
  const waitingKeys = new Set(waiting.map(markerKey));

  const hintRows = [
    ...open
      .filter((m) => !waitingKeys.has(markerKey(m)))
      .map((m) => {
        const on = hintOn(m);
        const item = { key: hintKey(m.path, m.text), time: 0 };
        const fresh = news.of(item);
        return (
          <ZoneRow
            key={`h${markerKey(m)}`}
            icon={<span className="rounded bg-ai/15 px-1 font-mono text-[10px] leading-4 text-ai">@ai</span>}
            sub={
              <>
                {m.path}:{m.line}
              </>
            }
            className={newsClass(fresh)}
            title={t("Double-click: view at this line")}
            onClick={() => fresh && markSeen(item)}
            onDoubleClick={() => void openFile(m.path, "view", m.line)}
            aside={
              <>
                <NewsTag news={fresh} />
                {canAttach && <Clip on={on} onClick={() => hints.toggle([m])} label={t("Attach hint in {path}, line {n}", { path: m.path, n: m.line })} />}
              </>
            }
          >
            <span className="selectable">{m.text}</span>
          </ZoneRow>
        );
      }),
  ];
  const commentRows = [
    // A line comment is attached once written: it goes with the next prompt, or is removed there
    ...comments.map((n) => (
      <ZoneRow
        key={`n${n.id}`}
        icon={<MessageSquare className="size-4 text-moved" />}
        sub={`${n.path}:${n.line}`}
        title={t("Double-click: view at this line")}
        onDoubleClick={() => void openFile(n.path, "view", n.line)}
        aside={
          <Tooltip content={<span>{t("Goes with your next prompt; remove it there")}</span>}>
            <button type="button" aria-label={t("Show in Next prompt")} onClick={() => openView("next")} className="rounded p-0.5 text-brand-soft hover:bg-raised">
              <Paperclip className="size-3.5" />
            </button>
          </Tooltip>
        }
      >
        „{n.text}“
      </ZoneRow>
    )),
  ];
  const questionRows = [
    ...questions.map((q) => (
      <ZoneRow
        key={`q${planKey(q)}`}
        icon={<ListChecks className="size-4 text-changed" />}
        title={t("Double-click: view at this line")}
        onDoubleClick={() => void openFile(q.path, "view", q.line)}
        aside={canAttach && <Clip on={planOn(q)} onClick={() => planItems.toggle([q])} label={t("Attach to next prompt")} />}
      >
        {q.text}
      </ZoneRow>
    )),
  ];
  // By where they come from, each group named once (user, 2026-11-27: "TODO.md · open point" under
  // every entry was too much); two columns where the zone is wide enough
  const groups: [string, React.ReactNode[]][] = [
    [t("Hints in your files"), hintRows],
    [t("Line comments"), commentRows],
    [plan?.tasks ? t("Open points · {file}", { file: plan.tasks.path }) : t("Open points"), questionRows],
  ];
  const count = hintRows.length + commentRows.length + questionRows.length;

  return (
    <Zone>
      <ZoneHead
        icon={ListTodo}
        title={t("To do")}
        count={count}
        note={waiting.length > 0 ? t("{n} handed over", { n: waiting.length }) : undefined}
        aside={
          <>
            {open.length > 0 && (
              <Tooltip content={<span>{copied ? t("Copied") : t("Copy the hints as a task to paste into {tool}", { tool: harness.shortName })}</span>}>
                <button
                  type="button"
                  aria-label={t("Copy as a task")}
                  onClick={async () => {
                    await navigator.clipboard.writeText(markerTask(open));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
                >
                  <ClipboardCopy className={`size-3.5 ${copied ? "text-added" : ""}`} />
                </button>
              </Tooltip>
            )}
            {open.length > 1 && canAttach && (
              <button
                type="button"
                onClick={() => hints.toggle(open)}
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] hover:bg-raised ${allHintsOn ? "text-brand-soft" : "text-slate-400 hover:text-slate-100"}`}
              >
                <Paperclip className="size-3.5" />
                {allHintsOn ? t("Remove all hints") : t("Attach all hints")}
              </button>
            )}
          </>
        }
        help={
          <>
            <span>{t("What you asked of the AI and is not done yet: @ai comments in your files, your comments on lines in Changes, open points of the TODO file.")}</span>
            <span className="mt-1.5">
              <T
                text="Write {ai} and what you want at the start of a line, in your own editor, or right after the comment sign that begins the line: {html}, {slash}, {hash}. Save, and it shows up here. {tool} removes the comment when it is done; that is how CodeDeck knows. Examples in Markdown code blocks do not count."
                ai={<Code>@ai</Code>}
                html={<Code>{"<!-- @ai …"}</Code>}
                slash={<Code>// @ai …</Code>}
                hash={<Code># @ai …</Code>}
                tool={harness.shortName}
              />
            </span>
            <TooltipHint>{t("The paperclip attaches an entry to your next prompt.")}</TooltipHint>
          </>
        }
      />
      {error && <p className="selectable text-[12px] text-problem">{error}</p>}
      {!canAttach && open.length > 0 && (
        <p className="mb-1 text-[12px] text-changed">
          {enabled
            ? t("Needs {tool} connected (status bar) to attach them.", { tool: harness.name })
            : t("{tool} takes nothing with a prompt: copy them as a task instead.", { tool: harness.name })}
        </p>
      )}
      {markers && count === 0 && waiting.length === 0 && (
        <ZoneEmpty icon={CircleCheckBig}>
          <T text="Nothing open. Write {ai} at the start of a line in any file of the project, and it shows up here." ai={<Code>@ai</Code>} />
        </ZoneEmpty>
      )}
      {groups
        .filter(([, list]) => list.length > 0)
        .map(([title, list]) => (
          <div key={title} className="mb-2 last:mb-0">
            <h4 className="mb-0.5 px-1.5 text-[11px] font-medium text-slate-500">{title}</h4>
            <ul className="grid grid-cols-1 gap-x-5 @lg/zone:grid-cols-2">{all ? list : list.slice(0, SHOWN)}</ul>
          </div>
        ))}
      {groups.some(([, list]) => list.length > SHOWN + 1) && <MoreButton all={all} count={count} onClick={() => setAll(!all)} />}
      {waiting.length > 0 && (
        <Tooltip content={<span className="flex flex-col">{waiting.map((m) => <span key={markerKey(m)}>{`${m.path}:${m.line} · ${m.text}`}</span>)}</span>}>
          <p className="mt-2 ml-10 text-[12px] text-slate-500">
            {t("Handed over, not done yet: {hints}", { hints: plural(waiting.length, "hint") })}
            {sent.length > 0 && ` · ${t("{done} of {all} sent done", { done: done.size, all: sent.length })}`}
          </p>
        </Tooltip>
      )}
    </Zone>
  );
}

function Clip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <Tooltip content={<span>{on ? t("Attached to your next prompt; click to remove it") : t("Attach to next prompt")}</span>} className="flex">
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? t("Remove from next prompt") : label}
        onClick={onClick}
        className={`rounded p-0.5 hover:bg-raised ${on ? "text-brand-soft" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-100 focus-visible:opacity-100"}`}
      >
        <Paperclip className="size-3.5" />
      </button>
    </Tooltip>
  );
}

const Code = ({ children }: { children: string }) => <code className="font-mono whitespace-nowrap text-slate-300">{children}</code>;
