const https = require("https");
const fs = require("fs");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";
const data = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));

// Get detailed properties of key rectangles
function findNode(n, targetId) {
  if (n.id === targetId) return n;
  for (const c of n.children || []) {
    const found = findNode(c, targetId);
    if (found) return found;
  }
  return null;
}

const doc = Object.values(data.nodes)[0].document;

// Key nodes to inspect
const ids = ["1:12", "1:16", "1:17", "1:41", "1:13"];
for (const id of ids) {
  const node = findNode(doc, id);
  if (node) {
    console.log("\n=== " + node.name + " (id=" + id + ") ===");
    console.log("Type:", node.type);
    const bb = node.absoluteBoundingBox;
    if (bb) console.log("Size:", bb.width + "x" + bb.height, "at", bb.x + "," + bb.y);
    if (node.cornerRadius) console.log("Corner radius:", node.cornerRadius);
    if (node.rectangleCornerRadii) console.log("Corner radii:", node.rectangleCornerRadii);
    if (node.fills) {
      node.fills.forEach((f, i) => {
        console.log("Fill " + i + ":", JSON.stringify(f, null, 2));
      });
    }
    if (node.strokes && node.strokes.length > 0) {
      console.log("Strokes:", JSON.stringify(node.strokes));
    }
    if (node.strokeWeight) console.log("Stroke weight:", node.strokeWeight);
    if (node.effects && node.effects.length > 0) {
      node.effects.forEach((e, i) => {
        console.log("Effect " + i + ":", JSON.stringify(e, null, 2));
      });
    }
    if (node.opacity !== undefined && node.opacity !== 1) console.log("Opacity:", node.opacity);
    if (node.blendMode && node.blendMode !== "PASS_THROUGH") console.log("Blend:", node.blendMode);
    if (node.clipsContent) console.log("Clips content:", node.clipsContent);
    if (node.backgroundColor) console.log("BG color:", JSON.stringify(node.backgroundColor));
  }
}
