const { connect } = require("puppeteer-real-browser");
const path = require("path");
const fs = require("fs");
const os = require("os");

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-site-isolation-trials",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--disable-default-apps",
  "--hide-scrollbars",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-default-browser-check",
  "--disable-component-update",
  "--disable-renderer-backgrounding",
  "--disable-ipc-flooding-protection",
  "--password-store=basic",
  "--use-mock-keychain",
];

async function createSession(cfg, workerId) {
  const profileDir = cfg.chromeProfile
    ? cfg.chromeProfile
    : path.join(os.tmpdir(), `ampcode-pw${workerId}-${Date.now()}`);

  fs.mkdirSync(profileDir, { recursive: true });

  const { browser, page } = await connect({
    headless: cfg.headless,
    turnstile: false,
    args: cfg.headless ? STEALTH_ARGS : [...STEALTH_ARGS, "--start-maximized"],
    customConfig: { userDataDir: profileDir },
    connectOption: {
      defaultViewport: cfg.headless ? cfg.viewport : null,
    },
  });

  return { browser, page, profileDir };
}

async function clearSession(page) {
  const client = await page.target().createCDPSession().catch(() => null);
  if (client) {
    await client.send("Network.clearBrowserCookies").catch(() => {});
    await client.send("Network.clearBrowserCache").catch(() => {});
    await client.detach().catch(() => {});
  }
}

module.exports = { createSession, clearSession };
