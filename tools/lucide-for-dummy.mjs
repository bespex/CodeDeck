// Pulls icon outlines out of lucide-react for the click dummy (not part of the app):
//   node tools/lucide-for-dummy.mjs design/click-dummy/lucide-icons.js
import fs from "node:fs";
const dir = "node_modules/lucide-react/dist/esm/icons";
const out = {};
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".mjs")) continue;
  const t = fs.readFileSync(`${dir}/${f}`, "utf8");
  const name = t.match(/name: "([^"]+)"/)?.[1];
  const at = t.indexOf("node: [");
  if (!name || at < 0) continue;
  // The node array, by matching brackets
  let depth = 0, end = at + 6;
  for (let i = at + 6; i < t.length; i++) {
    if (t[i] === "[") depth++;
    else if (t[i] === "]" && --depth === 0) { end = i + 1; break; }
  }
  const node = Function(`return ${t.slice(at + 6, end)}`)();
  out[name] = node.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
}
const all = JSON.stringify(out);
console.log(Object.keys(out).length, "icons,", all.length, "bytes");
fs.writeFileSync(process.argv[2], `// Generated from lucide-react ${JSON.parse(fs.readFileSync("node_modules/lucide-react/package.json")).version} (ISC licence) for the click dummy; the app imports lucide-react itself.\nwindow.LUCIDE = ${all};\n`);
