// Tes live auto-summarize: riwayat panjang berisi fakta penting di bagian lama,
// ringkas via API asli, lalu verifikasi faktanya masih bisa dijawab model.
import { loadConfig } from "../src/config.js";
import { maybeSummarize, historySize } from "../src/summarize.js";
import { chatCompletion } from "../src/api.js";

const config = loadConfig();
const state = { config, history: [] };

// Fakta penting di awal percakapan (bagian yang bakal diringkas)
state.history.push({
  role: "user",
  content:
    "Gue lagi setup project. Catat ya: kode proyek adalah MANGGA77 dan server harus jalan di port 4321.",
});
state.history.push({ role: "assistant", content: "Oke, dicatat: kode proyek MANGGA77, port 4321." });

// Padding obrolan panjang biar lewat threshold
const filler =
  "Ini diskusi teknis panjang soal refactoring, struktur folder, penamaan variabel, dan hal-hal lain yang tidak terlalu penting untuk diingat jangka panjang. ";
for (let i = 0; i < 12; i++) {
  state.history.push({ role: "user", content: `Pertanyaan ke-${i}: ${filler.repeat(10)}` });
  state.history.push({ role: "assistant", content: `Jawaban ke-${i}: ${filler.repeat(10)}` });
}

const before = historySize(state.history);
console.log(`Ukuran riwayat awal: ${before} chars (${state.history.length} pesan)`);

const result = await maybeSummarize(state);
if (!result) {
  console.log("FAIL: tidak meringkas padahal harusnya iya");
  process.exit(1);
}
console.log(`Diringkas: ${result.before} -> ${result.after} chars (${state.history.length} pesan)`);
console.log("--- ringkasan:\n" + state.history[0].content.slice(0, 600) + "\n---");

// Verifikasi: tanya fakta yang cuma ada di bagian yang diringkas
state.history.push({ role: "user", content: "Kode proyek dan port server yang tadi gue sebut apa? Jawab singkat." });
const reply = await chatCompletion(config, state.history);
console.log("Jawaban model:", reply);

const ok = /MANGGA77/i.test(reply) && /4321/.test(reply);
console.log(ok ? "\nTes auto-summarize LULUS ✔" : "\nFAIL: fakta hilang dari ringkasan ✘");
process.exit(ok ? 0 : 1);
