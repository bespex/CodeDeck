import { Eye, ExternalLink, FileText } from "lucide-react";
import { openFile, type AssistantState } from "../../backend";
import { touchedFiles, useSessionMarks } from "../../assistant";
import { Row, Rows, Section } from "../blocks";
import { SessionBadge } from "../SessionBadge";
import { LOCALE } from "../Trail";
import { Tooltip } from "../Tooltip";
import { t } from "../../i18n";

/**
 * What are the sessions doing? For now the documents they wrote: the results of their work, to
 * read first. The sessions' timeline and how safe the work is come with a later step.
 */
export function ActivityView({ assistant }: { assistant: AssistantState }) {
  const marks = useSessionMarks();
  const docs = recentDocs(assistant);
  const button = "rounded p-1 text-slate-500 hover:bg-overlay-hover hover:text-slate-100";
  return (
    <div className="flex min-h-full flex-col">
      <Section title={t("Documents written")} note={t("last 24 hours")}>
        {docs.length === 0 ? (
          <p>{t("None yet. Documents a session writes in this project show up here, to read first.")}</p>
        ) : (
          <Rows>
            {docs.map(([path, at]) => {
              const mark = marks.of(marks.writer(path));
              return (
                <Row key={path}>
                  <FileText className="size-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-200">{path}</span>
                  {mark && <SessionBadge mark={mark} />}
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    {new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Tooltip content={<span>{t("View")}</span>}>
                    <button type="button" aria-label={t("View {path}", { path })} onClick={() => openFile(path, "view")} className={button}>
                      <Eye className="size-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip content={<span>{t("Edit, e.g. to add comments for the assistant")}</span>}>
                    <button type="button" aria-label={t("Edit {path}", { path })} onClick={() => openFile(path, "edit")} className={button}>
                      <ExternalLink className="size-3.5" />
                    </button>
                  </Tooltip>
                </Row>
              );
            })}
          </Rows>
        )}
      </Section>
      <Section title={t("Timeline")}>
        <p>{t("Not built yet: what each session did when, and how safe your work is.")}</p>
      </Section>
    </div>
  );
}

const DOC_TYPES = /\.(md|markdown|html?|txt|adoc|rst)$/i;
/** How far back "recently" goes. */
const RECENT_DOCS_MS = 24 * 3600_000;

function recentDocs(state: AssistantState): [string, number][] {
  const since = Date.now() - RECENT_DOCS_MS;
  return [...touchedFiles(state)].filter(([path, at]) => DOC_TYPES.test(path) && at > since).sort((a, b) => b[1] - a[1]);
}
