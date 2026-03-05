import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const userscriptPath = path.join(repoRoot, "AutoNektome.user.js");
const metaPath = path.join(repoRoot, "AutoNektome.meta.js");

const userscript = fs.readFileSync(userscriptPath, "utf8");
const metadataMatch = userscript.match(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==/m);

if (!metadataMatch) {
    throw new Error("Failed to extract userscript metadata block.");
}

fs.writeFileSync(metaPath, `${metadataMatch[0]}\n`, "utf8");
console.log(`Generated ${path.basename(metaPath)}`);
