#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const verifyScript = join(scriptDir, "verify-checksums.mjs");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const expectedTarball = npmTarballName(packageJson);
const EXPECTED_PREBUILD_ARTIFACTS = [
  { name: "gemstone-js-native-macos-latest", nativeBinaryPattern: /^index\.darwin-[A-Za-z0-9_.-]+\.node$/ },
  { name: "gemstone-js-native-ubuntu-latest", nativeBinaryPattern: /^index\.linux-[A-Za-z0-9_.-]+\.node$/ },
  { name: "gemstone-js-native-windows-latest", nativeBinaryPattern: /^index\.win32-[A-Za-z0-9_.-]+\.node$/ },
];

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
    return;
  }
  if (args.length === 2 && args[0] === "--all") {
    const reports = checkPrebuildArtifactSet(args[1]);
    process.stdout.write(`Prebuild artifact set check passed: ${reports.map((report) => report.artifactName).join(", ")}.\n`);
    return;
  }
  if (args.length !== 1) {
    throw new Error("Usage: node scripts/check-prebuild-artifacts.mjs <artifact-directory> | --all <download-directory>");
  }
  const report = checkPrebuildArtifactDirectory(args[0]);
  process.stdout.write(`Prebuild artifact check passed: ${report.tarball}, ${report.nativeBinary}.\n`);
}

function checkPrebuildArtifactSet(directory) {
  const root = resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Prebuild artifact download directory not found: ${directory}`);
  }
  const artifactDirectories = readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .filter((entry) => entry.startsWith("gemstone-js-native-"))
    .sort();
  const expectedNames = EXPECTED_PREBUILD_ARTIFACTS.map((artifact) => artifact.name);
  const missing = expectedNames.filter((name) => !artifactDirectories.includes(name));
  const unexpected = artifactDirectories.filter((name) => !expectedNames.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Prebuild artifact set must contain exactly ${expectedNames.join(", ")}.`
      + ` Missing: ${missing.join(", ") || "none"}. Unexpected: ${unexpected.join(", ") || "none"}.`,
    );
  }
  const reports = EXPECTED_PREBUILD_ARTIFACTS.map((artifact) => checkPrebuildArtifactDirectory(
    join(root, artifact.name),
    artifact,
  ));
  const nativeBinaries = reports.map((report) => report.nativeBinary);
  if (new Set(nativeBinaries).size !== nativeBinaries.length) {
    throw new Error(`Prebuild artifact set must contain distinct native binaries, found: ${nativeBinaries.join(", ")}`);
  }
  return reports;
}

function checkPrebuildArtifactDirectory(directory, options = {}) {
  const root = resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`Prebuild artifact directory not found: ${directory}`);
  }
  const files = readdirSync(root).filter((file) => statSync(join(root, file)).isFile()).sort();
  const tarballs = files.filter((file) => file.endsWith(".tgz"));
  const nativeBinaries = files.filter((file) => file.endsWith(".node"));
  const manifest = "SHA256SUMS.txt";
  if (!files.includes(manifest)) {
    throw new Error(`Prebuild artifact directory is missing ${manifest}.`);
  }
  if (tarballs.length !== 1) {
    throw new Error(`Prebuild artifact directory must contain exactly one npm tarball, found: ${tarballs.join(", ")}`);
  }
  if (nativeBinaries.length !== 1) {
    throw new Error(`Prebuild artifact directory must contain exactly one native .node file, found: ${nativeBinaries.join(", ")}`);
  }
  const [tarball] = tarballs;
  const [nativeBinary] = nativeBinaries;
  if (tarball !== expectedTarball) {
    throw new Error(`Prebuild tarball name ${tarball} does not match expected package artifact ${expectedTarball}.`);
  }
  if (!/^index\.[A-Za-z0-9_.-]+\.node$/.test(nativeBinary)) {
    throw new Error(`Prebuild native binary must use index.<platform>.node naming, found: ${nativeBinary}`);
  }
  if (options.nativeBinaryPattern && !options.nativeBinaryPattern.test(nativeBinary)) {
    throw new Error(`Prebuild artifact ${options.name} has unexpected native binary ${nativeBinary}.`);
  }

  execFileSync(process.execPath, [verifyScript, manifest], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  const targets = checksumTargets(join(root, manifest));
  assertExactTargets(targets, [nativeBinary, tarball]);
  assertTarballContents(join(root, tarball), nativeBinary);
  return { artifactName: options.name ?? basename(root), nativeBinary, tarball };
}

