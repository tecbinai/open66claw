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

    function find(n, depth) {
      const name = n.name || "";
      const type = n.type || "";
      const id = n.id || "";
      const lower = name.toLowerCase();
      const keywords = ["logo", "66", "icon", "brand", "claw", "avatar", "头像", "吉祥物"];
      if (keywords.some((k) => lower.includes(k))) {
        console.log(
          "  ".repeat(depth) +
            type +
            ": " +
            name +
            " (id=" +
            id +
            ", size=" +
            (n.absoluteBoundingBox
              ? n.absoluteBoundingBox.width + "x" + n.absoluteBoundingBox.height
              : "?") +
            ")",
        );
      }
      (n.children || []).forEach((c) => find(c, depth + 1));
    }

    for (const [k, v] of Object.entries(nodes)) {
      find(v.document || {}, 0);
    }
  });
});
