import type { ReactNode } from "react";
import {
  ArrowUpRight,
  AtSign,
  File,
  FileText,
  Folder,
  GitCompareArrows,
  MessageSquare,
  Paperclip,
  TextSelect,
  X,
  type LucideIcon,
  LocateFixed,
  Map as MapIcon,
} from "lucide-react";
import { revealInTree } from "../fileView";
import { files, pinDetail, type Pin } from "../files";
import { changes } from "../changes";
import { notes, removeNote } from "../notes";
import { markerKey, markers, useMarkers } from "../markers";
import { planItems, planKey } from "../plan";
import { openFile } from "../backend";
import { useAttachEnabled } from "../attachments";
import { useConnections } from "../assistant";
import { openView, type ViewId } from "../view";
import { t } from "../i18n";
import { Row, Rows, Section } from "./blocks";

/**
 * Everything attached to the next prompt, with room: one section per kind, one line per item with
 * where it comes from, each removable on its own, and a way back to where such things are attached.
 * The Next prompt view shows it; the right column only sums it up.
 */
export function AttachmentSections() {
  const pins = files.use();
  const changed = changes.use();
  const comments = notes.use();
  const hints = markers.use();
  const planned = planItems.use();
  return (
    <>
      {planned.length > 0 && (
        <Kind title={t("From the plan")} count={planned.length} onClear={planItems.clear} source={{ view: "workbench", label: t("In the Workbench") }}>
          {planned.map((p) => (
            <Item
              key={planKey(p)}
              icon={MapIcon}
              name={`${p.path}:${p.line}`}
              title={p.text}
              detail={
                <span className="font-mono">
                  {p.path}:{p.line}
                  {p.stage ? ` · ${p.stage}` : ""}
                </span>
              }
              onRemove={() => planItems.remove([planKey(p)])}
            />
          ))}
        </Kind>
      )}
      {pins.length > 0 && (
        <Kind title={t("Files")} count={pins.length} onClear={files.clear}>
          {pins.map((pin) => (
            <Item
              key={pin.id}
              icon={pinIcon(pin)}
              name={pin.label}
              title={<span className={pin.kind === "snippet" ? "font-mono text-[12px]" : ""}>{pin.label}</span>}
              detail={
                <>
                  {pin.via && <span className="mr-1.5 rounded bg-ai/15 px-1 text-ai">{t("from {app}", { app: pin.via })}</span>}
                  {pinDetail(pin)}
                </>
              }
              aside={t("≈ {tokens} tokens", { tokens: formatTokens(pin.tokens) })}
              reveal={pin.kind === "snippet" ? undefined : pin.id}
              onRemove={() => files.remove([pin.id])}
            />
          ))}
        </Kind>
      )}
      {changed.length > 0 && (
        <Kind title={t("Changes")} count={changed.length} onClear={changes.clear} source={{ view: "changes", label: t("In Changes") }}>
          {changed.map((c) => (
            <Item
              key={c.id}
              icon={GitCompareArrows}
              name={c.shown}
              title={c.shown}
              detail={<span className="font-mono">{c.command ?? t("a new file, read as it is")}</span>}
              onRemove={() => changes.remove([c.id])}
            />
          ))}
        </Kind>
      )}
      {comments.length > 0 && (
        <Kind title={t("Line comments")} count={comments.length} onClear={notes.clear} source={{ view: "changes", label: t("In Changes") }}>
          {comments.map((n) => (
            <Item
              key={n.id}
              icon={MessageSquare}
              name={`${n.path}:${n.line}`}
              title={n.text}
              detail={
                <span className="font-mono">
                  {n.path}:{n.line} · {n.code.trim().slice(0, 80)}
                </span>
              }
              onRemove={() => removeNote(n.id)}
            />
          ))}
        </Kind>
      )}
      {hints.length > 0 && (
        <Kind title={t("Hints")} count={hints.length} onClear={markers.clear} source={{ view: "workbench", label: t("In the Workbench") }}>
          {hints.map((m) => (
            <Item
              key={markerKey(m)}
              icon={FileText}
              name={`${m.path}:${m.line}`}
              title={m.text}
              detail={
                <span className="font-mono">
                  {m.path}:{m.line}
                </span>
              }
              onRemove={() => markers.remove([markerKey(m)])}
            />
          ))}
        </Kind>
      )}
    </>
  );
}

/**
 * The `@ai` hints in the project's files that are not attached: offered here, where everything that
 * can go to the assistant is (docs/KONZEPT.md, scene 6), but not sent on their own. A hint stays in
 * its file and may be meant for later, so it goes only when attached (user, 2026-11-23); a line
 * comment, which lives nowhere else, is attached as it is written. Not counted with what is attached.
 */
