import { readFile, writeFile } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { resolve } from "node:path";

const outFile = resolve("dist/index.js");

const content = await readFile(outFile, "utf8");
const shebang = "#!/usr/bin/env node\n";

let next = content;
if (!content.startsWith(shebang)) {
  next = shebang + content;
  await writeFile(outFile, next, "utf8");
}

// Daję prawa do uruchamiania jak normalny bin
chmodSync(outFile, 0o755);

console.log("postbuild: ensured shebang + chmod on dist/index.js");
