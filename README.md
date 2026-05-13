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

## Local Checks

Rust-only checks:

```sh
cargo fmt --check
cargo test
cargo test --features session-thread-spike
```

The Rust tests cover wire-format parsing and immediate OOP helpers in addition
to boundary validation for perform argument counts, fetch ranges, returned byte
counts, finite floats, and session ids. The feature-gated test keeps the
experimental `session-thread-spike` worker slice from drifting, including
queued `fetchBytes`, `executeStr`, `perform`, `err`, and export-set
retain/release request paths, transaction status/reset calls, and
float conversion, dictionary lookup/update calls, plus string/symbol/object
allocation calls. The
`fetchBytes` wrapper keeps the validated GCI byte count separate from the
JavaScript buffer length to avoid unchecked narrowing at the FFI call.

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
SmallInteger, and invalid-input cases that do not need a live GemStone login.
Live native checks are opt-in with `GS_RUN_NATIVE_LIVE=1 npm run test:live`;
they cover login, `executeStr`, `perform`, string and float conversion,
`StringKeyValueDictionary` helpers, and export-set retain/release against a
real Stone.
`pack:check` validates the publishable npm tarball, checks that `index.js` and
`index.d.ts` expose the same public helpers, verifies the npm and Cargo versions
and package metadata match, verifies the npm entrypoint/export map, verifies
the npm script contract, verifies `Gci` method declarations, and fails if the
generated platform `.node` binary is missing, duplicated, misnamed, or not
referenced by the generated loader. It also checks the CI and prebuild workflow
snippets that produce and upload release artifacts, and guards the release docs
for artifact checksum, registry signature, and provenance verification steps.

Release notes, npm provenance guidance, and the current platform matrix live in
`docs/releasing.md`. Rust-side error mapping and dedicated session-threading
design notes live in `docs/native-architecture.md`.
