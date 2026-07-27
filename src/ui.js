const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;
export const stripAnsi = (s) => String(s).replace(ANSI_RE, "");
export const visibleLen = (s) => stripAnsi(s).length;

// Gradien magenta -> ungu -> biru -> cyan per karakter (256-color)
const GRADIENT_STOPS = [201, 171, 141, 111, 81, 51];
export function gradientText(s, { bold = false } = {}) {
  if (!useColor) return s;
  const chars = [...s];
  const last = Math.max(1, chars.length - 1);
  return chars
    .map((ch, i) => {
      if (ch === " ") return ch;
      const stop = GRADIENT_STOPS[Math.round((i / last) * (GRADIENT_STOPS.length - 1))];
      return `\x1b[38;5;${stop}m${bold ? "\x1b[1m" : ""}${ch}\x1b[0m`;
    })
    .join("");
}

// Word-wrap yang sadar ANSI (ngukur pakai panjang visible, bukan panjang string)
export function wrapText(line, width) {
  if (width <= 0 || visibleLen(line) <= width) return [line];
  const words = line.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (visibleLen(cur) + 1 + visibleLen(w) <= width) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.flatMap((l) => {
    // kata tunggal yang kepanjangan dipotong paksa (skip kalau ber-ANSI biar kode nggak kebelah)
    if (visibleLen(l) <= width || stripAnsi(l) !== l) return [l];
    const out = [];
    for (let i = 0; i < l.length; i += width) out.push(l.slice(i, i + width));
    return out;
  });
}

export function panel(title, body, colorFn = c.cyan) {
  const width = Math.min(process.stdout.columns || 80, 100);
  const line = "─".repeat(Math.max(width - visibleLen(title) - 6, 4));
  console.log(colorFn(`╭─ `) + c.bold(title) + colorFn(` ${line}`));
  for (const raw of String(body).split("\n")) {
    for (const l of wrapText(raw, width - 2)) {
      console.log(colorFn("│ ") + l);
    }
  }
  console.log(colorFn("╰" + "─".repeat(width - 1)));
}

// Efek shimmer ala Claude Code: teks redup dengan "kilauan" terang yang
// bergerak dari kiri ke kanan seiring tick animasi.
function shimmer(s, tick) {
  if (!useColor) return s;
  const chars = [...s];
  const W = 6; // lebar kilauan
  const span = chars.length + W * 2;
  const pos = (tick % span) - W;
  return chars
    .map((ch, i) =>
      i >= pos && i < pos + W ? `\x1b[1m\x1b[38;5;255m${ch}\x1b[0m` : `\x1b[2m${ch}\x1b[0m`
    )
    .join("");
}

/**
 * Spinner dengan gradien warna + shimmer + penghitung detik.
 * `label` boleh string, atau function(elapsedSeconds) => string
 * buat pesan status yang berubah seiring waktu.
 */
export function spinner(label) {
  if (!process.stdout.isTTY) return { stop() {}, update() {} };
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const frameColors = [201, 171, 141, 111, 81, 51, 81, 111, 141, 171];
  let tick = 0;
  let text = label;
  const start = Date.now();

  function render() {
    const s = Math.round((Date.now() - start) / 1000);
    const raw = typeof text === "function" ? text(s) : text;
    const maxLen = Math.max(10, (process.stdout.columns || 80) - 8);
    const lbl = raw.length > maxLen ? raw.slice(0, maxLen - 1) + "…" : raw;
    const frame = useColor
      ? `\x1b[38;5;${frameColors[tick % frameColors.length]}m${frames[tick % frames.length]}\x1b[0m`
      : frames[tick % frames.length];
    process.stdout.write(`\r\x1b[2K${frame} ${shimmer(lbl, tick)} ${c.dim(`${s}s`)}`);
    tick++;
  }

  render();
  const timer = setInterval(render, 100);
  return {
    update(t) {
      text = t;
    },
    stop() {
      clearInterval(timer);
      process.stdout.write("\r\x1b[2K");
    },
  };
}

/**
 * Renderer buat animasi ngetik (streaming) yang sadar sama `tool_call`.
 * Bakal nahan print teks kalau kecium bau-bau AI mau manggil tool,
 * biar JSON internalnya nggak bocor ke layar user.
 */
