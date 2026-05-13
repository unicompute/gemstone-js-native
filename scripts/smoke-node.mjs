import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const native = require("..");

const required = [
  "Gci",
  "smallintToOop",
  "oopToSmallint",
  "isSmallintOop",
  "boolToOop",
  "charToOopString",
  "oopToCharString",
];

for (const name of required) {
  if (typeof native[name] !== "function") {
    throw new Error(`@gemstone-js/native is missing ${name} export.`);
  }
}

if (native.boolToOop(true) !== "268") {
  throw new Error("boolToOop(true) returned an unexpected OOP.");
}

const smallint = native.smallintToOop(42);
if (!native.isSmallintOop(smallint) || native.oopToSmallint(smallint) !== 42) {
  throw new Error("SmallInteger helpers failed to round-trip 42.");
}

const char = native.charToOopString("A");
if (native.oopToCharString(char) !== "A") {
  throw new Error("Character helpers failed to round-trip A.");
}

assertThrows(() => native.oopToSmallint("20"), "oopToSmallint should reject non-SmallInteger OOPs.");
assertThrows(() => native.oopToSmallint("+20"), "oopToSmallint should reject signed OOP strings.");
assertThrows(() => native.oopToSmallint("-20"), "oopToSmallint should reject negative OOP strings.");
assertThrows(() => native.charToOopString(""), "charToOopString should reject empty strings.");
assertThrows(() => native.charToOopString("AB"), "charToOopString should reject multi-character strings.");

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
