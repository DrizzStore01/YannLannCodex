import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const TOOL_CALL_RE = /```tool_call\s*\n([\s\S]*?)```/;

export function parseToolCall(text) {
  const m = TOOL_CALL_RE.exec(text);
  if (m) {
    const before = text.slice(0, m.index).trim();
    try {
      const payload = JSON.parse(m[1].trim());
      return { before, tool: payload.tool, args: payload.args || {} };
    } catch {
      return { before, tool: "__parse_error__", args: {} };
    }
  }
  
  // Fallback XML parser (jika model bandel pakai XML)
  const xmlMatch = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/.exec(text);
  if (xmlMatch) {
    const tool = xmlMatch[1];
    const knownTools = ["bash", "read_file", "write_file", "edit_file", "list_dir", "grep_search", "web_search", "fetch_url", "think", "task_done", "git_status", "git_diff", "git_log", "git_commit", "delegate_task"];
    if (knownTools.includes(tool)) {
      const before = text.slice(0, xmlMatch.index).trim();
      const inner = xmlMatch[2];
      const args = {};
      
      // Coba parse tag <key>value</key>
      const argRe = /<([a-zA-Z0-9_]+)>([\s\S]*?)(?:<\/\1>|$)/g;
      let argMatch;
      while ((argMatch = argRe.exec(inner)) !== null) {
        args[argMatch[1]] = argMatch[2].trim().replace(/^[a-zA-Z0-9_]+>|<\/[a-zA-Z0-9_]+>$/g, ""); // Bersihin tag sisa
      }
      return { before, tool, args };
    }
  }

  return { before: text, tool: null, args: null };
}

function resolvePath(workdir, p) {
  const expanded = (p || ".").replace(/^~(?=$|\/)/, os.homedir());
  return path.normalize(path.resolve(workdir, expanded));
}

function truncate(text, max) {
  if (text.length > max) {
    return text.slice(0, max) + `\n... [terpotong, total ${text.length} chars]`;
  }
  return text;
}

export function runBash(workdir, command, { timeout, maxOutput }) {
  return new Promise((resolve) => {
    execFile(
      "bash",
      ["-c", command],
      { cwd: workdir, timeout, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && err.killed) {
          resolve(`ERROR: timeout ${Math.round(timeout / 1000)}s`);
          return;
        }
        const code = err ? err.code ?? 1 : 0;
        const out = `${stdout}${stderr}`.trim() || "(no output)";
        resolve(`exit: ${code}\n${truncate(out, maxOutput)}`);
      }
    );
  });
}

