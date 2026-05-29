const https = require("https");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Get file with depth=2 to see pages and their top-level frames
const url = `https://api.figma.com/v1/files/${fileKey}?depth=2`;

https.get(url, { headers: { "X-Figma-Token": token } }, (res) => {
  let body = "";
  res.on("data", (d) => (body += d));
  res.on("end", () => {
    const data = JSON.parse(body);
    const doc = data.document || {};

    // Print pages and their children
    (doc.children || []).forEach((page) => {
      console.log('PAGE: "' + page.name + '" id=' + page.id);
      (page.children || []).forEach((frame) => {
        const bb = frame.absoluteBoundingBox;
        const size = bb ? Math.round(bb.width) + "x" + Math.round(bb.height) : "";
        console.log("  " + frame.type + ': "' + frame.name + '" id=' + frame.id + " " + size);
      });
    });
  });
});
