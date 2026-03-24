import { Glob } from "bun";
const glob = new Glob("src/**/*.ts");
let out = "================================================\nAccount Express Bookkeeping Core - Codebase Digest\n================================================\n\n";

for await (const file of glob.scan(".")) {
  try {
    const fileContent = await Bun.file(file).text();
    out += "================================================\n";
    out += "File: " + file + "\n";
    out += "================================================\n";
    out += fileContent + "\n\n";
  } catch (e) {
    console.warn("Could not read " + file);
  }
}
await Bun.write("gitingest-output.txt", out);
console.log("Digest saved successfully to gitingest-output.txt");
