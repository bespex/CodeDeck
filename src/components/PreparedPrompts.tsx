// Prepared prompts in the Next prompt area (docs/PLAN.md, "Prompts vorbereiten"): a short list below
// what is attached, quiet like the rest of the column. One prompt at a time opens in its editor right
// there; the area grows for it, so it can stay open beside the deck and the file list while one looks
// things up and copies them in. Handing a prompt over is copy and paste for now.

import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, Pencil, Plus, Trash2, X } from "lucide-react";
import { onPromptsChanged, promptCreate, promptRead, promptRename, promptTrash, promptWrite, tokensFor, type PreparedPrompt } from "../backend";
import { usePreparedPrompts } from "../prompts";
import { PromptEditor } from "./PromptEditor";
import { HoverTools, Tool, ToolGap } from "./RowTools";
import { formatTokens } from "./AttachmentList";
import { t } from "../i18n";

/** Rows shown before "all n": prepared prompts are few, the column is narrow. */
const SHOWN = 3;
/** Saved this long after the last key: no save button to forget. */
const SAVE_AFTER_MS = 600;

const copy = (text: string) => navigator.clipboard.writeText(text);

/**
 * The list and the open prompt. `open` is the prompt in the editor (kept per project by the column,
 * which also makes room for it); `age` says how long ago a time was, as the column says it.
 */
export function PreparedPrompts({ open, onOpen, age }: { open: string | null; onOpen: (name: string | null) => void; age: (ms: number) => string }) {
  const { prompts, error, reload } = usePreparedPrompts();
  const [all, setAll] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Gone on disk (deleted elsewhere): the editor closes. Only once the list has shown it: right after
  // creating or renaming, the list read before does not know the name yet
  const listed = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !prompts) return;
    if (prompts.some((p) => p.name === open)) listed.current = open;
    else if (listed.current === open) {
      listed.current = null;
      onOpen(null);
    }
  }, [open, prompts, onOpen]);

  const create = async () => {
    try {
      const name = await promptCreate(t("New prompt"));
      setFresh(name);
      onOpen(name);
      setProblem(null);
      reload();
    } catch (e) {
      setProblem(String(e));
    }
  };
  const trash = async (name: string) => {
    try {
      await promptTrash(name);
      setProblem(null);
    } catch (e) {
      setProblem(String(e));
    }
    reload();
  };

  const others = (prompts ?? []).filter((p) => p.name !== open);
  const shown = all ? others : others.slice(0, SHOWN);
  const more = others.length - shown.length;

  return (
    <div data-tour="prepared" className={`flex flex-col gap-1 border-t border-line pt-2 ${open ? "min-h-[11rem] flex-1" : ""}`}>
      <div className="flex h-6 items-center gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{t("Prepared")}</h3>
        {!!prompts?.length && <span className="rounded-full bg-raised px-1.5 text-[11px] font-semibold text-slate-200">{prompts.length}</span>}
        <span className="ml-auto flex">
          <Tool icon={Plus} label={t("New prompt")} says={t("Prepare a prompt over time: Enter is a new line here, nothing is sent. Copy it into the session when it is ready.")} onClick={create} />
        </span>
      </div>

      {open && (
        <OpenPrompt
          key={open}
          name={open}
          fresh={fresh === open}
          onClose={() => {
            setFresh(null);
            onOpen(null);
          }}
          onRenamed={(name) => {
            setFresh(null);
            onOpen(name);
            reload();
          }}
          onTrashed={() => {
            onOpen(null);
            reload();
          }}
        />
      )}

      {shown.map((p) => (
        <PromptRow key={p.name} prompt={p} age={age(p.modified)} onOpen={() => onOpen(p.name)} onTrash={() => trash(p.name)} />
      ))}
      {(more > 0 || (all && others.length > SHOWN)) && (
        <button type="button" onClick={() => setAll(!all)} className="self-start rounded px-1.5 text-[12px] text-slate-500 hover:bg-raised hover:text-slate-200">
          {all ? t("Fewer") : t("… all {n}", { n: others.length })}
        </button>
      )}
      {prompts?.length === 0 && (
        <button type="button" onClick={create} className="flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[12px] text-slate-500 hover:bg-raised hover:text-slate-200">
          <Plus className="size-3.5" /> {t("Prepare a prompt")}
        </button>
      )}
      {(problem ?? error) && <p className="text-[12px] text-problem">{problem ?? error}</p>}
    </div>
  );
}

