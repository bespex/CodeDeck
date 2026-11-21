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

// The project window with every column open: the file list starts folded in the preview.
const wide = [german, "wait:3000", "size:1800x1000", 'eval:(window.dispatchEvent(new KeyboardEvent("keydown",{key:"b",ctrlKey:true})),1)', "wait:800"];

/** Per chapter: name of the picture → url, the steps of tools/shot.mjs before the one snap, and
 *  optionally a crop (ImageMagick geometry, e.g. "760x520+370+190") for showing one area only and
 *  marks: numbered circles [x, y, label] at places of the uncropped picture, which the text explains;
 *  or parts: several crops of the same picture, side by side on the column's colour. */
const chapters = {
  einleitung: {
    // The whole window, the file list shown too: the overview shows every part
    projektfenster: { url: base, steps: wide },
  },
  "session-starten": {
    spalte: { url: base, steps: [german, "wait:3000"], crop: "375x700+300+0" },
    konto: { url: base, steps: [german, "wait:3000", 'click:[title^="Work ·"]', "wait:500"], crop: "395x200+300+0" },
    // Three cards side by side: working, asking, turn done
    // The first card with its tools shown (as on hover) and its menu open (as on a right click)
    werkzeuge: {
      url: base,
      steps: [
        german,
        "wait:3000",
        `eval:(() => { const l = [...document.querySelectorAll("li")].find((l) => { const r = l.getBoundingClientRect(); return r.x > 300 && r.x < 700; }); const h = l.querySelector("span.hidden.bg-raised"); h.style.display = "flex"; const r = h.getBoundingClientRect(); l.firstElementChild.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left - 40, clientY: r.bottom + 4, button: 2 })); return 1; })()`,
        "wait:500",
      ],
      crop: "375x215+300+105",
    },
    zustaende: { url: base, steps: [german, "wait:3000"], parts: ["366x90+304+112", "366x114+304+200", "366x125+304+312"] },
  },
  vorbereitung: {
    willkommen: { url: `${base}?view=welcome`, steps: [german, "wait:2500", "size:720x820"] },
    "deine-projekte": { url: `${base}?view=welcome`, steps: [german, "wait:2500", "size:720x820", "text:Erzähl mir mehr", "wait:800"] },
    "coding-agents": { url: `${base}?view=settings&section=tools`, steps: [german, "wait:2500", "size:780x420"] },
    "leere-liste": { url: `${base}?view=overview&projects=none`, steps: [german, "wait:2500", "size:440x420"], crop: "440x330+0+0" },
    // A project without a repository opens in Changes, which offers git init
    "git-init": { url: `${base}?git=none`, steps: [german, "wait:3000"], crop: "470x240+832+100" },
  },
  aenderungen: {
    // Turn 6, finished: what was asked, the closing words, the counts, the tree
    runde: { url: base, steps: [german, "wait:3000", `eval:[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("CRunde 6")).click()`, "wait:1000"], crop: "760x420+676+0" },
    kommentar: {
      url: base,
      steps: [
        german,
        "wait:3000",
        `eval:[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("CRunde 6")).click()`,
        "wait:1000",
        "text:Code",
        "wait:800",
        `eval:[...document.querySelectorAll("button[aria-label]")].filter((b) => /Zeile \\d+ .*kommentieren/.test(b.getAttribute("aria-label")))[3].click()`,
        "wait:500",
        "type:Hier bitte auch den Fall ohne Client-ID abdecken.",
        "wait:300",
      ],
      crop: "760x350+676+250",
    },
    // A file row with its tools shown, as on hover
    werkzeuge: {
      url: base,
      steps: [german, "wait:3000", `eval:[...document.querySelectorAll("span.hidden.bg-raised")].find((h) => h.parentElement.getBoundingClientRect().x > 676 && h.closest("li,div").textContent.includes("orders.rs")).style.display = "flex"`, "wait:300"],
      crop: "735x130+676+520",
    },
  },
  werkbank: {
    ausserhalb: { url: base, steps: [german, "wait:3000", "text:Werkbank", "wait:1000"], crop: "736x308+675+0" },
    hinweise: { url: base, steps: [german, "wait:3000", "text:Werkbank", "wait:1000"], crop: "736x202+675+308" },
    scratch: { url: base, steps: [german, "wait:3000", "text:Werkbank", "wait:1000"], crop: "736x265+675+510" },
  },
  "naechster-prompt": {
    liste: { url: base, steps: [german, "wait:3000", "text:Nächster Prompt", "wait:1000"], crop: "736x350+675+0" },
    startregeln: { url: base, steps: [german, "wait:3000", "text:Nächster Prompt", "wait:1000"], crop: "736x262+675+350" },
    // The choice of who gets the attachments, open
    fuer: {
      url: base,
      steps: [german, "wait:3000", "text:Nächster Prompt", "wait:800", `eval:[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Wählen") && b.getBoundingClientRect().x > 676).click()`, "wait:500"],
      crop: "300x200+676+30",
    },
    // The summary at the bottom of the sessions column
    zusammenfassung: { url: base, steps: [german, "wait:3000"], crop: "375x150+300+748" },
  },
  aktivitaet: {
    // One picture per section, each shown where the text explains it (user, 2026-11-21)
    zeitleiste: { url: base, steps: [german, "wait:3000", "text:Aktivität", "wait:1000"], crop: "736x264+675+0" },
    sicherheit: { url: base, steps: [german, "wait:3000", "text:Aktivität", "wait:1000"], crop: "736x169+675+264" },
    verbrauch: { url: base, steps: [german, "wait:3000", "text:Aktivität", "wait:1000"], crop: "736x269+675+433" },
    dokumente: { url: base, steps: [german, "wait:3000", "text:Aktivität", "wait:1000"], crop: "736x146+675+702" },
    glocke: { url: base, steps: [german, "wait:3000", "text:Aktivität", "wait:800", 'click:[title="Hinweise und Tipps"]', "wait:600"], crop: "380x620+1076+0" },
  },
  trail: {
    zu: { url: base, steps: [german, "wait:3000"], crop: "100x640+1360+0" },
    // Opened by resting the mouse on it
    offen: { url: base, steps: [german, "wait:3000", 'hover:[data-tour="trail"]', "wait:1200"], crop: "420x640+1050+0" },
    // A snapshot chosen (the folded run opened first), then "Go back to here"
    snapshot: {
      url: base,
      steps: [
        german,
        "wait:3000",
        'eval:document.querySelector("[data-tour=trail] button[aria-label*=\\"gefaltet\\"]").click()',
        "wait:500",
        'eval:[...document.querySelectorAll("[data-tour=trail] button")].find((b) => /Snapshot/.test(b.getAttribute("aria-label") || "") && !/gefaltet/.test(b.getAttribute("aria-label"))).click()',
        "wait:800",
      ],
      crop: "760x290+676+0",
    },
    zurueckgehen: {
      url: base,
      steps: [
        german,
        "wait:3000",
        'eval:document.querySelector("[data-tour=trail] button[aria-label*=\\"gefaltet\\"]").click()',
        "wait:500",
        'eval:[...document.querySelectorAll("[data-tour=trail] button")].find((b) => /Snapshot/.test(b.getAttribute("aria-label") || "") && !/gefaltet/.test(b.getAttribute("aria-label"))).click()',
        "wait:800",
        "text:Hierher zurückgehen",
        "wait:400",
      ],
      crop: "760x290+676+0",
    },
  },
  projektfenster: {
    bereiche: { url: base, steps: wide, marks: [[150, 720, "1"], [525, 730, "2"], [700, 905, "3"], [1090, 975, "4"], [1418, 760, "5"], [1600, 600, "6"]] },
    projektliste: { url: base, steps: [german, "wait:3000"], crop: "300x650+0+0" },
    menue: { url: base, steps: [german, "wait:3000", 'click:[title="CodeDeck-Menü"]', "wait:600"], crop: "300x380+0+0" },
    schnelleinstellungen: { url: base, steps: [german, "wait:3000", 'click:[title="Schnelleinstellungen"]', "wait:600"], crop: "305x285+0+0" },
  },
};

