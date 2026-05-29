const fs = require("fs");
const data = JSON.parse(fs.readFileSync("d:/newopenclaw/docs/figma_chat_raw.json", "utf8"));

// Search all nodes in the saved raw data for logo/image nodes
function findAll(n, depth) {
  const name = n.name || "";
  const type = n.type || "";
  const id = n.id || "";
  const bb = n.absoluteBoundingBox;
  const size = bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "";

  // Look for logo, image fills, or large icons
  const lower = name.toLowerCase();
  const isImage = type === "RECTANGLE" && n.fills && n.fills.some((f) => f.type === "IMAGE");
  const isVector =
    type === "VECTOR" || type === "BOOLEAN_OPERATION" || type === "STAR" || type === "ELLIPSE";
  const isGroup =
    type === "GROUP" || type === "FRAME" || type === "COMPONENT" || type === "INSTANCE";

  if (
    isImage ||
    lower.includes("logo") ||
    lower.includes("66") ||
    lower.includes("icon") ||
    lower.includes("brand") ||
    lower.includes("claw") ||
    lower.includes("头") ||
    lower.includes("图")
  ) {
    const fills = n.fills ? n.fills.map((f) => f.type).join(",") : "";
    console.log(
      "  ".repeat(depth) +
        type +
        ': "' +
        name +
        '" id=' +
        id +
        " " +
        size +
        " fills=[" +
        fills +
        "]",
    );
  }

  (n.children || []).forEach((c) => findAll(c, depth + 1));
}

// The raw data might have a 'nodes' wrapper or be the document directly
if (data.nodes) {
  Object.values(data.nodes).forEach((n) => findAll(n.document || n, 0));
} else if (data.document) {
  findAll(data.document, 0);
} else {
  findAll(data, 0);
}
