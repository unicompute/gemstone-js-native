"use strict";

const candidates = [
  "./gemstone_js_native.node",
  "./gemstone-js-native.node",
  "./index.node",
];

let lastError;
for (const candidate of candidates) {
  try {
    module.exports = require(candidate);
    return;
  } catch (error) {
    lastError = error;
  }
}

throw lastError || new Error("Cannot load @gemstone-js/native binary.");
