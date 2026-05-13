import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gciMethods, publicExports } from "./public-surface.mjs";

const require = createRequire(import.meta.url);
const native = require("..");

for (const name of publicExports) {
  if (typeof native[name] !== "function") {
    throw new Error(`@gemstone-js/native is missing ${name} export.`);
  }
}
for (const name of gciMethods) {
  if (typeof native.Gci.prototype[name] !== "function") {
    throw new Error(`@gemstone-js/native Gci prototype is missing ${name}.`);
  }
}

if (native.boolToOop(true) !== "268") {
  throw new Error("boolToOop(true) returned an unexpected OOP.");
}
if (native.boolToOop(false) !== "12") {
  throw new Error("boolToOop(false) returned an unexpected OOP.");
}

const smallint = native.smallintToOop(42);
if (!native.isSmallintOop(smallint) || native.oopToSmallint(smallint) !== 42) {
  throw new Error("SmallInteger helpers failed to round-trip 42.");
}

const char = native.charToOopString("A");
if (native.oopToCharString(char) !== "A") {
  throw new Error("Character helpers failed to round-trip A.");
}
const unicodeChar = native.charToOopString("λ");
if (native.oopToCharString(unicodeChar) !== "λ") {
  throw new Error("Character helpers failed to round-trip λ.");
}

assertThrows(() => native.oopToSmallint("20"), "oopToSmallint should reject non-SmallInteger OOPs.");
assertThrows(() => native.oopToSmallint("+20"), "oopToSmallint should reject signed OOP strings.");
assertThrows(() => native.oopToSmallint("-20"), "oopToSmallint should reject negative OOP strings.");
assertThrows(() => native.charToOopString(""), "charToOopString should reject empty strings.");
assertThrows(() => native.charToOopString("AB"), "charToOopString should reject multi-character strings.");
assertMappedGciError(
  () => new native.Gci("/definitely/missing/libgcirpc.dylib"),
  "constructor",
  "Gci constructor should decorate native loading errors.",
);
assertPatchLoaderPatchesGeneratedFixture();

if (native.oopToCharString("20") !== null) {
  throw new Error("oopToCharString should return null for non-Character OOPs.");
}

console.log("@gemstone-js/native Node smoke check passed.");

function assertThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertMappedGciError(fn, operation, message) {
  try {
    fn();
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && error.code === "GEMSTONE_GCI_ERROR"
      && error.operation === operation
      && String(error.message).includes(`${operation} failed`)
    ) {
      return;
    }
    throw new Error(`${message} Got ${String(error?.message ?? error)}.`);
  }
  throw new Error(message);
}

function assertPatchLoaderPatchesGeneratedFixture() {
  const dir = mkdtempSync(join(tmpdir(), "gemstone-js-native-loader-"));
  const loaderPath = join(dir, "index.js");
  const patchScript = fileURLToPath(new URL("./patch-loader.mjs", import.meta.url));
  try {
    writeFileSync(loaderPath, generatedLoaderFixture());
    execFileSync(process.execPath, [patchScript, "--loader", loaderPath], { encoding: "utf8" });
    const patched = readFileSync(loaderPath, "utf8");
    if (!patched.includes("GEMSTONE_GCI_ERROR") || !patched.includes("class Gci extends NativeGci")) {
      throw new Error("patch-loader did not apply GemStone GCI error mapping to a generated loader fixture.");
    }
    execFileSync(process.execPath, [patchScript, "--loader", loaderPath, "--check"], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function generatedLoaderFixture() {
  return `const nativeBinding = {}
const { Gci, smallintToOop, oopToSmallint, isSmallintOop, boolToOop, charToOopString, oopToCharString } = nativeBinding

module.exports.Gci = Gci
module.exports.smallintToOop = smallintToOop
module.exports.oopToSmallint = oopToSmallint
module.exports.isSmallintOop = isSmallintOop
module.exports.boolToOop = boolToOop
module.exports.charToOopString = charToOopString
module.exports.oopToCharString = oopToCharString
`;
}
