import crypto from "node:crypto";
import os from "node:os";

// Key statis untuk enkripsi default value di source code (biar ga keliatan di GitHub public)
const APP_SEED = "YanLanCodexStaticKey2026SecretAppKey";
const STATIC_KEY = crypto.createHash("sha256").update(APP_SEED).digest();
const STATIC_IV = Buffer.from("123456789012", "utf8");

// Key spesifik mesin/user untuk enkripsi file ~/.agentcli.json di lokal
function getMachineKey() {
  let userIdent = "default_user";
  try {
    userIdent = os.userInfo().username;
  } catch {
    // fallback jika os.userInfo() gagal
  }
  const seed = `${os.hostname()}:${userIdent}:${os.homedir()}:YanLanCodexMachineKeySalt2026`;
  return crypto.createHash("sha256").update(seed).digest();
}

/**
 * Enkripsi teks lokal untuk disimpan ke ~/.agentcli.json (Machine-Bound)
 */
export function encryptLocal(text) {
  if (!text || typeof text !== "string") return text;
  if (text.startsWith("enc:v1:") || text.startsWith("enc:static:")) return text;
  
  try {
    const key = getMachineKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(text, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `enc:v1:${iv.toString("hex")}:${tag}:${enc}`;
  } catch {
    return text; // fallback jika crypto gagal
  }
}

/**
 * Dekripsi teks lokal yang dibaca dari ~/.agentcli.json
 */
export function decryptLocal(cipherText) {
  if (!cipherText || typeof cipherText !== "string") return cipherText;
  
  // Jika ini static secret bawaan app
  if (cipherText.startsWith("enc:static:")) {
    return decryptStatic(cipherText);
  }
  
  // Jika tidak berawalan enc:v1:, berarti plain text lama (backward compatibility)
  if (!cipherText.startsWith("enc:v1:")) return cipherText;

  try {
    const parts = cipherText.split(":");
    if (parts.length < 5) return cipherText;
    const iv = Buffer.from(parts[2], "hex");
    const tag = Buffer.from(parts[3], "hex");
    const enc = parts[4];
    const key = getMachineKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let str = decipher.update(enc, "hex", "utf8");
    str += decipher.final("utf8");
    return str;
  } catch {
    // Jika gagal dekripsi (misal file dikopi ke laptop lain), kembalikan kosong/string asli
    return cipherText;
  }
}

/**
 * Enkripsi nilai default statis untuk source code
 */
export function encryptStatic(text) {
  if (!text || typeof text !== "string") return text;
  const cipher = crypto.createCipheriv("aes-256-gcm", STATIC_KEY, STATIC_IV);
  let enc = cipher.update(text, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `enc:static:${tag}:${enc}`;
}

/**
 * Dekripsi nilai default statis di source code
 */
export function decryptStatic(cipherText) {
  if (!cipherText || typeof cipherText !== "string") return cipherText;
  if (!cipherText.startsWith("enc:static:")) return cipherText;

  try {
    const parts = cipherText.split(":");
    const tag = Buffer.from(parts[2], "hex");
    const enc = parts[3];
    const decipher = crypto.createDecipheriv("aes-256-gcm", STATIC_KEY, STATIC_IV);
    decipher.setAuthTag(tag);
    let str = decipher.update(enc, "hex", "utf8");
    str += decipher.final("utf8");
    return str;
  } catch {
    return cipherText;
  }
}

/**
 * Sensor / Masking API key atau sensitive URL agar aman saat ditampilkan di layar / logs
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "****";
  if (secret.length <= 6) return secret[0] + "***" + secret.slice(-1);
  return secret.slice(0, 3) + "*".repeat(Math.min(16, secret.length - 6)) + secret.slice(-3);
}
