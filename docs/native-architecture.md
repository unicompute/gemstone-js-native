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
around one or two read-only calls, followed by session-bound `executeStr()` and
`perform()` queue paths, same-thread error reads, and export-set retain/release
plus transaction reset/status and allocation/symbol-resolution calls before the
full JavaScript API is moved onto it.

### Current Spike

The `session-thread-spike` Cargo feature now compiles an
`ExperimentalGciThreadWorker`. The worker owns a background Rust thread and
routes read-only `library_path()`, `fetch_size()`, `fetch_class()`, and
`fetch_bytes()` requests through a channel before replying to the caller. It
also has queued
`execute_str()`, `perform()`, `err()`, `init()`, `encrypt()`, `set_net()`,
`login_ex()`, `logout()`, and export-set retain/release paths as the first
session-bound call shapes, along with queued `commit()`, `abort()`,
`needs_commit()`, `in_transaction()`, `get_session_id()`, `set_session_id()`,
`flt_to_oop()`, `oop_to_flt()`, symbol/string dictionary lookup/update calls,
`new_string()`, `new_symbol()`, `new_oop()`, and `resolve_symbol()` calls. The
live worker arm calls
`GciFetchSize_`, `GciFetchClass_`, `GciFetchBytes_`, `GciExecuteStr_`,
`GciPerform_`, `GciErr_`, float conversion, dictionary functions, transaction
and allocation functions, and optional export-set symbols on the worker thread;
the feature test uses synthetic auth/lifecycle, readback, execution, perform,
error, session id, float, dictionary, transaction, and allocation data to verify
the queue and reply path from a different OS thread without requiring a live
Stone or a loadable GCI library.

This deliberately avoids changing the JavaScript API. It is only a native
architecture slice that validates the queue/thread/drop shape before moving
the remaining session-bound operations onto the worker.
