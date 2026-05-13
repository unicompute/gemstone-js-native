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
npm run test:node
npm run pack:check
npm pack --json
```

The workflow uploads the `.node` file and npm tarball as GitHub Actions
artifacts so the package contents can be inspected before publishing.

## Publish Checklist

1. Verify `package.json` and `Cargo.toml` version, license, homepage,
   repository, and description match.
2. Run `npm run pack:check` locally after `npm run build`.
3. Review the workflow tarball artifact contents.
4. Publish with provenance:

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
propagation, and addon shutdown semantics.
