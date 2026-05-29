const https = require("https");
const fs = require("fs");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Get full page node id first, then render at high res
// The raw data shows the main frame is id=1:2 (the full page frame containing everything)
// Let me find the correct full-page frame from the saved data
const data = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));
const nodes = data.nodes || {};

// Print all top-level children to find the full page frame
function printTop(n, depth) {
  if (depth > 1) return;
  const name = n.name || "";
  const type = n.type || "";
  const id = n.id || "";
  const bb = n.absoluteBoundingBox;
  const size = bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "";
  console.log("  ".repeat(depth) + type + ': "' + name + '" id=' + id + " " + size);
  (n.children || []).forEach((c) => printTop(c, depth + 1));
}

for (const [k, v] of Object.entries(nodes)) {
  console.log("=== Node key:", k, "===");
  printTop(v.document || v, 0);
}