function checksumTargets(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.match(/^[a-fA-F0-9]{64}  ([^\r\n]+)$/);
      if (!match) throw new Error(`Invalid checksum line in ${basename(path)}: ${line}`);
      return match[1];
    })
    .sort();
}

function assertExactTargets(actual, expected) {
  const expectedSorted = [...expected].sort();
  if (actual.length !== expectedSorted.length || actual.some((target, index) => target !== expectedSorted[index])) {
    throw new Error(`Prebuild checksum targets must be exactly ${expectedSorted.join(", ")}, found: ${actual.join(", ")}`);
  }
}

function assertTarballContents(tarballPath, nativeBinary) {
  const entries = execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  for (const required of [
    "package/package.json",
    "package/index.js",
    "package/index.d.ts",
    "package/session-worker.js",
    "package/session-worker-thread.js",
    "package/README.md",
    "package/LICENSE",
    "package/scripts/check-live-smoke.mjs",
    "package/scripts/check-prebuild-artifacts.mjs",
    "package/scripts/verify-checksums.mjs",
    "package/scripts/verify-provenance-metadata.mjs",
    "package/scripts/write-checksums.mjs",
    `package/${nativeBinary}`,
  ]) {
    if (!entries.includes(required)) {
      throw new Error(`Prebuild tarball is missing required entry: ${required}`);
    }
  }
  const packagedNativeBinaries = entries
    .map((entry) => entry.replace(/^package\//, ""))
    .filter((entry) => !entry.includes("/") && entry.endsWith(".node"));
  if (packagedNativeBinaries.length !== 1 || packagedNativeBinaries[0] !== nativeBinary) {
    throw new Error(`Prebuild tarball must contain exactly ${nativeBinary}, found: ${packagedNativeBinaries.join(", ")}`);
  }
  for (const forbidden of ["package/src/", "package/target/", "package/Cargo.toml", "package/Cargo.lock"]) {
    if (entries.some((entry) => entry === forbidden || entry.startsWith(forbidden))) {
      throw new Error(`Prebuild tarball unexpectedly includes forbidden entry: ${forbidden}`);
    }
  }
}

function selfTest() {
  const tempRoot = mkdtempSync(join(tmpdir(), "gemstone-js-native-prebuild-artifacts-"));
  try {
    const valid = join(tempRoot, "valid");
    writeFixture(valid);
    checkPrebuildArtifactDirectory(valid);
    const validSet = join(tempRoot, "valid-set");
    writeFixture(join(validSet, "gemstone-js-native-macos-latest"), { nativeBinary: "index.darwin-arm64.node" });
    writeFixture(join(validSet, "gemstone-js-native-ubuntu-latest"), { nativeBinary: "index.linux-x64-gnu.node" });
    writeFixture(join(validSet, "gemstone-js-native-windows-latest"), { nativeBinary: "index.win32-x64-msvc.node" });
    checkPrebuildArtifactSet(validSet);
    assertFixtureFails(join(tempRoot, "missing-manifest"), { manifest: false }, /missing SHA256SUMS/);
    assertFixtureFails(join(tempRoot, "extra-node"), { extraNativeBinary: true }, /exactly one native/);
    assertFixtureFails(join(tempRoot, "missing-packaged-node"), { packagedNativeBinary: false }, /missing required entry/);
    assertFixtureFails(join(tempRoot, "extra-checksum-target"), { extraChecksumTarget: true }, /exactly/);
    assertArtifactSetFails(join(tempRoot, "missing-windows-set"), { windows: false }, /Missing: gemstone-js-native-windows-latest/);
    assertArtifactSetFails(join(tempRoot, "wrong-platform-set"), { ubuntuNativeBinary: "index.darwin-x64.node" }, /unexpected native binary/);
    process.stdout.write("Prebuild artifact self-check passed.\n");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function assertArtifactSetFails(path, options, pattern) {
  writeFixture(join(path, "gemstone-js-native-macos-latest"), { nativeBinary: "index.darwin-arm64.node" });
  writeFixture(join(path, "gemstone-js-native-ubuntu-latest"), {
    nativeBinary: options.ubuntuNativeBinary ?? "index.linux-x64-gnu.node",
  });
  if (options.windows !== false) {
    writeFixture(join(path, "gemstone-js-native-windows-latest"), { nativeBinary: "index.win32-x64-msvc.node" });
  }
  try {
    checkPrebuildArtifactSet(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new Error(`Expected artifact set failure ${pattern}, got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected invalid artifact set to fail: ${path}`);
}

function assertFixtureFails(path, options, pattern) {
  writeFixture(path, options);
  try {
    checkPrebuildArtifactDirectory(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new Error(`Expected fixture failure ${pattern}, got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected invalid fixture to fail: ${path}`);
}

function writeFixture(root, options = {}) {
  mkdirSync(root, { recursive: true });
  const nativeBinary = options.nativeBinary ?? "index.darwin-arm64.node";
  writeFileSync(join(root, nativeBinary), "native-binary");
  if (options.extraNativeBinary) writeFileSync(join(root, "index.linux-x64-gnu.node"), "extra-native-binary");
  if (options.extraChecksumTarget) writeFileSync(join(root, "extra.txt"), "extra");

  const packageDir = join(root, "package");
  mkdirSync(join(packageDir, "scripts"), { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify(packageJson, null, 2));
  writeFileSync(join(packageDir, "index.js"), "module.exports = {};\n");
  writeFileSync(join(packageDir, "index.d.ts"), "export {};\n");
  writeFileSync(join(packageDir, "session-worker.js"), "module.exports = {};\n");
  writeFileSync(join(packageDir, "session-worker-thread.js"), "module.exports = {};\n");
  writeFileSync(join(packageDir, "README.md"), "# fixture\n");
  writeFileSync(join(packageDir, "LICENSE"), "MIT\n");
  writeFileSync(join(packageDir, "scripts", "check-live-smoke.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(packageDir, "scripts", "check-prebuild-artifacts.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(packageDir, "scripts", "verify-checksums.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(packageDir, "scripts", "verify-provenance-metadata.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(packageDir, "scripts", "write-checksums.mjs"), "#!/usr/bin/env node\n");
  if (options.packagedNativeBinary !== false) {
    writeFileSync(join(packageDir, nativeBinary), "native-binary");
  }
  execFileSync("tar", ["-czf", join(root, expectedTarball), "-C", root, "package"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  rmSync(packageDir, { recursive: true, force: true });
  if (options.manifest !== false) {
    const checksumFiles = [nativeBinary, expectedTarball];
    if (options.extraChecksumTarget) checksumFiles.push("extra.txt");
    writeChecksumManifest(root, checksumFiles);
  }
}

function writeChecksumManifest(root, files) {
  const lines = files.sort().map((file) => {
    const hash = createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
    return `${hash}  ${file}`;
  });
  writeFileSync(join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
}

function npmTarballName(pkg) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
}

function printUsage() {
  process.stdout.write(`Usage:
  node scripts/check-prebuild-artifacts.mjs <artifact-directory>
  node scripts/check-prebuild-artifacts.mjs --all <download-directory>

Validate one downloaded Prebuild workflow artifact directory. The directory
must contain exactly one ${expectedTarball}, exactly one index.<platform>.node,
and SHA256SUMS.txt covering exactly those two files.

Use --all after downloading all GitHub Actions Prebuild artifacts into one
directory. It requires the macOS, Ubuntu, and Windows artifact directories and
checks that each contains the expected platform native binary.

Options:
  --self-test   Run fixture-based checks for the validator
  -h, --help    Show this help
`);
}
