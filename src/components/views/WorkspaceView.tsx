import type { ReactNode } from "react";
import { Bot, CircleAlert, CircleCheck, EyeOff, FileCog, Plug, Wrench } from "lucide-react";
import { config, configToml, project as sample } from "../../mock";
import type { ProjectInfo } from "../../backend";

const tomlLines = configToml.trimEnd().split("\n");

export function WorkspaceView({ project }: { project: ProjectInfo | null }) {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-50">{project?.name}</h1>
          <p className="selectable mt-0.5 font-mono text-[12px] text-slate-500">{project?.root}</p>
        </div>
        <p className="max-w-xs text-right text-[12px] text-slate-500">
          A project is a directory. Everything CodeDeck knows about it is in one small file.
        </p>
      </header>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* The file itself */}
        <Card icon={FileCog} title=".codedeck.toml" hint={`optional · ${tomlLines.length} lines`}>
          <pre className="selectable overflow-x-auto font-mono text-[12px] leading-[1.7]">
            {tomlLines.map((line, i) => (
              <div key={i} className="flex">
                <span className="w-7 shrink-0 pr-3 text-right text-slate-700 select-none">{i + 1}</span>
                <TomlLine line={line} />
              </div>
            ))}
          </pre>
        </Card>

        {/* What CodeDeck reads from it */}
        <div className="grid content-start gap-4">
          <Card icon={Bot} title="Assistant">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
              <Row label="Runs through">{config.assistant.provider}</Row>
              <Row label="Model">
                <code className="font-mono text-[12px]">{config.assistant.model}</code>
              </Row>
              <Row label="Context budget">
                {config.assistant.contextBudget.toLocaleString("en-US")} tokens
              </Row>
            </dl>
          </Card>

          <Card icon={Wrench} title="Tools" hint="open files in small external apps">
            <ul className="-my-1 divide-y divide-line">
              {config.tools.map((t) => (
                <li key={t.pattern} className="flex items-center gap-3 py-2">
                  <code className="w-14 font-mono text-[12px] text-indigo-300">{t.pattern}</code>
                  <span className="font-medium text-slate-100">{t.tool}</span>
                  <span className="truncate text-slate-500">{t.what}</span>
                  {t.found ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-added">
                      <CircleCheck className="size-3.5" /> installed
                    </span>
                  ) : (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] text-changed">
                      <CircleAlert className="size-3.5" /> not found
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card icon={EyeOff} title="Ignored">
              <div className="flex flex-wrap gap-1.5">
                {config.ignore.map((glob) => (
                  <code
                    key={glob}
                    className="rounded border border-line bg-base px-1.5 py-0.5 font-mono text-[12px] text-slate-300"
                  >
                    {glob}
                  </code>
                ))}
              </div>
            </Card>
            <Card icon={Plug} title="Tool socket">
              <code className="selectable font-mono text-[12px] break-all text-slate-300">
                {sample.socket}
              </code>
              <p className="mt-1.5 text-[12px] text-slate-500">
                Tools send selections here; they appear in the context.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Bot;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Icon className="size-4 text-indigo-300" />
        <h2 className="font-semibold text-slate-100">{title}</h2>
        {hint && <span className="ml-auto text-[12px] text-slate-500">{hint}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200">{children}</dd>
    </>
  );
}

/** Just enough TOML colouring for the sample: tables, keys, strings, numbers. */
function TomlLine({ line }: { line: string }) {
  if (line.startsWith("[")) return <span className="text-indigo-300">{line}</span>;
  const eq = line.indexOf("=");
  if (eq < 0) return <span>{line || " "}</span>;
  const value = line.slice(eq + 1);
  return (
    <span className="whitespace-pre">
      <span className="text-slate-300">{line.slice(0, eq)}</span>
      <span className="text-slate-600">=</span>
      <span className={/^\s*\d/.test(value) ? "text-changed" : "text-added"}>{value}</span>
    </span>
  );
}
