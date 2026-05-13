# Releasing @gemstone-js/native

`@gemstone-js/native` should be released from a clean tag after the CI workflow
passes on `main`.

## Prebuilt Artifacts

The `Prebuild` workflow builds the napi-rs addon on:

- macOS arm64/x64 capable runner output
- Linux x64 GNU output
- Windows x64 MSVC output

Each job runs:

```sh
npm install
npm run build
npm run verify
npm pack --json
node scripts/write-checksums.mjs .node .tgz
node scripts/verify-checksums.mjs SHA256SUMS.txt
```

The workflow uploads the `.node` file, npm tarball, and `SHA256SUMS.txt` as
GitHub Actions artifacts so the package contents can be inspected before
publishing.
`npm run pack:check` verifies that both CI workflows still build, run
`npm run verify`, pack, verify checksums, and upload the expected release
artifacts. The local `npm run checksum:check` script also verifies that the
checksum writer produces stable sorted output, that the checksum verifier
accepts matching artifacts and rejects mismatches, empty or malformed
manifests, missing files, pathful or whitespace-bearing entries, non-file
targets, duplicate entries, manifest artifact targets, and that writing
checksums fails when no artifact suffixes match or when suffix filters or
matching artifact names are malformed, pathful, whitespace-bearing,
non-portable, or duplicated. The checksum writer excludes `SHA256SUMS.txt`
itself and
directories from artifact suffix matches, so broad suffix checks cannot include
the manifest as an artifact target.
`npm run public-surface:check` verifies that the generated loader, TypeScript
declarations, loader patcher, and smoke checks agree on exported helpers and
`Gci` methods before publishing.
`npm run verify` also runs `npm run fmt:check`, which wraps `cargo fmt --check`,
so local release verification catches Rust formatting drift before CI.

## Artifact Inspection

Before `npm publish`, compare at least one CI tarball with a local package:

```sh
npm pack --json
node scripts/write-checksums.mjs .node .tgz
node scripts/verify-checksums.mjs SHA256SUMS.txt
tar -tzf gemstone-js-native-*.tgz
shasum -a 256 gemstone-js-native-*.tgz index.*.node
shasum -a 256 -c SHA256SUMS.txt
```

Check that the tarball contains `index.js`, `index.d.ts`, `README.md`,
`LICENSE`, the `scripts/*.mjs` smoke/package helpers, and exactly one generated
`index.<platform>.node` binary for the artifact platform. It must not contain
`src/`, `target/`, `Cargo.toml`, `Cargo.lock`, tests, or local editor files.
Release artifact basenames used in `SHA256SUMS.txt` must use portable ASCII
letters, digits, `.`, `_`, `@`, `+`, and `-`, with no path separators or
whitespace.
Install the `.tgz` into a disposable project and run `node -e
"const n=require('@gemstone-js/native'); console.log(typeof n.Gci)"` to verify
the loader resolves the packed binary.

## Provenance Verification

After publishing, verify the registry metadata and signatures from a disposable
project:

```sh
VERSION=$(node -p "require('./package.json').version")
npm view @gemstone-js/native@$VERSION dist.integrity dist.signatures --json
npm install @gemstone-js/native@$VERSION
npm audit signatures
```

The metadata must include `dist.integrity` and `dist.signatures`, and
`npm audit signatures` must complete without signature or provenance failures.

## Publish Checklist

1. Verify `package.json` and `Cargo.toml` version, license, homepage,
   repository, and description match, and that `package.json` has
   `publishConfig.access` set to `public` and `publishConfig.provenance`.
2. Run `npm run verify` locally after `npm run build`.
3. Review the workflow tarball artifact contents with the artifact inspection
   checklist above.
4. Publish with provenance from a trusted CI or local environment:

```sh
npm publish --access public --provenance
```

The current package includes the local platform `.node` binary directly. Split
platform-specific optional packages can be added later once the prebuild matrix
is stable.

## Session Threading

The current Node wrapper serializes calls at the TypeScript runtime layer. The
future production model is one dedicated native GCI thread per session with a
queue from JavaScript into that thread. That should land as a separate native
architecture change because it affects login, logout, cancellation, error
propagation, and addon shutdown semantics. See `docs/native-architecture.md`
for the Rust-side error mapping and session-thread design notes.
