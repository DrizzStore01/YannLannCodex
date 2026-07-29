/**
 * @file index.js
 * CommonJS (CJS) entry point wrapper for alwayscodex-api
 */
const exportedCodex = require('./src/client.js');
exportedCodex.codex = exportedCodex;
module.exports = exportedCodex;
