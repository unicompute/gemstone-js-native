"use strict";

const { Worker } = require("node:worker_threads");
const { join } = require("node:path");

const GCI_SESSION_WORKER_METHODS = [
  "init",
  "libraryPath",
  "encrypt",
  "setNet",
  "loginEx",
  "logout",
  "commit",
  "abort",
  "err",
  "executeStr",
  "perform",
  "newString",
  "newSymbol",
  "newOop",
  "resolveSymbol",
  "fetchClass",
  "fetchSize",
  "fetchBytes",
  "getSessionId",
  "setSessionId",
  "needsCommit",
  "inTransaction",
  "fltToOop",
  "oopToFlt",
  "symDictAt",
  "symDictAtPut",
  "symDictAtObjPut",
  "strKeyValueDictAt",
  "strKeyValueDictAtPut",
  "addOopToExportSet",
  "removeOopFromExportSet",
];

class GciSessionWorker {
  #closed = false;
  #nextId = 1;
  #pending = new Map();
  #worker;

  constructor(libPath = null) {
    this.#worker = new Worker(join(__dirname, "session-worker-thread.js"), {
      workerData: { libPath },
    });
    this.#worker.on("message", (message) => this.#handleMessage(message));
    this.#worker.on("error", (error) => this.#failAll(error));
    this.#worker.on("exit", (code) => {
      if (!this.#closed && code !== 0) {
        this.#failAll(new Error(`GciSessionWorker exited with code ${code}.`));
      } else {
        this.#failAll(new Error("GciSessionWorker closed before replying."));
      }
    });
  }

  call(method, args = []) {
    if (this.#closed) {
      return Promise.reject(new Error(`GciSessionWorker is closed before ${method} could be queued.`));
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { method, resolve, reject });
      this.#worker.postMessage({ id, method, args });
    });
  }

  async close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#requestClose();
    } finally {
      await this.#worker.terminate().catch(() => undefined);
      this.#failAll(new Error("GciSessionWorker closed."));
    }
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }

  #requestClose() {
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending.set(id, { method: "__close", resolve, reject: resolve });
      this.#worker.postMessage({ id, method: "__close", args: [] });
    });
  }

  #handleMessage(message) {
    const pending = this.#pending.get(message?.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.ok) {
      pending.resolve(decodeWorkerValue(message.result));
    } else {
      pending.reject(deserializeWorkerError(message.error, pending.method));
    }
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

for (const method of GCI_SESSION_WORKER_METHODS) {
  Object.defineProperty(GciSessionWorker.prototype, method, {
    configurable: true,
    writable: true,
    value: function queuedGciSessionWorkerMethod(...args) {
      return this.call(method, args);
    },
  });
}

function createGciSessionWorker(libPath = null) {
  return new GciSessionWorker(libPath);
}

function decodeWorkerValue(value) {
  if (value && value.__gemstoneNativeType === "Buffer") {
    return Buffer.from(value.data);
  }
  return value;
}

function deserializeWorkerError(serialized, operation) {
  const error = new Error(serialized?.message ?? `GciSessionWorker ${operation} failed.`);
  if (serialized && typeof serialized === "object") {
    for (const [key, value] of Object.entries(serialized)) {
      if (key !== "message") error[key] = value;
    }
  }
  if (!error.operation) error.operation = operation;
  return error;
}

module.exports.GciSessionWorker = GciSessionWorker;
module.exports.createGciSessionWorker = createGciSessionWorker;
module.exports.GCI_SESSION_WORKER_METHODS = GCI_SESSION_WORKER_METHODS;
