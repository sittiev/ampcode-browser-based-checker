const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
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
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-ipc-flooding-protection",
  "--password-store=basic",
  "--use-mock-keychain",
];

const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function createSession(cfg, workerId) {
  const profileDir = cfg.chromeProfile
    ? cfg.chromeProfile
    : path.join(os.tmpdir(), `ampcode-w${workerId}-${Date.now()}`);

  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: cfg.headless,
    channel: "chrome",
    args: [
      ...STEALTH_ARGS,
      `--window-size=${cfg.viewport.width},${cfg.viewport.height + 100}`,
    ],
    ignoreDefaultArgs: [
      "--enable-automation",
    ],
    userAgent: REALISTIC_UA,
    viewport: cfg.viewport,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    javaScriptEnabled: true,
    locale: "en-US",
    timezoneId: "America/Sao_Paulo",
    permissions: ["geolocation"],
    geolocation: { latitude: -23.5505, longitude: -46.6333 },
    bypassCSP: true,
  });

  // Remove webdriver / automation traces
  await context.addInitScript(() => {
    // nuke webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    delete Object.getPrototypeOf(navigator).webdriver;

    // fake chrome runtime
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const arr = [1, 2, 3, 4, 5];
        arr.item = (i) => arr[i];
        arr.namedItem = () => null;
        arr.refresh = () => {};
        return arr;
      },
    });

    // fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en", "pt-BR", "pt"],
    });

    // permissions override
    const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (params) =>
      params.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : origQuery(params);
  });

  // Open a fresh page
  const pages = context.pages();
  const page = pages.length ? pages[0] : await context.newPage();

  // Extra: kill the CDP "Chrome is being controlled" infobar
  if (page) {
    await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  return { context, page, profileDir };
}

async function clearSession(page) {
  const cdp = await page.context().newCDPSession(page).catch(() => null);
  if (!cdp) return;
  await cdp.send("Network.clearBrowserCookies").catch(() => {});
  await cdp.send("Network.clearBrowserCache").catch(() => {});
  await cdp.detach().catch(() => {});
}

module.exports = { createSession, clearSession };
