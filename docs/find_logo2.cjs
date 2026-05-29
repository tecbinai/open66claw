const https = require("https");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const nodeId = "1-41";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;

https.get(url, { headers: { "X-Figma-Token": token } }, (res) => {
  let body = "";
  res.on("data", (d) => (body += d));
  res.on("end", () => {
    const data = JSON.parse(body);
    const nodes = data.nodes || {};

    // Print full tree with first 3 levels
    function printTree(n, depth) {
      if (depth > 4) return;
      const name = n.name || "";
      const type = n.type || "";
      const id = n.id || "";
      const bb = n.absoluteBoundingBox;
      const size = bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "";
      console.log("  ".repeat(depth) + type + ': "' + name + '" id=' + id + " " + size);
      (n.children || []).forEach((c) => printTree(c, depth + 1));
    }

    for (const [k, v] of Object.entries(nodes)) {
      printTree(v.document || {}, 0);
    }
  });
});
