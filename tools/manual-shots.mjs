// Pictures for the manual on the website (bespex.github.io, /codedeck/manual/de/), taken from the
// browser preview with its sample data and the German interface, so they can be made again after
// the interface changed.
//
//   setsid npx vite --port 5391 --strictPort >/dev/null 2>&1 &
//   node tools/manual-shots.mjs [site-repo] [chapter...]
//
// site-repo defaults to ../bespex.github.io; without chapters every chapter is taken. Each picture
// lands as WebP in <site-repo>/public/codedeck/manual/de/<chapter>-<name>.webp. Needs cwebp.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [site = resolve(import.meta.dirname, "../../bespex.github.io"), ...only] = process.argv.slice(2);
const base = "http://localhost:5391/";
// German interface, no tour and no welcome on top of what is to be seen.
const german = `eval:(localStorage.setItem("codedeck.mockSettings",JSON.stringify({language:"de",windowHelp:false,welcome:false})),location.reload(),1)`;

/** Per chapter: name of the picture → url and the steps of tools/shot.mjs that end in one snap. */
const chapters = {
  einleitung: {
    projektfenster: { url: base, steps: [german, "wait:3000"] },
  },
};

const out = join(site, "public/codedeck/manual/de");
execFileSync("mkdir", ["-p", out]);
const work = mkdtempSync(join(tmpdir(), "codedeck-manual-"));
try {
  for (const [chapter, shots] of Object.entries(chapters)) {
    if (only.length && !only.includes(chapter)) continue;
    for (const [name, { url, steps }] of Object.entries(shots)) {
      const prefix = join(work, `${chapter}-${name}`);
      execFileSync("node", [join(import.meta.dirname, "shot.mjs"), url, prefix, ...steps, "snap:x"], { stdio: "inherit" });
      const target = join(out, `${chapter}-${name}.webp`);
      execFileSync("cwebp", ["-quiet", "-q", "86", `${prefix}-x.png`, "-o", target]);
      console.log(target);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
