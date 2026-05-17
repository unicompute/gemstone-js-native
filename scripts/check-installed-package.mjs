#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoot = mkdtempSync(join(tmpdir(), "gemstone-js-native-installed-"));
const cache = join(tempRoot, "npm-cache");
const packageRoot = join(tempRoot, "package");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  const packOutput = execFileSync(npmCommand, ["pack", "--json", "--pack-destination", tempRoot], {
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
  });
  const [pack] = JSON.parse(packOutput);
  const tarballPath = join(tempRoot, pack.filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack did not create expected tarball: ${tarballPath}`);
  }

  mkdirSync(packageRoot, { recursive: true });
  execFileSync("tar", ["-xzf", tarballPath, "-C", packageRoot, "--strip-components", "1"], {
    encoding: "utf8",
    stdio: "pipe",
  });

  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assertPackageMetadata(packageJson, pack);
  assertSessionWorkerFiles(packageRoot);
  const nativeBinary = assertNativeBinary(packageRoot);
  assertLoaderReferencesNativeBinary(packageRoot, nativeBinary);

  for (const args of [
    ["scripts/check-public-surface.mjs"],
    ["scripts/patch-loader.mjs", "--check"],
    ["scripts/verify-provenance-metadata.mjs", "--self-test"],
    ["scripts/check-release-artifacts.mjs"],
    ["scripts/check-live-smoke.mjs"],
    ["scripts/smoke-node.mjs"],
  ]) {
    execFileSync(process.execPath, args, {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  console.log(`Installed package check passed: ${packageJson.name}@${packageJson.version} (${nativeBinary}).`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function assertPackageMetadata(packageJson, pack) {
  if (packageJson.name !== "@gemstone-js/native") {
    throw new Error(`Installed package name mismatch: ${packageJson.name}`);
  }
  if (packageJson.version !== pack.version) {
    throw new Error(`Installed package version ${packageJson.version} does not match packed version ${pack.version}.`);
  }
  if (packageJson.main !== "./index.js") {
    throw new Error(`Installed package main must be ./index.js, found ${packageJson.main}.`);
  }
  if (packageJson.types !== "./index.d.ts") {
    throw new Error(`Installed package types must be ./index.d.ts, found ${packageJson.types}.`);
  }
  if (packageJson.exports?.["."]?.require !== "./index.js" || packageJson.exports?.["."]?.types !== "./index.d.ts") {
    throw new Error("Installed package root export must point require/types at index.js and index.d.ts.");
  }
  if (packageJson.publishConfig?.provenance !== true || packageJson.publishConfig?.access !== "public") {
    throw new Error("Installed package publishConfig must require public provenance publishing.");
  }
}

function assertNativeBinary(root) {
  const nativeBinaries = readdirSync(root).filter((file) => file.endsWith(".node"));
  if (nativeBinaries.length !== 1) {
    throw new Error(`Installed package must contain exactly one native .node binary, found: ${nativeBinaries.join(", ")}`);
  }
  const [binary] = nativeBinaries;
  if (!/^index\.[A-Za-z0-9_.-]+\.node$/.test(binary)) {
    throw new Error(`Installed native binary must use index.<platform>.node naming, found: ${binary}`);
  }
  return binary;
}

function assertSessionWorkerFiles(root) {
  for (const file of ["session-worker.js", "session-worker-thread.js"]) {
    if (!existsSync(join(root, file))) {
      throw new Error(`Installed package is missing ${file}.`);
    }
  }
}

function assertLoaderReferencesNativeBinary(root, nativeBinary) {
  const loader = readFileSync(join(root, "index.js"), "utf8");
  if (!loader.includes(`'${nativeBinary}'`) && !loader.includes(JSON.stringify(nativeBinary))) {
    throw new Error(`Installed loader does not reference native binary: ${nativeBinary}`);
  }
  for (const snippet of [
    "GEMSTONE_GCI_ERROR",
    "class Gci extends NativeGci",
    "function isGemStoneNativeError(error)",
    "require('./session-worker.js')",
    "module.exports.isGemStoneNativeError = isGemStoneNativeError",
    "module.exports.createGciSessionWorker = createGciSessionWorker",
  ]) {
    if (!loader.includes(snippet)) {
      throw new Error(`Installed loader is missing patched error-mapping snippet: ${snippet}`);
    }
  }
}
