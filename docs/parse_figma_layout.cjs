const fs = require("fs");
const d = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));
const root = d.nodes["1:10"].document;

function walk(node, indent) {
  const bb = node.absoluteBoundingBox || {};
  const x = Math.round(bb.x || 0);
  const y = Math.round(bb.y || 0);
  const w = Math.round(bb.width || 0);
  const h = Math.round(bb.height || 0);

  let text = "";
  if (node.type === "TEXT" && node.characters) {
    text = ' "' + node.characters + '"';
  }

  let color = "";
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
    if (hex !== "#ffffff" && hex !== "#000000") color = " " + hex;
  }

  let r = node.cornerRadius ? " r" + node.cornerRadius : "";

  console.log(
    indent +
      node.name +
      " [" +
      node.type +
      "] @(" +
      x +
      "," +
      y +
      ") " +
      w +
      "x" +
      h +
      color +
      r +
      text,
  );

  if (node.children) {
    for (const child of node.children) {
      walk(child, indent + "  ");
    }
  }
}

walk(root, "");
