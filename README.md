# @gemstone-js/native

`@gemstone-js/native` is the napi-rs native addon used by
[`gemstone-js`](https://github.com/unicompute/gemstone-js).

It exposes the low-level GemStone/S GCI calls needed by the TypeScript client
and delegates dynamic `libgcirpc` loading to the shared `gemstone-gci` Rust
crate from [`gemstone-rs`](https://github.com/unicompute/gemstone-rs).

## Local Checks

```sh
cargo fmt --check
cargo test
```

Building the Node addon itself uses napi-rs:

```sh
npm install
npm run build
```
