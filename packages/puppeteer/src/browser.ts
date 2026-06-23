import { connect } from 'puppeteer-real-browser';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Session {
  browser: any;
  page: any;
  profileDir: string;
}

export async function createSession(cfg: Config, workerId: number): Promise<Session> {
  const profileDir = cfg.chromeProfile
    ? cfg.chromeProfile
    : join(tmpdir(), `ampcode-pp${workerId}-${Date.now()}`);

  mkdirSync(profileDir, { recursive: true });

  const { browser, page } = await connect({
    headless: cfg.headless,
    turnstile: false,
    args: cfg.headless ? [...STEALTH_ARGS] : [...STEALTH_ARGS, '--start-maximized'],
    customConfig: { userDataDir: profileDir },
    connectOption: {
      defaultViewport: cfg.headless ? cfg.viewport : null,
    },
  });

  return { browser, page, profileDir };
}

export async function clearSession(page: any): Promise<void> {
  const client = await page.target().createCDPSession().catch(() => null);
  if (!client) return;
  await client.send('Network.clearBrowserCookies').catch(() => {});
  await client.send('Network.clearBrowserCache').catch(() => {});
  await client.detach().catch(() => {});
}
