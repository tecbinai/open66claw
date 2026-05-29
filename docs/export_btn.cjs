const fs = require("fs");
const data = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));
function findNode(n, targetId) {
  if (n.id === targetId) return n;
  for (const c of n.children || []) {
    const found = findNode(c, targetId);
    if (found) return found;
  }
  return null;
}
const doc = Object.values(data.nodes)[0].document;
// Quick suggestion button
const btn = findNode(doc, "1:19");
if (btn) {
  console.log("Name:", btn.name, "Type:", btn.type);
  const bb = btn.absoluteBoundingBox;
  if (bb) console.log("Size:", bb.width + "x" + bb.height);
  if (btn.cornerRadius) console.log("Radius:", btn.cornerRadius);
  if (btn.fills) btn.fills.forEach((f, i) => console.log("Fill", i, ":", JSON.stringify(f)));
  if (btn.strokes) console.log("Strokes:", JSON.stringify(btn.strokes));
  if (btn.strokeWeight) console.log("StrokeWeight:", btn.strokeWeight);
  if (btn.effects) btn.effects.forEach((e, i) => console.log("Effect", i, ":", JSON.stringify(e)));
}
// Text inside button
const txt = findNode(doc, "1:25");
if (txt) {
  console.log("\nText:", txt.name);
  if (txt.style) console.log("Style:", JSON.stringify(txt.style));
  if (txt.fills) txt.fills.forEach((f, i) => console.log("Fill", i, ":", JSON.stringify(f)));
}