export function HintsToAttach() {
  const { markers: found } = useMarkers();
  const attached = markers.use();
  const enabled = useAttachEnabled();
  const { connected } = useConnections();
  const keys = new Set(attached.map(markerKey));
  const open = (found ?? []).filter((m) => !keys.has(markerKey(m)));
  if (open.length === 0 || !enabled || !connected) return null;
  return (
    <Section
      title={t("Hints in your files")}
      note={t("{n} not attached", { n: open.length })}
      aside={
        <>
          <button
            type="button"
            onClick={() => openView("workbench")}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
          >
            {t("In the Workbench")}
            <ArrowUpRight className="size-3.5" />
          </button>
          {open.length > 1 && (
            <button
              type="button"
              onClick={() => markers.add(open)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
            >
              <Paperclip className="size-3.5" /> {t("attach all")}
            </button>
          )}
        </>
      }
    >
      <Rows>
        {open.map((m) => (
          <Row
            key={markerKey(m)}
            className="min-h-12 gap-3 py-2"
            onDoubleClick={() => void openFile(m.path, "view", m.line)}
            title={t("Double-click: view at this line")}
          >
            <AtSign className="size-4 shrink-0 text-slate-600" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] text-slate-400">{m.text}</span>
              <span className="truncate font-mono text-[12px] text-slate-500">
                {m.path}:{m.line}
              </span>
            </div>
            <button
              type="button"
              aria-label={t("Attach hint in {path}, line {n}", { path: m.path, n: m.line })}
              title={t("Attach to next prompt")}
              onClick={() => markers.add([m])}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
            >
              <Paperclip className="size-4" />
            </button>
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

/** How many things are attached: every item counts, the same everywhere. */
export function useAttachedCount(): number {
  return files.use().length + changes.use().length + notes.use().length + markers.use().length + planItems.use().length;
}

/** Per kind, for the summary in the right column. */
export function useAttachedKinds() {
  const pins = files.use();
  return {
    files: pins.length,
    tokens: pins.reduce((sum, p) => sum + p.tokens, 0),
    changes: changes.use().length,
    comments: notes.use().length,
    hints: markers.use().length,
    plan: planItems.use().length,
  };
}

const pinIcon = (pin: Pin) => (pin.kind === "folder" ? Folder : pin.kind === "snippet" ? TextSelect : File);

function Kind(props: { title: string; count: number; onClear: () => void; source?: { view: ViewId; label: string }; children: ReactNode }) {
  return (
    <Section
      title={props.title}
      note={String(props.count)}
      aside={
        <>
          {props.source && (
            <button
              type="button"
              onClick={() => openView(props.source!.view)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
            >
              {props.source.label}
              <ArrowUpRight className="size-3.5" />
            </button>
          )}
          {props.count > 1 && (
            <button
              type="button"
              onClick={props.onClear}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-slate-400 hover:bg-raised hover:text-slate-100"
            >
              <X className="size-3.5" /> {t("remove all")}
            </button>
          )}
        </>
      }
    >
      <Rows>{props.children}</Rows>
    </Section>
  );
}

function Item(props: { icon: typeof File; name: string; title: ReactNode; detail: ReactNode; aside?: ReactNode; reveal?: string; onRemove: () => void }) {
  const Icon = props.icon;
  return (
    <Row className="min-h-12 gap-3 py-2">
      <Icon className="size-4 shrink-0 text-slate-500" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] text-slate-100">{props.title}</span>
        <span className="truncate text-[12px] text-slate-500">{props.detail}</span>
      </div>
      {props.aside && <span className="shrink-0 text-[12px] text-slate-500 tabular-nums">{props.aside}</span>}
      {props.reveal !== undefined && (
        <button
          type="button"
          aria-label={t("Show in tree")}
          title={t("Show in tree")}
          onClick={() => revealInTree(props.reveal!)}
          className="shrink-0 rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-raised hover:text-slate-100 focus-visible:opacity-100"
        >
          <LocateFixed className="size-4" />
        </button>
      )}
      <button
        type="button"
        aria-label={t("Remove {name} from the next prompt", { name: props.name })}
        title={t("Remove from the next prompt")}
        onClick={props.onRemove}
        className="shrink-0 rounded p-1 text-slate-500 hover:bg-raised hover:text-slate-100"
      >
        <X className="size-4" />
      </button>
    </Row>
  );
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

/**
 * For nothing attached: a hint, not content. Set apart by a dashed outline and quiet type so it is
 * not read as something that goes out; one line per way to attach, with the icon of its place.
 */
export function NothingAttached({ tool }: { tool: string }) {
  const ways: [LucideIcon, string, string][] = [
    [Paperclip, t("Files"), t("the paperclip in the file list, or drag them onto Next prompt in the AI session list")],
    [GitCompareArrows, t("Changes"), t("the paperclip at a turn, commit or file in Changes")],
    [MessageSquare, t("Line comments"), t("the speech bubble at a line of a diff")],
    [AtSign, t("Hints"), t("write @ai into a file, then attach it below or in the Workbench")],
  ];
  return (
    <div className="mx-4 mt-5 rounded-lg border border-dashed border-slate-600/70 px-5 py-4 text-[13px]">
      <p className="flex items-center gap-2 font-medium text-slate-300">
        <Paperclip className="size-4 text-slate-500" />
        {t("Nothing attached yet")}
      </p>
      <p className="mt-1 text-slate-500">{t("{tool} only gets what you write. To give it more along with your next prompt:", { tool })}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {ways.map(([Icon, kind, how]) => (
          <li key={kind} className="flex items-baseline gap-2.5 text-slate-500">
            <Icon className="size-3.5 shrink-0 translate-y-[2px] text-slate-500" />
            <span>
              <span className="text-slate-400">{kind}:</span> {how}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
