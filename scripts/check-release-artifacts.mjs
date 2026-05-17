#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const tempRoot = mkdtempSync(join(tmpdir(), "gemstone-js-native-release-artifacts-"));
const cache = join(tempRoot, "npm-cache");
const checksumWriter = join(scriptDir, "write-checksums.mjs");
const checksumVerifier = join(scriptDir, "verify-checksums.mjs");
const prebuildChecker = join(scriptDir, "check-prebuild-artifacts.mjs");

try {
  const packOutput = runNpm(["pack", "--json", "--pack-destination", tempRoot], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cache },
    stdio: "pipe",
  });
  const [pack] = JSON.parse(packOutput);
  const tarballPath = join(tempRoot, pack.filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`npm pack did not create expected tarball: ${tarballPath}`);
  }

  const nativeBinary = findNativeBinary();
  copyFileSync(join(packageRoot, nativeBinary), join(tempRoot, nativeBinary));

  execFileSync(process.execPath, [checksumWriter, ".node", ".tgz"], {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  execFileSync(process.execPath, [checksumVerifier, "SHA256SUMS.txt"], {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  assertChecksumTargets([nativeBinary, pack.filename]);
  execFileSync(process.execPath, [prebuildChecker, tempRoot], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  console.log(`Release artifact check passed: ${pack.name}@${pack.version} (${pack.filename}, ${nativeBinary}).`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function findNativeBinary() {
  const binaries = readdirSync(packageRoot)
    .filter((entry) => entry.endsWith(".node"))
    .filter((entry) => statSync(join(packageRoot, entry)).isFile())
    .sort();
  if (binaries.length !== 1) {
    throw new Error(`Expected exactly one native .node binary before release artifact check, found: ${binaries.join(", ")}`);
  }
  const [binary] = binaries;
  if (!/^index\.[A-Za-z0-9_.-]+\.node$/.test(binary)) {
    throw new Error(`Native binary must use index.<platform>.node naming, found: ${binary}`);
  }
  return binary;
}

function assertChecksumTargets(expected) {
  const actual = readFileSync(join(tempRoot, "SHA256SUMS.txt"), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^[a-fA-F0-9]{64}  ([^\r\n]+)$/);
      if (!match) throw new Error(`Invalid checksum line: ${line}`);
      return match[1];
    })
    .sort();
  const expectedSorted = [...expected].sort();
  if (actual.length !== expectedSorted.length || actual.some((target, index) => target !== expectedSorted[index])) {
    throw new Error(`Release checksum targets must be exactly ${expectedSorted.join(", ")}, found: ${actual.join(", ")}`);
  }
}

function runNpm(args, options) {
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return execFileSync("npm", args, options);
}
