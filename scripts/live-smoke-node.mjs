if (process.env.GS_RUN_NATIVE_LIVE !== "1") {
  console.log("Skipping @gemstone-js/native live smoke check; set GS_RUN_NATIVE_LIVE=1 to run it.");
  process.exit(0);
}

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const native = require("..");

const env = process.env;
const missing = [];
const username = envValue("GS_USERNAME", "GS_USER");
const password = envValue("GS_PASSWORD", "GS_PASS");
warnAliasConflicts([
  ["GS_STONE", "GS_STONE_NAME"],
  ["GS_NETLDI", "GS_NETLDI_NAME_OR_PORT"],
  ["GS_HOST", "GS_NETLDI_HOST"],
  ["GS_USERNAME", "GS_USER"],
  ["GS_PASSWORD", "GS_PASS"],
  ["GS_GEM_SERVICE", "GS_SERVICE"],
]);
if (!username) missing.push("GS_USERNAME or GS_USER");
if (!password) missing.push("GS_PASSWORD or GS_PASS");
if (missing.length > 0) {
  throw new Error(`Missing required live GemStone environment: ${missing.join(", ")}`);
}

const gci = new native.Gci(env.GS_LIB_PATH ?? null);
const stone = envValue("GS_STONE", "GS_STONE_NAME") ?? "gs64stone";
const netldi = envValue("GS_NETLDI", "GS_NETLDI_NAME_OR_PORT") ?? "netldi";
const host = envValue("GS_HOST", "GS_NETLDI_HOST") ?? "localhost";
const hostUsername = env.GS_HOST_USERNAME ?? "";
const hostPassword = env.GS_HOST_PASSWORD ?? "";
const gemService = envValue("GS_GEM_SERVICE", "GS_SERVICE") ?? "gemnetobject";
const stoneName = stoneNrs({ stone, netldi, host });

let loggedIn = false;
const cleanupGlobalKeys = [];
try {
  gci.init(env.GS_LIB_PATH ?? null);
  const encryptedHostPassword = gci.encrypt(hostPassword);
  gci.setNet(stoneName, hostUsername, encryptedHostPassword, gemService);
  const loginResult = gci.loginEx({
    username,
    password,
    flags: 0,
    haltOnError: false,
  });
  if (!loginResult) {
    const info = gci.err();
    throw new Error(`GemStone login failed${info ? `: ${info.message}` : "."}`);
  }
  loggedIn = true;

  const sessionId = gci.getSessionId();
  assertNonNegativeInteger(sessionId, "getSessionId should return a non-negative integer session id.");
  gci.setSessionId(sessionId);
  optionalBooleanGciCall(gci, "inTransaction", "inTransaction should return a boolean transaction status.");
  optionalBooleanGciCall(gci, "needsCommit", "needsCommit should return a boolean commit status.");
  assertBoolean(gci.commit(), "commit should return a boolean status for a no-op commit.");

  assertEqual(native.oopToSmallint(gci.executeStr("1 + 1")), 2, "executeStr should evaluate arithmetic.");

  const seven = gci.perform(native.smallintToOop(7), "yourself", []);
  assertEqual(native.oopToSmallint(seven), 7, "perform should send selectors with OOP arguments.");

  const text = gci.newString("native live smoke");
  assertEqual(fetchString(gci, text), "native live smoke", "newString/fetchBytes should round-trip strings.");

  const floatOop = gci.fltToOop(1.25);
  assertEqual(gci.oopToFlt(floatOop), 1.25, "Float OOP helpers should round-trip finite floats.");

  const dictClass = gci.resolveSymbol("StringKeyValueDictionary");
  const dict = gci.newOop(dictClass);
  const status = gci.newString("ready");
  gci.strKeyValueDictAtPut(dict, "status", status);
  assertEqual(fetchString(gci, gci.strKeyValueDictAt(dict, "status")), "ready", "dictionary helpers should round-trip values.");

  const userGlobals = gci.resolveSymbol("UserGlobals");
  const globalKey = `GemstoneJsNativeLive${Date.now()}`;
  const globalObjectKey = `${globalKey}Object`;
  cleanupGlobalKeys.push(globalKey, globalObjectKey);
  const globalText = gci.newString("symbol-dict-live");
  gci.symDictAtPut(userGlobals, globalKey, globalText);
  const globalLookup = gci.symDictAt(userGlobals, globalKey);
  assertEqual(globalLookup.value, globalText, "symDictAtPut/symDictAt should round-trip string-key symbol dictionary values.");
  assertEqual(fetchString(gci, globalLookup.value), "symbol-dict-live", "symDictAt should return the stored value OOP.");
  const globalObjectKeySymbol = gci.newSymbol(globalObjectKey);
  const globalObjectText = gci.newString("symbol-dict-obj-live");
  gci.symDictAtObjPut(userGlobals, globalObjectKeySymbol, globalObjectText);
  const globalObjectLookup = gci.symDictAt(userGlobals, globalObjectKey);
  assertEqual(globalObjectLookup.value, globalObjectText, "symDictAtObjPut should round-trip object-key symbol dictionary values.");
  assertEqual(fetchString(gci, globalObjectLookup.value), "symbol-dict-obj-live", "symDictAtObjPut should store the expected value OOP.");

  gci.addOopToExportSet(text);
  gci.removeOopFromExportSet(text);

  await runWorkerSmoke({
    encryptedHostPassword,
    gemService,
    globalKeyPrefix: globalKey,
    hostUsername,
    password,
    stoneName,
    username,
  });

  console.log("@gemstone-js/native live smoke check passed.");
} finally {
  if (loggedIn) {
    for (const key of cleanupGlobalKeys) {
      try {
        gci.executeStr(`UserGlobals removeKey: #${key} ifAbsent: []`);
      } catch (error) {
        console.warn(`@gemstone-js/native live smoke: failed to remove UserGlobals key ${key}: ${String(error?.message ?? error)}`);
      }
    }
    try {
      assertBoolean(gci.abort(), "abort should return a boolean cleanup status.");
    } catch (error) {
      console.warn(`@gemstone-js/native live smoke: abort cleanup failed: ${String(error?.message ?? error)}`);
    }
    gci.logout();
  }
}

