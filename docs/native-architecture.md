# Native Architecture Notes

This document tracks the production-hardening work that should happen below the
TypeScript `SerializedGciRuntime` layer.

## Rust-Side Error Mapping

The current package patches the generated napi-rs loader so JavaScript callers
receive a stable `GemStoneNativeError` shape with:

- `code: "GEMSTONE_GCI_ERROR"`
- `operation`
- optional `GciErr` number, fatal flag, message, reason, category, context,
  exception object, and argument OOPs

That patch keeps the public surface stable, but the long-term implementation
should move this mapping closer to the Rust/N-API boundary:

1. Add a Rust helper that builds a structured napi error for each GCI operation.
2. Include the operation name at the Rust call site before returning to JS.
3. Read `GciErr` while still on the owning GCI session thread.
4. Preserve the current JavaScript fields so existing callers and
   `isGemStoneNativeError()` keep working.
5. Keep the loader patch only as a compatibility shim until generated bindings
   can expose the same shape directly.

The migration is complete when `scripts/patch-loader.mjs` no longer needs to
wrap `Gci` prototype methods to attach error metadata.

## Dedicated Session Thread Model

GCI calls are session-sensitive and should eventually run on one dedicated OS
thread per logged-in session. The TypeScript runtime already serializes calls,
but that does not guarantee native thread affinity.

Target model:

1. `Gci` owns a worker thread after `init()`/login.
2. Public napi methods enqueue operation requests into that worker.
3. The worker performs all GCI calls for the session, including `err()`,
   export-set retain/release, logout, and shutdown.
4. JavaScript receives promises resolved by napi thread-safe functions.
5. Fatal GCI errors mark the session closed and reject queued work.
6. Logout drains or cancels pending work, releases retained state, and joins the
   worker thread.

Open design questions:

- Whether `Gci` should be split into a synchronous low-level binding and an
  async session wrapper.
- How cancellation should interact with GCI calls that are already executing.
- Whether export-set operations should be coalesced while queued.
- How to expose session-thread diagnostics in smoke tests without requiring a
  live Stone.

The first implementation slice should be a feature-gated worker-thread wrapper
around one or two read-only calls, followed by `executeStr()` and `perform()`
once error mapping has moved into Rust.

### Current Spike

The `session-thread-spike` Cargo feature now compiles an
`ExperimentalGciThreadWorker`. The worker owns a background Rust thread and
routes read-only `library_path()`, `fetch_size()`, and `fetch_class()` requests
through a channel before replying to the caller. The live worker arm calls
`GciFetchSize_` and `GciFetchClass_` on the worker thread; the feature test uses
synthetic readback data to verify the queue and reply path from a different OS
thread without requiring a live Stone or a loadable GCI library.

This deliberately avoids changing the JavaScript API. It is only a native
architecture slice that validates the queue/thread/drop shape before moving
more session-bound operations such as `executeStr()`, `perform()`, `err()`, and
export-set retain/release onto the worker.
