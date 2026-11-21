// Pictures for the manual on the website (bespex.github.io, /codedeck/manual/de/), taken from the
// browser preview with its sample data and the German interface, so they can be made again after
// the interface changed.
//
//   setsid npx vite --port 5391 --strictPort >/dev/null 2>&1 &
//   node tools/manual-shots.mjs [site-repo] [chapter...]
//
// site-repo defaults to ../bespex.github.io; without chapters every chapter is taken. Each picture
// lands as WebP in <site-repo>/public/codedeck/manual/de/<chapter>-<name>.webp. Needs cwebp and ImageMagick (convert).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [site = resolve(import.meta.dirname, "../../bespex.github.io"), ...only] = process.argv.slice(2);
const base = "http://localhost:5391/";
// German interface, no tour and no welcome on top of what is to be seen.
const german = `eval:(localStorage.setItem("codedeck.mockSettings",JSON.stringify({language:"de",windowHelp:false,welcome:false})),location.reload(),1)`;
const settings = (section) => [german, "wait:3000", 'click:[title="Schnelleinstellungen"]', "wait:500", "text:Alle Einstellungen", "wait:800", `text:${section}`, "wait:800"];

/** Per chapter: name of the picture → url, the steps of tools/shot.mjs before the one snap, and
 *  optionally a crop (ImageMagick geometry, e.g. "760x520+370+190") for showing one area only. */
const chapters = {
  einleitung: {
    projektfenster: { url: base, steps: [german, "wait:3000"] },
  },
  vorbereitung: {
    willkommen: { url: `${base}?view=welcome`, steps: [german, "wait:2500", "size:720x820"] },
    "deine-projekte": { url: `${base}?view=welcome`, steps: [german, "wait:2500", "size:720x820", "text:Erzähl mir mehr", "wait:800"] },
    "coding-agents": { url: base, steps: settings("Coding-Agents"), crop: "760x520+370+190" },
    "leere-liste": { url: `${base}?view=overview&projects=none`, steps: [german, "wait:2500", "size:440x420"], crop: "440x330+0+0" },
  },
};

const out = join(site, "public/codedeck/manual/de");
execFileSync("mkdir", ["-p", out]);
const work = mkdtempSync(join(tmpdir(), "codedeck-manual-"));
try {
  for (const [chapter, shots] of Object.entries(chapters)) {
    if (only.length && !only.includes(chapter)) continue;
    for (const [name, { url, steps, crop }] of Object.entries(shots)) {
      const prefix = join(work, `${chapter}-${name}`);
      execFileSync("node", [join(import.meta.dirname, "shot.mjs"), url, prefix, ...steps, "snap:x"], { stdio: "inherit" });
      if (crop) execFileSync("convert", [`${prefix}-x.png`, "-crop", crop, "+repage", `${prefix}-x.png`]);
      const target = join(out, `${chapter}-${name}.webp`);
      execFileSync("cwebp", ["-quiet", "-q", "86", `${prefix}-x.png`, "-o", target]);
      console.log(target);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
