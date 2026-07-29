import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { c } from "./ui.js";

const USAGE_FILE = path.join(os.homedir(), ".agentcli", "usage.json");
const PUBLIC_DAILY_LIMIT = 50; // Batas 50 request per hari untuk pengguna publik

// Daftar Key Resmi & Prefix yang diizinkan Admin untuk Unlimited / Member Access:
const AUTHORIZED_KEYS = ["agent", "member", "codex-member", "ylc-member"];

export function isUnlimitedKey(key) {
  if (!key || typeof key !== "string") return false;
  const k = key.trim().toLowerCase();
  if (AUTHORIZED_KEYS.includes(k)) return true;
  if (k.startsWith("ylc-") || k.startsWith("codex-") || k.startsWith("admin-") || k.startsWith("member-")) return true;
  return false;
}

/**
 * Cek dan hitung penggunaan request harian untuk key publik
 */
export function checkAndTrackUsage(apikey) {
  // Jika menggunakan Key Resmi Admin / Member yang terotorisasi = UNLIMITED ♾️
  if (isUnlimitedKey(apikey)) {
    return { allowed: true, isPublic: false };
  }

  // Jika menggunakan Key 'public' atau key biasa tanpa izin admin = LIMITED 50/hari
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let data = { date: today, count: 0 };

  try {
    if (fs.existsSync(USAGE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
      if (raw.date === today) {
        data = raw;
      }
    }
  } catch {
    // abaikan jika file rusak
  }

  if (data.count >= PUBLIC_DAILY_LIMIT) {
    return {
      allowed: false,
      isPublic: true,
      count: data.count,
      limit: PUBLIC_DAILY_LIMIT,
    };
  }

  data.count += 1;

  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // abaikan jika gagal tulis disk
  }

  return {
    allowed: true,
    isPublic: true,
    count: data.count,
    limit: PUBLIC_DAILY_LIMIT,
  };
}

/**
 * Dapatkan status kuota harian saat ini
 */
export function getUsageStatus(apikey) {
  if (isUnlimitedKey(apikey)) {
    const k = (apikey || "").trim().toLowerCase();
    const role = k === "agent" ? "Admin Dev Key" : "Member Authorized Key";
    return { isPublic: false, message: `Unlimited ♾️ [${role}]` };
  }

  const today = new Date().toISOString().split("T")[0];
  let count = 0;
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
      if (raw.date === today) count = raw.count || 0;
    }
  } catch {}

  const remaining = Math.max(0, PUBLIC_DAILY_LIMIT - count);
  return {
    isPublic: true,
    count,
    limit: PUBLIC_DAILY_LIMIT,
    remaining,
    message: `Publik Gratis: ${count}/${PUBLIC_DAILY_LIMIT} request terpakai hari ini (Sisa: ${remaining})`,
  };
}