function fetchString(gci, oop) {
  const size = gci.fetchSize(oop);
  const bytes = gci.fetchBytes(oop, 1, size);
  return Buffer.from(bytes).toString("utf8");
}

function envValue(...names) {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function warnAliasConflicts(groups) {
  const conflicts = [];
  for (const [canonical, ...aliases] of groups) {
    const canonicalValue = env[canonical];
    if (canonicalValue === undefined || canonicalValue === "") continue;
    for (const alias of aliases) {
      const aliasValue = env[alias];
      if (aliasValue !== undefined && aliasValue !== "" && aliasValue !== canonicalValue) {
        conflicts.push(`${canonical}/${alias}`);
      }
    }
  }
  if (conflicts.length > 0) {
    console.warn(`@gemstone-js/native live smoke: conflicting environment aliases: ${conflicts.join(", ")}; canonical values win.`);
  }
}

function optionalBooleanGciCall(gci, method, message) {
  try {
    assertBoolean(gci[method](), message);
  } catch (error) {
    if (isMissingNativeSymbol(error)) {
      console.warn(`@gemstone-js/native live smoke: skipping optional ${method} check because the loaded GCI library does not export it.`);
      return;
    }
    throw error;
  }
}

async function runWorkerSmoke(config) {
  const worker = native.createGciSessionWorker(env.GS_LIB_PATH ?? null);
  let workerLoggedIn = false;
  const workerGlobalKey = `${config.globalKeyPrefix}Worker`;
  cleanupGlobalKeys.push(workerGlobalKey);
  try {
    await worker.init(env.GS_LIB_PATH ?? null);
    await worker.setNet(config.stoneName, config.hostUsername, config.encryptedHostPassword, config.gemService);
    const loginResult = await worker.loginEx({
      username: config.username,
      password: config.password,
      flags: 0,
      haltOnError: false,
    });
    if (!loginResult) {
      const info = await worker.err();
      throw new Error(`GemStone worker login failed${info ? `: ${info.message}` : "."}`);
    }
    workerLoggedIn = true;
    const workerResults = await Promise.all([
      worker.executeStr("10 + 1"),
      worker.executeStr("10 + 2"),
      worker.perform(native.smallintToOop(13), "yourself", []),
    ]);
    assertEqual(native.oopToSmallint(workerResults[0]), 11, "GciSessionWorker should queue executeStr calls.");
    assertEqual(native.oopToSmallint(workerResults[1]), 12, "GciSessionWorker should preserve queued executeStr results.");
    assertEqual(native.oopToSmallint(workerResults[2]), 13, "GciSessionWorker should queue perform calls.");
    const workerText = await worker.newString("native worker live smoke");
    assertEqual(await fetchStringAsync(worker, workerText), "native worker live smoke", "GciSessionWorker should fetch string bytes.");
    const userGlobals = await worker.resolveSymbol("UserGlobals");
    const value = await worker.newString("worker-global");
    await worker.symDictAtPut(userGlobals, workerGlobalKey, value);
    const lookup = await worker.symDictAt(userGlobals, workerGlobalKey);
    assertEqual(await fetchStringAsync(worker, lookup.value), "worker-global", "GciSessionWorker should update UserGlobals.");
    await worker.addOopToExportSet(workerText);
    await worker.removeOopFromExportSet(workerText);
  } finally {
    if (workerLoggedIn) {
      try {
        await worker.abort();
      } catch {}
      try {
        await worker.logout();
      } catch {}
    }
    await worker.close();
  }
}

async function fetchStringAsync(gci, oop) {
  const size = await gci.fetchSize(oop);
  const bytes = await gci.fetchBytes(oop, 1, size);
  return Buffer.from(bytes).toString("utf8");
}

function isMissingNativeSymbol(error) {
  const text = String(error?.message ?? error);
  return /symbol not found|not found in .*libgcirpc|undefined symbol/i.test(text);
}

function stoneNrs(config) {
  if (config.host && config.host !== "localhost" && config.host !== "127.0.0.1") {
    return `!@${config.host}!${config.netldi}!${config.stone}`;
  }
  return config.stone;
}

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertBoolean(actual, message) {
  if (typeof actual !== "boolean") {
    throw new Error(`${message} Expected a boolean, got ${JSON.stringify(actual)}.`);
  }
}

function assertNonNegativeInteger(actual, message) {
  if (!Number.isInteger(actual) || actual < 0) {
    throw new Error(`${message} Got ${JSON.stringify(actual)}.`);
  }
}
