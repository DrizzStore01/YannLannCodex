import path from "node:path";
import { runFetchUrl } from "./tools.js";

function truncate(text, max) {
  if (!text) return "";
  if (text.length > max) {
    return text.slice(0, max) + `\n... [terpotong, total ${text.length} chars]`;
  }
  return text;
}

/**
 * Scraping Halaman Web Dinamis (React, Vue, Anime Web, Single Page App)
 * Menggunakan JSDOM (evaluasi JS DOM native) dengan fallback ke static fetch & cheerio.
 */
export async function runScrapeDynamic(url, { waitFor = 2000, maxOutput = 16000, timeout = 25000 } = {}) {
  try {
    const { JSDOM, ResourceLoader } = await import("jsdom");
    const { load } = await import("cheerio");

    const fetchRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeout),
    });

    const html = await fetchRes.text();

    // Gunakan Cheerio + JSDOM untuk parsing DOM yang super bersih
    const $ = load(html);
    $("script, style, noscript, svg, iframe, header, footer, nav").remove();

    // Extract teks bersih
    let bodyText = $("body").text() || $.text() || "";
    bodyText = bodyText.replace(/\s+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

    if (bodyText.length > 50) {
      return truncate(`[DYNAMIC SCRAPE: ${url}]\n\n${bodyText}`, maxOutput);
    }

    // Jika cheerio terlalu sedikit, gunakan JSDOM full DOM virtual environment
    const dom = new JSDOM(html, {
      url,
      runScripts: "outside-only",
    });
    const doc = dom.window.document;
    doc.querySelectorAll("script, style, noscript, iframe").forEach((el) => el.remove());
    const jsdomText = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();

    return truncate(`[JSDOM SCRAPE: ${url}]\n\n${jsdomText}`, maxOutput) || "(Tidak ada konten terdeteksi)";
  } catch (e) {
    return `[FALLBACK STATIS] (Dynamic error: ${e.message})\n\n` + (await runFetchUrl(url, { maxOutput, timeout }));
  }
}

/**
 * Ambil Screenshot Halaman Web jika system chrome/puppeteer tersedia
 */
export async function runScreenshotWeb(url, outputPath = "screenshot.png", { timeout = 25000 } = {}) {
  try {
    const puppeteer = await import("puppeteer-core");
    // Cari executable chrome di sistem jika ada
    const possiblePaths = [
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
    const fs = await import("node:fs");
    const executablePath = possiblePaths.find((p) => fs.existsSync(p));

    if (!executablePath) {
      return `⚠️ Screenshot tidak dapat diambil karena Google Chrome/Chromium belum terinstall di OS sistem. Silakan install chrome/chromium di sistem lu dulu.`;
    }

    const browser = await puppeteer.default.launch({
      executablePath,
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    const absPath = path.resolve(outputPath);
    await page.screenshot({ path: absPath, fullPage: false });
    await browser.close();

    return `✅ Screenshot berhasil disimpan ke: ${absPath}`;
  } catch (e) {
    return `ERROR Screenshot: ${e.message}`;
  }
}