/** One prepared prompt in the list: a click opens it, the tools appear on hover. */
function PromptRow({ prompt: p, age, onOpen, onTrash }: { prompt: PreparedPrompt; age: string; onOpen: () => void; onTrash: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded px-1.5 text-[12px] text-slate-300 hover:bg-raised/70 hover:text-slate-100"
    >
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      <HoverTools>
        <Tool icon={Pencil} label={t("Edit")} onClick={onOpen} />
        <Tool icon={ClipboardCopy} label={t("Copy")} says={t("Copy the text to paste it into a session")} onClick={() => void promptRead(p.name).then(copy)} />
        <ToolGap />
        <Tool icon={Trash2} label={t("Move to the trash")} danger onClick={onTrash} />
      </HoverTools>
      <span className="shrink-0 text-[11px] text-slate-500 group-hover:hidden">{age}</span>
    </div>
  );
}

type SaveState = "saved" | "pending" | "saving" | "failed";

/**
 * The open prompt: its name (renamed in place), the editor and how saving goes. Saved shortly after
 * typing stops and when it closes; a change made elsewhere (one's own editor) comes in while nothing
 * typed here waits to be saved.
 */
function OpenPrompt({ name, fresh, onClose, onRenamed, onTrashed }: { name: string; fresh: boolean; onClose: () => void; onRenamed: (name: string) => void; onTrashed: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [state, setState] = useState<SaveState>("saved");
  const [problem, setProblem] = useState<string | null>(null);
  const [draftName, setDraftName] = useState(name);
  const [copied, setCopied] = useState(false);
  const local = useRef("");
  const saved = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gone = useRef(false);
  const nameField = useRef<HTMLInputElement>(null);

  const take = (from: string) => {
    saved.current = local.current = from;
    setText(from);
    setTokens(tokensFor(from.length));
  };

  const save = async () => {
    clearTimeout(timer.current);
    if (gone.current || local.current === saved.current) return;
    const value = local.current;
    setState("saving");
    try {
      await promptWrite(name, value);
      saved.current = value;
      setState(local.current === value ? "saved" : "pending");
      setProblem(null);
    } catch (e) {
      setState("failed");
      setProblem(String(e));
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    promptRead(name)
      .then(take)
      .catch((e) => setProblem(String(e)));
    // Changed on disk by someone else: taken over unless something typed here waits
    const path = `.scratch/prompts/${name}.md`;
    const stop = onPromptsChanged((change) => {
      if (!change.paths.includes(path)) return;
      if (local.current !== saved.current) return;
      promptRead(name)
        .then((disk) => disk !== saved.current && take(disk))
        .catch(() => {});
    });
    if (fresh) {
      nameField.current?.focus();
      nameField.current?.select();
    }
    return () => {
      stop();
      // Closing saves what is left
      void saveRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const onChange = (value: string) => {
    local.current = value;
    setTokens(tokensFor(value.length));
    setState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), SAVE_AFTER_MS);
  };

  const rename = async () => {
    const to = draftName.trim();
    if (!to || to === name) return setDraftName(name);
    try {
      await save();
      onRenamed(await promptRename(name, to));
    } catch (e) {
      setProblem(String(e));
      setDraftName(name);
    }
  };

  const trash = async () => {
    gone.current = true;
    clearTimeout(timer.current);
    try {
      await promptTrash(name);
      onTrashed();
    } catch (e) {
      gone.current = false;
      setProblem(String(e));
    }
  };

  const status: Record<SaveState, string> = { saved: t("Saved"), pending: t("Not saved yet"), saving: t("Saving…"), failed: t("Not saved") };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border border-line bg-base">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line pr-1 pl-2">
        <input
          ref={nameField}
          value={draftName}
          aria-label={t("Name of the prompt")}
          title={t("Name of the prompt: click to rename")}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraftName(name);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded bg-transparent px-1 text-[12px] font-medium text-slate-100 outline-none hover:bg-raised focus:bg-raised"
        />
        <Tool
          icon={ClipboardCopy}
          label={copied ? t("Copied") : t("Copy")}
          says={t("Copy the text to paste it into a session")}
          active={copied}
          onClick={() => {
            void copy(local.current).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        />
        <Tool icon={Trash2} label={t("Move to the trash")} danger onClick={trash} />
        <Tool icon={X} label={t("Close")} says={t("Saved already; it stays in the list")} onClick={onClose} />
      </div>
      {text !== null && <PromptEditor text={text} onChange={onChange} placeholderText={t("Write the prompt here. Enter starts a new line; nothing is sent.")} autoFocus={!fresh} />}
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-0.5 text-[11px] text-slate-500">
        <span className={state === "failed" ? "text-problem" : ""}>{status[state]}</span>
        <span className="ml-auto">{t("≈ {tokens} tokens", { tokens: formatTokens(tokens) })}</span>
      </div>
      {problem && <p className="px-2 pb-1 text-[12px] text-problem">{problem}</p>}
    </div>
  );
}
