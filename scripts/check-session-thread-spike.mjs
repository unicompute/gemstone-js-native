import { readFileSync } from "node:fs";

const source = readText("src/lib.rs");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const readme = readText("README.md");
const architecture = readText("docs/native-architecture.md");

const enumBody = between(source, "enum GciThreadCommand", "\n}\n\n#[cfg(all(feature = \"session-thread-spike\", test))]");

const operations = [
  { name: "init", method: "pub fn init(&self)", command: "Init", dispatch: "state.init()" },
  { name: "encrypt", method: "pub fn encrypt(&self", command: "Encrypt", dispatch: "state.encrypt(password)" },
  { name: "set_net", method: "pub fn set_net(", command: "SetNet", dispatch: "state.set_net(" },
  { name: "login_ex", method: "pub fn login_ex(&self", command: "LoginEx", dispatch: "state.login_ex(options)" },
  { name: "library_path", method: "pub fn library_path(&self)", command: "LibraryPath", dispatch: "state.library_path()" },
  { name: "fetch_size", method: "pub fn fetch_size(&self", command: "FetchSize", dispatch: "state.fetch_size(oop)" },
  { name: "fetch_class", method: "pub fn fetch_class(&self", command: "FetchClass", dispatch: "state.fetch_class(oop)" },
  { name: "fetch_bytes", method: "pub fn fetch_bytes(&self", command: "FetchBytes", dispatch: "state.fetch_bytes(oop, start, count)" },
  { name: "execute_str", method: "pub fn execute_str(&self", command: "ExecuteStr", dispatch: "state.execute_str(source, receiver_oop)" },
  { name: "perform", method: "pub fn perform(", command: "Perform", dispatch: "state.perform(receiver_oop, selector, args)" },
  { name: "err", method: "pub fn err(&self)", command: "Err", dispatch: "state.err()" },
  { name: "logout", method: "pub fn logout(&self)", command: "Logout", dispatch: "state.logout()" },
  { name: "add_oop_to_export_set", method: "pub fn add_oop_to_export_set(&self", command: "AddOopToExportSet", dispatch: "state.add_oop_to_export_set(oop)" },
  { name: "remove_oop_from_export_set", method: "pub fn remove_oop_from_export_set(&self", command: "RemoveOopFromExportSet", dispatch: "state.remove_oop_from_export_set(oop)" },
  { name: "commit", method: "pub fn commit(&self)", command: "Commit", dispatch: "state.commit()" },
  { name: "abort", method: "pub fn abort(&self)", command: "Abort", dispatch: "state.abort()" },
  { name: "needs_commit", method: "pub fn needs_commit(&self)", command: "NeedsCommit", dispatch: "state.needs_commit()" },
  { name: "in_transaction", method: "pub fn in_transaction(&self)", command: "InTransaction", dispatch: "state.in_transaction()" },
  { name: "get_session_id", method: "pub fn get_session_id(&self)", command: "GetSessionId", dispatch: "state.get_session_id()" },
  { name: "set_session_id", method: "pub fn set_session_id(&self", command: "SetSessionId", dispatch: "state.set_session_id(session_id)" },
  { name: "flt_to_oop", method: "pub fn flt_to_oop(&self", command: "FltToOop", dispatch: "state.flt_to_oop(value)" },
  { name: "oop_to_flt", method: "pub fn oop_to_flt(&self", command: "OopToFlt", dispatch: "state.oop_to_flt(oop)" },
  { name: "sym_dict_at", method: "pub fn sym_dict_at(&self", command: "SymDictAt", dispatch: "state.sym_dict_at(dict, key)" },
  { name: "sym_dict_at_put", method: "pub fn sym_dict_at_put(&self", command: "SymDictAtPut", dispatch: "state.sym_dict_at_put(dict, key, value)" },
  { name: "sym_dict_at_obj_put", method: "pub fn sym_dict_at_obj_put(&self", command: "SymDictAtObjPut", dispatch: "state.sym_dict_at_obj_put(dict, key, value)" },
  { name: "str_key_value_dict_at", method: "pub fn str_key_value_dict_at(&self", command: "StrKeyValueDictAt", dispatch: "state.str_key_value_dict_at(dict, key)" },
  { name: "str_key_value_dict_at_put", method: "pub fn str_key_value_dict_at_put(", command: "StrKeyValueDictAtPut", dispatch: "state.str_key_value_dict_at_put(dict, key, value)" },
  { name: "new_string", method: "pub fn new_string(&self", command: "NewString", dispatch: "state.new_string(value)" },
  { name: "new_symbol", method: "pub fn new_symbol(&self", command: "NewSymbol", dispatch: "state.new_symbol(value)" },
  { name: "new_oop", method: "pub fn new_oop(&self", command: "NewOop", dispatch: "state.new_oop(class_oop)" },
  { name: "resolve_symbol", method: "pub fn resolve_symbol(&self", command: "ResolveSymbol", dispatch: "state.resolve_symbol(name, symbol_list)" },
];

