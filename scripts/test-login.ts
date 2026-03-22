// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
async function testLogin() {
  try {
    const res = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "ChangeMe@2026!" })
    });
    const authHeaders = res.headers.get("set-cookie");
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
    console.log("Set-Cookie:", authHeaders || "No cookie set");
  } catch(e) {
    console.error("Fetch failed:", e);
  }
}
testLogin();
