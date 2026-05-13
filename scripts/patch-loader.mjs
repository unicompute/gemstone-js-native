import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const loaderPath = args.loaderPath ?? fileURLToPath(new URL("../index.js", import.meta.url));
const typesPath = args.typesPath ?? (args.loaderPath ? undefined : fileURLToPath(new URL("../index.d.ts", import.meta.url)));
const source = readFileSync(loaderPath, "utf8");
const checkOnly = args.checkOnly;

const requiredPatchedSnippets = [
  "const { Gci: NativeGci",
  "const mappedGciMethods = [",
  "class Gci extends NativeGci",
  "function mapGciError(error, gci, operation)",
  "function isGemStoneNativeError(error)",
  "typeof error.operation === 'string'",
  "mapped.code = 'GEMSTONE_GCI_ERROR'",
  "mapped.operation = operation",
  "mapped.gciNumber = info.number",
  "mapped.category = info.category",
  "module.exports.Gci = Gci",
  "module.exports.isGemStoneNativeError = isGemStoneNativeError",
];
const requiredDeclarationSnippets = [
  "export interface GemStoneNativeError extends Error",
  "export declare function isGemStoneNativeError(error: unknown): error is GemStoneNativeError",
  "category: string",
  "context: string",
  "exceptionObj: string",
  "args: Array<string>",
  "category?: string",
  "context?: string",
  "exceptionObj?: string",
  "args?: Array<string>",
];

patchOrCheckDeclarations(typesPath, checkOnly);

if (source.includes("GEMSTONE_GCI_ERROR")) {
  assertPatchedLoader(source);
  console.log("index.js already has GemStone GCI error mapping.");
  process.exit(0);
}

if (checkOnly) {
  throw new Error("index.js is missing GemStone GCI error mapping. Run node scripts/patch-loader.mjs after build.");
}

const generatedExports = `const { Gci, smallintToOop, oopToSmallint, isSmallintOop, boolToOop, charToOopString, oopToCharString } = nativeBinding

module.exports.Gci = Gci
module.exports.smallintToOop = smallintToOop
module.exports.oopToSmallint = oopToSmallint
module.exports.isSmallintOop = isSmallintOop
module.exports.boolToOop = boolToOop
module.exports.charToOopString = charToOopString
module.exports.oopToCharString = oopToCharString
`;

const mappedExports = `const { Gci: NativeGci, smallintToOop, oopToSmallint, isSmallintOop, boolToOop, charToOopString, oopToCharString } = nativeBinding

const mappedGciMethods = [
  'init',
  'libraryPath',
  'encrypt',
  'setNet',
  'loginEx',
  'logout',
  'commit',
  'abort',
  'err',
  'executeStr',
  'perform',
  'newString',
  'newSymbol',
  'newOop',
  'resolveSymbol',
  'fetchClass',
  'fetchSize',
  'fetchBytes',
  'getSessionId',
  'setSessionId',
  'needsCommit',
  'inTransaction',
  'fltToOop',
  'oopToFlt',
  'symDictAt',
  'symDictAtPut',
  'symDictAtObjPut',
  'strKeyValueDictAt',
  'strKeyValueDictAtPut',
  'addOopToExportSet',
  'removeOopFromExportSet',
]

class Gci extends NativeGci {
  constructor(...args) {
    try {
      super(...args)
    } catch (error) {
      throw mapGciError(error, null, 'constructor')
    }
  }
}

for (const method of mappedGciMethods) {
  const nativeMethod = NativeGci.prototype[method]
  if (typeof nativeMethod !== 'function') continue
  Object.defineProperty(Gci.prototype, method, {
    configurable: true,
    writable: true,
    value: function mappedGciMethod(...args) {
      try {
        return nativeMethod.apply(this, args)
      } catch (error) {
        throw mapGciError(error, this, method)
      }
    },
  })
}

function mapGciError(error, gci, operation) {
  const mapped = error instanceof Error ? error : new Error(String(error))
  if (mapped.code && mapped.code !== 'GEMSTONE_GCI_ERROR') {
    mapped.nativeCode = mapped.code
  }
  mapped.code = 'GEMSTONE_GCI_ERROR'
  mapped.operation = operation

  if (gci && operation !== 'err' && typeof NativeGci.prototype.err === 'function') {
    try {
      const info = NativeGci.prototype.err.call(gci)
      if (info) {
        mapped.gciNumber = info.number
        mapped.fatal = info.fatal
        mapped.gciMessage = info.message
        mapped.reason = info.reason
        mapped.category = info.category
        mapped.context = info.context
        mapped.exceptionObj = info.exceptionObj
        mapped.args = info.args
        mapped.info = info
      }
    } catch {}
  }

  if (typeof mapped.message === 'string' && !mapped.message.includes(\`\${operation} failed\`)) {
    mapped.message = \`\${operation} failed: \${mapped.message}\`
  }
  return mapped
}

function isGemStoneNativeError(error) {
  return Boolean(
    error
    && typeof error === 'object'
    && error.code === 'GEMSTONE_GCI_ERROR'
    && typeof error.operation === 'string'
  )
}

module.exports.Gci = Gci
module.exports.isGemStoneNativeError = isGemStoneNativeError
module.exports.smallintToOop = smallintToOop
module.exports.oopToSmallint = oopToSmallint
module.exports.isSmallintOop = isSmallintOop
module.exports.boolToOop = boolToOop
module.exports.charToOopString = charToOopString
module.exports.oopToCharString = oopToCharString
`;

