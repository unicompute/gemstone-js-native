export interface LoginOptions {
  username: string;
  password: string;
  flags?: number;
  haltOnError?: boolean;
}

export interface GciErrorInfo {
  number: number;
  fatal: boolean;
  message: string;
  reason?: string;
}

export interface SymDictLookup {
  value: string;
  assoc: string;
}

export class Gci {
  constructor(libPath?: string);
  init(libPath?: string): number;
  libraryPath(): string;
  encrypt(password: string): string;
  setNet(stoneName: string, hostUsername: string, encryptedHostPassword: string, gemService: string): void;
  loginEx(options: LoginOptions): number;
  logout(): number;
  commit(): boolean;
  abort(): boolean;
  err(): GciErrorInfo | null;
  executeStr(source: string, receiver?: string): string;
  perform(receiver: string, selector: string, args?: string[]): string;
  newString(value: string): string;
  newSymbol(value: string): string;
  newOop(classOop: string): string;
  resolveSymbol(name: string, symbolList?: string): string;
  fetchClass(oop: string): string;
  fetchSize(oop: string): number;
  fetchBytes(oop: string, start: number, count: number): Uint8Array;
  getSessionId(): number;
  setSessionId(sessionId: number): void;
  needsCommit(): boolean;
  inTransaction(): boolean;
  fltToOop(value: number): string;
  oopToFlt(oop: string): number;
  symDictAt(dict: string, key: string): SymDictLookup;
  symDictAtPut(dict: string, key: string, value: string): void;
  symDictAtObjPut(dict: string, key: string, value: string): void;
  strKeyValueDictAt(dict: string, key: string): string;
  strKeyValueDictAtPut(dict: string, key: string, value: string): void;
  addOopToExportSet(oop: string): void;
  removeOopFromExportSet(oop: string): void;
}
