// scripts/fetch_issues.js
const https = require("https");

const options = {
  hostname: "api.github.com",
  path: "/repos/linxiap/battle-rank-system/issues",
  headers: {
    "User-Agent": "battle-rank-system"
  }
};

https.get(options, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log(data);
  });
}).on("error", (err) => {
  console.error("Request failed:", err);
});