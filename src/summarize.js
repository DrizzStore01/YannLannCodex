import { chatCompletion } from "./api.js";

export function historySize(history) {
  return history.reduce((n, m) => n + m.content.length, 0);
}

const SUMMARY_MARKER = "[Ringkasan percakapan sebelumnya]";

/**
 * Kalau riwayat sudah melewati config.summarizeThreshold (dalam karakter),
 * ringkas pesan-pesan lama jadi satu blok, pertahankan config.summarizeKeep
 * pesan terakhir apa adanya. Return info {before, after} kalau meringkas,
 * false kalau tidak perlu. Lempar error kalau API summarize gagal.
 */
export async function maybeSummarize(state) {
  const cfg = state.config;
  const before = historySize(state.history);
  if (before < cfg.summarizeThreshold) return false;

  const keep = Math.max(2, cfg.summarizeKeep);
  if (state.history.length <= keep + 2) return false;

  const old = state.history.slice(0, -keep);
  const recent = state.history.slice(-keep);

  let transcript = old
    .map((m) => `${m.role === "assistant" ? "Asisten" : "User"}: ${m.content}`)
    .join("\n\n");
  // Jaga-jaga: transkrip yang mau diringkas pun jangan kegedean buat sekali request
  const cap = cfg.summarizeThreshold * 2;
  if (transcript.length > cap) {
    const half = Math.floor(cap / 2);
    transcript =
      transcript.slice(0, half) +
      "\n\n... [bagian tengah dipotong] ...\n\n" +
      transcript.slice(-half);
  }

  const prompt = [
    "Ringkas percakapan antara user dan AI coding agent berikut menjadi catatan konteks yang padat.",
    "WAJIB dipertahankan: tujuan user, keputusan yang sudah diambil, fakta penting (path file, nama, angka, kode, perintah), hasil tool yang relevan, dan status tugas terakhir.",
    "Tulis dalam bahasa Indonesia, maksimal ~300 kata, format poin-poin. Jangan tambahkan basa-basi.",
    "",
    "=== PERCAKAPAN ===",
    transcript,
  ].join("\n");

  const summary = await chatCompletion(cfg, [{ role: "user", content: prompt }]);

  state.history = [
    { role: "user", content: `${SUMMARY_MARKER}\n${summary.trim()}` },
    { role: "assistant", content: "Oke, konteks dari ringkasan sudah gue pahami. Lanjut." },
    ...recent,
  ];

  return { before, after: historySize(state.history) };
}
