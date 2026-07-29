import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { c } from "./ui.js";

const USAGE_FILE = path.join(os.homedir(), ".agentcli", "usage.json");
const PUBLIC_DAILY_LIMIT = 50; // Batas 50 request per hari untuk semua pengguna publik/gratis

/**
 * Cek dan hitung penggunaan request harian:
 * - HANYA key 'agent' (Secret Admin Dev Key) yang UNLIMITED.
 * - Semua key lainnya (termasuk key publik gratisan yang di-share di GitHub/README) = LIMITED 50/hari.
 */
export function checkAndTrackUsage(apikey) {
  const k = (apikey || "").trim().toLowerCase();

  // HANYA key 'agent' milik Admin/Dev yang UNLIMITED ♾️
  if (k === "agent") {
    return { allowed: true, isPublic: false };
  }

  // Semua pengguna publik / gratisan = LIMITED (50 request/hari)
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
  const k = (apikey || "").trim().toLowerCase();
  if (k === "agent") {
    return { isPublic: false, message: "Unlimited ♾️ [Secret Admin Dev Key]" };
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
    message: `Pengguna Publik Gratis: ${count}/${PUBLIC_DAILY_LIMIT} request terpakai hari ini (Sisa: ${remaining})`,
  };
}
