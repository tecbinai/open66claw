const fs = require("fs");
const d = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));
const root = d.nodes["1:10"].document;

function walk(node, indent) {
  const bb = node.absoluteBoundingBox || {};
  const w = Math.round(bb.width || 0);
  const h = Math.round(bb.height || 0);
  let info = indent + node.type + ': "' + node.name + '" (' + w + "x" + h + ")";

  if (node.type === "TEXT" && node.characters) {
    info += ' -> "' + node.characters.replace(/\n/g, "\\n") + '"';
  }

  if (node.fills && node.fills.length > 0 && node.fills[0].color) {
    const c = node.fills[0].color;
    const hex =
      "#" +
      [c.r, c.g, c.b]
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (hex !== "#ffffff" && hex !== "#000000") info += " [" + hex + "]";
  }

  if (node.cornerRadius) info += " r=" + node.cornerRadius;
  if (node.strokeWeight && node.strokes && node.strokes.length > 0)
    info += " stroke=" + node.strokeWeight;

  console.log(info);

  if (node.children) {
    for (const child of node.children) {
      walk(child, indent + "  ");
    }
  }
}

walk(root, "");
