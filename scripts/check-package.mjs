import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gciMethods, publicExports } from "./public-surface.mjs";

const cache = mkdtempSync(join(tmpdir(), "gemstone-js-native-npm-cache-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

let pack;
try {
  const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
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
if (packageJson.publishConfig?.access !== "public") {
  throw new Error("package.json publishConfig.access must be public.");
}
if (packageJson.main !== "./index.js") {
  throw new Error(`package.json main must be ./index.js, found ${packageJson.main}.`);
}
if (packageJson.types !== "./index.d.ts") {
  throw new Error(`package.json types must be ./index.d.ts, found ${packageJson.types}.`);
}
const rootExport = packageJson.exports?.["."];
if (rootExport?.types !== packageJson.types) {
  throw new Error(`package.json exports["."].types must match package.json types.`);
}
if (rootExport?.require !== packageJson.main) {
  throw new Error(`package.json exports["."].require must match package.json main.`);
}
if (rootExport?.default !== packageJson.main) {
  throw new Error(`package.json exports["."].default must match package.json main.`);
}

const required = [
  "LICENSE",
  "README.md",
  "index.d.ts",
  "index.js",
  "package.json",
  "session-worker.js",
  "session-worker-thread.js",
  "scripts/check-package.mjs",
  "scripts/check-checksums.mjs",
  "scripts/check-installed-package.mjs",
  "scripts/check-live-smoke.mjs",
  "scripts/check-prebuild-artifacts.mjs",
  "scripts/check-release-artifacts.mjs",
  "scripts/live-smoke-node.mjs",
  "scripts/patch-loader.mjs",
  "scripts/public-surface.mjs",
  "scripts/check-public-surface.mjs",
  "scripts/check-session-thread-spike.mjs",
  "scripts/smoke-node.mjs",
  "scripts/verify-checksums.mjs",
  "scripts/verify-provenance-metadata.mjs",
  "scripts/write-checksums.mjs",
];

const forbidden = [
  ".DS_Store",
  "Cargo.toml",
  "Cargo.lock",
  "src",
  "target",
];
const requiredFileEntries = [
  "index.js",
  "index.d.ts",
  "session-worker.js",
  "session-worker-thread.js",
  "README.md",
  "LICENSE",
  "scripts/check-package.mjs",
  "scripts/check-checksums.mjs",
  "scripts/check-installed-package.mjs",
  "scripts/check-live-smoke.mjs",
  "scripts/check-prebuild-artifacts.mjs",
  "scripts/check-release-artifacts.mjs",
  "scripts/live-smoke-node.mjs",
  "scripts/patch-loader.mjs",
  "scripts/public-surface.mjs",
  "scripts/check-public-surface.mjs",
  "scripts/check-session-thread-spike.mjs",
  "scripts/smoke-node.mjs",
  "scripts/verify-checksums.mjs",
  "scripts/verify-provenance-metadata.mjs",
  "scripts/write-checksums.mjs",
  "*.node",
];
const requiredScripts = {
  build: "napi build --platform --release && node scripts/patch-loader.mjs",
  "build:debug": "napi build --platform && node scripts/patch-loader.mjs",
  "fmt:check": "cargo fmt --check",
  test: "cargo test",
  "test:live": "node scripts/live-smoke-node.mjs",
  "live:check": "node scripts/check-live-smoke.mjs",
  "test:node": "node scripts/smoke-node.mjs",
  "pack:check": "node scripts/check-package.mjs",
  "prebuild:check": "node scripts/check-prebuild-artifacts.mjs",
  "prebuild:self-check": "node scripts/check-prebuild-artifacts.mjs --self-test",
  "installed:check": "node scripts/check-installed-package.mjs",
  "loader:check": "node scripts/patch-loader.mjs --check",
  "public-surface:check": "node scripts/check-public-surface.mjs",
  "session-thread:check": "node scripts/check-session-thread-spike.mjs",
  "checksum:check": "node scripts/check-checksums.mjs",
  "checksum:verify": "node scripts/verify-checksums.mjs",
  "provenance:check": "node scripts/verify-provenance-metadata.mjs --self-test",
  "release:check": "node scripts/check-release-artifacts.mjs",
  verify: "npm run fmt:check && cargo test && cargo test --features session-thread-spike && npm run session-thread:check && npm run checksum:check && npm run provenance:check && npm run prebuild:self-check && npm run public-surface:check && npm run live:check && npm run test:node && npm run loader:check && npm run pack:check && npm run release:check && npm run installed:check",
};

for (const path of required) {
  if (!fileSet.has(path)) {
    throw new Error(`npm pack is missing required file: ${path}`);
  }
}
if (!Array.isArray(packageJson.files)) {
  throw new Error("package.json files must be an array.");
}
for (const entry of requiredFileEntries) {
  if (!packageJson.files.includes(entry)) {
    throw new Error(`package.json files is missing required entry: ${entry}`);
  }
}
if (typeof packageJson.scripts !== "object" || packageJson.scripts === null || Array.isArray(packageJson.scripts)) {
  throw new Error("package.json scripts must be an object.");
}
for (const [name, command] of Object.entries(requiredScripts)) {
  if (packageJson.scripts[name] !== command) {
    throw new Error(`package.json script ${name} must be ${JSON.stringify(command)}.`);
  }
}

const declarations = readFileSync("index.d.ts", "utf8");
const loader = readFileSync("index.js", "utf8");
const readme = readFileSync("README.md", "utf8");
const prebuildWorkflow = readFileSync(".github/workflows/prebuild.yml", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const releasingDocs = readFileSync("docs/releasing.md", "utf8");
try {
  execFileSync(process.execPath, ["scripts/patch-loader.mjs", "--check"], { stdio: "pipe" });
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error
    ? String(error.stderr ?? "")
    : "";
  throw new Error(`index.js loader patch check failed.${stderr ? ` ${stderr.trim()}` : ""}`);
}
if (!declarations.includes("interface GemStoneNativeError")) {
  throw new Error("index.d.ts is missing GemStoneNativeError declaration.");
}
if (!declarations.includes("class GciSessionWorker") || !declarations.includes("createGciSessionWorker")) {
  throw new Error("index.d.ts is missing GciSessionWorker declarations.");
}
if (
  !declarations.includes("fetchBytes(oop: string, start: number, count: number): Uint8Array")
  || !declarations.includes("fetchBytes(oop: string, start: number, count: number): Promise<Uint8Array>")
) {
  throw new Error("index.d.ts fetchBytes declarations must use Uint8Array for raw and worker APIs.");
}
if (/\bBuffer\b/.test(declarations)) {
  throw new Error("index.d.ts must not require Node Buffer ambient types; use Uint8Array in public declarations.");
}
if (!loader.includes("require('./session-worker.js')") || !loader.includes("module.exports.createGciSessionWorker")) {
  throw new Error("index.js is missing GciSessionWorker exports.");
}
for (const snippet of ["category: string", "context: string", "exceptionObj: string", "args: Array<string>"]) {
  if (!declarations.includes(snippet)) {
    throw new Error(`index.d.ts is missing GciErrorInfo field: ${snippet}`);
  }
}
const nodeSmoke = readFileSync("scripts/smoke-node.mjs", "utf8");
const liveSmoke = readFileSync("scripts/live-smoke-node.mjs", "utf8");
const liveSmokeCheck = readFileSync("scripts/check-live-smoke.mjs", "utf8");
const prebuildArtifactCheck = readFileSync("scripts/check-prebuild-artifacts.mjs", "utf8");
const publicSurfaceCheck = readFileSync("scripts/check-public-surface.mjs", "utf8");
const sessionThreadCheck = readFileSync("scripts/check-session-thread-spike.mjs", "utf8");
const installedPackageCheck = readFileSync("scripts/check-installed-package.mjs", "utf8");
const releaseArtifactCheck = readFileSync("scripts/check-release-artifacts.mjs", "utf8");
const checksumCheck = readFileSync("scripts/check-checksums.mjs", "utf8");
const checksumWriter = readFileSync("scripts/write-checksums.mjs", "utf8");
const checksumVerifier = readFileSync("scripts/verify-checksums.mjs", "utf8");
const provenanceVerifier = readFileSync("scripts/verify-provenance-metadata.mjs", "utf8");
if (!nodeSmoke.includes("assertMappedGciError")) {
  throw new Error("scripts/smoke-node.mjs must assert mapped Gci errors.");
}
if (!nodeSmoke.includes("assertPatchLoaderPatchesGeneratedFixture")) {
  throw new Error("scripts/smoke-node.mjs must assert patch-loader against a generated loader fixture.");
}
if (!nodeSmoke.includes("assertSessionWorkerSmoke")) {
  throw new Error("scripts/smoke-node.mjs must assert the GciSessionWorker smoke path.");
}
assertSnippets(
  "scripts/live-smoke-node.mjs",
  liveSmoke,
  [
    "warnAliasConflicts",
    "envValue(\"GS_USERNAME\", \"GS_USER\")",
    "envValue(\"GS_PASSWORD\", \"GS_PASS\")",
    "GS_NETLDI_NAME_OR_PORT",
    "GS_NETLDI_HOST",
    "GS_SERVICE",
    "canonical values win",
  ],
);
if (!publicSurfaceCheck.includes("publicExports") || !publicSurfaceCheck.includes("gciMethods")) {
  throw new Error("scripts/check-public-surface.mjs must assert publicExports and gciMethods.");
}
if (!publicSurfaceCheck.includes("GemStoneNativeError") || !publicSurfaceCheck.includes("class Gci extends NativeGci")) {
  throw new Error("scripts/check-public-surface.mjs must assert mapped loader and declaration shape.");
}
if (!publicSurfaceCheck.includes("GciSessionWorker") || !publicSurfaceCheck.includes("session-worker.js")) {
  throw new Error("scripts/check-public-surface.mjs must assert session worker public exports.");
}
if (!sessionThreadCheck.includes("ExperimentalGciThreadWorker")) {
  throw new Error("scripts/check-session-thread-spike.mjs must assert ExperimentalGciThreadWorker coverage.");
}
if (!sessionThreadCheck.includes("GciThreadCommand")) {
  throw new Error("scripts/check-session-thread-spike.mjs must assert GciThreadCommand coverage.");
}
if (!sessionThreadCheck.includes("GciThreadDiagnostics") || !sessionThreadCheck.includes("requests_processed")) {
  throw new Error("scripts/check-session-thread-spike.mjs must assert worker diagnostics coverage.");
}
if (!sessionThreadCheck.includes("shutdown(&mut self)") || !sessionThreadCheck.includes("join_worker_thread")) {
  throw new Error("scripts/check-session-thread-spike.mjs must assert explicit worker shutdown coverage.");
}
if (
  !installedPackageCheck.includes("--pack-destination")
  || !installedPackageCheck.includes("--strip-components")
  || !installedPackageCheck.includes("assertNativeBinary")
  || !installedPackageCheck.includes("assertSessionWorkerFiles")
  || !installedPackageCheck.includes("scripts/smoke-node.mjs")
  || !installedPackageCheck.includes("scripts/check-live-smoke.mjs")
  || !installedPackageCheck.includes("scripts/verify-provenance-metadata.mjs")
  || !installedPackageCheck.includes("scripts/check-release-artifacts.mjs")
  || !installedPackageCheck.includes("GEMSTONE_GCI_ERROR")
) {
  throw new Error("scripts/check-installed-package.mjs must pack, extract, smoke, and run release helper checks from the installed native artifact.");
}
assertSnippets(
  "scripts/check-live-smoke.mjs",
  liveSmokeCheck,
  [
    "GS_RUN_NATIVE_LIVE",
    "scripts/live-smoke-node.mjs",
    "envValue(\\\"GS_USERNAME\\\", \\\"GS_USER\\\")",
    "envValue(\\\"GS_PASSWORD\\\", \\\"GS_PASS\\\")",
    "GS_NETLDI_NAME_OR_PORT",
    "GS_NETLDI_HOST",
    "GS_SERVICE",
    "gci.executeStr(",
    "gci.perform(",
    "gci.getSessionId(",
    "gci.setSessionId(",
    "optionalBooleanGciCall(gci, \\\"needsCommit\\\"",
    "optionalBooleanGciCall(gci, \\\"inTransaction\\\"",
    "isMissingNativeSymbol",
    "gci.commit(",
    "gci.abort(",
    "gci.newString(",
    "gci.fltToOop(",
    "gci.strKeyValueDictAtPut(",
    "gci.resolveSymbol(\\\"UserGlobals\\\")",
    "gci.symDictAtPut(",
    "gci.symDictAtObjPut(",
    "UserGlobals removeKey:",
    "gci.addOopToExportSet(",
    "createGciSessionWorker",
    "worker.executeStr(\\\"10 + 1\\\")",
    "worker.close()",
    "Native live smoke check passed",
  ],
);
if (
  !releaseArtifactCheck.includes("--pack-destination")
  || !releaseArtifactCheck.includes("write-checksums.mjs")
  || !releaseArtifactCheck.includes("verify-checksums.mjs")
  || !releaseArtifactCheck.includes("check-prebuild-artifacts.mjs")
  || !releaseArtifactCheck.includes("SHA256SUMS.txt")
  || !releaseArtifactCheck.includes("findNativeBinary")
  || !releaseArtifactCheck.includes("assertChecksumTargets")
  || !releaseArtifactCheck.includes("index.<platform>.node")
) {
  throw new Error("scripts/check-release-artifacts.mjs must pack to a temporary directory, verify checksums, and validate the native prebuild artifact shape.");
}
if (
  !provenanceVerifier.includes("dist.integrity")
  || !provenanceVerifier.includes("dist.signatures")
  || !provenanceVerifier.includes("SRI sha digest")
  || !provenanceVerifier.includes("keyid")
  || !provenanceVerifier.includes("sig")
  || !provenanceVerifier.includes("--self-test")
  || !provenanceVerifier.includes("npm view <package>@<version>")
) {
  throw new Error("scripts/verify-provenance-metadata.mjs must validate saved npm provenance metadata and include a self-test.");
}
assertSnippets(
  "scripts/check-prebuild-artifacts.mjs",
  prebuildArtifactCheck,
  [
    "checkPrebuildArtifactDirectory",
    "checkPrebuildArtifactSet",
    "EXPECTED_PREBUILD_ARTIFACTS",
    "--all <download-directory>",
    "gemstone-js-native-macos-latest",
    "gemstone-js-native-ubuntu-latest",
    "gemstone-js-native-windows-latest",
    "SHA256SUMS.txt",
    "verify-checksums.mjs",
    "exactly one native .node",
    "exactly one npm tarball",
    "package/index.js",
    "package/index.d.ts",
    "package/session-worker.js",
    "package/session-worker-thread.js",
    "package/README.md",
    "package/LICENSE",
    "package/scripts/check-live-smoke.mjs",
    "package/scripts/check-prebuild-artifacts.mjs",
    "package/scripts/verify-provenance-metadata.mjs",
    "Prebuild artifact self-check passed",
  ],
);
if (!checksumCheck.includes("write-checksums.mjs")) {
  throw new Error("scripts/check-checksums.mjs must exercise write-checksums.mjs.");
}
if (!checksumCheck.includes("SHA256SUMS.txt") || !checksumCheck.includes("no files match")) {
  throw new Error("scripts/check-checksums.mjs must assert checksum output and no-match behavior.");
}
if (!checksumCheck.includes("assertInvalidSuffixFails")) {
  throw new Error("scripts/check-checksums.mjs must assert invalid checksum suffix behavior.");
}
if (!checksumCheck.includes("assertDuplicateSuffixFails")) {
  throw new Error("scripts/check-checksums.mjs must assert duplicate checksum suffix behavior.");
}
if (!checksumCheck.includes("assertManifestIsExcluded")) {
  throw new Error("scripts/check-checksums.mjs must assert SHA256SUMS.txt exclusion behavior.");
}
if (
  !checksumCheck.includes("verify-checksums.mjs")
  || !checksumCheck.includes("assertMismatchFails")
  || !checksumCheck.includes("assertVerifierInputFailures")
) {
  throw new Error("scripts/check-checksums.mjs must assert checksum verification and mismatch behavior.");
}
if (!checksumWriter.includes("createHash") || !checksumWriter.includes("sha256")) {
  throw new Error("scripts/write-checksums.mjs must compute sha256 digests.");
}
if (!checksumWriter.includes("startsWith(\".\")")) {
  throw new Error("scripts/write-checksums.mjs must validate artifact suffix filters.");
}
if (!checksumWriter.includes("path separators")) {
  throw new Error("scripts/write-checksums.mjs must reject pathful artifact suffix filters.");
}
if (!checksumWriter.includes("without whitespace")) {
  throw new Error("scripts/write-checksums.mjs must reject whitespace-bearing artifact suffix filters.");
}
if (!checksumWriter.includes("uniqueSuffixes")) {
  throw new Error("scripts/write-checksums.mjs must reject duplicate artifact suffix filters.");
}
if (!checksumWriter.includes('file !== "SHA256SUMS.txt"')) {
  throw new Error("scripts/write-checksums.mjs must exclude SHA256SUMS.txt from artifact targets.");
}
if (!checksumWriter.includes("isFile()")) {
  throw new Error("scripts/write-checksums.mjs must only write checksums for regular files.");
}
if (!checksumWriter.includes("artifact file names must not contain whitespace")) {
  throw new Error("scripts/write-checksums.mjs must reject whitespace-bearing artifact file names.");
}
if (!checksumWriter.includes("portable ASCII characters")) {
  throw new Error("scripts/write-checksums.mjs must reject non-portable artifact file names.");
}
if (!checksumVerifier.includes("createHash") || !checksumVerifier.includes("Checksum mismatch")) {
  throw new Error("scripts/verify-checksums.mjs must verify sha256 digests and report mismatches.");
}
if (!checksumVerifier.includes("Duplicate checksum target")) {
  throw new Error("scripts/verify-checksums.mjs must reject duplicate checksum entries.");
}
if (!checksumVerifier.includes("must not be artifact targets")) {
  throw new Error("scripts/verify-checksums.mjs must reject checksum manifest artifact targets.");
}
if (!checksumVerifier.includes("regular files")) {
  throw new Error("scripts/verify-checksums.mjs must reject non-file checksum targets.");
}
if (!checksumVerifier.includes("file entries must not contain whitespace")) {
  throw new Error("scripts/verify-checksums.mjs must reject whitespace-bearing checksum targets.");
}
if (!checksumVerifier.includes("portable ASCII basenames")) {
  throw new Error("scripts/verify-checksums.mjs must reject non-portable checksum targets.");
}
for (const name of publicExports) {
  if (!declarations.includes(` ${name}`)) {
    throw new Error(`index.d.ts is missing public export: ${name}`);
  }
  if (!loader.includes(`module.exports.${name}`)) {
    throw new Error(`index.js is missing public export: ${name}`);
  }
}
for (const name of gciMethods) {
  if (!declarations.includes(`  ${name}(`)) {
    throw new Error(`index.d.ts is missing Gci method declaration: ${name}`);
  }
}
assertSnippets(
  ".github/workflows/prebuild.yml",
  prebuildWorkflow,
  [
    "name: Prebuild",
    "workflow_dispatch:",
    "tags:",
    "- \"v*\"",
    "id-token: write",
    "macos-latest",
    "ubuntu-latest",
    "windows-latest",
    "node-version: 24",
    "npm run build",
    "npm run verify",
    "npm pack --json",
    "node scripts/write-checksums.mjs .node .tgz",
    "node scripts/verify-checksums.mjs SHA256SUMS.txt",
    "node scripts/check-prebuild-artifacts.mjs .",
    "actions/upload-artifact@v4",
    "*.node",
    "*.tgz",
    "SHA256SUMS.txt",
  ],
);
assertSnippets(
  ".github/workflows/ci.yml",
  ciWorkflow,
  [
    "name: CI",
    "branches: [main]",
    "node-version: 24",
    "cargo fmt --check",
    "npm run build",
    "npm run verify",
    "npm pack --json",
    "node scripts/write-checksums.mjs .tgz",
    "node scripts/verify-checksums.mjs SHA256SUMS.txt",
    "actions/upload-artifact@v4",
    "*.tgz",
    "SHA256SUMS.txt",
  ],
);
assertSnippets(
  "docs/releasing.md",
  releasingDocs,
  [
    "npm publish --access public --provenance",
    "npm audit signatures",
    "dist.integrity",
    "dist.signatures",
    "npm run provenance:check",
    "npm view @gemstone-js/native@$VERSION dist.integrity dist.signatures --json",
    "node scripts/verify-provenance-metadata.mjs npm-provenance.json",
    "shasum -a 256",
    "npm run installed:check",
    "npm run release:check",
    "live-smoke guard",
    "SHA256SUMS.txt",
    "scripts/check-release-artifacts.mjs",
    "node scripts/verify-checksums.mjs SHA256SUMS.txt",
    "node scripts/check-prebuild-artifacts.mjs",
    "--all ./downloaded-prebuild-artifacts",
    "gemstone-js-native-macos-latest",
    "gemstone-js-native-ubuntu-latest",
    "gemstone-js-native-windows-latest",
  ],
);
assertSnippets(
  "README.md",
  readme,
  [
    "GS_USER",
    "GS_PASS",
    "GS_NETLDI_HOST",
    "GS_NETLDI_NAME_OR_PORT",
    "GS_SERVICE",
    "canonical value",
    "npm run live:check",
    "UserGlobals",
    "symbol-dictionary",
    "transaction status/reset",
    "GciSessionWorker",
    "createGciSessionWorker",
    "--all <download-directory>",
  ],
);

const nativeBinaries = files.filter((file) => file.endsWith(".node"));
if (nativeBinaries.length === 0) {
  throw new Error("npm pack is missing a native .node binary. Run npm run build before pack:check.");
}
if (nativeBinaries.length !== 1) {
  throw new Error(`npm pack must include exactly one platform native binary, found: ${nativeBinaries.join(", ")}`);
}
for (const binary of nativeBinaries) {
  if (!/^index\.[A-Za-z0-9_.-]+\.node$/.test(binary)) {
    throw new Error(`packed native binary must use the generated index.<platform>.node naming pattern: ${binary}`);
  }
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

function assertSnippets(path, contents, snippets) {
  for (const snippet of snippets) {
    if (!contents.includes(snippet)) {
      throw new Error(`${path} is missing required release verification snippet: ${JSON.stringify(snippet)}.`);
    }
  }
}
