import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encryptLocal, decryptLocal, decryptStatic } from "./security.js";

const CONFIG_PATH = path.join(os.homedir(), ".agentcli.json");

// Default value ter-enkripsi untuk GitHub Publik:
// baseUrl = https://api.alwayscodex.my.id/api/v4
// apikey = public (Key Publik Gratisan)
const DEFAULTS_ENCRYPTED = {
  baseUrl: "enc:static:d8284eb1c1202c5b1f81dbb4ea87ee00:eabb470e7d3ffd0feb2b0cd02745b0ffd216fdf522b07348a7a2cc6f64f2e4801578e177",
  apikey: "enc:static:d26176d74ee962bb0cfb77342d03985f:f2ba51126766", // decrypts to "public"
  model: "qwen3.7-plus",
  requestTimeout: 120_000,
  bashTimeout: 120_000,
  maxToolOutput: 16000,
  maxStepsPerTurn: 25,
  summarizeThreshold: 60_000,
  summarizeKeep: 8,
};

export function loadConfig() {
  let rawFileConfig = {};
  try {
    rawFileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // config file opsional
  }

  const fileConfig = {
    ...rawFileConfig,
    ...(rawFileConfig.apikey ? { apikey: decryptLocal(rawFileConfig.apikey) } : {}),
    ...(rawFileConfig.baseUrl ? { baseUrl: decryptLocal(rawFileConfig.baseUrl) } : {}),
  };

  const defaultsDecrypted = {
    ...DEFAULTS_ENCRYPTED,
    baseUrl: decryptStatic(DEFAULTS_ENCRYPTED.baseUrl),
    apikey: decryptStatic(DEFAULTS_ENCRYPTED.apikey),
  };

  const env = process.env;
  return {
    ...defaultsDecrypted,
    ...fileConfig,
    ...(env.AGENTCLI_BASE_URL ? { baseUrl: env.AGENTCLI_BASE_URL } : {}),
    ...(env.AGENTCLI_API_KEY ? { apikey: env.AGENTCLI_API_KEY } : {}),
    ...(env.AGENTCLI_MODEL ? { model: env.AGENTCLI_MODEL } : {}),
  };
}

export function saveConfig(partial) {
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // belum ada
  }

  const toSave = { ...partial };

  if (toSave.apikey && typeof toSave.apikey === "string") {
    toSave.apikey = encryptLocal(toSave.apikey);
  }
  if (toSave.baseUrl && typeof toSave.baseUrl === "string") {
    toSave.baseUrl = encryptLocal(toSave.baseUrl);
  }

  const next = { ...current, ...toSave };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
  return CONFIG_PATH;
}

export { CONFIG_PATH };
