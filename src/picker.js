import { c } from "./ui.js";

/**
 * Menu pilihan interaktif di terminal.
 * - TTY: navigasi panah atas/bawah (atau j/k), Enter pilih, Esc/q batal.
 * - Non-TTY: fallback ketik nomor.
 * items: array of { label, value, hint? } atau string.
 * Return: value terpilih, atau null kalau dibatalkan.
 */
export async function pick(rl, title, items, { current } = {}) {
  const list = items.map((it) =>
    typeof it === "string" ? { label: it, value: it } : it
  );
  if (!list.length) return null;

  if (!process.stdin.isTTY) {
    console.log(c.bold(title));
    list.forEach((it, i) =>
      console.log(`  ${i + 1}. ${it.label}${it.hint ? c.dim(` ${it.hint}`) : ""}`)
    );
    let ans;
    try {
      ans = (await rl.question("Pilih nomor (kosong = batal): ")).trim();
    } catch {
      return null; // stdin keburu habis/tertutup
    }
    const idx = parseInt(ans, 10) - 1;
    return list[idx] ? list[idx].value : null;
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let index = Math.max(0, list.findIndex((it) => it.value === current));
    let offset = 0;
    const pageSize = Math.min(list.length, Math.max(5, (stdout.rows || 24) - 4));
    let rendered = 0;

    // readline milik REPL harus dipause biar nggak makan keystroke
    rl.pause();
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    // Copot SEMUA listener keypress lain (readline + slash menu) selama menu
    // kebuka — tanpa ini, ketikan tetap diproses readline dan bocor ke baris
    // input. Dikembalikan lagi persis di cleanup.
    const parkedKeypress = stdin.rawListeners("keypress");
    for (const l of parkedKeypress) stdin.removeListener("keypress", l);

    // Alokasi ruang: paksa terminal scroll kalau kursor di bawah
    // biar pas gambar menu, layarnya nggak nge-shift/dobel
    const maxDrawLines = pageSize + 2; 
    stdout.write("\n".repeat(maxDrawLines));
    stdout.write(`\x1b[${maxDrawLines}A`);

    stdout.write("\x1b[?25l"); // sembunyikan kursor selama milih

    function render() {
      if (rendered) stdout.write(`\x1b[${rendered}A`); // naik ke awal menu
      if (index < offset) offset = index;
      if (index >= offset + pageSize) offset = index - pageSize + 1;

      const cols = stdout.columns || 80;
      const lines = [c.bold(title) + c.dim("  (↑/↓ pilih, Enter ok, Esc batal)")];
      const visible = list.slice(offset, offset + pageSize);
      
      for (let i = 0; i < visible.length; i++) {
        const it = visible[i];
        const real = offset + i;
        const isActive = it.value === current;
        
        const prefix = "  "; // length 2
        const marker = isActive ? " (aktif)" : "";
        const hint = it.hint ? " " + it.hint : "";
        
        let label = it.label;
        const fixedLen = prefix.length + marker.length + hint.length;
        
        if (fixedLen + label.length > cols) {
          const maxLabel = Math.max(5, cols - fixedLen - 2);
          label = label.slice(0, maxLabel) + "…";
        }
        
        const cMarker = isActive ? c.dim(marker) : "";
        const cHint = hint ? c.dim(hint) : "";
        let cLine = real === index 
            ? c.cyan(`❯ ${c.bold(label)}`) 
            : `  ${label}`;
            
        lines.push(cLine + cMarker + cHint);
      }
      
      if (list.length > pageSize) {
        lines.push(c.dim(`  ${index + 1}/${list.length}`));
      }
      stdout.write(lines.map((l) => `\x1b[2K${l}`).join("\n") + "\n");
      rendered = lines.length;
    }

    function cleanup(result) {
      stdin.removeListener("data", onKey);
      stdin.setRawMode(wasRaw ?? false);
      for (const l of parkedKeypress) stdin.on("keypress", l);
      stdout.write("\x1b[?25h"); // munculkan kursor lagi
      rl.resume();
      
      // hapus menu dari layar
      stdout.write(`\x1b[${rendered}A`);
      for (let i = 0; i < maxDrawLines; i++) stdout.write(`\x1b[2K\x1b[1B`);
      stdout.write(`\x1b[${maxDrawLines}A`);
      
      resolve(result);
    }

    function onKey(buf) {
      const key = buf.toString();
      if (key === "\x1b[A" || key === "k") {
        index = (index - 1 + list.length) % list.length;
        render();
      } else if (key === "\x1b[B" || key === "j") {
        index = (index + 1) % list.length;
        render();
      } else if (key === "\r" || key === "\n") {
        cleanup(list[index].value);
      } else if (key === "\x1b" || key === "q" || key === "\x03") {
        cleanup(null);
      }
    }

    stdin.on("data", onKey);
    render();
  });
}
