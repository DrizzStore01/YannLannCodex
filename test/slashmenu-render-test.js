// Inspeksi raw ANSI yang ditulis slash menu: apakah menu dibersihkan pas Enter?
import readline from "node:readline";
import { PassThrough, Writable } from "node:stream";
import { setupSlashMenu } from "../src/slashmenu.js";

const COMMANDS = [
  { name: "/help", desc: "bantuan" },
  { name: "/model", desc: "pilih model" },
  { name: "/models", desc: "list model" },
];

const chunks = [];
const input = new PassThrough();
input.isTTY = true;
input.setRawMode = () => input;
const output = new Writable({
  write(chunk, enc, cb) {
    chunks.push(chunk.toString());
    cb();
  },
});
output.isTTY = true;
output.columns = 80;
output.rows = 30;

const rl = readline.createInterface({ input, output, terminal: true });
const menu = setupSlashMenu(rl, COMMANDS, "test ❯ ", { force: true });

const show = (s) =>
  s.replace(/\x1b/g, "ESC").replace(/\r/g, "\\r").replace(/\n/g, "\\n");

rl.question("test ❯ ", () => {
  // defer: biar semua keypress listener (termasuk cleanup menu) selesai dulu
  setImmediate(() => {
    console.log("== semua chunk setelah pertanyaan selesai ==");
    chunks.forEach((c, i) => console.log(`${i}: ${show(c)}`));
    const afterEnter = chunks.slice(chunks.indexOf("\r\n") + 1).join("");
    console.log(
      afterEnter.includes("\x1b[J")
        ? "\nMenu dibersihkan setelah Enter ✔"
        : "\nFAIL: tidak ada clear setelah Enter ✘"
    );
    rl.close();
    process.exit(afterEnter.includes("\x1b[J") ? 0 : 1);
  });
});

const type = (s, d) => new Promise((r) => setTimeout(() => { input.write(s); r(); }, d));
await type("/m", 50);
await type("\x1b[B", 150);
await type("\r", 250);
