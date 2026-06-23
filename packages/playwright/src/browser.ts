import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Config } from './config.js';

const STEALTH_ARGS: readonly string[] = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-default-apps',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--disable-component-update',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  '--password-store=basic',
  '--use-mock-keychain',
];

const REALISTIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface Session {
  context: BrowserContext;
  page: Page;
  profileDir: string;
}

export async function createSession(cfg: Config, workerId: number): Promise<Session> {
  const profileDir = cfg.chromeProfile
    ? cfg.chromeProfile
    : join(tmpdir(), `ampcode-w${workerId}-${Date.now()}`);

  mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: cfg.headless,
    channel: 'chrome',
    args: [
      ...STEALTH_ARGS,
      `--window-size=${cfg.viewport.width},${cfg.viewport.height + 100}`,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    userAgent: REALISTIC_UA,
    viewport: cfg.viewport,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    javaScriptEnabled: true,
    locale: 'en-US',
    timezoneId: 'America/Sao_Paulo',
    permissions: ['geolocation'],
    geolocation: { latitude: -23.5505, longitude: -46.6333 },
    bypassCSP: true,
  });

  await context.addInitScript(() => {
    // Strip webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete Object.getPrototypeOf(navigator).webdriver;

    // Fake chrome runtime (TS doesn't know about window.chrome)
    (window as unknown as Record<string, unknown>).chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };

    // Fake plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [1, 2, 3, 4, 5] as unknown as PluginArray;
        arr.item = (i: number) => arr[i] ?? null;
        arr.namedItem = () => null;
        arr.refresh = () => {};
        return arr;
      },
    });

    // Fake languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'pt-BR', 'pt'],
    });

    // Permissions override
    const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : origQuery(params);
  });

  const pages = context.pages();
  const page = pages.length ? pages[0]! : await context.newPage();

  if (page) {
    await page.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  return { context, page, profileDir };
}

export async function clearSession(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page).catch(() => null);
  if (!cdp) return;
  await cdp.send('Network.clearBrowserCookies').catch(() => {});
  await cdp.send('Network.clearBrowserCache').catch(() => {});
  await cdp.detach().catch(() => {});
}
