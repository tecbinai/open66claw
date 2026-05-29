const https = require("https");
const fs = require("fs");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Export these node IDs as PNG images
const nodeIds = ["1:44", "1:34", "1:42", "1:143"];
const idsParam = nodeIds.join(",");

const url = `https://api.figma.com/v1/images/${fileKey}?ids=${idsParam}&format=png&scale=2`;

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
            console.log("Parse error:", body.slice(0, 200));
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadFile(imageUrl, filename) {
  return new Promise((resolve, reject) => {
    https
      .get(imageUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return downloadFile(res.headers.location, filename).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          fs.writeFileSync(filename, Buffer.concat(chunks));
          console.log("Saved:", filename, "(" + Buffer.concat(chunks).length + " bytes)");
          resolve();
        });
      })
      .on("error", reject);
  });
}

(async () => {
  console.log("Fetching image URLs...");
  const data = await fetch(url);
  console.log("Response:", JSON.stringify(data, null, 2));

  const images = data.images || {};
  const names = {
    "1:44": "logo_66_main",
    "1:34": "logo_66_alt",
    "1:42": "logo_text",
    "1:143": "user_avatar",
  };

  for (const [id, imgUrl] of Object.entries(images)) {
    if (imgUrl) {
      const name = names[id] || id.replace(":", "_");
      const path = "d:/newopenclaw/ui-cn/public/" + name + ".png";
      await downloadFile(imgUrl, path);
    }
  }
})();