assertIncludes(source, "pub struct ExperimentalGciThreadWorker", "worker struct");
assertIncludes(source, "impl Clone for ExperimentalGciThreadWorker", "worker cloneable request handle");
assertIncludes(source, "pub struct GciThreadDiagnostics", "worker diagnostics struct");
assertIncludes(source, "pub fn diagnostics(&self)", "worker diagnostics method");
assertIncludes(source, "pub fn shutdown(&mut self)", "worker explicit shutdown method");
assertIncludes(source, "fn join_worker_thread(&mut self)", "worker join helper");
assertIncludes(source, "fn request_worker_result", "worker result request helper");
assertIncludes(source, "fn request_worker_value", "worker value request helper");
assertIncludes(source, "fn worker_queue_error", "worker queue error helper");
assertIncludes(source, "fn worker_reply_error", "worker reply error helper");
assertIncludes(source, "fn worker_operation_error", "worker operation error helper");
assertIncludes(source, "fn live_worker_error", "worker live GciErr capture helper");
assertIncludes(source, "fn capture_worker_gci_error", "worker same-thread GciErr helper");
assertIncludes(source, "fn format_worker_gci_error", "worker formatted GciErr helper");
assertIncludes(source, "operation {operation} failed", "worker operation-aware error text");
assertIncludes(source, "GciErr number=", "worker GciErr detail text");
assertIncludes(source, "worker_gci_error_formatter_includes_same_thread_error_details", "worker GciErr formatter test");
assertIncludes(source, "experimental_worker_cloned_handles_queue_on_one_thread", "worker cloned-handle queue test");
assertIncludes(source, "contains(\"library_path\")", "worker closed-error operation-name test");
assertIncludes(source, "requests_processed", "worker processed request counter");
assertIncludes(source, "enum GciThreadState", "worker state enum");
assertIncludes(enumBody, "Shutdown", "worker shutdown command");
assertIncludes(enumBody, "Diagnostics", "worker diagnostics command");
assertIncludes(source, "GciThreadCommand::Shutdown", "worker shutdown send/drop path");
assertIncludes(source, "GciThreadCommand::Diagnostics", "worker diagnostics dispatch path");

for (const operation of operations) {
  assertIncludes(source, operation.method, `${operation.name} public worker method`);
  assertIncludes(enumBody, operation.command, `${operation.name} command enum variant`);
  assertIncludes(source, `GciThreadCommand::${operation.command}`, `${operation.name} command constructor or match arm`);
  assertIncludes(source, operation.dispatch, `${operation.name} dispatch to state`);
  assertIncludes(source, `fn ${operation.name}(`, `${operation.name} state implementation`);
}

const expectedScript = "node scripts/check-session-thread-spike.mjs";
if (packageJson.scripts?.["session-thread:check"] !== expectedScript) {
  throw new Error(`package.json script session-thread:check must be ${JSON.stringify(expectedScript)}.`);
}
if (!packageJson.scripts?.verify?.includes("npm run session-thread:check")) {
  throw new Error("package.json verify script must run npm run session-thread:check.");
}
if (!packageJson.files?.includes("scripts/check-session-thread-spike.mjs")) {
  throw new Error("package.json files must include scripts/check-session-thread-spike.mjs.");
}

for (const snippet of [
  "npm run session-thread:check",
  "session-thread-spike",
  "ExperimentalGciThreadWorker",
  "GciThreadDiagnostics",
  "shutdown",
  "queued operation name",
  "same-thread GciErr",
  "cloned request handles",
]) {
  assertIncludes(readme, snippet, `README session-thread snippet ${snippet}`);
}
for (const snippet of [
  "ExperimentalGciThreadWorker",
  "diagnostics",
  "shutdown",
  "session-thread:check",
  "allocation/symbol-resolution",
  "queued operation name",
  "same-thread GciErr",
  "cloned request handles",
]) {
  assertIncludes(architecture, snippet, `native architecture session-thread snippet ${snippet}`);
}

console.log(`Session-thread spike check passed: ${operations.length} queued operations.`);

function assertIncludes(value, snippet, label) {
  if (!value.includes(snippet)) {
    throw new Error(`Missing ${label}: ${snippet}`);
  }
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

function between(value, start, end) {
  const startIndex = value.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start marker: ${start}`);
  const endIndex = value.indexOf(end, startIndex);
  if (endIndex < 0) throw new Error(`Missing end marker after ${start}: ${end}`);
  return value.slice(startIndex, endIndex);
}
