const https = require("https");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Get file with depth=1 first - just pages
const url = `https://api.figma.com/v1/files/${fileKey}?depth=1`;

function fetch(u) {
  return new Promise((resolve, reject) => {
    https
      .get(u, { headers: { "X-Figma-Token": token } }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

(async () => {
  const data = await fetch(url);
  const doc = data.document || {};
  const pages = doc.children || [];

  console.log("Total pages:", pages.length);
  pages.forEach((p) => {
    console.log('  PAGE: "' + p.name + '" id=' + p.id);
  });
})();
