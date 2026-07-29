import readline from 'node:readline';
import { setupSlashMenu, filterCommands } from './src/slashmenu.js';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const commands = [
  { name: "/help", desc: "tampilkan bantuan" },
  { name: "/about", desc: "tentang" },
  { name: "/model", desc: "pilih model dari menu" },
  { name: "/models", desc: "list model dari API" },
  { name: "/key", desc: "set API key" },
  { name: "/history", desc: "lanjutkan sesi lama" },
  { name: "/fix", desc: "god-mode auto fix" },
  { name: "/clear", desc: "mulai sesi baru" },
  { name: "/config", desc: "konfigurasi aktif" },
  { name: "/update", desc: "update" },
  { name: "/exit", desc: "keluar" },
];
rl.line = '/';
const matches = filterCommands(commands, rl.line);
console.log("matches:", matches);
