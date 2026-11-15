// The interface in English or German. Texts stay in English in the code, where they are read; the
// English text is also the key into the German dictionary (`i18n.de.ts`), so a text not translated
// yet simply shows in English. What the assistant gets (start rules, attachments) and what is kept in
// git (snapshot names) is not translated: it is not interface.
//
//   t("Delete {n} older than {days} days", { n: 2, days: 7 })   a text with values
//   <T text="Sent at {time} to {who}" time={…} who={<Badge/>} />  a sentence with elements in it
//   plural(3, "file")                                            "3 files" / "3 Dateien"

import { createElement, Fragment, type ReactNode } from "react";
import { de, nouns } from "./i18n.de";

export type Lang = "en" | "de";

const KEY = "codedeck.lang";

/** The language chosen on this machine, else the system's. */
function initial(): Lang {
  const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  if (saved === "en" || saved === "de") return saved;
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

export let lang: Lang = initial();
/** For dates and numbers. A live binding: it follows the language. */
export let LOCALE = lang === "de" ? "de-DE" : "en-GB";

const listeners = new Set<() => void>();

/** Switches the language and keeps it for this machine; the interface draws itself again. */
export function setLang(next: Lang) {
  lang = next;
  LOCALE = next === "de" ? "de-DE" : "en-GB";
  localStorage.setItem(KEY, next);
  listeners.forEach((l) => l());
}

export function onLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Texts asked for in German that the dictionary does not have, for finding them in the preview. */
const missing = new Set<string>();
if (typeof window !== "undefined") (window as unknown as { missingTranslations: () => string[] }).missingTranslations = () => [...missing];

function lookup(text: string): string {
  if (lang === "en") return text;
  const found = de[text];
  if (found === undefined) missing.add(text);
  return found ?? text;
}

/** The text in the current language, with `{name}` filled in from `values`. */
export function t(text: string, values?: Record<string, string | number>): string {
  const s = lookup(text);
  return values ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m)) : s;
}

/** For labels that may already be in the current language (made when attaching): translated if known, quietly. */
export const known = (text: string): string => (lang === "de" ? (de[text] ?? text) : text);

/** A translated sentence with elements in it: every `{name}` is replaced by the prop of that name. */
export function T({ text, ...parts }: { text: string } & Record<string, ReactNode>): ReactNode {
  const pieces = lookup(text).split(/\{(\w+)\}/);
  return createElement(
    Fragment,
    null,
    ...pieces.map((piece, i) => (i % 2 === 1 ? createElement(Fragment, { key: i }, piece in parts ? parts[piece] : `{${piece}}`) : piece)),
  );
}

/**
 * A snapshot's name as shown. It is kept in git in English ("Before: <prompt>"), since it is data;
 * only its fixed beginning is translated when it is shown.
 */
export function snapshotLabel(label: string): string {
  if (lang === "en") return label;
  for (const [prefix, key] of [
    ["Before going back to ", "Before going back to {rest}"],
    ["Before: ", "Before: {rest}"],
    ["After: ", "After: {rest}"],
  ] as const) {
    if (label.startsWith(prefix)) return t(key, { rest: label.slice(prefix.length) });
  }
  return known(label);
}

/** A count with its noun: `plural(1, "file")` is "1 file", in German "1 Datei". */
export function plural(n: number, one: string, many = `${one}s`): string {
  if (lang === "de") {
    const forms = nouns[one];
    if (forms) return `${n} ${n === 1 ? forms[0] : forms[1]}`;
    missing.add(`noun: ${one}`);
  }
  return `${n} ${n === 1 ? one : many}`;
}
