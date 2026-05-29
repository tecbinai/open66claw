const https = require("https");
const fs = require("fs");

const fileKey = "RQNCY6fSnuHM5jOYZWXqfZ";
const token = "figd_kWzs3AtyWisjL87FR33XEt3o_kYDaYXs57dgpdhf";

// Export the background image node and the mask group
const nodeIds = ["1:15", "1:13"];
const idsParam = nodeIds.join(",");

const url = `https://api.figma.com/v1/images/${fileKey}?ids=${idsParam}&format=png&scale=1`;

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
  const data = await fetch(url);
  console.log(JSON.stringify(data, null, 2));
  const images = data.images || {};
  for (const [id, imgUrl] of Object.entries(images)) {
    if (imgUrl) {
      const name = id.replace(":", "_");
      const path = "d:/newopenclaw/ui-cn/public/chat-bg-" + name + ".png";
      await downloadFile(imgUrl, path);
    }
  }
})();
