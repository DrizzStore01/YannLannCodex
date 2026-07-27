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

async function askApproval(rl, state, label) {
  if (state.autoApprove) return true;
  while (true) {
    const ans = (await rl.question(c.bold(`${label} [y]a / [n]tidak / [a]selalu: `))).trim().toLowerCase();
    if (["y", "ya", ""].includes(ans)) return true;
    if (["n", "tidak"].includes(ans)) return false;
    if (["a", "selalu"].includes(ans)) {
      state.autoApprove = true;
      return true;
    }
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
      return "__TASK_DONE__";
    }
    case "__parse_error__":
      return "ERROR: JSON di blok tool_call tidak valid. Perbaiki dan kirim ulang.";
    default:
      return `ERROR: tool "${tool}" tidak dikenal.`;
  }
}

export async function agentTurn(rl, state, userInput) {
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

    state.history.push({ role: "user", content: `Hasil tool ${tool}:\n${result}` });

    // task_done = sinyal berhenti
    if (result === "__TASK_DONE__") return;
  }

  console.log(c.red(`Stop: batas ${state.config.maxStepsPerTurn} step per giliran tercapai.`));
}
