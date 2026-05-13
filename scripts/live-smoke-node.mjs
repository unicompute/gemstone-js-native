if (process.env.GS_RUN_NATIVE_LIVE !== "1") {
  console.log("Skipping @gemstone-js/native live smoke check; set GS_RUN_NATIVE_LIVE=1 to run it.");
  process.exit(0);
}

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const native = require("..");

const env = process.env;
const missing = [];
if (!env.GS_USERNAME) missing.push("GS_USERNAME");
if (!env.GS_PASSWORD) missing.push("GS_PASSWORD");
if (missing.length > 0) {
  throw new Error(`Missing required live GemStone environment: ${missing.join(", ")}`);
}

const gci = new native.Gci(env.GS_LIB_PATH ?? null);
const stone = env.GS_STONE ?? env.GS_STONE_NAME ?? "gs64stone";
const netldi = env.GS_NETLDI ?? "netldi";
const host = env.GS_HOST ?? "localhost";
const hostUsername = env.GS_HOST_USERNAME ?? "";
const hostPassword = env.GS_HOST_PASSWORD ?? "";
const gemService = env.GS_GEM_SERVICE ?? "gemnetobject";
const stoneName = stoneNrs({ stone, netldi, host });

let loggedIn = false;
try {
  gci.init(env.GS_LIB_PATH ?? null);
  const encryptedHostPassword = gci.encrypt(hostPassword);
  gci.setNet(stoneName, hostUsername, encryptedHostPassword, gemService);
  const loginResult = gci.loginEx({
    username: env.GS_USERNAME,
    password: env.GS_PASSWORD,
    flags: 0,
    haltOnError: false,
  });
  if (!loginResult) {
    const info = gci.err();
    throw new Error(`GemStone login failed${info ? `: ${info.message}` : "."}`);
  }
  loggedIn = true;

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

  gci.addOopToExportSet(text);
  gci.removeOopFromExportSet(text);

  console.log("@gemstone-js/native live smoke check passed.");
} finally {
  if (loggedIn) {
    gci.logout();
  }
}

function fetchString(gci, oop) {
  const size = gci.fetchSize(oop);
  const bytes = gci.fetchBytes(oop, 1, size);
  return Buffer.from(bytes).toString("utf8");
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
