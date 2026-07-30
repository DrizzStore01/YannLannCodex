import { execFileSync } from "node:child_process";
import { c } from "./ui.js";

const GITHUB_RAW_PKG = "https://raw.githubusercontent.com/DrizzStore01/YannLannCodex/main/package.json";
const REPO_URL = "git+https://github.com/DrizzStore01/YannLannCodex.git";

/**
 * Cek update secara otomatis dari GitHub di background saat CLI dibuka
 */
export async function checkAutoUpdate(currentVersion) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500); // 3.5 detik timeout agar tidak memperlambat startup

    const res = await fetch(GITHUB_RAW_PKG, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const remotePkg = await res.json();
    const latestVersion = remotePkg.version || "0.1.0";

    if (latestVersion !== currentVersion) {
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
      };
    }
  } catch {
    // Abaikan jika offline / timeout
  }
  return { hasUpdate: false };
}

/**
 * Jalankan update otomatis via npm install -g
 */
export function performUpdate() {
  console.log(c.cyan("\n🔄 Mengunduh dan meng-update YanLan Codex dari GitHub..."));
  try {
    execFileSync("npm", ["install", "-g", REPO_URL], { stdio: "inherit" });
    console.log(c.green("\n✅ YanLan Codex berhasil diperbarui! Silakan buka kembali CLI.\n"));
    return true;
  } catch (e) {
    console.log(c.red(`\n❌ Gagal update: ${e.message}\n`));
    return false;
  }
}
