import { chatCompletion, chatCompletionStream } from "./api.js";
import {
  parseToolCall,
  runBash,
  runReadFile,
  runWriteFile,
  runListDir,
  runWebSearch,
  runFetchUrl,
  runGrepSearch,
  runEditFile,
  runGitStatus,
  runGitDiff,
  runGitLog,
  runGitCommit,
} from "./tools.js";
import { c, panel, spinner, createStreamRenderer } from "./ui.js";
import { maybeSummarize, historySize } from "./summarize.js";
import { runScrapeDynamic, runScreenshotWeb } from "./browser.js";
import { mcpManager } from "./mcp.js";
import { checkAndTrackUsage } from "./usage.js";

async function askApproval(rl, state, label) {
  if (state.autoApprove) return true;
  while (true) {
    let raw;
    try {
      raw = await rl.question(c.bold(`${label} [y]a / [n]tidak / [a]selalu: `));
    } catch {
      return false;
    }
    const ans = (raw || "").trim().toLowerCase();

    // Affirmative (ya, yes, ok, oke, yep, sure, Enter)
    if (["y", "ya", "yes", "ok", "oke", "yep", "1", "s", "sure", ""].includes(ans)) {
      return true;
    }
    // Always / Auto-approve for session
    if (["a", "selalu", "always", "yolo", "all"].includes(ans)) {
      state.autoApprove = true;
      console.log(c.yellow("  (Mode Auto-Approve diaktifkan untuk sesi ini)"));
      return true;
    }
    // Negative (tidak, no, ga, gak, cancel)
    if (["n", "tidak", "no", "ga", "gak", "g", "0", "c", "cancel"].includes(ans)) {
      return false;
    }

    console.log(c.dim("  Ketik 'y' (Ya), 'n' (Tidak), atau 'a' (Selalu/Auto-approve)."));
  }
}

function previewWrite(p, content) {
  const lines = String(content ?? "").split("\n");
  let shown = lines.slice(0, 30).join("\n");
  if (lines.length > 30) shown += `\n... (+${lines.length - 30} baris lagi)`;
  panel(`Tulis: ${p}`, shown, c.yellow);
}

