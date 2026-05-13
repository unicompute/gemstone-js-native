import { createRequire } from "node:module";
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
