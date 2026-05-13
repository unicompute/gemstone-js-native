import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const cargoToml = readFileSync("Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLicense = cargoToml.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
const cargoHomepage = cargoToml.match(/^homepage\s*=\s*"([^"]+)"/m)?.[1];
const cargoRepository = cargoToml.match(/^repository\s*=\s*"([^"]+)"/m)?.[1];
const cargoDescription = cargoToml.match(/^description\s*=\s*"([^"]+)"/m)?.[1];

if (!cargoVersion) {
  throw new Error("Cargo.toml is missing a package version.");
}
if (pack.name !== packageJson.name) {
  throw new Error(`npm pack name ${pack.name} does not match package.json name ${packageJson.name}.`);
}
if (pack.version !== packageJson.version) {
  throw new Error(`npm pack version ${pack.version} does not match package.json version ${packageJson.version}.`);
}
if (packageJson.version !== cargoVersion) {
  throw new Error(`package.json version ${packageJson.version} does not match Cargo.toml version ${cargoVersion}.`);
}
if (packageJson.description !== cargoDescription) {
  throw new Error(`package.json description ${packageJson.description} does not match Cargo.toml description ${cargoDescription}.`);
}
if (packageJson.license !== cargoLicense) {
  throw new Error(`package.json license ${packageJson.license} does not match Cargo.toml license ${cargoLicense}.`);
}
if (packageJson.homepage !== `${cargoHomepage}#readme`) {
  throw new Error(`package.json homepage ${packageJson.homepage} does not match Cargo.toml homepage ${cargoHomepage}.`);
}
if (normalizeRepositoryUrl(packageJson.repository?.url) !== normalizeRepositoryUrl(cargoRepository)) {
  throw new Error(`package.json repository ${packageJson.repository?.url} does not match Cargo.toml repository ${cargoRepository}.`);
}
if (packageJson.publishConfig?.provenance !== true) {
  throw new Error("package.json publishConfig.provenance must be true.");
}

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

const publicExports = [
  "Gci",
  "smallintToOop",
  "oopToSmallint",
  "isSmallintOop",
  "boolToOop",
  "charToOopString",
  "oopToCharString",
];

for (const path of required) {
  if (!fileSet.has(path)) {
    throw new Error(`npm pack is missing required file: ${path}`);
  }
}

const declarations = readFileSync("index.d.ts", "utf8");
const loader = readFileSync("index.js", "utf8");
for (const name of publicExports) {
  if (!declarations.includes(` ${name}`)) {
    throw new Error(`index.d.ts is missing public export: ${name}`);
  }
  if (!loader.includes(`module.exports.${name}`)) {
    throw new Error(`index.js is missing public export: ${name}`);
  }
}

const nativeBinaries = files.filter((file) => file.endsWith(".node"));
if (nativeBinaries.length === 0) {
  throw new Error("npm pack is missing a native .node binary. Run npm run build before pack:check.");
}
for (const binary of nativeBinaries) {
  if (!loader.includes(JSON.stringify(binary)) && !loader.includes(`'${binary}'`)) {
    throw new Error(`index.js does not reference packed native binary: ${binary}`);
  }
}

for (const path of forbidden) {
  const included = files.find((file) => file === path || file.startsWith(`${path}/`) || file.endsWith(`/${path}`));
  if (included) {
    throw new Error(`npm pack unexpectedly includes: ${included}`);
  }
}

console.log(`Package check passed: ${pack.name}@${pack.version} (${files.length} files).`);

function normalizeRepositoryUrl(value) {
  return String(value ?? "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/#readme$/, "")
    .replace(/\/$/, "");
}
