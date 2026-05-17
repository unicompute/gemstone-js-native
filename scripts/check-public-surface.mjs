import { readFileSync } from "node:fs";
import { gciMethods, publicExports } from "./public-surface.mjs";

const declarations = readFileSync("index.d.ts", "utf8");
const loader = readFileSync("index.js", "utf8");
const patchLoader = readFileSync("scripts/patch-loader.mjs", "utf8");
const smokeNode = readFileSync("scripts/smoke-node.mjs", "utf8");

assertUnique(publicExports, "public exports");
assertUnique(gciMethods, "Gci methods");
assertIncludes(smokeNode, "from \"./public-surface.mjs\"", "smoke-node public surface import");

for (const name of publicExports) {
  assertIncludes(loader, `module.exports.${name}`, `loader export ${name}`);
  if (name === "Gci" || name === "GciSessionWorker") {
    assertIncludes(declarations, `export declare class ${name}`, `${name} class declaration`);
  } else {
    assertIncludes(declarations, `export declare function ${name}(`, `${name} function declaration`);
  }
}

for (const name of gciMethods) {
  assertIncludes(declarations, `  ${name}(`, `Gci.${name} declaration`);
  assertIncludes(patchLoader, `'${name}'`, `patch-loader mapped method ${name}`);
  assertIncludes(loader, `'${name}'`, `patched loader mapped method ${name}`);
}

assertIncludes(declarations, "interface GemStoneNativeError", "GemStoneNativeError declaration");
assertIncludes(loader, "function isGemStoneNativeError(error)", "isGemStoneNativeError implementation");
assertIncludes(loader, "class Gci extends NativeGci", "mapped Gci wrapper class");
assertIncludes(loader, "require('./session-worker.js')", "session worker loader import");
assertIncludes(declarations, "createGciSessionWorker", "session worker factory declaration");

console.log(`Public surface check passed: ${publicExports.length} exports, ${gciMethods.length} Gci methods.`);

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label} entry: ${value}`);
    seen.add(value);
  }
}

function assertIncludes(contents, snippet, label) {
  if (!contents.includes(snippet)) {
    throw new Error(`Missing ${label}: ${snippet}`);
  }
}
