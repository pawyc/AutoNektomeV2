import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const userscriptPath = path.join(repoRoot, "AutoNektome.user.js");
const readmePath = path.join(repoRoot, "README.md");

const userscript = fs.readFileSync(userscriptPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

const headerVersionMatch = userscript.match(/(^\/\/ @version\s+)([^\r\n]+)/m);
const runtimeVersionMatch = userscript.match(/(const VERSION = ")([^"]+)(";\s*)/);

if (!headerVersionMatch || !runtimeVersionMatch) {
    throw new Error("Failed to locate userscript version markers.");
}

const currentVersion = headerVersionMatch[2].trim();
const nextVersion = bumpVersion(currentVersion);

let nextUserscript = userscript.replace(/(^\/\/ @version\s+)([^\r\n]+)/m, `$1${nextVersion}`);
nextUserscript = nextUserscript.replace(/(const VERSION = ")([^"]+)(";\s*)/, `$1${nextVersion}$3`);

let nextReadme = readme.replace(
    /(https:\/\/img\.shields\.io\/badge\/версия-)([^-]+)(-brightgreen)/,
    `$1${nextVersion}$3`
);

fs.writeFileSync(userscriptPath, nextUserscript, "utf8");
fs.writeFileSync(readmePath, nextReadme, "utf8");

console.log(`Bumped userscript version: ${currentVersion} -> ${nextVersion}`);

function bumpVersion(version) {
    const parts = version.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
        throw new Error(`Invalid version: ${version}`);
    }

    while (parts.length < 3) {
        parts.push(0);
    }

    parts[parts.length - 1] += 1;
    return parts.join(".");
}
