import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_PATH = path.join(os.homedir(), ".agentcli.json");

const DEFAULTS = {
  baseUrl: "https://api.alwayscodex.my.id/api/v4",
  apikey: "agent",
  model: "qwen3.7-plus",
  requestTimeout: 120_000,
  bashTimeout: 120_000,
  maxToolOutput: 16000,
  maxStepsPerTurn: 25,
  summarizeThreshold: 60_000, // karakter riwayat sebelum auto-summarize
  summarizeKeep: 8, // jumlah pesan terakhir yang dibiarkan utuh
};

export function loadConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // config file opsional
  }

  const env = process.env;
  return {
    ...DEFAULTS,
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
  const next = { ...current, ...partial };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n");
  return CONFIG_PATH;
}

export { CONFIG_PATH };
