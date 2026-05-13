#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./write-checksums.mjs", import.meta.url));
const verifyScript = fileURLToPath(new URL("./verify-checksums.mjs", import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "gemstone-js-native-checksums-"));

try {
  writeFileSync(join(workspace, "package.tgz"), "package-tarball");
  writeFileSync(join(workspace, "addon.node"), "native-binary");
  writeFileSync(join(workspace, "notes.txt"), "ignored");

  execFileSync(process.execPath, [script, ".tgz", ".node"], {
    cwd: workspace,
    encoding: "utf8",
    stdio: "pipe",
  });

  const expected = [
    `${sha256("native-binary")}  addon.node`,
    `${sha256("package-tarball")}  package.tgz`,
  ].join("\n") + "\n";
  const actual = readFileSync(join(workspace, "SHA256SUMS.txt"), "utf8");
  if (actual !== expected) {
    throw new Error(`Unexpected SHA256SUMS.txt content.\nExpected:\n${expected}\nActual:\n${actual}`);
  }

  execFileSync(process.execPath, [verifyScript, "SHA256SUMS.txt"], {
    cwd: workspace,
    encoding: "utf8",
    stdio: "pipe",
  });
  assertMismatchFails();
  assertVerifierInputFailures();
  assertInvalidSuffixFails();
  assertNoMatchFails();
  process.stdout.write("Checksum helper check passed.\n");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function assertMismatchFails() {
  writeFileSync(join(workspace, "package.tgz"), "tampered-package-tarball");
  try {
    execFileSync(process.execPath, [verifyScript, "SHA256SUMS.txt"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    writeFileSync(join(workspace, "package.tgz"), "package-tarball");
    return;
  }
  throw new Error("verify-checksums.mjs should fail when a file hash does not match.");
}

function assertVerifierInputFailures() {
  assertVerifierFails("EMPTY-SHA256SUMS.txt", "");
  assertVerifierFails("BAD-SHA256SUMS.txt", "not-a-checksum-line\n");
  assertVerifierFails("MISSING-SHA256SUMS.txt", `${sha256("missing")}  missing.tgz\n`);
  assertVerifierFails("PATH-SHA256SUMS.txt", `${sha256("nested")}  nested/package.tgz\n`);
  assertVerifierFails("DUPLICATE-SHA256SUMS.txt", [
    `${sha256("package-tarball")}  package.tgz`,
    `${sha256("package-tarball")}  package.tgz`,
  ].join("\n") + "\n");
}

function assertVerifierFails(fileName, contents) {
  writeFileSync(join(workspace, fileName), contents);
  try {
    execFileSync(process.execPath, [verifyScript, fileName], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    return;
  }
  throw new Error(`verify-checksums.mjs should fail for invalid manifest ${fileName}.`);
}

function assertNoMatchFails() {
  try {
    execFileSync(process.execPath, [script, ".missing"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    return;
  }
  throw new Error("write-checksums.mjs should fail when no files match.");
}

function assertInvalidSuffixFails() {
  for (const suffix of ["", "tgz", "."]) {
    try {
      execFileSync(process.execPath, [script, suffix], {
        cwd: workspace,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch {
      continue;
    }
    throw new Error(`write-checksums.mjs should fail for invalid suffix ${JSON.stringify(suffix)}.`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