if (!source.includes(generatedExports)) {
  throw new Error("Cannot patch index.js: generated export block was not found.");
}

const patched = source.replace(generatedExports, mappedExports);
assertPatchedLoader(patched);
writeFileSync(loaderPath, patched);
console.log("Patched index.js with GemStone GCI error mapping.");

function assertPatchedLoader(value) {
  for (const snippet of requiredPatchedSnippets) {
    if (!value.includes(snippet)) {
      throw new Error(`index.js GemStone GCI error mapping is incomplete: missing ${JSON.stringify(snippet)}.`);
    }
  }
}

function patchOrCheckDeclarations(path, checkOnly) {
  if (!path) return;
  const declarations = readFileSync(path, "utf8");
  if (declarations.includes("GemStoneNativeError")) {
    assertPatchedDeclarations(declarations);
    return;
  }
  if (checkOnly) {
    throw new Error(`${path} is missing GemStone native error declarations. Run node scripts/patch-loader.mjs after build.`);
  }

  const marker = "export interface SymDictLookup";
  if (!declarations.includes(marker)) {
    throw new Error(`Cannot patch ${path}: SymDictLookup declaration was not found.`);
  }
  const patched = declarations.replace(marker, `${errorDeclarationBlock()}${marker}`);
  assertPatchedDeclarations(patched);
  writeFileSync(path, patched);
  console.log(`Patched ${path} with GemStone native error declarations.`);
}

function assertPatchedDeclarations(value) {
  for (const snippet of requiredDeclarationSnippets) {
    if (!value.includes(snippet)) {
      throw new Error(`index.d.ts GemStone native error declarations are incomplete: missing ${JSON.stringify(snippet)}.`);
    }
  }
}

function errorDeclarationBlock() {
  return `export interface GemStoneNativeError extends Error {
  code: 'GEMSTONE_GCI_ERROR'
  operation: string
  nativeCode?: string
  gciNumber?: number
  fatal?: boolean
  gciMessage?: string
  reason?: string
  category?: string
  context?: string
  exceptionObj?: string
  args?: Array<string>
  info?: GciErrorInfo
}
export declare function isGemStoneNativeError(error: unknown): error is GemStoneNativeError
`;
}

function parseArgs(argv) {
  let checkOnly = false;
  let loaderPath;
  let typesPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      checkOnly = true;
    } else if (arg === "--loader") {
      const value = argv[index + 1];
      index += 1;
      if (!value) throw new Error("--loader requires a path.");
      loaderPath = resolve(value);
    } else if (arg === "--types") {
      const value = argv[index + 1];
      index += 1;
      if (!value) throw new Error("--types requires a path.");
      typesPath = resolve(value);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return { checkOnly, loaderPath, typesPath };
}
