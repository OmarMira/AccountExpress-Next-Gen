import { Glob } from "bun";

const globs = [
  new Glob("src/**/*.{ts,tsx}"),
  new Glob("frontend/src/**/*.{ts,tsx}"),
];

let out = "";

for (const glob of globs) {
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
}

await Bun.write("gitingest-output.txt", out);
console.log("Digest saved to gitingest-output.txt");
