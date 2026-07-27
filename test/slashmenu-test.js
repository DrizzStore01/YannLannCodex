// Tes slash menu: readline asli di atas stream palsu (terminal mode),
// simulasi ketikan + panah + Tab/Enter, cek hasil seleksi & autocomplete.
import readline from "node:readline";
import { PassThrough, Writable } from "node:stream";
import { setupSlashMenu, filterCommands, resolveCommand } from "../src/slashmenu.js";

const COMMANDS = [
  { name: "/help", desc: "bantuan" },
  { name: "/model", desc: "pilih model" },
  { name: "/models", desc: "list model" },
  { name: "/history", desc: "sesi lama" },
  { name: "/exit", desc: "keluar" },
];

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok: ${label}`);
  else {
    console.log(`  FAIL: ${label}`);
    failures++;
  }
}

// --- unit: filterCommands / resolveCommand
check(filterCommands(COMMANDS, "/m").length === 2, "filter /m -> 2 match");
check(filterCommands(COMMANDS, "/model ") === null, "ada spasi -> menu mati");
check(filterCommands(COMMANDS, "halo") === null, "bukan slash -> null");
check(filterCommands(COMMANDS, "/zzz") === null, "gak ada match -> null");
check(resolveCommand(COMMANDS, "/hi").name === "/history", "prefix unik ke-resolve");
check(resolveCommand(COMMANDS, "/m").ambiguous.length === 2, "prefix ambigu terdeteksi");
check(resolveCommand(COMMANDS, "/model").name === "/model", "exact match menang");
check(resolveCommand(COMMANDS, "/xyz") === null, "gak dikenal -> null");

// --- integrasi: readline + keypress
function makeRig() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;
  const output = new Writable({ write(chunk, enc, cb) { cb(); } });
  output.isTTY = true;
  output.columns = 80;
  output.rows = 30;
  const rl = readline.createInterface({ input, output, terminal: true, prompt: "" });
  const menu = setupSlashMenu(rl, COMMANDS, "test ❯ ", { force: true });
  return { input, rl, menu };
}

function type(input, s) {
  return new Promise((res) => {
    input.write(s);
    setTimeout(res, 50);
  });
}

// Tes 1: ketik /m, panah bawah, Enter -> pilihan = /models
{
  const { input, rl, menu } = makeRig();
  const lineP = new Promise((res) => rl.once("line", res));
  await type(input, "/m");
  await type(input, "\x1b[B"); // down
  await type(input, "\r");
  const line = await lineP;
  check(line === "/m", "baris mentah tetap /m");
  check(menu.consumeSelection() === "/models", "selection tetap tersedia setelah line event");
  rl.close();
}

// Ulang tes 1 dengan urutan yang benar: consumeSelection dipanggil SETELAH line
// (di CLI asli, loop utama membaca hasil question dulu baru consume)
{
  const { input, rl, menu } = makeRig();
  let captured;
  rl.once("line", () => {
    captured = menu.consumeSelection();
  });
  await type(input, "/m");
  await type(input, "\x1b[B");
  await type(input, "\r");
  await new Promise((r) => setTimeout(r, 50));
  check(captured === "/models", `Enter mengeksekusi item ke-highlight (dapat: ${captured})`);
  rl.close();
}

// Tes 2: ketik /hi lalu Tab -> autocomplete jadi "/history "
{
  const { input, rl, menu } = makeRig();
  await type(input, "/hi");
  await type(input, "\t");
  check(rl.line === "/history ", `Tab autocomplete (dapat: "${rl.line}")`);
  rl.close();
}

// Tes 3: Esc nutup menu, Enter kirim apa adanya
{
  const { input, rl, menu } = makeRig();
  let captured = "belum";
  rl.once("line", () => {
    captured = menu.consumeSelection();
  });
  await type(input, "/m");
  await type(input, "\x1b"); // Esc
  await new Promise((r) => setTimeout(r, 600)); // tunggu escape timeout readline (500ms)
  await type(input, "\r");
  await new Promise((r) => setTimeout(r, 50));
  check(captured === null, `Esc -> Enter tidak override (dapat: ${captured})`);
  rl.close();
}

// Tes 4: baris biasa (bukan slash) tidak kena efek menu
{
  const { input, rl, menu } = makeRig();
  let captured = "belum";
  rl.once("line", (l) => {
    captured = menu.consumeSelection();
  });
  await type(input, "halo bro");
  await type(input, "\r");
  await new Promise((r) => setTimeout(r, 50));
  check(captured === null, "input biasa -> selection null");
  rl.close();
}

console.log(failures ? `\n${failures} tes GAGAL ✘` : "\nSemua tes slash menu lulus ✔");
process.exit(failures ? 1 : 0);
