"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const native = require("./index.js");
const { GCI_SESSION_WORKER_METHODS } = require("./session-worker.js");

const allowedMethods = new Set(GCI_SESSION_WORKER_METHODS);
let gci;

parentPort.on("message", (message) => {
  const { id, method, args } = message;
  try {
    if (method === "__close") {
      closeGci();
      parentPort.postMessage({ id, ok: true });
      parentPort.close();
      return;
    }
    if (!allowedMethods.has(method)) {
      throw Object.assign(new Error(`Unsupported GciSessionWorker method: ${method}`), {
        code: "GEMSTONE_SESSION_WORKER_ERROR",
        operation: method,
      });
    }
    const result = ensureGci()[method](...(args ?? []));
    parentPort.postMessage({ id, ok: true, result: encodeWorkerValue(result) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: serializeWorkerError(error, method) });
  }
});

function ensureGci() {
  if (!gci) gci = new native.Gci(workerData?.libPath ?? null);
  return gci;
}

function closeGci() {
  if (!gci) return;
  try {
    gci.logout();
  } catch {}
  gci = undefined;
}

function encodeWorkerValue(value) {
  if (Buffer.isBuffer(value)) {
    return {
      __gemstoneNativeType: "Buffer",
      data: Array.from(value),
    };
  }
  return value;
}

function serializeWorkerError(error, operation) {
  const serialized = {
    message: String(error?.message ?? error),
    operation: error?.operation ?? operation,
  };
  for (const key of [
    "code",
    "nativeCode",
    "gciNumber",
    "fatal",
    "gciMessage",
    "reason",
    "category",
    "context",
    "exceptionObj",
    "args",
    "info",
  ]) {
    if (error && Object.prototype.hasOwnProperty.call(error, key)) {
      serialized[key] = error[key];
    }
  }
  return serialized;
}