async function executeTool(rl, state, tool, args) {
  const { workdir, config } = state;
  const opts = { timeout: config.bashTimeout, maxOutput: config.maxToolOutput };

  switch (tool) {
    case "bash": {
      const cmd = args.command || "";
      panel("bash", cmd, c.cyan);
      if (!(await askApproval(rl, state, "Jalankan perintah?"))) return null;
      const sp = spinner("menjalankan...");
      const result = await runBash(workdir, cmd, opts);
      sp.stop();
      return result;
    }
    case "write_file": {
      previewWrite(args.path, args.content);
      if (!(await askApproval(rl, state, "Tulis file?"))) return null;
      return runWriteFile(workdir, args.path || "", args.content ?? "");
    }
    case "read_file":
      console.log(c.dim(`→ membaca ${args.path}`));
      return runReadFile(workdir, args.path || "", opts);
    case "list_dir":
      console.log(c.dim(`→ melihat direktori ${args.path || "."}`));
      return runListDir(workdir, args.path, opts);
    case "web_search": {
      const q = args.query || "";
      console.log(c.dim(`🌐 mencari: ${q}`));
      const sp = spinner("searching...");
      const result = await runWebSearch(q, { maxOutput: opts.maxOutput, timeout: opts.timeout });
      sp.stop();
      return result;
    }
    case "fetch_url": {
      const u = args.url || "";
      console.log(c.dim(`🌐 mengambil: ${u}`));
      const sp = spinner("fetching...");
      const result = await runFetchUrl(u, { maxOutput: opts.maxOutput, timeout: opts.timeout });
      sp.stop();
      return result;
    }
    case "scrape_dynamic": {
      const u = args.url || "";
      const wf = args.waitFor || 2000;
      console.log(c.dim(`🕸️ Dynamic Scraping: ${u}`));
      const sp = spinner("rendering JS & scraping...");
      const result = await runScrapeDynamic(u, { waitFor: wf, maxOutput: opts.maxOutput, timeout: opts.timeout });
      sp.stop();
      return result;
    }
    case "screenshot_web": {
      const u = args.url || "";
      const out = args.output || "screenshot.png";
      console.log(c.dim(`📸 Screenshot Web: ${u}`));
      const sp = spinner("taking screenshot...");
      const result = await runScreenshotWeb(u, out, { timeout: opts.timeout });
      sp.stop();
      return result;
    }
    case "grep_search": {
      const pat = args.pattern || "";
      const sp2 = args.path || ".";
      console.log(c.dim(`🔍 grep: "${pat}" di ${sp2}${args.include ? " (" + args.include + ")" : ""}`));
      const sp = spinner("searching...");
      const result = await runGrepSearch(workdir, pat, sp2, {
        include: args.include,
        maxOutput: opts.maxOutput,
        timeout: opts.timeout,
      });
      sp.stop();
      return result;
    }
    case "edit_file": {
      const ep = args.path || "";
      const oldT = args.old_text ?? "";
      const newT = args.new_text ?? "";
      const oldLines = oldT.split("\n");
      const preview = oldLines.length > 5
        ? oldLines.slice(0, 3).join("\n") + `\n... (+${oldLines.length - 3} baris)`
        : oldT;
      panel(`Edit: ${ep}`, `${c.red("- " + preview.split("\n").join("\n- "))}\n${c.green("+ (" + newT.split("\n").length + " baris baru)")}`, c.yellow);
      if (!(await askApproval(rl, state, "Edit file?"))) return null;
      return runEditFile(workdir, ep, oldT, newT);
    }
    case "think": {
      const thought = args.thought || "";
      panel("🧠 Think", thought, c.dim);
      return `OK: pikiran dicatat. Lanjutkan dengan aksi berikutnya.`;
    }
    case "git_status": {
      console.log(c.dim(`📊 git status`));
      return runGitStatus(workdir, opts);
    }
    case "git_diff": {
      const file = args.file || null;
      const staged = args.staged || false;
      console.log(c.dim(`📊 git diff${file ? " " + file : ""}${staged ? " (staged)" : ""}`));
      return runGitDiff(workdir, { file, staged }, opts);
    }
    case "git_log": {
      const n = args.count || 10;
      console.log(c.dim(`📊 git log -${n}`));
      return runGitLog(workdir, n, opts);
    }
    case "git_commit": {
      const msg = args.message || "";
      if (!msg) return "ERROR: message tidak boleh kosong";
      panel("💾 Git Commit", msg, c.cyan);
      if (!(await askApproval(rl, state, "Commit perubahan?"))) return null;
      return runGitCommit(workdir, msg, opts);
    }
    case "task_done": {
      const summary = args.summary || "Tugas selesai.";
      panel("✅ Selesai", summary, c.green);
      return { __done: true, summary };
    }
    case "delegate_task": {
      const role = args.role || "Sub-Agent";
      const task = args.task || "";
      const context = args.context || "";
      console.log(c.magenta(`\n🤖 Mendelegasikan tugas ke Sub-Agent [${role}]...`));
      
      const childState = {
        config: state.config,
        workdir: state.workdir,
        history: [],
        autoApprove: state.autoApprove,
        systemPrompt: state.systemPrompt.replace(
          "Kamu bekerja seperti senior developer yang teliti dan sistematis.",
          `Peran kamu adalah: ${role}. Fokus pada tugas yang diberikan.`
        ),
      };
      
      const prompt = `[DELEGATED TASK]\nTugas Anda:\n${task}\n\nKonteks Tambahan:\n${context}\n\nSelesaikan tugas ini secara mandiri menggunakan tool yang tersedia. Jika selesai, WAJIB panggil task_done dengan ringkasan lengkap.`;
      
      const summary = await agentTurn(rl, childState, prompt);
      console.log(c.magenta(`\n🔙 Sub-Agent [${role}] selesai bekerja.`));
      return `Hasil dari Sub-Agent [${role}]:\n${summary || "(Tidak ada ringkasan)"}`;
    }
    case "__parse_error__":
      return "ERROR: JSON di blok tool_call tidak valid. Perbaiki dan kirim ulang.";
    default: {
      if (tool && tool.startsWith("mcp__")) {
        console.log(c.dim(`🔌 Eksekusi MCP Tool: ${tool}`));
        const sp = spinner("MCP executing...");
        try {
          const res = await mcpManager.callTool(tool, args);
          sp.stop();
          return res;
        } catch (e) {
          sp.stop();
          return `ERROR MCP: ${e.message}`;
        }
      }
      return `ERROR: tool "${tool}" tidak dikenal.`;
    }
  }
}

