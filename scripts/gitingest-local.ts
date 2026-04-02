import { Glob } from "bun";

const glob = new Glob("src/**/*.{ts,tsx}");
let out = "";

for await (const file of glob.scan(".")) {
  out += "================================================\n";
  out += "FILE: " + file + "\n";
  out += "================================================\n";
  try {
    const fileContent = await Bun.file(file).text();
    out += fileContent + "\n\n";
  } catch (e) {
    out += "[Could not read file]\n\n";
  }
}

await Bun.write("gitingest-output.txt", out);
console.log("Digest saved to gitingest-output.txt");
