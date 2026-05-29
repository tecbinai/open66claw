const fs = require("fs");
const data = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));
const doc = Object.values(data.nodes)[0].document;

// Find the logo that's actually in the center of the card
// Card is at (388, 178) size 1419x682, so center is around (1097, 519)
// Look for IMAGE type fills or large elements near center

function findAll(n, depth) {
  const bb = n.absoluteBoundingBox;
  if (bb && bb.x > 300 && bb.x < 1200 && bb.y > 200 && bb.y < 600) {
    const type = n.type;
    const fills = n.fills || [];
    const hasImage = fills.some((f) => f.type === "IMAGE");
    if (hasImage || (bb.width > 50 && bb.height > 50 && type !== "FRAME" && type !== "GROUP")) {
      console.log(
        type +
          ': "' +
          n.name +
          '" id=' +
          n.id +
          " " +
          Math.round(bb.width) +
          "x" +
          Math.round(bb.height) +
          " at (" +
          Math.round(bb.x) +
          "," +
          Math.round(bb.y) +
          ")" +
          (hasImage ? " [IMAGE]" : ""),
      );
    }
  }
  (n.children || []).forEach((c) => findAll(c, depth + 1));
}

findAll(doc, 0);
