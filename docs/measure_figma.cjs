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

// Content area (Rectangle 68) = 1584x837
// Card (Rectangle 1198) = 1419x682
// Logo (ChatGPT Image 1:44) = 124x83
// Input box (Rectangle 1199) = 770x180
// Button (Rectangle 1205) = 144x50
// Full frame = 1920x1080

const frame = findNode(doc, "1:10");
const contentArea = findNode(doc, "1:12");
const card = findNode(doc, "1:16");
const logo = findNode(doc, "1:44");
const inputBox = findNode(doc, "1:17");
const btn = findNode(doc, "1:19");
const title = findNode(doc, "1:23");

console.log("=== Sizes ===");
[
  ["Frame", frame],
  ["Content area", contentArea],
  ["Card", card],
  ["Logo 66°", logo],
  ["Input box", inputBox],
  ["Button", btn],
  ["Title text", title],
].forEach(([name, node]) => {
  if (!node) return;
  const bb = node.absoluteBoundingBox;
  if (bb) {
    console.log(
      `${name}: ${Math.round(bb.width)}x${Math.round(bb.height)} at (${Math.round(bb.x)}, ${Math.round(bb.y)})`,
    );
  }
});

// Calculate ratios relative to content area
const cBB = contentArea.absoluteBoundingBox;
const cardBB = card.absoluteBoundingBox;
const logoBB = logo.absoluteBoundingBox;

console.log(
  "\n=== Ratios (relative to content area " +
    Math.round(cBB.width) +
    "x" +
    Math.round(cBB.height) +
    ") ===",
);
console.log("Card width ratio:", ((cardBB.width / cBB.width) * 100).toFixed(1) + "%");
console.log("Card height ratio:", ((cardBB.height / cBB.height) * 100).toFixed(1) + "%");
console.log("Logo width px:", Math.round(logoBB.width));
console.log("Logo height px:", Math.round(logoBB.height));

// Calculate logo position relative to card
console.log("\n=== Logo position in card ===");
console.log("Logo top from card top:", Math.round(logoBB.y - cardBB.y));
console.log("Logo center X from card left:", Math.round(logoBB.x + logoBB.width / 2 - cardBB.x));
console.log("Card center X:", Math.round(cardBB.width / 2));

// Input box position
const inputBB = inputBox.absoluteBoundingBox;
console.log("\n=== Input box in card ===");
console.log("Input left margin:", Math.round(inputBB.x - cardBB.x));
console.log(
  "Input right margin:",
  Math.round(cardBB.x + cardBB.width - (inputBB.x + inputBB.width)),
);
console.log("Input width ratio of card:", ((inputBB.width / cardBB.width) * 100).toFixed(1) + "%");
