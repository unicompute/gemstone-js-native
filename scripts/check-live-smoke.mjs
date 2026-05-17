#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/live-smoke-node.mjs", "utf8");

const skipOutput = execFileSync(process.execPath, ["scripts/live-smoke-node.mjs"], {
  encoding: "utf8",
  env: {
    ...process.env,
    GS_RUN_NATIVE_LIVE: "",
  },
  stdio: "pipe",
});
if (!skipOutput.includes("Skipping @gemstone-js/native live smoke check; set GS_RUN_NATIVE_LIVE=1")) {
  throw new Error(`live-smoke-node.mjs skip output is missing GS_RUN_NATIVE_LIVE guidance:\n${skipOutput}`);
}

for (const snippet of [
  "GS_RUN_NATIVE_LIVE",
  "envValue(\"GS_USERNAME\", \"GS_USER\")",
  "envValue(\"GS_PASSWORD\", \"GS_PASS\")",
  "envValue(\"GS_STONE\", \"GS_STONE_NAME\")",
  "envValue(\"GS_NETLDI\", \"GS_NETLDI_NAME_OR_PORT\")",
  "envValue(\"GS_HOST\", \"GS_NETLDI_HOST\")",
  "envValue(\"GS_GEM_SERVICE\", \"GS_SERVICE\")",
  "warnAliasConflicts",
  "canonical values win",
  "optionalBooleanGciCall",
  "isMissingNativeSymbol",
  "skipping optional",
  "runWorkerSmoke",
  "createGciSessionWorker",
  "fetchStringAsync",
  "stoneNrs",
  "fetchString",
]) {
  assertIncludes(source, snippet, `live smoke setup snippet ${snippet}`);
}

const operations = [
  "new native.Gci",
  "gci.init(",
  "gci.encrypt(",
  "gci.setNet(",
  "gci.loginEx(",
  "gci.err()",
  "gci.getSessionId(",
  "gci.setSessionId(",
  "optionalBooleanGciCall(gci, \"inTransaction\"",
  "optionalBooleanGciCall(gci, \"needsCommit\"",
  "gci.commit(",
  "gci.executeStr(",
  "gci.perform(",
  "gci.newString(",
  "gci.fetchSize(",
  "gci.fetchBytes(",
  "gci.fltToOop(",
  "gci.oopToFlt(",
  "gci.resolveSymbol(\"StringKeyValueDictionary\")",
  "gci.resolveSymbol(\"UserGlobals\")",
  "gci.newOop(",
  "gci.newSymbol(",
  "gci.strKeyValueDictAtPut(",
  "gci.strKeyValueDictAt(",
  "gci.symDictAtPut(",
  "gci.symDictAt(",
  "gci.symDictAtObjPut(",
  "UserGlobals removeKey:",
  "gci.addOopToExportSet(",
  "gci.removeOopFromExportSet(",
  "worker.executeStr(\"10 + 1\")",
  "worker.perform(native.smallintToOop(13)",
  "fetchStringAsync(worker",
  "worker.symDictAtPut(",
  "worker.addOopToExportSet(",
  "worker.removeOopFromExportSet(",
  "worker.close()",
  "gci.abort(",
  "gci.logout()",
];
for (const operation of operations) {
  assertIncludes(source, operation, `live GCI operation ${operation}`);
}

const aliases = [
  ["GS_USERNAME", "GS_USER"],
  ["GS_PASSWORD", "GS_PASS"],
  ["GS_STONE", "GS_STONE_NAME"],
  ["GS_NETLDI", "GS_NETLDI_NAME_OR_PORT"],
  ["GS_HOST", "GS_NETLDI_HOST"],
  ["GS_GEM_SERVICE", "GS_SERVICE"],
];
for (const [canonical, alias] of aliases) {
  assertIncludes(source, `[\"${canonical}\", \"${alias}\"]`, `alias conflict pair ${canonical}/${alias}`);
}

console.log(`Native live smoke check passed: ${operations.length} guarded operations, ${aliases.length} alias groups.`);

function assertIncludes(value, snippet, label) {
  if (!value.includes(snippet)) {
    throw new Error(`Missing ${label}: ${snippet}`);
  }
}
