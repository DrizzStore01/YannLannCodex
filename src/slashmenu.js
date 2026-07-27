import { c } from "./ui.js";

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

/**
 * Filter perintah slash berdasarkan isi baris input.
 * Menu cuma aktif kalau baris diawali "/" dan belum ada spasi (lagi ngetik nama perintah).
 */
export function filterCommands(commands, line) {
  if (!line.startsWith("/") || /\s/.test(line)) return null;
  const q = line.slice(1).toLowerCase();
  const matches = commands.filter((cmd) => cmd.name.slice(1).toLowerCase().startsWith(q));
  return matches.length ? matches : null;
}

/**
 * Resolusi prefix: "/mo" -> unik? nama lengkap : null.
 * Return { name } kalau ketemu satu, { ambiguous: [...] } kalau lebih, null kalau nol.
 */
export function resolveCommand(commands, typed) {
  const exact = commands.find((cmd) => cmd.name === typed);
  if (exact) return { name: exact.name };
  const matches = commands.filter((cmd) => cmd.name.startsWith(typed));
  if (matches.length === 1) return { name: matches[0].name };
  if (matches.length > 1) return { ambiguous: matches.map((m) => m.name) };
  return null;
}

/**
 * Dropdown perintah ala Claude Code: muncul begitu ngetik "/".
 * ↑/↓ pilih, Tab autocomplete, Enter eksekusi yang ke-highlight, Esc tutup.
 * Return { consumeSelection() } — dipanggil setelah Enter buat ambil item terpilih.
 */
export function setupSlashMenu(rl, commands, promptLabel, { force = false } = {}) {
  const stdin = rl.input ?? process.stdin;
  const stdout = rl.output ?? process.stdout;
  if (!force && !(stdin.isTTY && stdout.isTTY)) {
    return { consumeSelection: () => null };
  }

  const promptWidth = stripAnsi(promptLabel).length;
  let active = false;
  let sel = 0;
  let drawn = false;
  let savedHistory = null;
  let lastSelection = null;
  let dismissed = false;
  let lastLine = "";

  const col = () => promptWidth + rl.cursor + 1;

  function draw(matches) {
    const width = Math.max(...matches.map((m) => m.name.length));
    const lines = matches.map((m, i) => {
      const label = m.name.padEnd(width + 2);
      return i === sel
        ? c.cyan(`❯ ${label}`) + c.dim(m.desc)
        : `  ${label}` + c.dim(m.desc);
    });
    stdout.write(
      `\n\x1b[J` + lines.join("\n") + `\x1b[${lines.length}A\x1b[${col()}G`
    );
    drawn = true;
  }

  function clear() {
    if (!drawn) return;
    stdout.write(`\n\x1b[J\x1b[1A\x1b[${col()}G`);
    drawn = false;
  }

  function deactivate() {
    clear();
    active = false;
    if (savedHistory) {
      rl.history = savedHistory;
      savedHistory = null;
    }
  }

  function onKeypress(ch, key = {}) {
    if (key.name === "return" || key.name === "enter") {
      // PENTING: saat rl.question() pending, readline TIDAK emit event 'line',
      // jadi pembersihan menu harus di sini. Kursor sudah pindah ke baris di
      // bawah input (bekas baris pertama menu) karena readline menulis \r\n.
      if (active) {
        stdout.write("\x1b[J");
        drawn = false;
        active = false;
        if (savedHistory) {
          // readline sempat unshift jawaban ke history kosong; gabungkan balik
          rl.history = [...rl.history.filter((h) => h.trim()), ...savedHistory];
          savedHistory = null;
        }
        // lastSelection DIBIARKAN — dikonsumsi main loop via consumeSelection()
      }
      lastLine = "";
      return;
    }

    // Tab: readline keburu masukin \t ke baris, jadi pakai lastLine (baris sebelum tab)
    if (key.name === "tab" && active && !dismissed) {
      const matches = filterCommands(commands, lastLine);
      if (matches) {
        const target = matches[Math.min(sel, matches.length - 1)].name;
        rl.write(null, { ctrl: true, name: "u" }); // hapus kiri kursor (termasuk \t)
        rl.write(null, { ctrl: true, name: "k" }); // hapus kanan kursor
        rl.write(target + " ");
        lastLine = rl.line;
        deactivate();
        lastSelection = null;
        return;
      }
    }

    if (rl.line !== lastLine) {
      sel = 0;
      dismissed = false;
    }
    lastLine = rl.line;

    const matches = dismissed ? null : filterCommands(commands, rl.line);
    if (!matches) {
      if (active) deactivate();
      lastSelection = null;
      return;
    }

    if (!active) {
      active = true;
      // Kosongkan history readline biar ↑/↓ jadi navigasi menu, bukan ganti input
      savedHistory = rl.history;
      rl.history = [];
    }

    if (key.name === "up") {
      sel = (sel - 1 + matches.length) % matches.length;
    } else if (key.name === "down") {
      sel = (sel + 1) % matches.length;
    } else if (key.name === "escape") {
      deactivate();
      dismissed = true;
      lastSelection = null;
      return;
    }
    if (sel >= matches.length) sel = 0;

    lastSelection = matches[sel].name;
    draw(matches);
  }

  stdin.on("keypress", onKeypress);

  // Jalur tanpa question() (mis. dipakai langsung di tes): 'line' tetap di-handle.
  // Di CLI asli jalur ini tidak kepanggil saat question pending — cleanup-nya
  // sudah ditangani handler keypress Enter di atas.
  rl.on("line", (line) => {
    if (active) {
      stdout.write("\x1b[J");
      active = false;
      drawn = false;
      if (savedHistory) {
        if (line.trim() && savedHistory[0] !== line) savedHistory.unshift(line);
        rl.history = savedHistory;
        savedHistory = null;
      }
    }
    lastLine = "";
  });

  return {
    consumeSelection() {
      const s = lastSelection;
      lastSelection = null;
      return s;
    },
  };
}