export function createStreamRenderer(model) {
  let firstChunk = true;
  let sp = spinner(`${model} · lagi mikir...`);
  let text = "";
  let printed = 0;
  let toolMode = false;
  
  let mdBuffer = "";
  let backtickBuffer = "";
  let hashBuffer = "";
  let isLineStart = true;
  let isBold = false;
  let isCode = false;

  function initIfFirst() {
    if (firstChunk) {
      firstChunk = false;
      sp.stop();
      if (useColor) {
         process.stdout.write(c.cyan(`╭─ `) + c.bold(model) + `\n`);
      }
    }
  }

  function getPrefix() {
    let prefix = c.cyan("│ ");
    if (useColor) {
      if (isBold) prefix += "\x1b[1m";
      if (isCode) prefix += "\x1b[33m";
    }
    return prefix;
  }

  function printMarkdown(chunk) {
    let out = "";
    
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      if (isLineStart && (char === "#" || char === " ")) {
        hashBuffer += char;
        if (char === " ") {
          if (/^#+ $/.test(hashBuffer)) {
            out += getPrefix() + (useColor ? "\x1b[36m\x1b[1m" : "") + hashBuffer;
          } else {
            out += getPrefix() + hashBuffer;
          }
          hashBuffer = "";
          isLineStart = false;
        }
        continue;
      } else if (hashBuffer) {
        out += getPrefix() + hashBuffer;
        hashBuffer = "";
        isLineStart = false;
      }

      if (isLineStart && char !== "\n") {
         out += getPrefix();
         isLineStart = false;
      }

      if (char === "*") {
        mdBuffer += "*";
        continue;
      }
      if (mdBuffer) {
        if (mdBuffer === "**") {
          isBold = !isBold;
          out += useColor ? (isBold ? "\x1b[1m" : "\x1b[22m") : "";
        } else {
          out += mdBuffer;
        }
        mdBuffer = "";
      }

      if (char === "`") {
        backtickBuffer += "`";
        continue;
      }
      if (backtickBuffer) {
        if (backtickBuffer === "`") {
          isCode = !isCode;
          out += useColor ? (isCode ? "\x1b[33m" : "\x1b[39m") : "";
        } else {
          out += backtickBuffer;
        }
        backtickBuffer = "";
      }

      if (char === "\n") {
        out += (useColor ? "\x1b[0m" : "") + "\n";
        isLineStart = true;
        continue;
      }

      out += char;
    }
    process.stdout.write(out);
  }

  function flushMarkdown() {
    let out = "";
    if (hashBuffer) {
      if (isLineStart) out += getPrefix();
      out += hashBuffer;
      hashBuffer = "";
      isLineStart = false;
    }
    if (mdBuffer) {
      if (isLineStart) { out += getPrefix(); isLineStart = false; }
      out += mdBuffer;
      mdBuffer = "";
    }
    if (backtickBuffer) {
      if (isLineStart) { out += getPrefix(); isLineStart = false; }
      out += backtickBuffer;
      backtickBuffer = "";
    }
    if (out) process.stdout.write(out);
  }

  return {
    pushReasoning(chunk) {
      // Tidak diprint, biar spinner tetap jalan sebagai indikator "lagi mikir".
    },
    push(chunk) {
      initIfFirst();
      text += chunk;
      if (toolMode) return;
      
      const toolIdx = text.indexOf("\n```tool_call");
      const toolIdx2 = text.indexOf("```tool_call");
      const actualIdx = toolIdx !== -1 ? toolIdx : toolIdx2;
      
      if (actualIdx !== -1) {
        toolMode = true;
        const toPrint = text.slice(printed, actualIdx);
        printMarkdown(toPrint);
        flushMarkdown();
        printed = text.length;
        if (!isLineStart) process.stdout.write("\n");
        process.stdout.write(c.cyan("│ ") + c.dim("⚙ menyiapkan tool..."));
        return;
      }
      
      let safeLimit = text.length;
      const lastTick = text.lastIndexOf("`");
      if (lastTick !== -1 && text.length - lastTick < 15) {
         safeLimit = lastTick;
      }
      
      if (safeLimit > printed) {
        const toPrint = text.slice(printed, safeLimit);
        printMarkdown(toPrint);
        printed = safeLimit;
      }
    },
    end() {
      if (firstChunk) sp.stop();
      if (!toolMode) {
         if (printed < text.length) {
            printMarkdown(text.slice(printed));
         }
         flushMarkdown();
         if (!isLineStart) process.stdout.write("\n");
         process.stdout.write(c.cyan("╰" + "─".repeat(50)) + "\n");
      } else {
         process.stdout.write("\r\x1b[2K"); // hapus spinner "menyiapkan tool..."
      }
      return text;
    }
  };
}
