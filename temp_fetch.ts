import fs from 'fs';
async function run() {
  const loginRes = await fetch("http://localhost:3000/api/auth/bypass", { method: "POST" });
  const loginData = await loginRes.json();
  const cookies = loginRes.headers.get("set-cookie");
  const compRes = await fetch("http://localhost:3000/api/companies", {
    headers: { cookie: cookies || "" }
  });
  const compData = await compRes.json();
  const out = "LOGIN:\n" + JSON.stringify(loginData, null, 2) + "\n\nCOMPANIES:\n" + JSON.stringify(compData, null, 2);
  fs.writeFileSync("fetch_out.txt", out);
}
run();