export async function agentTurn(rl, state, userInput) {
  const usage = checkAndTrackUsage(state.config.apikey);
  if (!usage.allowed) {
    panel(
      "⚠️ Kuota Harian Publik Habis",
      `Anda telah mencapai batas ${usage.limit} request gratis hari ini.\n\n` +
      `Untuk penggunaan UNLIMITED tanpa batas, silakan masukkan API Key Anda sendiri:\n` +
      `  ${c.cyan("/key <KODE_API_KEY_ANDA>")}\n`,
      c.yellow
    );
    return;
  }

  state.history.push({ role: "user", content: userInput });

  for (let step = 0; step < state.config.maxStepsPerTurn; step++) {
    if (historySize(state.history) >= state.config.summarizeThreshold) {
      const sp = spinner("riwayat panjang, meringkas dulu...");
      try {
        const summarized = await maybeSummarize(state);
        sp.stop();
        if (summarized) {
          console.log(
            c.dim(
              `✂ Riwayat diringkas: ${Math.round(summarized.before / 1000)}k → ${Math.round(summarized.after / 1000)}k karakter`
            )
          );
        }
      } catch (e) {
        sp.stop();
        console.log(c.yellow(`Gagal meringkas riwayat (lanjut tanpa ringkas): ${e.message}`));
      }
    }

    const messages = [{ role: "system", content: state.systemPrompt }, ...state.history];

    const model = state.config.model;
    const renderer = createStreamRenderer(model);
    let reply = "";
    let reasoning = "";
    
    try {
      for await (const chunk of chatCompletionStream(state.config, messages)) {
        if (chunk.type === "reasoning") {
           reasoning += chunk.text;
           renderer.pushReasoning(chunk.text);
        } else {
           reply += chunk.text;
           renderer.push(chunk.text);
        }
      }
      renderer.end();
    } catch (e) {
      renderer.end();
      console.log(c.red(`Gagal API: ${e.message}`));
      if (step === 0) state.history.pop();
      return;
    }

    let fullReply = reply;
    if (reasoning) {
       fullReply = `<think>\n${reasoning}\n</think>\n\n${reply}`;
    }
    state.history.push({ role: "assistant", content: fullReply });
    const { tool, args } = parseToolCall(reply);

    if (tool === null) {
      return;
    }

    let result;
    try {
      result = await executeTool(rl, state, tool, args);
    } catch (e) {
      result = `ERROR: ${e.message}`;
    }

    if (result === null) {
      console.log(c.yellow("Dibatalkan."));
      state.history.push({ role: "user", content: `Tool ${tool} dibatalkan oleh user.` });
      return;
    }

    state.history.push({ role: "user", content: `Hasil tool ${tool}:\n${typeof result === 'object' ? JSON.stringify(result) : result}` });

    // task_done = sinyal berhenti
    if (result && result.__done) {
      return result.summary;
    }
  }

  console.log(c.red(`Stop: batas ${state.config.maxStepsPerTurn} step per giliran tercapai.`));
  return null;
}
