const https = require("https");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Get file top-level structure (pages and top frames)
const url = `https://api.figma.com/v1/files/${fileKey}?depth=3`;

https.get(url, { headers: { "X-Figma-Token": token } }, (res) => {
  let body = "";
  res.on("data", (d) => (body += d));
  res.on("end", () => {
    const data = JSON.parse(body);
    const doc = data.document || {};

    function printTree(n, depth) {
      if (depth > 3) return;
      const name = n.name || "";
      const type = n.type || "";
      const id = n.id || "";
      const bb = n.absoluteBoundingBox;
      const size = bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "";
      console.log("  ".repeat(depth) + type + ': "' + name + '" id=' + id + " " + size);
      (n.children || []).forEach((c) => printTree(c, depth + 1));
    }

    printTree(doc, 0);
  });
});
