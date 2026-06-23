const path = require("path");
const fs = require("fs");
const os = require("os");

const CFG_PATH = path.join(__dirname, "config.json");

function load() {
  if (!fs.existsSync(CFG_PATH)) {
    console.error("config.json not found");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));

  return {
    threads: Math.max(1, Math.min(raw.threads || 2, os.cpus().length)),
    startLine: Math.max(1, raw.startLine || 1),
    headless: raw.headless ?? false,
    chromeProfile: raw.chromeProfile
      ? path.resolve(raw.chromeProfile)
      : "",
    outputDir: raw.outputDir || "results",
    comboFile: raw.comboFile || "",
    accounts: raw.accounts || [],
    viewport: raw.viewport || { width: 1280, height: 800 },
    delay: {
      min: raw.delay?.min ?? 1500,
      max: raw.delay?.max ?? 3500,
    },
    timeout: {
      navigation: raw.timeout?.navigation ?? 30000,
      element: raw.timeout?.element ?? 15000,
      login: raw.timeout?.login ?? 20000,
    },
    proxy: {
      enabled: raw.proxy?.enabled ?? false,
      list: raw.proxy?.list || "",
    },
    ui: {
      showProgress: raw.ui?.showProgress ?? true,
      showPerAccount: raw.ui?.showPerAccount ?? true,
      compact: raw.ui?.compact ?? false,
    },
    cui: raw.cui ?? false,
  };
}

module.exports = { load };
