// Checks every theme in src/themes/ against the rules of docs/STYLING.md (contrast, colours that must
// stay apart, glass and backdrop in their worst case). Exits with 1 if one breaks a rule.
//
//   npm run themes            all themes, only what fails (and a line per theme)
//   npm run themes -- -v      every rule with its value
//
// Runs src/palette.ts directly (Node 22 strips the types), so app and check share one derivation.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "../src/palette.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/themes");
const verbose = process.argv.includes("-v");
let broken = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const theme = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const findings = check(theme);
  const fails = findings.filter((f) => !f.ok);
  broken += fails.length;
  console.log(`${fails.length ? "✗" : "✓"} ${theme.name} (${file}): ${findings.length - fails.length} of ${findings.length} rules met`);
  for (const f of verbose ? findings : fails) {
    const value = f.kind === "contrast" ? `${f.value.toFixed(2)} : 1, needs ${f.need}` : `apart ${f.value.toFixed(1)}, needs ${f.need}`;
    console.log(`    ${f.ok ? "ok  " : "FAIL"} ${f.rule.padEnd(44)} ${value}   ${f.a} / ${f.b}`);
  }
}
process.exit(broken ? 1 : 0);
