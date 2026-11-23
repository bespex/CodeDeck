import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { startRules, type AssistantState } from "../../backend";
import { mainHarness, shortId, useSessionMarks } from "../../assistant";
import { Section, Toolbar } from "../blocks";
import { known, T, t } from "../../i18n";
import { SessionBadge } from "../SessionBadge";
import { AttachTarget, TargetLost } from "../AttachTarget";
import { AttachmentSections, HintsToAttach, NothingAttached, useAttachedCount } from "../AttachmentList";
import { LOCALE } from "../Trail";

const time = (ms: number) => new Date(ms).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

/**
 * What do you attach to your next prompt? (D20, D23) What goes out, with room: one section per
 * kind, every item on its own line with where it comes from; the exact text on demand; and, always
 * in sight below, the fixed rules every session gets at its start. No frames and no fills, only
 * structure. Where things are attached stays where they live (file list, Changes, Workbench).
 */
export function NextPromptView({ assistant }: { assistant: AssistantState }) {
  const harness = mainHarness(assistant);
  const count = useAttachedCount();
  const marks = useSessionMarks();
  const { delivered } = assistant;
  const [exact, setExact] = useState(false);
  const Fold = exact ? ChevronDown : ChevronRight;

  return (
    <div className="flex min-h-full flex-col">
      <Toolbar>
        {count > 0 ? (
          <>
            <span>{t("For")}</span>
            <AttachTarget state={assistant} className="max-w-72" />
            <TargetLost state={assistant} />
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-changed" /> {assistant.held ? t("Waiting until you choose who gets it") : t("Waiting for your next prompt")}
            </span>
          </>
        ) : delivered ? (
          <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
            <Check className="size-3.5 shrink-0 text-added" />
            <span className="truncate">
              <T
                text="Sent at {time} to {who}"
                time={time(delivered.at)}
                who={
                  <>
                    {marks.of(delivered.session) && <SessionBadge mark={marks.of(delivered.session)!} className="mx-0.5 align-[-2px]" />}
                    {marks.of(delivered.session)?.title ?? t("session {id}", { id: shortId(delivered.session) })}
                  </>
                }
              />
              <span className="text-slate-500">: {delivered.labels.filter(Boolean).map(known).join(", ")}</span>
            </span>
          </span>
        ) : (
          <span className="truncate">{t("You write the prompt in {tool}. CodeDeck attaches only what is listed here.", { tool: harness.shortName })}</span>
        )}
      </Toolbar>

      <div>
        {count > 0 ? (
          <AttachmentSections />
        ) : (
          <NothingAttached tool={harness.shortName} />
        )}
        <HintsToAttach />

        {assistant.preview && (
          <Section
            title={t("The exact text")}
            note={t("below what you write, in English")}
            aside={
              <button
                type="button"
                aria-expanded={exact}
                onClick={() => setExact(!exact)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
              >
                <Fold className="size-3.5" />
                {exact ? t("Hide") : t("Show")}
              </button>
            }
          >
            {exact && (
              <pre className="selectable max-h-[60vh] overflow-auto border-l-2 border-line pl-3 font-mono text-[12px] whitespace-pre-wrap text-slate-300">
                {assistant.preview}
              </pre>
            )}
          </Section>
        )}

        <StartRules assistant={assistant} />
      </div>
    </div>
  );
}

/** The fixed text every new session gets at its start, word for word, and who got it last: always in sight. */
function StartRules({ assistant }: { assistant: AssistantState }) {
  const harness = mainHarness(assistant);
  const [rules, setRules] = useState<string | null>(null);
  const marks = useSessionMarks();
  useEffect(() => {
    startRules().then(setRules, () => setRules(null));
  }, []);
  const ruled = assistant.ruled;
  return (
    <Section
      title={t("Start rules")}
      note={
        ruled ? (
          <T
            text="last given at {time} to {who}"
            time={time(ruled.at)}
            who={marks.of(ruled.session)?.title ?? t("session {id}", { id: shortId(ruled.session) })}
          />
        ) : undefined
      }
    >
      <p className="mb-2 text-[12px]">
        {t("Not an attachment: every new AI session gets them once when it starts while this project is open in CodeDeck, and again after its context was cleared or compacted. Short, fixed and always on.")}
      </p>
      {!harness.capabilities.startRules && (
        <p className="mb-2 text-[12px] text-changed">{t("{tool} cannot take text when an AI session starts, so these rules do not reach it.", { tool: harness.name })}</p>
      )}
      <RulesText text={rules} />
    </Section>
  );
}

/**
 * The rules laid out for reading: the opening line as a sentence, each rule as a point with a hanging
 * indent. Only the layout differs from what the session gets; the words are the same (D17).
 */
function RulesText({ text }: { text: string | null }) {
  if (text === null) return <p className="border-l-2 border-line pl-3 text-slate-500">…</p>;
  const intro: string[] = [];
  const rules: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("- ")) rules.push(line.slice(2));
    // A line that continues a rule (or the opening) belongs to what came before it
    else if (rules.length > 0) rules[rules.length - 1] += ` ${line}`;
    else intro.push(line);
  }
  return (
    <div className="selectable border-l-2 border-line pl-3 text-[13px] leading-relaxed text-slate-300">
      {intro.length > 0 && <p className="text-slate-400">{intro.join(" ")}</p>}
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-2">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-slate-500" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
