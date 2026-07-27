import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR = path.join(os.homedir(), ".agentcli");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const INPUT_HISTORY_PATH = path.join(DATA_DIR, "input_history");
const MAX_SESSIONS = 100;
const MAX_INPUT_HISTORY = 500;

function ensureDirs() {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function newSessionId() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function sessionTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  const text = (first?.content || "(kosong)").replace(/\s+/g, " ").trim();
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

export function saveSession(state) {
  if (!state.history.length) return;
  ensureDirs();
  const file = path.join(SESSIONS_DIR, `${state.sessionId}.json`);
  const data = {
    id: state.sessionId,
    title: sessionTitle(state.history),
    createdAt: state.sessionCreatedAt,
    updatedAt: new Date().toISOString(),
    model: state.config.model,
    workdir: state.workdir,
    messages: state.history,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  pruneSessions();
}

function pruneSessions() {
  const files = listSessionFiles();
  for (const f of files.slice(MAX_SESSIONS)) {
    try {
      fs.unlinkSync(f.file);
    } catch {
      // biarin
    }
  }
}

function listSessionFiles() {
  ensureDirs();
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const file = path.join(SESSIONS_DIR, f);
      return { file, mtime: fs.statSync(file).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime); // terbaru dulu
}

export function listSessions() {
  const sessions = [];
  for (const { file } of listSessionFiles()) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      sessions.push({
        id: data.id,
        title: data.title || "(tanpa judul)",
        updatedAt: data.updatedAt,
        model: data.model,
        turns: (data.messages || []).filter((m) => m.role === "user" && !m.content.startsWith("Hasil tool ")).length,
      });
    } catch {
      // file rusak, skip
    }
  }
  return sessions;
}

export function loadSession(id) {
  const file = path.join(SESSIONS_DIR, `${id}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return data;
}

export function latestSessionId() {
  const files = listSessionFiles();
  if (!files.length) return null;
  return path.basename(files[0].file, ".json");
}

export function deleteSession(id) {
  try {
    fs.unlinkSync(path.join(SESSIONS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

// ---- history input readline (panah atas antar sesi) ----

export function loadInputHistory() {
  try {
    return fs
      .readFileSync(INPUT_HISTORY_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .reverse(); // readline expects newest-first
  } catch {
    return [];
  }
}

export function appendInputHistory(line) {
  if (!line.trim()) return;
  try {
    ensureDirs();
    fs.appendFileSync(INPUT_HISTORY_PATH, line + "\n");
    // pangkas kalau kepanjangan
    const lines = fs.readFileSync(INPUT_HISTORY_PATH, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_INPUT_HISTORY) {
      fs.writeFileSync(INPUT_HISTORY_PATH, lines.slice(-MAX_INPUT_HISTORY).join("\n") + "\n");
    }
  } catch {
    // non-fatal
  }
}

export { SESSIONS_DIR };