export function runReadFile(workdir, p, { maxOutput }) {
  try {
    const content = fs.readFileSync(resolvePath(workdir, p), "utf8");
    return truncate(content, maxOutput) || "(kosong)";
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

export function runWriteFile(workdir, p, content) {
  try {
    const full = resolvePath(workdir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content ?? "");
    return `OK: ${(content ?? "").length} chars -> ${full}`;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

export function runListDir(workdir, p, { maxOutput }) {
  try {
    const full = resolvePath(workdir, p);
    const entries = fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    if (!entries.length) return "(kosong)";
    return truncate(entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name)).join("\n"), maxOutput);
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

/**
 * Web search via Google — scrape hasil pencarian dari HTML.
 * Zero dependency, pakai fetch bawaan Node 18+.
 */
export async function runWebSearch(query, { maxOutput, timeout }) {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=8&hl=id`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 15000);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return `ERROR: HTTP ${resp.status}`;
    const html = await resp.text();

    // Parse hasil pencarian dari HTML Google
    const results = [];

    // Ambil snippet dari tag <div class="BNeawe"> atau pola umum lainnya
    const snippetRe = /<div class="BNeawe[^"]*"[^>]*>(.*?)<\/div>/gs;
    const linkRe = /<a href="\/url\?q=(https?:\/\/[^&"]+)/g;

    const links = [];
    let lm;
    while ((lm = linkRe.exec(html)) !== null) {
      const decoded = decodeURIComponent(lm[1]);
      if (!decoded.includes("google.com") && !links.includes(decoded)) {
        links.push(decoded);
      }
    }

    const snippets = [];
    let sm;
    while ((sm = snippetRe.exec(html)) !== null) {
      const clean = sm[1].replace(/<[^>]*>/g, "").trim();
      if (clean.length > 20 && !snippets.includes(clean)) {
        snippets.push(clean);
      }
    }

    // Gabungkan results
    const count = Math.min(links.length, 8);
    for (let i = 0; i < count; i++) {
      results.push(`[${i + 1}] ${links[i]}${snippets[i] ? "\n    " + snippets[i] : ""}`);
    }

    if (!results.length) {
      // Fallback: coba extract teks apapun yang berguna
      const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return truncate(`Hasil pencarian "${query}":\n${textContent}`, maxOutput);
    }

    return truncate(`Hasil pencarian "${query}":\n\n${results.join("\n\n")}`, maxOutput);
  } catch (e) {
    if (e.name === "AbortError") return `ERROR: timeout pencarian`;
    return `ERROR: ${e.message}`;
  }
}

/**
 * Fetch URL dan konversi HTML ke plain text yang bersih.
 * Mendukung halaman web biasa, API JSON, dan plain text.
 */
export async function runFetchUrl(url, { maxOutput, timeout }) {
  try {
    if (!url || !url.startsWith("http")) {
      return "ERROR: URL harus dimulai dengan http:// atau https://";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 15000);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/json,text/plain;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!resp.ok) return `ERROR: HTTP ${resp.status} dari ${url}`;

    const contentType = resp.headers.get("content-type") || "";
    const body = await resp.text();

    // JSON? Return formatted
    if (contentType.includes("application/json")) {
      try {
        return truncate(JSON.stringify(JSON.parse(body), null, 2), maxOutput);
      } catch {
        return truncate(body, maxOutput);
      }
    }

    // Plain text? Return langsung
    if (contentType.includes("text/plain")) {
      return truncate(body, maxOutput);
    }

    // HTML → plain text
    let text = body;
    // Hapus script, style, nav, footer, header
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    // Extract title
    const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    // Konversi tag heading jadi marker
    text = text.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, content) => {
      const clean = content.replace(/<[^>]*>/g, "").trim();
      return "\n" + "#".repeat(Number(level)) + " " + clean + "\n";
    });

    // <p>, <br>, <li> jadi newline
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<li[^>]*>/gi, "\n• ");

    // Hapus semua tag HTML sisanya
    text = text.replace(/<[^>]*>/g, " ");

    // Decode HTML entities
    text = text.replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // Rapikan whitespace
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/(\n\s*){3,}/g, "\n\n");
    text = text.trim();

    const header = title ? `Judul: ${title}\nURL: ${url}\n${"-".repeat(40)}\n\n` : `URL: ${url}\n${"-".repeat(40)}\n\n`;
    return truncate(header + text, maxOutput);
  } catch (e) {
    if (e.name === "AbortError") return `ERROR: timeout mengambil ${url}`;
    return `ERROR: ${e.message}`;
  }
}

/**
 * Grep search — cari pattern di file-file dalam direktori.
 * Pakai grep -rnI (recursive, line numbers, skip binary).
 * Support glob include (e.g. "*.js") dan regex.
 */
export function runGrepSearch(workdir, pattern, searchPath, { include, maxOutput, timeout } = {}) {
  return new Promise((resolve) => {
    const args = ["-rnI", "--color=never"];
    if (include) {
      args.push(`--include=${include}`);
    }
    args.push("--", pattern, resolvePath(workdir, searchPath || "."));

    execFile("grep", args, { cwd: workdir, timeout: timeout || 10000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.killed) {
        resolve(`ERROR: timeout grep`);
        return;
      }
      const out = stdout.trim();
      if (!out) {
        resolve(`Tidak ditemukan hasil untuk pattern "${pattern}"`);
        return;
      }
      // Hitung jumlah match
      const lines = out.split("\n");
      const header = `Ditemukan ${lines.length} hasil untuk "${pattern}":\n`;
      resolve(truncate(header + out, maxOutput || 8000));
    });
  });
}

/**
 * Edit file — ganti bagian tertentu dari file (old_text → new_text).
 * Lebih efisien dari write_file untuk edit kecil di file besar.
 */
export function runEditFile(workdir, p, oldText, newText) {
  try {
    const full = resolvePath(workdir, p);
    if (!fs.existsSync(full)) {
      return `ERROR: file tidak ditemukan: ${full}`;
    }

    const content = fs.readFileSync(full, "utf8");
    const idx = content.indexOf(oldText);

    if (idx === -1) {
      // Coba cari dengan whitespace yang dinormalisasi
      const normalizeWs = (s) => s.replace(/[ \t]+/g, " ").trim();
      const normalContent = normalizeWs(content);
      const normalOld = normalizeWs(oldText);
      if (!normalContent.includes(normalOld)) {
        // Kasih hint: tampilkan beberapa baris yang mirip
        const oldLines = oldText.split("\n").filter(l => l.trim());
        const firstLine = oldLines[0]?.trim();
        if (firstLine) {
          const contentLines = content.split("\n");
          const similar = contentLines
            .map((l, i) => ({ line: i + 1, text: l }))
            .filter(({ text }) => text.includes(firstLine.slice(0, 30)))
            .slice(0, 3);
          if (similar.length) {
            const hint = similar.map(s => `  line ${s.line}: ${s.text.trim()}`).join("\n");
            return `ERROR: old_text tidak ditemukan persis di file.\nBaris yang mirip:\n${hint}\nPastikan old_text persis sama termasuk whitespace/indentasi.`;
          }
        }
        return `ERROR: old_text tidak ditemukan di ${p}. Baca file dulu pakai read_file untuk lihat isi yang benar.`;
      }
    }

    // Cek apakah ada lebih dari satu occurrence
    const secondIdx = content.indexOf(oldText, idx + 1);
    if (secondIdx !== -1) {
      const count = content.split(oldText).length - 1;
      return `ERROR: old_text ditemukan ${count} kali di file. Tambahkan konteks (baris sebelum/sesudah) supaya unik.`;
    }

    const updated = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
    fs.writeFileSync(full, updated);

    const oldLines = oldText.split("\n").length;
    const newLines = newText.split("\n").length;
    const diff = newLines - oldLines;
    return `OK: ${full}\n  ${oldLines} baris diganti → ${newLines} baris (${diff >= 0 ? "+" : ""}${diff})\n  Total: ${updated.length} chars`;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

/**
 * Git tools — status, diff, log, commit.
 * Semua pakai execFileSync biar simpel (operasi git cepet).
 */

function gitExec(workdir, args, { timeout = 10000, maxOutput = 16000 } = {}) {
  try {
    const out = execFileSync("git", args, {
      cwd: workdir,
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 5 * 1024 * 1024,
    }).toString().trim();
    return truncate(out || "(no output)", maxOutput);
  } catch (e) {
    const stderr = e.stderr?.toString?.()?.trim?.() || "";
    return `ERROR: ${stderr || e.message}`;
  }
}

export function runGitStatus(workdir, opts = {}) {
  return gitExec(workdir, ["status", "--short", "--branch"], opts);
}

export function runGitDiff(workdir, { file, staged } = {}, opts = {}) {
  const args = ["diff", "--stat"];
  if (staged) args.push("--cached");
  if (file) args.push("--", file);
  const stat = gitExec(workdir, args, opts);

  const patchArgs = ["diff"];
  if (staged) patchArgs.push("--cached");
  if (file) patchArgs.push("--", file);
  const patch = gitExec(workdir, patchArgs, { ...opts, maxOutput: opts.maxOutput || 12000 });

  return `${stat}\n\n${patch}`;
}

export function runGitLog(workdir, n = 10, opts = {}) {
  return gitExec(workdir, [
    "log", "--oneline", `-${Math.min(n, 50)}`,
    "--format=%h %s (%cr)"
  ], opts);
}

export function runGitCommit(workdir, message, opts = {}) {
  const addResult = gitExec(workdir, ["add", "-A"], opts);
  if (addResult.startsWith("ERROR:")) return addResult;
  return gitExec(workdir, ["commit", "-m", message], opts);
}

export function buildSystemPrompt(workdir, projectContext = "") {
  return [
    `Kamu adalah AI coding agent profesional di terminal. Kamu bekerja seperti senior developer yang teliti dan sistematis.`,
    `OS: linux. Direktori kerja: ${workdir}`,
    "",
    "## CARA KERJA",
    "Kamu punya akses ke tools. Untuk memakai tool, akhiri responsmu dengan SATU blok persis seperti ini:",
    "",
    '```tool_call',
    '{"tool":"bash","args":{"command":"ls -la"}}',
    '```',
    "",
    "## TOOLS YANG TERSEDIA",
    "",
    "### File Operations",
    '- read_file: {"tool":"read_file","args":{"path":"<path>"}}',
    '- write_file: {"tool":"write_file","args":{"path":"<path>","content":"<isi file>"}} — buat file baru atau rewrite total',
    '- edit_file: {"tool":"edit_file","args":{"path":"<path>","old_text":"<teks lama>","new_text":"<teks baru>"}} — edit bagian file; old_text harus persis',
    '- list_dir: {"tool":"list_dir","args":{"path":"<path>"}}',
    "",
    "### Search & Analysis",
    '- grep_search: {"tool":"grep_search","args":{"pattern":"<regex/teks>","path":"<dir>","include":"*.ext"}} — include opsional',
    '- bash: {"tool":"bash","args":{"command":"<perintah shell>"}}',
    '- think: {"tool":"think","args":{"thought":"<analisis/rencana>"}} — mikir dulu sebelum bertindak',
    "",
    "### Internet",
    '- web_search: {"tool":"web_search","args":{"query":"<kata kunci>"}} — cari info online',
    '- fetch_url: {"tool":"fetch_url","args":{"url":"<url>"}} — baca halaman web',
    "",
    "### Git",
    '- git_status: {"tool":"git_status","args":{}} — lihat status repo',
    '- git_diff: {"tool":"git_diff","args":{"file":"<opsional>","staged":false}} — lihat perubahan',
    '- git_log: {"tool":"git_log","args":{"count":10}} — lihat riwayat commit',
    '- git_commit: {"tool":"git_commit","args":{"message":"<pesan commit>"}} — stage all + commit',
    "",
    "### Flow Control & Delegation",
    '- task_done: {"tool":"task_done","args":{"summary":"<ringkasan>"}} — panggil kalau tugas selesai',
    '- delegate_task: {"tool":"delegate_task","args":{"role":"<peran, misal: Frontend Expert>","task":"<deskripsi tugas>","context":"<info tambahan>"}} — delegasikan sub-tugas spesifik ke Sub-Agent AI. Tool ini akan blocking sampai Sub-Agent selesai dan mengembalikan hasil kerjanya.',
    "",
    "## ATURAN PENTING",
    "",
    "### Tool Usage",
    "- DILARANG KERAS menggunakan format XML (<tool>). WAJIB gunakan blok markdown ```tool_call berisi JSON!",
    "- Maksimal SATU blok tool_call per respons.",
    "- JSON di dalam blok harus valid (escape newline sebagai \\\\n).",
    "- Untuk edit file yang sudah ada, WAJIB pakai edit_file (bukan write_file), kecuali file baru atau rewrite total.",
    "- Pakai read_file dulu sebelum edit_file biar tau isi yang benar.",
    "",
    "### Pendekatan Kerja (PENTING!)",
    "Untuk tugas yang kompleks, WAJIB ikuti alur ini:",
    "1. **Analisis** — Pakai think untuk memahami tugas, identifikasi file/komponen yang terlibat.",
    "2. **Riset** — Baca file/kode yang relevan pakai read_file, grep_search, list_dir.",
    "3. **Rencana** — Pakai think untuk menyusun langkah-langkah spesifik.",
    "4. **Eksekusi** — Kerjakan per-langkah, verifikasi tiap perubahan.",
    "5. **Verifikasi** — Setelah selesai, pastikan kode jalan (jalankan test/build kalau ada).",
    "6. **Selesai** — Panggil task_done dengan ringkasan lengkap.",
    "",
    "### Kualitas Kode",
    "- Tulis kode yang bersih, terbaca, dan well-documented.",
    "- Jangan hapus komentar/docstring yang sudah ada kecuali diminta.",
    "- Handle error dengan baik, jangan biarkan crash tanpa pesan jelas.",
    "- Kalau buat file baru, selalu pikirin struktur project yang konsisten.",
    "",
    "### Komunikasi",
    "- Jawab dalam bahasa Indonesia santai tapi informatif.",
    "- Kalau ada ambiguitas, tanyakan ke user sebelum bertindak.",
    "- Jelaskan keputusan penting yang kamu ambil.",
    projectContext ? `${projectContext}` : "",
  ].filter(Boolean).join("\n");
}
