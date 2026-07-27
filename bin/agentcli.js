#!/usr/bin/env node
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";

import { loadConfig, saveConfig, CONFIG_PATH } from "../src/config.js";
import { listModels } from "../src/api.js";
import { buildSystemPrompt } from "../src/tools.js";
import { buildProjectContext } from "../src/context.js";
import { agentTurn } from "../src/agent.js";
import { c, panel, spinner } from "../src/ui.js";
import { pick } from "../src/picker.js";
import { setupSlashMenu, resolveCommand } from "../src/slashmenu.js";
import { showLogo } from "../src/logo.js";
import { runAutoFix } from "../src/autofix.js";
import {
  newSessionId,
  saveSession,
  listSessions,
  loadSession,
  latestSessionId,
  deleteSession,
  loadInputHistory,
  appendInputHistory,
} from "../src/history.js";

const BRAND = "YanLann Codex";
const DEVS = "Xiao Yan Dev · Always Codex · Lann";
const VERSION = "0.1.0";

const COMMANDS = [
  { name: "/help", desc: "tampilkan bantuan" },
  { name: "/about", desc: `tentang ${BRAND}` },
  { name: "/model", desc: "pilih model dari menu" },
  { name: "/models", desc: "list model dari API" },
  { name: "/key", desc: "set API key" },
  { name: "/history", desc: "lanjutkan sesi lama (rm = hapus)" },
  { name: "/fix", desc: "jalankan god-mode auto fix untuk perintah (contoh: /fix npm test)" },
  { name: "/clear", desc: "mulai sesi baru" },
  { name: "/config", desc: "konfigurasi aktif" },
  { name: "/update", desc: "update YanLan Codex ke versi terbaru" },
  { name: "/exit", desc: "keluar" },
];

const HELP = `Perintah:
  /help            tampilkan bantuan ini
  /about           info versi & developer
  /model [nama]    pilih model dari menu (atau set langsung)
  /models          list model dari API
  /key <apikey>    set API key (disimpan ke ${CONFIG_PATH})
  /history         pilih & lanjutkan sesi percakapan lama
  /history rm      hapus sesi dari menu
  /fix <cmd>       god-mode auto fix, jalankan perintah dan perbaiki error berulang kali
  /clear           mulai sesi baru (riwayat aktif dihapus)
  /config          tampilkan konfigurasi aktif
  /update          update YanLan Codex ke versi terbaru via GitHub
  /exit            keluar

Flags: --yolo (auto-approve semua aksi), -C <dir> (direktori kerja),
       -c/--continue (lanjutkan sesi terakhir)
Env:   AGENTCLI_API_KEY, AGENTCLI_BASE_URL, AGENTCLI_MODEL`;

async function handleCommand(rl, state, input) {
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/help":
      console.log(HELP);
      return true;
    case "/about":
      panel(
        `✦ ${BRAND}`,
        [
          `AgentCLI v${VERSION} — AI coding agent di terminal`,
          `${c.dim("dev:")}   ${DEVS}`,
          `${c.dim("model:")} ${state.config.model}`,
          `${c.dim("api:")}   ${state.config.baseUrl}`,
        ].join("\n"),
        c.blue
      );
      return true;
    case "/exit":
    case "/quit":
      rl.close();
      process.exit(0);
    case "/clear":
      state.history = [];
      state.sessionId = newSessionId();
      state.sessionCreatedAt = new Date().toISOString();
      console.log(c.dim("Riwayat dihapus, sesi baru dimulai."));
      return true;
    case "/history": {
      const sessions = listSessions();
      if (!sessions.length) {
        console.log(c.dim("Belum ada sesi tersimpan."));
        return true;
      }
      const items = sessions.map((s) => ({
        label: s.title,
        value: s.id,
        hint: `[${(s.updatedAt || "").slice(0, 16).replace("T", " ")} | ${s.turns} giliran | ${s.model}]`,
      }));
      if (arg === "rm" || arg === "hapus") {
        const chosen = await pick(rl, "Hapus sesi:", items, {});
        if (chosen && deleteSession(chosen)) {
          console.log(c.green("Sesi dihapus."));
          if (chosen === state.sessionId) {
            state.history = [];
            state.sessionId = newSessionId();
            state.sessionCreatedAt = new Date().toISOString();
          }
        } else {
          console.log(c.dim("Batal."));
        }
        return true;
      }
      const chosen = await pick(rl, "Lanjutkan sesi:", items, { current: state.sessionId });
      if (!chosen) {
        console.log(c.dim("Batal."));
        return true;
      }
      try {
        resumeSession(state, loadSession(chosen));
      } catch (e) {
        console.log(c.red(`Gagal memuat sesi: ${e.message}`));
      }
      return true;
    }
    case "/model": {
      if (arg) {
        state.config.model = arg;
        saveConfig({ model: arg });
        console.log(c.green(`Model: ${arg} (disimpan)`));
        return true;
      }
      const sp = spinner("mengambil daftar model...");
      let models;
      try {
        models = await listModels(state.config);
      } catch (e) {
        sp.stop();
        console.log(c.red(e.message));
        return true;
      }
      sp.stop();
      if (!models.length) {
        console.log(c.dim("(daftar model kosong)"));
        return true;
      }
      const items = models.map((m) => {
        const slash = m.indexOf("/");
        return slash === -1
          ? { label: m, value: m }
          : { label: m.slice(slash + 1), value: m, hint: `[${m.slice(0, slash)}]` };
      });
      const chosen = await pick(rl, "Pilih model:", items, { current: state.config.model });
      if (chosen) {
        state.config.model = chosen;
        saveConfig({ model: chosen });
        console.log(c.green(`Model: ${chosen} (disimpan)`));
      } else {
        console.log(c.dim("Batal."));
      }
      return true;
    }
    case "/models":
      try {
        const models = await listModels(state.config);
        console.log(models.length ? models.join("\n") : c.dim("(kosong)"));
      } catch (e) {
        console.log(c.red(e.message));
      }
      return true;
    case "/key":
      if (!arg) {
        console.log(c.red("Pakai: /key <apikey>"));
      } else {
        state.config.apikey = arg;
        saveConfig({ apikey: arg });
        console.log(c.green("API key disimpan."));
      }
      return true;
    case "/update": {
      console.log(c.cyan("Mengunduh update terbaru dari GitHub..."));
      try {
        const out = execSync("npm install -g git+https://github.com/DrizzStore01/YannLannCodex.git", {
          stdio: "inherit"
        });
        console.log(c.green("Update berhasil! Silakan restart CLI (ketik /exit lalu buka lagi)."));
      } catch (e) {
        console.log(c.red(`Gagal update: ${e.message}`));
      }
      return true;
    }
    case "/fix": {
      await runAutoFix(rl, state, arg);
      return true;
    }
    case "/config":
      console.log(
        JSON.stringify(
          { ...state.config, apikey: state.config.apikey.slice(0, 3) + "***", configFile: CONFIG_PATH },
          null,
          2
        )
      );
      return true;
    default: {
      const resolved = resolveCommand(COMMANDS, cmd);
      if (resolved?.name && resolved.name !== cmd) {
        return handleCommand(rl, state, [resolved.name, ...rest].join(" "));
      }
      if (resolved?.ambiguous) {
        console.log(c.yellow(`Ambigu: ${resolved.ambiguous.join(", ")}`));
        return true;
      }
      console.log(c.red(`Perintah ${cmd} tidak dikenal. Ketik /help buat daftar perintah.`));
      return true;
    }
  }
}

