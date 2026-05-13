#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const suffixes = process.argv.slice(2);
if (suffixes.length === 0) {
  fail("Usage: node scripts/write-checksums.mjs <suffix> [suffix...]");
}
for (const suffix of suffixes) {
  if (!suffix.startsWith(".") || suffix.length < 2) {
    fail(`Checksum suffixes must start with "." and include an extension name: ${JSON.stringify(suffix)}`);
  }
}
const uniqueSuffixes = new Set(suffixes);
if (uniqueSuffixes.size !== suffixes.length) {
  fail("Checksum suffix filters must be unique.");
}

const files = readdirSync(".")
  .filter((file) => suffixes.some((suffix) => file.endsWith(suffix)))
  .sort();

if (files.length === 0) {
  fail(`No files matched checksum suffixes: ${suffixes.join(", ")}`);
}

const lines = files.map((file) => {
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  return `${hash}  ${file}`;
});
writeFileSync("SHA256SUMS.txt", `${lines.join("\n")}\n`);
process.stdout.write(`Wrote SHA256SUMS.txt for ${files.length} file(s).\n`);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
