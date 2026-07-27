// Tes logika picker arrow-key tanpa pty beneran:
// stub process.stdin sebagai TTY, kirim urutan tombol, cek hasil pilihan.
import { pick } from "../src/picker.js";

const stdin = process.stdin;
stdin.isTTY = true;
stdin.setRawMode = () => stdin;
process.stdout.rows = 40;

const fakeRl = { pause() {}, resume() {}, question: async () => "" };

const items = [
  { label: "model-a", value: "model-a" },
  { label: "model-b", value: "model-b" },
  { label: "model-c", value: "model-c" },
];

function send(keys, delay = 30) {
  keys.forEach((k, i) => setTimeout(() => stdin.emit("data", Buffer.from(k)), delay * (i + 1)));
}

// Tes 1: turun 2x lalu Enter -> model-c
send(["\x1b[B", "\x1b[B", "\r"]);
const r1 = await pick(fakeRl, "Tes 1:", items, { current: "model-a" });
console.assert(r1 === "model-c", `FAIL tes1: dapat ${r1}`);

// Tes 2: naik 1x dari index 0 (wrap ke bawah) lalu Enter -> model-c
send(["\x1b[A", "\r"]);
const r2 = await pick(fakeRl, "Tes 2:", items, { current: "model-a" });
console.assert(r2 === "model-c", `FAIL tes2: dapat ${r2}`);

// Tes 3: Esc -> null (batal)
send(["\x1b[B", "\x1b"]);
const r3 = await pick(fakeRl, "Tes 3:", items, {});
console.assert(r3 === null, `FAIL tes3: dapat ${r3}`);

// Tes 4: current di-highlight duluan -> Enter langsung -> model-b
send(["\r"]);
const r4 = await pick(fakeRl, "Tes 4:", items, { current: "model-b" });
console.assert(r4 === "model-b", `FAIL tes4: dapat ${r4}`);

// Tes 5: ngetik huruf sembarang diabaikan total, gak ngubah seleksi
send(["h", "e", "l", "o", "9", " ", "\x1b[B", "\r"]);
const r5 = await pick(fakeRl, "Tes 5:", items, { current: "model-a" });
console.assert(r5 === "model-b", `FAIL tes5: dapat ${r5}`);

// Tes 6: listener keypress lain dicopot selama picker & dibalikin setelahnya
let leaked = 0;
const spy = () => leaked++;
process.stdin.on("keypress", spy);
send(["x", "y", "\r"]);
const r6 = await pick(fakeRl, "Tes 6:", items, {});
process.stdin.emit("keypress", "z", { name: "z" }); // setelah cleanup: harus nyampe
console.assert(r6 === "model-a", `FAIL tes6: dapat ${r6}`);
console.assert(leaked === 1, `FAIL tes6: keypress bocor selama picker (leaked=${leaked})`);
process.stdin.removeListener("keypress", spy);

console.log("\nSemua tes picker lulus ✔");
process.exit(0);
