# YanLan Codex 🚀

**YanLan Codex** adalah AI coding assistant berbasis CLI yang powerful, dirancang untuk membantu Anda ngoding, analisa, dan kelola project langsung dari terminal. Dibuat khusus untuk bekerja layaknya *Senior Developer*, YanLan Codex punya akses ke 14 tools (bash, file system, internet, git, dll) dan fully support streaming real-time dengan smart reasoning.

**Dev:** Xiao Yan Dev · Always Codex · Lann

---

## ✨ Fitur Utama
- **14 Smart Tools:** File ops, bash, internet search, git auto-context, regex grep.
- **Auto Project Context:** Langsung mengenali struktur project, tech stack (Node.js, Python, Go, dll), package dependencies, dan status Git Anda.
- **Smart Reasoning UI:** Jika AI model menggunakan *thinking process* (seperti DeepSeek-R1 atau Qwen-Max), reasoning akan disembunyikan dalam spinner elegan agar output tetap rapi.
- **Session History:** Simpan, lanjutkan, atau hapus riwayat sesi percakapan dengan mudah lewat UI interaktif di terminal.
- **Auto-Summarize:** Tidak perlu khawatir context window penuh; riwayat obrolan panjang otomatis diringkas (summarized) tanpa menghilangkan konteks penting!
- **Cross-Platform:** Jalan mulus di Windows, macOS, dan Linux.

---

## 💻 Instalasi

Karena ini dibuat dengan Node.js (Syarat: Node.js >= 18), instalasinya sangat mudah di semua OS (Windows, Linux, macOS).

### Opsi 1: Install Langsung (Paling Gampang)
Anda bisa langsung menginstallnya secara global lewat GitHub:
```bash
npm install -g git+https://github.com/DrizzStore01/YannLannCodex.git
```

### Opsi 2: Clone & Link (Untuk Developer/Kontributor)
```bash
git clone https://github.com/DrizzStore01/YannLannCodex.git
cd YannLannCodex
npm install
npm link
```

Setelah terinstall, Anda bisa memanggil AI ini dari mana saja menggunakan salah satu perintah berikut:
- `codex` 🔥 (Rekomendasi)
- `yanlan`
- `ylc`
- `agentcli`

---

## 🚀 Cara Penggunaan

Buka terminal di dalam folder project Anda, lalu jalankan:

```bash
# Mode Interaktif (Chat / REPL)
codex

# Mode One-shot (Kasi perintah langsung dari command line)
codex "Tolong buatkan script backup database MySQL"

# Lanjutkan percakapan sebelumnya
codex -c

# Auto-approve semua tool (Hati-hati, AI bisa langsung eksekusi script bash!)
codex --yolo
```

### Konfigurasi API Key
Saat pertama kali masuk, Anda harus memasukkan API Key. Di dalam terminal interaktif `codex`, ketik perintah ini:
```
/key KODE_API_KEY_ANDA
```
API Key dan konfigurasi lainnya akan tersimpan aman di `~/.agentcli.json` (bisa juga di-set lewat environment variable `AGENTCLI_API_KEY`).

### Perintah Slash (Slash Commands)
Ketik `/` di prompt untuk memunculkan menu perintah bawaan:
- `/help` — Tampilkan panduan penggunaan.
- `/model` — Pilih model dari menu interaktif (contoh: `qwen3.7-plus`).
- `/history` — Pilih & lanjutkan sesi percakapan lama dari menu.
- `/clear` — Mulai sesi baru (riwayat aktif dihapus).
- `/config` — Lihat konfigurasi aktif.
- `/exit` — Keluar dari aplikasi.

---

## 🛠️ Tools & Kemampuan

YanLan Codex bekerja secara agen (Agentic AI) dengan alur: **Analisis → Riset → Rencana → Eksekusi → Verifikasi → Selesai**. 

Berikut daftar tool yang dimiliki YanLan Codex:

| Tool | Fungsi | Butuh Izin (Approval)? |
|---|---|---|
| `bash` | Jalankan perintah shell apa saja | ✅ Ya |
| `read_file` / `list_dir` | Baca isi file dan struktur folder | ❌ Auto |
| `write_file` / `edit_file` | Tulis/Buat file baru atau edit sebagian baris kode | ✅ Ya |
| `grep_search` | Cari pattern spesifik di banyak file sekaligus | ❌ Auto |
| `web_search` / `fetch_url` | Cari error/dokumentasi di Google dan baca isi web statis | ❌ Auto |
| `scrape_dynamic` | Render JavaScript & sikat web dinamis (React, Vue, Anime site) | ❌ Auto |
| `screenshot_web` | Tangkap screenshot tampilan web ke file image | ❌ Auto |
| `git_status` / `git_diff` | Cek status perubahan Git di project | ❌ Auto |
| `git_log` / `git_commit` | Cek riwayat commit dan buat commit baru | ❌ Auto / ✅ Ya |
| `delegate_task` | Mandatkan sub-tugas ke Sub-Agent AI independen | ❌ Auto |
| `think` | Scratchpad / mikir internal sebelum eksekusi besar | ❌ Auto |

### 🔌 Konfigurasi MCP (Model Context Protocol)
YanLan Codex mendukung integrasi MCP Server secara native. Cukup buat file `~/.agentcli/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```
Saat CLI dijalankan, semua tool dari MCP Server akan otomatis terdeteksi dan bisa digunakan oleh AI!

---

## ⚙️ Limit & Konfigurasi Lanjutan
YanLan Codex sudah di-tune untuk project berskala *Medium-High*. Konfigurasi default:
- **Max Tool Output:** 16.000 karakter (Aman buat baca log panjang/diff).
- **Max Steps Per Turn:** 25 steps (AI bisa mikir dan ngoding otomatis 25 kali berturut-turut tanpa disuruh ulang).
- **Summarize Threshold:** 60.000 karakter. Jika lebih, riwayat masa lalu otomatis dijadikan ringkasan padat tanpa merusak konteks agar token hemat.

---
**Happy Coding! Biarkan YanLan Codex yang mikir, Anda yang ngopi ☕**
