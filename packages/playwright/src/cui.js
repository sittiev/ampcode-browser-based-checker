const readline = require("readline");
const path = require("path");
const fs = require("fs");
const chalk = require("chalk");

const CFG_PATH = path.join(__dirname, "..", "config.json");

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("");
  console.log(chalk.cyan("  ╔" + "═".repeat(50) + "╗"));
  console.log(chalk.cyan("  ║") + chalk.bold.white("  AmpCode Checker — Interactive Setup") + " ".repeat(12) + chalk.cyan("║"));
  console.log(chalk.cyan("  ╚" + "═".repeat(50) + "╝"));
  console.log("");

  let cfg = {};
  if (fs.existsSync(CFG_PATH)) {
    try { cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8")); } catch {}
  }

  // ── Threads ──
  const threads = await question(rl, chalk.white("  Threads") + chalk.gray(` (${cfg.threads || 2}): `));
  if (threads && !isNaN(threads)) cfg.threads = parseInt(threads, 10);

  // ── Headless ──
  const headless = await question(rl, chalk.white("  Headless (y/n)") + chalk.gray(` (${cfg.headless ? "y" : "n"}): `));
  if (headless) cfg.headless = headless.toLowerCase().startsWith("y");

  // ── Combo file ──
  const combo = await question(rl, chalk.white("  Combo file") + chalk.gray(` (${cfg.comboFile || "ampcode_login_pass.txt"}): `));
  if (combo) cfg.comboFile = combo;

  // ── Chrome profile ──
  const profile = await question(rl, chalk.white("  Chrome profile path") + chalk.gray(` (${cfg.chromeProfile || "none"}): `));
  if (profile && profile.toLowerCase() !== "none") cfg.chromeProfile = profile;
  else if (profile.toLowerCase() === "none") cfg.chromeProfile = "";

  // ── Output dir ──
  const outDir = await question(rl, chalk.white("  Output directory") + chalk.gray(` (${cfg.outputDir || "results"}): `));
  if (outDir) cfg.outputDir = outDir;

  // ── Delay min ──
  const delayMin = await question(rl, chalk.white("  Delay min (ms)") + chalk.gray(` (${cfg.delay?.min ?? 1500}): `));
  if (delayMin && !isNaN(delayMin)) {
    if (!cfg.delay) cfg.delay = {};
    cfg.delay.min = parseInt(delayMin, 10);
  }

  // ── Delay max ──
  const delayMax = await question(rl, chalk.white("  Delay max (ms)") + chalk.gray(` (${cfg.delay?.max ?? 3500}): `));
  if (delayMax && !isNaN(delayMax)) {
    if (!cfg.delay) cfg.delay = {};
    cfg.delay.max = parseInt(delayMax, 10);
  }

  // ── Proxy enabled ──
  const proxyOn = await question(rl, chalk.white("  Use proxy (y/n)") + chalk.gray(` (${cfg.proxy?.enabled ? "y" : "n"}): `));
  if (proxyOn) {
    if (!cfg.proxy) cfg.proxy = {};
    cfg.proxy.enabled = proxyOn.toLowerCase().startsWith("y");
  }

  // ── Proxy list ──
  if (cfg.proxy?.enabled) {
    const proxyList = await question(rl, chalk.white("  Proxy list file") + chalk.gray(` (${cfg.proxy?.list || "proxies.txt"}): `));
    if (proxyList) cfg.proxy.list = proxyList;
  }

  // ── Start line ──
  const startLine = await question(rl, chalk.white("  Start line") + chalk.gray(` (${cfg.startLine || 1}): `));
  if (startLine && !isNaN(startLine)) cfg.startLine = parseInt(startLine, 10);

  // ── Save ──
  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), "utf8");

  console.log("");
  console.log(chalk.green("  ✓ Config saved to config.json"));
  console.log("");

  rl.close();
}

module.exports = { setup };
