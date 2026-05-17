# @gemstone-js/native

`@gemstone-js/native` is the napi-rs native addon used by
[`gemstone-js`](https://github.com/unicompute/gemstone-js).

It exposes the low-level GemStone/S GCI calls needed by the TypeScript client
and delegates dynamic `libgcirpc` loading to the shared `gemstone-gci` Rust
crate from [`gemstone-rs`](https://github.com/unicompute/gemstone-rs).
String and OOP values cross the Node boundary in decimal wire form so JavaScript
does not lose precision on 64-bit object pointers.
The addon validates unsigned decimal OOP strings, finite float inputs, perform
argument counts, byte ranges, byte counts returned from GCI, and session ids
before dispatching into GCI so bad JavaScript inputs fail at the boundary.
Thrown `Gci` method errors are decorated with `code: "GEMSTONE_GCI_ERROR"`,
the operation name, and any available `GciErr` number, fatal flag, message, and
reason fields, plus raw category, context, exception object, and argument OOPs.
`isGemStoneNativeError()` is exported as a small runtime/type guard for that
standardized error shape.
`GciSessionWorker` and `createGciSessionWorker()` expose the first production
session-thread wrapper: one Node worker thread owns a synchronous `Gci`
instance, while JavaScript callers use promise-returning methods that are
queued onto that thread. The raw `Gci` class remains available for low-level
tests and tooling.

## Local Checks

Rust-only checks:

```sh
cargo fmt --check
npm run fmt:check
cargo test
cargo test --features session-thread-spike
npm run session-thread:check
npm run checksum:check
npm run prebuild:self-check
npm run public-surface:check
npm run live:check
```

The Rust tests cover wire-format parsing and immediate OOP helpers in addition
to boundary validation for perform argument counts, fetch ranges, returned byte
counts, finite floats, and session ids. The feature-gated test keeps the
experimental `session-thread-spike` worker slice from drifting, including
queued `fetchBytes`, `executeStr`, `perform`, `err`, and export-set
retain/release request paths, `init`/`encrypt`/`setNet`/`loginEx`/`logout`,
transaction status/reset calls, session id get/set calls, float conversion,
dictionary lookup/update calls, plus string/symbol/object allocation calls. The
`GciThreadDiagnostics` helper reports the worker thread id and processed
request count so tests can prove calls cross the worker queue. The spike also
has an explicit idempotent `shutdown()` path that joins the worker and causes
later requests to fail through the closed-thread path. Queue, reply, and
operation failures include the queued operation name, so closed-worker errors
identify calls such as `library_path` instead of reporting only a generic
channel failure. cloned request handles can queue concurrent callers onto the
same worker without taking ownership of shutdown. Live worker call failures now
capture same-thread GciErr details before sending the error back across the worker queue. The `fetchBytes` wrapper
keeps the validated GCI byte count separate from the JavaScript buffer length
to avoid unchecked narrowing at the FFI call.
`npm run fmt:check` is the npm-facing Rust formatting guard used by
`npm run verify`, matching the CI `cargo fmt --check` step.
`npm run session-thread:check` statically verifies that the feature-gated
`ExperimentalGciThreadWorker` command enum, public wrapper methods, dispatch
arms, state implementations, docs, and package script contract stay in sync.
`npm run checksum:check` verifies that the release checksum helper emits stable
sorted `SHA256SUMS.txt` output, that the verifier accepts matching artifacts
and rejects mismatches, empty or malformed manifests, missing files, pathful
or whitespace-bearing entries, non-portable artifact names, non-file targets,
duplicate entries, manifest artifact targets, and that writing checksums fails
when no artifact suffixes match or when suffix filters or matching artifact
names are malformed, pathful, whitespace-bearing, non-portable, or duplicated.
The writer also excludes
`SHA256SUMS.txt` itself and directories from artifact suffix matches.
`npm run prebuild:self-check` verifies the prebuild artifact validator with
fixture artifacts. The validator is also runnable against a downloaded workflow
artifact with `npm run prebuild:check -- <artifact-directory>`; it checks for
one package tarball, one platform `.node`, a checksum manifest covering exactly
those two files, and a tarball containing the same native binary. After
downloading the complete GitHub Actions Prebuild artifact set, run
`npm run prebuild:check -- --all <download-directory>` to require the macOS,
Ubuntu, and Windows artifact directories and platform-appropriate native
binaries.
`npm run public-surface:check` verifies that `index.js`, `index.d.ts`, the
loader patcher, and smoke checks agree on exported helpers and `Gci` methods.
`npm run live:check` runs the live-smoke skip path without a Stone and
statically guards the alias handling and native operations covered by the
opt-in live smoke script.
`npm run installed:check` packs and extracts the npm tarball, verifies package
metadata, the generated `.node` binary, loader references, patched error
mapping, and then runs the packaged public-surface, loader, live-smoke guard,
release/provenance helper checks, and Node smoke checks from the extracted
artifact.

Building the Node addon itself uses napi-rs:

```sh
npm install
npm run build
npm run verify
```

The build scripts run `scripts/patch-loader.mjs` after napi-rs regenerates
`index.js` so the packed loader keeps the standardized `Gci` error mapping.
`npm run loader:check` verifies the patched loader shape without modifying it,
and `pack:check` runs that verification before inspecting the tarball.
`test:node` loads the generated addon through `index.js`, checks exported OOP
helpers and `Gci` prototype methods, and covers boolean, character,
SmallInteger, `GciSessionWorker`, and invalid-input cases that do not need a
live GemStone login.
`live:check` keeps the native live-smoke script covered without a live Stone by
checking its skip path, environment alias policy, and guarded GCI operations.
Live native checks are opt-in with `GS_RUN_NATIVE_LIVE=1 npm run test:live`;
they cover login, `executeStr`, `perform`, string and float conversion,
`StringKeyValueDictionary` helpers, `UserGlobals` symbol-dictionary
lookup/update helpers, session id helpers, optional transaction status helpers
when the loaded `libgcirpc` exports them, transaction reset helpers, and
export-set retain/release against a real Stone. They also open a
`GciSessionWorker`, run concurrent queued `executeStr`/`perform` calls, fetch
string bytes through the worker, update `UserGlobals`, and retain/release an
export-set object through the worker thread. The
live smoke script prefers `GS_USERNAME`, `GS_PASSWORD`,
`GS_HOST`, `GS_NETLDI`, and `GS_GEM_SERVICE`, but also accepts the Pharo bridge
aliases `GS_USER`, `GS_PASS`, `GS_NETLDI_HOST`, `GS_NETLDI_NAME_OR_PORT`, and
`GS_SERVICE`. If both forms are set to different non-empty values, the live
smoke script warns by variable name and keeps the canonical value.
`pack:check` validates the publishable npm tarball, checks that `index.js` and
`index.d.ts` expose the same public helpers, verifies the npm and Cargo versions
and package metadata match, verifies the npm entrypoint/export map, verifies
the npm script contract, verifies `Gci` method declarations, checks the
session-thread spike coverage guard, checks the checksum helper self-test,
checks the prebuild artifact validator,
checks the public surface guard, and fails if the generated platform `.node`
binary is missing, duplicated, misnamed, or not referenced by the generated
loader. It also checks the CI and prebuild workflow snippets that produce,
verify, and upload release artifacts, and guards the release docs for artifact
checksum, registry signature, and provenance verification steps. `verify` then
runs the extracted-artifact smoke so the packed loader and native binary are
tested from the same file layout users install.

Release notes, npm provenance guidance, and the current platform matrix live in
`docs/releasing.md`. Rust-side error mapping and dedicated session-threading
design notes live in `docs/native-architecture.md`.
