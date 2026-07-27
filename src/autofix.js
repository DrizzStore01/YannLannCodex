import { exec } from "node:child_process";
import { promisify } from "node:util";
import { c, panel, spinner } from "./ui.js";
import { agentTurn } from "./agent.js";

const execAsync = promisify(exec);

export async function runAutoFix(rl, state, command, maxRetries = 5) {
  if (!command) {
    console.log(c.red("Penggunaan: /fix <perintah bash>"));
    console.log(c.dim("Contoh: /fix npm test"));
    return false;
  }

  console.log(c.magenta(`\n🚀 [GOD MODE] Memulai Auto-Fix untuk: ${c.bold(command)}\n`));
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const sp = spinner(`Menjalankan "${command}" (Percobaan ${attempt}/${maxRetries})...`);
    let output = "";
    let success = false;
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: state.workdir, timeout: 60000 });
      output = (stdout + "\n" + stderr).trim();
      success = true;
    } catch (e) {
      output = (e.stdout + "\n" + e.stderr + "\n" + e.message).trim();
    }
    sp.stop();
    
    if (success) {
      panel("✅ Auto-Fix Lulus!", `Perintah berhasil tanpa error di percobaan ke-${attempt}.`, c.green);
      if (output) console.log(c.dim(output.slice(0, 1000) + (output.length > 1000 ? "..." : "")));
      return true;
    }
    
    panel(`❌ Gagal (Percobaan ${attempt}/${maxRetries})`, output.slice(-2000), c.red);
    
    if (attempt === maxRetries) {
      console.log(c.yellow(`\n⚠️ Batas retries (${maxRetries}x) tercapai. Auto-Fix menyerah.`));
      return false;
    }
    
    console.log(c.magenta(`\n🤖 AI mengambil alih. Menganalisa dan memperbaiki kode...`));
    
    const prompt = `[AUTO-FIX MODE] Saya menjalankan perintah verifikasi berikut:\n\`\`\`bash\n${command}\n\`\`\`\nDan mendapatkan error/kegagalan berikut:\n\`\`\`\n${output.slice(-4000)}\n\`\`\`\nTugas Anda: analisis error ini, periksa file terkait (read_file / grep_search), lalu perbaiki kode sumber agar perintah tersebut lulus (gunakan edit_file atau write_file). Jika sudah selesai, panggil task_done dengan ringkasan apa saja yang diperbaiki.`;
    
    // Paksa mode auto-approve (YOLO) biar jalan otomatis tanpa nanya-nanya (God Mode)
    const originalYolo = state.autoApprove;
    state.autoApprove = true; 
    
    try {
      await agentTurn(rl, state, prompt);
    } finally {
      state.autoApprove = originalYolo;
    }
    
    console.log(c.dim(`\nSelesai memperbaiki. Memverifikasi ulang...\n`));
  }
}
