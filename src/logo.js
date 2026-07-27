import { c, gradientText, visibleLen } from "./ui.js";

const EMBLEM_WIDTH = 9;
const GAP = "   ";

// Gradien border emblem: magenta -> ungu -> cyan, satu warna per baris
const GRADIENT = [201, 141, 51];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const tint = (code, s) => (useColor ? `\x1b[38;5;${code}m${s}\x1b[0m` : s);

function emblemLines() {
  // Baris tengah dirakit manual biar simbol ❯_ bisa beda warna dari border
  const prompt = useColor
    ? `\x1b[1m\x1b[38;5;213m❯\x1b[0m\x1b[38;5;51m_\x1b[0m`
    : "❯_";
  return [
    tint(GRADIENT[0], " ╭──────╮"),
    tint(GRADIENT[1], " │ ") + prompt + "   " + tint(GRADIENT[1], "│"),
    tint(GRADIENT[2], " ╰──────╯"),
  ];
}

// Potong teks (tanpa ANSI) kalau melebihi width, kasih ellipsis
const fit = (s, width) => (s.length > width ? s.slice(0, Math.max(1, width - 1)) + "…" : s);

/**
 * Emblem startup yang responsif: teks di samping kalau lebar cukup,
 * di bawah kalau sempit; baris kepanjangan dipotong dengan ellipsis.
 */
export function showLogo({ brand, version, devs }) {
  const cols = process.stdout.columns || 80;
  const emblem = emblemLines();
  const sideWidth = cols - EMBLEM_WIDTH - GAP.length;
  const sideBySide = sideWidth >= brand.length + 4;
  const textWidth = sideBySide ? sideWidth : cols - 2;

  const info = [
    gradientText(brand, { bold: true }),
    c.dim(fit(`AI Agent · v${version}`, textWidth)),
    c.dim(fit(`dev: ${devs}`, textWidth)),
  ];

  console.log();
  if (sideBySide) {
    emblem.forEach((line, i) => console.log(line + GAP + info[i]));
  } else {
    emblem.forEach((line) => console.log(line));
    info.forEach((line) => console.log(" " + line));
  }
  console.log();
  return true;
}