function resumeSession(state, data) {
  state.history = data.messages || [];
  state.sessionId = data.id;
  state.sessionCreatedAt = data.createdAt || new Date().toISOString();
  const last = [...state.history].reverse().find((m) => m.role === "assistant");
  console.log(c.green(`Sesi dilanjutkan: ${c.bold(data.title || data.id)} (${state.history.length} pesan)`));
  if (last) panel("terakhir", last.content, c.dim);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      yolo: { type: "boolean", default: false },
      dir: { type: "string", short: "C", default: process.cwd() },
      help: { type: "boolean", short: "h", default: false },
      continue: { type: "boolean", short: "c", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const config = loadConfig();
  const workdir = path.resolve(values.dir);
  const projectContext = buildProjectContext(workdir);
  const state = {
    config,
    workdir,
    history: [],
    autoApprove: values.yolo,
    systemPrompt: buildSystemPrompt(workdir, projectContext),
    sessionId: newSessionId(),
    sessionCreatedAt: new Date().toISOString(),
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    history: loadInputHistory(),
    historySize: 500,
  });
  rl.on("SIGINT", () => {
    console.log(c.dim("\nBye!"));
    process.exit(0);
  });

  const splash = process.stdout.isTTY && !positionals.length;
  if (splash) {
    // Bersihkan layar + scrollback, kursor ke pojok kiri atas
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  }
  showLogo({ brand: BRAND, version: VERSION, devs: DEVS });
  console.log(`  ${c.bold("Model:")} ${config.model}   ${c.dim(`dir: ${workdir}`)}`);
  console.log(`  ${c.dim("Ketik / buat menu perintah, /help buat bantuan.")}`);
  if (values.yolo) console.log(`  ${c.yellow("MODE YOLO: semua aksi auto-approve!")}`);
  console.log();
  if (splash) await new Promise((r) => setTimeout(r, 2000));

  if (values.continue) {
    const lastId = latestSessionId();
    if (lastId) {
      try {
        resumeSession(state, loadSession(lastId));
      } catch (e) {
        console.log(c.red(`Gagal memuat sesi terakhir: ${e.message}`));
      }
    } else {
      console.log(c.dim("Belum ada sesi tersimpan, mulai sesi baru."));
    }
  }

  // Kalau ada argumen positional, jalankan sebagai satu perintah lalu keluar
  if (positionals.length) {
    await agentTurn(rl, state, positionals.join(" "));
    saveSession(state);
    rl.close();
    return;
  }

  const promptLabel = c.magenta(c.bold(`${path.basename(workdir) || "/"} ❯ `));
  const menu = setupSlashMenu(rl, COMMANDS, promptLabel);
  while (true) {
    let input;
    try {
      input = (await rl.question(promptLabel)).trim();
    } catch {
      console.log(c.dim("\nBye!"));
      break;
    }
    if (!input) continue;
    if (input.startsWith("/")) {
      // Enter dengan menu kebuka = eksekusi item yang lagi ke-highlight
      const selected = menu.consumeSelection();
      const [typed, ...restArgs] = input.split(/\s+/);
      if (selected && selected !== typed) {
        input = [selected, ...restArgs].join(" ");
        console.log(c.dim(`→ ${input}`));
      }
    }
    appendInputHistory(input);
    try {
      if (input.startsWith("/")) {
        const handled = await handleCommand(rl, state, input);
        if (handled) continue;
      }
      await agentTurn(rl, state, input);
      saveSession(state);
    } catch (e) {
      if (/readline was closed/i.test(e.message)) {
        console.log(c.dim("\nBye!"));
        break;
      }
      throw e;
    }
  }
  rl.close();
}

main().catch((e) => {
  console.error(c.red(`Fatal: ${e.message}`));
  process.exit(1);
});
