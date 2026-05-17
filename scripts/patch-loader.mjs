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
  "require('./session-worker.js')",
  "typeof error.operation === 'string'",
  "mapped.code = 'GEMSTONE_GCI_ERROR'",
  "mapped.operation = operation",
  "mapped.gciNumber = info.number",
  "mapped.category = info.category",
  "module.exports.Gci = Gci",
  "module.exports.GciSessionWorker = GciSessionWorker",
  "module.exports.createGciSessionWorker = createGciSessionWorker",
  "module.exports.isGemStoneNativeError = isGemStoneNativeError",
];
const requiredDeclarationSnippets = [
  "export interface GemStoneNativeError extends Error",
  "export declare function isGemStoneNativeError(error: unknown): error is GemStoneNativeError",
  "export declare class GciSessionWorker",
  "export declare function createGciSessionWorker",
  "fetchBytes(oop: string, start: number, count: number): Promise<Uint8Array>",
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

const { GciSessionWorker, createGciSessionWorker } = require('./session-worker.js')

module.exports.Gci = Gci
module.exports.GciSessionWorker = GciSessionWorker
module.exports.createGciSessionWorker = createGciSessionWorker
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
  let patched = normalizeDeclarationTypes(declarations);
  if (checkOnly && patched !== declarations) {
    throw new Error(`${path} contains generated declaration types that need normalization. Run node scripts/patch-loader.mjs after build.`);
  }
  if (declarations.includes("GemStoneNativeError") && declarations.includes("GciSessionWorker")) {
    assertPatchedDeclarations(patched);
    if (patched !== declarations) {
      writeFileSync(path, patched);
      console.log(`Patched ${path} generated declaration types.`);
    }
    return;
  }
  if (checkOnly) {
    throw new Error(`${path} is missing GemStone native error or session worker declarations. Run node scripts/patch-loader.mjs after build.`);
  }

  const marker = "export interface SymDictLookup";
  if (!patched.includes(marker)) {
    throw new Error(`Cannot patch ${path}: SymDictLookup declaration was not found.`);
  }
  if (!patched.includes("GemStoneNativeError")) {
    patched = patched.replace(marker, `${errorDeclarationBlock()}${marker}`);
  }
  if (!patched.includes("GciSessionWorker")) {
    patched = patched.replace("export declare function smallintToOop", `${sessionWorkerDeclarationBlock()}export declare function smallintToOop`);
  }
  assertPatchedDeclarations(patched);
  writeFileSync(path, patched);
  console.log(`Patched ${path} with GemStone native error and session worker declarations.`);
}

function normalizeDeclarationTypes(value) {
  return value.replaceAll(
    "fetchBytes(oop: string, start: number, count: number): Buffer",
    "fetchBytes(oop: string, start: number, count: number): Uint8Array",
  );
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

function sessionWorkerDeclarationBlock() {
  return `export declare class GciSessionWorker {
  constructor(libPath?: string | undefined | null)
  call(method: string, args?: Array<unknown>): Promise<unknown>
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
  init(libPath?: string | undefined | null): Promise<number>
  libraryPath(): Promise<string>
  encrypt(password: string): Promise<string>
  setNet(stoneName: string, hostUsername: string, encryptedHostPassword: string, gemService: string): Promise<void>
  loginEx(options: LoginOptions): Promise<number>
  logout(): Promise<number>
  commit(): Promise<boolean>
  abort(): Promise<boolean>
  err(): Promise<GciErrorInfo | null>
  executeStr(source: string, receiver?: string | undefined | null): Promise<string>
  perform(receiver: string, selector: string, args?: Array<string> | undefined | null): Promise<string>
  newString(value: string): Promise<string>
  newSymbol(value: string): Promise<string>
  newOop(classOop: string): Promise<string>
  resolveSymbol(name: string, symbolList?: string | undefined | null): Promise<string>
  fetchClass(oop: string): Promise<string>
  fetchSize(oop: string): Promise<number>
  fetchBytes(oop: string, start: number, count: number): Promise<Uint8Array>
  getSessionId(): Promise<number>
  setSessionId(sessionId: number): Promise<void>
  needsCommit(): Promise<boolean>
  inTransaction(): Promise<boolean>
  fltToOop(value: number): Promise<string>
  oopToFlt(oop: string): Promise<number>
  symDictAt(dict: string, key: string): Promise<SymDictLookup>
  symDictAtPut(dict: string, key: string, value: string): Promise<void>
  symDictAtObjPut(dict: string, key: string, value: string): Promise<void>
  strKeyValueDictAt(dict: string, key: string): Promise<string>
  strKeyValueDictAtPut(dict: string, key: string, value: string): Promise<void>
  addOopToExportSet(oop: string): Promise<void>
  removeOopFromExportSet(oop: string): Promise<void>
}
export declare function createGciSessionWorker(libPath?: string | undefined | null): GciSessionWorker
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
