/**
 * Auto Project Context — scan workdir dan build konteks project
 * buat di-inject ke system prompt. AI jadi langsung paham
 * tech stack, dependencies, struktur folder, dan git status.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function tryReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function tryExec(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, timeout: 5000, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Scan directory tree (max depth), return array of relative paths.
 * Skip node_modules, .git, dist, build, __pycache__, .venv, vendor, dll.
 */
function scanTree(dir, maxDepth = 3, prefix = "") {
  const SKIP = new Set([
    "node_modules", ".git", "dist", "build", "__pycache__", ".venv",
    "venv", "vendor", ".next", ".nuxt", ".cache", ".output",
    "target", "coverage", ".tox", "env", ".env",
  ]);

  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  entries.sort((a, b) => {
    // Direktori duluan
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) {
        result.push(`${rel}/ (skipped)`);
        continue;
      }
      result.push(`${rel}/`);
      if (maxDepth > 1) {
        result.push(...scanTree(path.join(dir, entry.name), maxDepth - 1, rel));
      }
    } else {
      result.push(rel);
    }
  }
  return result;
}

/**
 * Detect project type dan extract info penting.
 */
function detectProject(workdir) {
  const info = [];

  // === Node.js / JavaScript ===
  const pkg = tryReadJSON(path.join(workdir, "package.json"));
  if (pkg) {
    info.push(`Project: ${pkg.name || "unnamed"} v${pkg.version || "?"}`);
    if (pkg.description) info.push(`Deskripsi: ${pkg.description}`);
    const type = pkg.type === "module" ? "ESM" : "CommonJS";
    info.push(`Type: Node.js (${type})`);
    if (pkg.scripts) {
      const scripts = Object.entries(pkg.scripts)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      info.push(`Scripts:\n${scripts}`);
    }
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    if (deps.length) info.push(`Dependencies: ${deps.join(", ")}`);
    if (devDeps.length) info.push(`Dev dependencies: ${devDeps.join(", ")}`);
    if (pkg.engines) info.push(`Engines: ${JSON.stringify(pkg.engines)}`);
  }

  // === Python ===
  const pyproject = tryReadJSON(path.join(workdir, "pyproject.toml"));
  if (fs.existsSync(path.join(workdir, "requirements.txt"))) {
    info.push("Type: Python");
    try {
      const reqs = fs.readFileSync(path.join(workdir, "requirements.txt"), "utf8")
        .split("\n")
        .filter(l => l.trim() && !l.startsWith("#"))
        .slice(0, 20);
      if (reqs.length) info.push(`Requirements: ${reqs.join(", ")}`);
    } catch {}
  }
  if (fs.existsSync(path.join(workdir, "setup.py"))) {
    info.push("Type: Python (setup.py)");
  }

  // === Go ===
  if (fs.existsSync(path.join(workdir, "go.mod"))) {
    info.push("Type: Go");
    try {
      const mod = fs.readFileSync(path.join(workdir, "go.mod"), "utf8");
      const modLine = mod.match(/^module\s+(.+)/m);
      if (modLine) info.push(`Module: ${modLine[1]}`);
      const goVer = mod.match(/^go\s+(.+)/m);
      if (goVer) info.push(`Go version: ${goVer[1]}`);
    } catch {}
  }

  // === Rust ===
  if (fs.existsSync(path.join(workdir, "Cargo.toml"))) {
    info.push("Type: Rust (Cargo)");
  }

  // === Docker ===
  if (fs.existsSync(path.join(workdir, "Dockerfile"))) {
    info.push("Docker: Dockerfile ditemukan");
  }
  if (fs.existsSync(path.join(workdir, "docker-compose.yml")) || fs.existsSync(path.join(workdir, "docker-compose.yaml"))) {
    info.push("Docker: docker-compose ditemukan");
  }

  // === Makefile ===
  if (fs.existsSync(path.join(workdir, "Makefile"))) {
    info.push("Build: Makefile ditemukan");
  }

  return info;
}

/**
 * Detect git info.
 */
function detectGit(workdir) {
  const info = [];
  const isGit = fs.existsSync(path.join(workdir, ".git"));
  if (!isGit) {
    info.push("Git: tidak ada repo git");
    return info;
  }

  info.push("Git: repo aktif");

  const branch = tryExec("git", ["branch", "--show-current"], workdir);
  if (branch) info.push(`Branch: ${branch}`);

  const status = tryExec("git", ["status", "--short"], workdir);
  if (status) {
    const lines = status.split("\n");
    info.push(`Status: ${lines.length} file berubah`);
  } else {
    info.push("Status: clean");
  }

  const lastCommit = tryExec("git", ["log", "--oneline", "-1"], workdir);
  if (lastCommit) info.push(`Last commit: ${lastCommit}`);

  return info;
}

/**
 * Build full project context string.
 */
export function buildProjectContext(workdir) {
  const sections = [];

  // Project info
  const projectInfo = detectProject(workdir);
  if (projectInfo.length) {
    sections.push(projectInfo.join("\n"));
  }

  // Git info
  const gitInfo = detectGit(workdir);
  if (gitInfo.length) {
    sections.push(gitInfo.join("\n"));
  }

  // Directory tree
  const tree = scanTree(workdir, 3);
  if (tree.length) {
    const treeStr = tree.length > 80
      ? tree.slice(0, 80).join("\n") + `\n... (+${tree.length - 80} files)`
      : tree.join("\n");
    sections.push(`Struktur project:\n${treeStr}`);
  }

  if (!sections.length) return "";
  return "\n\n--- KONTEKS PROJECT ---\n" + sections.join("\n\n");
}
