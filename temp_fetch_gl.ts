import fs from "fs";
async function run() {
  const loginRes = await fetch("http://localhost:3000/api/auth/bypass", { method: "POST" });
  const cookies = loginRes.headers.get("set-cookie");
  const compRes = await fetch("http://localhost:3000/api/gl-accounts?companyId=72a631f0-eca3-4cde-b283-c7eabd3fc9de", {
    headers: { cookie: cookies || "" }
  });
  const compData = await compRes.text();
  fs.writeFileSync("fetch_gl_out2.json", compData);
}
run();