/** ImageMagick arguments for one numbered circle in the brand's orange. */
function mark([x, y, label]) {
  return [
    "-fill", "#f26500", "-stroke", "white", "-strokewidth", "3", "-draw", `circle ${x},${y} ${x + 20},${y}`,
    "-fill", "white", "-stroke", "none", "-font", "DejaVu-Sans-Bold", "-pointsize", "24", "-gravity", "NorthWest",
    "-annotate", `+${x - 8}+${y - 15}`, label,
  ];
}

const out = join(site, "public/codedeck/manual/de");
execFileSync("mkdir", ["-p", out]);
const work = mkdtempSync(join(tmpdir(), "codedeck-manual-"));
try {
  for (const [chapter, shots] of Object.entries(chapters)) {
    if (only.length && !only.includes(chapter)) continue;
    for (const [name, { url, steps, crop, marks, parts }] of Object.entries(shots)) {
      const prefix = join(work, `${chapter}-${name}`);
      execFileSync("node", [join(import.meta.dirname, "shot.mjs"), url, prefix, ...steps, "snap:x"], { stdio: "inherit" });
      if (marks) execFileSync("convert", [`${prefix}-x.png`, ...marks.flatMap(mark), `${prefix}-x.png`]);
      if (crop) execFileSync("convert", [`${prefix}-x.png`, "-crop", crop, "+repage", `${prefix}-x.png`]);
      if (parts) {
        const gap = ["(", "-size", "16x1", "xc:rgb(36,39,44)", ")"];
        const pieces = parts.flatMap((p, i) => [...(i ? gap : []), "(", `${prefix}-x.png`, "-crop", p, "+repage", ")"]);
        // Gravity only for joining: set before the crops it would move them
        execFileSync("convert", ["-background", "rgb(36,39,44)", ...pieces, "-gravity", "North", "+append", "-bordercolor", "rgb(36,39,44)", "-border", "12", `${prefix}-x.png`]);
      }
      const target = join(out, `${chapter}-${name}.webp`);
      execFileSync("cwebp", ["-quiet", "-q", "86", `${prefix}-x.png`, "-o", target]);
      console.log(target);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
