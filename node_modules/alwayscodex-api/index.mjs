/**
 * @file index.mjs
 * ES Module (ESM) entry point wrapper for alwayscodex-api
 */
import exportedCodex from './src/client.js';

export const codex = exportedCodex;
export const AlwaysCodex = exportedCodex.AlwaysCodex;
export const AlwaysCodexError = exportedCodex.AlwaysCodexError;
export default exportedCodex;
