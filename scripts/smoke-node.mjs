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

console.log("@gemstone-js/native Node smoke check passed.");
