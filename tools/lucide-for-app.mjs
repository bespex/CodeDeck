// The outlines and keywords of every Lucide icon, for project marks (docs/UEBERSICHT.md): one JSON
// that the app loads only when it draws a mark or opens the picker.
//
//   npm pack lucide-static@<version of lucide-react>   # tags.json is only in lucide-static
//   tar xzf lucide-static-*.tgz package/tags.json
//   node tools/lucide-for-app.mjs package/tags.json public/lucide.json
import fs from "node:fs";

const [tagFile, out] = process.argv.slice(2);
if (!tagFile || !out) {
  console.error("usage: node tools/lucide-for-app.mjs <tags.json> <out.json>");
  process.exit(2);
}
const dir = "node_modules/lucide-react/dist/esm/icons";
const icons = {};
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
  icons[name] = node.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
}
const all = JSON.parse(fs.readFileSync(tagFile, "utf8"));
const tags = Object.fromEntries(Object.entries(all).filter(([n]) => icons[n]).map(([n, t]) => [n, t.join(" ")]));
const version = JSON.parse(fs.readFileSync("node_modules/lucide-react/package.json", "utf8")).version;
fs.writeFileSync(out, JSON.stringify({ version, icons, tags }));
console.log(`${Object.keys(icons).length} icons, ${Object.keys(tags).length} with keywords, lucide ${version}`);
