import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = mkdtempSync(join(tmpdir(), "gemstone-js-native-npm-cache-"));

let pack;
try {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
  });
  [pack] = JSON.parse(output);
} finally {
  rmSync(cache, { recursive: true, force: true });
}

const files = pack.files.map((file) => file.path);
const fileSet = new Set(files);

const required = [
  "LICENSE",
  "README.md",
  "index.d.ts",
  "index.js",
  "package.json",
  "scripts/check-package.mjs",
  "scripts/smoke-node.mjs",
];

const forbidden = [
  ".DS_Store",
  "Cargo.toml",
  "Cargo.lock",
  "src",
  "target",
];

for (const path of required) {
  if (!fileSet.has(path)) {
    throw new Error(`npm pack is missing required file: ${path}`);
  }
}

const nativeBinaries = files.filter((file) => file.endsWith(".node"));
if (nativeBinaries.length === 0) {
  throw new Error("npm pack is missing a native .node binary. Run npm run build before pack:check.");
}

for (const path of forbidden) {
  const included = files.find((file) => file === path || file.startsWith(`${path}/`) || file.endsWith(`/${path}`));
  if (included) {
    throw new Error(`npm pack unexpectedly includes: ${included}`);
  }
}

console.log(`Package check passed: ${pack.name}@${pack.version} (${files.length} files).`);
