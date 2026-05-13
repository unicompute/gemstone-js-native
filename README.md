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

## Local Checks

```sh
cargo fmt --check
cargo test
```

The Rust tests cover wire-format parsing and immediate OOP helpers in addition
to boundary validation for perform argument counts, fetch ranges, returned byte
counts, finite floats, and session ids. The `fetchBytes` wrapper keeps the
validated GCI byte count separate from the JavaScript buffer length to avoid
unchecked narrowing at the FFI call.

Building the Node addon itself uses napi-rs:

```sh
npm install
npm run build
npm run test:node
npm run pack:check
```

`test:node` loads the generated addon through `index.js` and checks exported OOP
helpers, including invalid-input cases that do not need a live GemStone login.
`pack:check` validates the publishable npm tarball, checks that `index.js` and
`index.d.ts` expose the same public helpers, verifies the npm and Cargo versions
and package metadata match, and fails if the generated platform `.node` binary
is missing or not referenced by the generated loader.

Release notes, npm provenance guidance, the current platform matrix, and the
native session-threading roadmap live in `docs/releasing.md`.
