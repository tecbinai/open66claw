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

// Mask group children - the gradient background
const maskGroup = findNode(doc, "1:13");
if (maskGroup) {
  console.log("Mask group children:", (maskGroup.children || []).length);
  (maskGroup.children || []).forEach((c) => {
    console.log("\n--- Child:", c.name, "id=" + c.id, c.type);
    const bb = c.absoluteBoundingBox;
    if (bb) console.log("  Size:", bb.width + "x" + bb.height);
    if (c.fills) c.fills.forEach((f, i) => console.log("  Fill " + i + ":", JSON.stringify(f)));
    if (c.opacity !== undefined && c.opacity !== 1) console.log("  Opacity:", c.opacity);
  });
}
