import type { Page } from 'playwright';
import type { Config } from './config.js';

const SETTINGS_URL = 'https://ampcode.com/settings';

export interface CheckResult {
  ok: boolean;
  balance: string;
  topUp: string;
  payment: string;
  loc: string;
  threads: string;
  messages: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randDelay(cfg: Config): number {
  const min = cfg.delay?.min ?? 1500;
  const max = cfg.delay?.max ?? 3500;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pad(n: number, w: number): string {
  const s = String(n);
  return ' '.repeat(Math.max(0, w - s.length)) + s;
}

async function waitUrl(page: Page, substring: string, timeout = 12000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const url = page.url();
    if (url.includes(substring)) return url;
    await sleep(100);
  }
  return null;
}

async function waitForPasswordField(page: Page, timeout = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await page.locator('input[type="password"]').count();
    if (count > 0) return true;
    await sleep(200);
  }
  return false;
}

async function findEmailInput(page: Page): Promise<ReturnType<Page['locator']> | null> {
  const candidates = [
    page.getByRole('textbox', { name: /email|e-mail/i }),
    page.getByPlaceholder(/email|e-mail/i),
    page.locator('input[type="email"]'),
    page.locator('input[name="email"]'),
    page.locator('input').first(),
  ];
  for (const sel of candidates) {
    if (await sel.count()) return sel;
  }
  return null;
}

async function findPasswordInput(page: Page): Promise<ReturnType<Page['locator']> | null> {
  const candidates = [
    page.locator('input[type="password"]').first(),
    page.getByPlaceholder(/senha|password/i),
    page.getByLabel(/senha|password/i),
  ];
  for (const sel of candidates) {
    if (await sel.count()) return sel;
  }
  return null;
}

async function clickButtonByText(page: Page, patterns: RegExp[]): Promise<boolean> {
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (const pattern of patterns) {
    for (let i = 0; i < count; i++) {
      try {
        const text = await buttons.nth(i).innerText();
        if (pattern.test(text)) {
          await buttons.nth(i).click();
          return true;
        }
      } catch {
        // stale element, skip
      }
    }
  }
  return false;
}

export function parseBalance(bal: string | null): number {
  return parseFloat((bal || '$0').replace(/[$,]/g, '').trim()) || 0;
}

export function isValuable(info: CheckResult): boolean {
  if (!info.ok) return false;
  if (parseBalance(info.balance) > 0) return true;
  if (info.topUp && info.topUp !== 'Off' && info.topUp !== 'N/A') return true;
  if (info.payment !== 'Not Configured' && info.payment !== 'Balance' && info.payment !== 'N/A') return true;
  return false;
}

export async function checkAccount(
  page: Page,
  cfg: Config,
  email: string,
  password: string,
): Promise<CheckResult> {
  const timeout = cfg.timeout;

  await page.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});

  await page.goto(SETTINGS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: timeout.navigation,
  });
  await sleep(2000);

  let url = page.url();

  // Already authenticated
  if (url.includes('/settings') && !url.includes('auth.')) {
    // extract directly
  } else if (url.includes('auth.') || !url.includes('/settings')) {
    // Email step
    const emailInput = await findEmailInput(page);
    if (!emailInput) throw new Error('no-email-input');

    await emailInput.click();
    await sleep(300);
    await emailInput.fill(email);
    await sleep(500);

    const contClicked = await clickButtonByText(page, [
      /^continuar$/i,
      /^continue$/i,
      /continuar/i,
      /continue/i,
    ]);
    if (!contClicked) {
      await emailInput.press('Enter');
    }

    const pwAppeared = await waitForPasswordField(page, 15000);
    if (!pwAppeared) {
      await sleep(3000);
      url = page.url();
      const hasPw = (await page.locator('input[type="password"]').count()) > 0;
      if (!hasPw && !url.includes('/password')) {
        throw new Error('no-password-step');
      }
    }

    // Password step
    await sleep(800);

    const pwInput = await findPasswordInput(page);
    if (!pwInput) throw new Error('no-password-input');

    await pwInput.click();
    await sleep(200);
    await pwInput.fill(password);
    await sleep(500);

    // Click "Sign in" (exact to avoid "Sign in with a passkey")
    let signed = false;

    const signInBtn = page.getByRole('button', { name: 'Sign in', exact: true });
    if ((await signInBtn.count()) > 0) {
      await signInBtn.first().click().catch(() => {});
      signed = true;
    }

    if (!signed) {
      signed = await clickButtonByText(page, [/^entrar$/i, /entrar/i]);
    }

    if (!signed) {
      const primaryBtn = page.locator('button[type="submit"]').first();
      if ((await primaryBtn.count()) > 0) {
        await primaryBtn.click().catch(() => {});
        signed = true;
      }
    }

    if (!signed) {
      await pwInput.press('Enter');
    }

    await sleep(3000);

    // Handle passkey
    url = page.url();
    if (url.includes('passkey')) {
      await sleep(1500);
      await clickButtonByText(page, [/^pular$/i, /^skip$/i, /not now/i, /maybe later/i]);
      await sleep(2000);
    }

    // Verify auth
    url = page.url();
    if (!url.includes('/settings') || url.includes('auth.')) {
      const body = await page.evaluate(() => document.body.innerText);
      if (/bloqueado|blocked|ban/i.test(body)) throw new Error('blocked');
      if (/incorrect|incorreta|invalid|wrong|inválida/i.test(body)) throw new Error('wrong-pass');
      const hasEmail = (await page.locator('input[type="email"]').count()) > 0 ||
        (await page.locator('input[required]').count()) > 0;
      if (hasEmail) throw new Error('wrong-pass');
      throw new Error('auth-stuck');
    }
  }

  // Extract billing data
  await page.goto(SETTINGS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: timeout.navigation,
  });
  await sleep(3000);

  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('Balance'),
      { timeout: timeout.element },
    );
  } catch {
    // continue anyway
  }
  await sleep(2000);

  const body = await page.evaluate(() => document.body.innerText);
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const val = (label: string): string | null => {
    const i = lines.findIndex((l) => l === label);
    return i >= 0 ? lines[i + 1] ?? null : null;
  };

  const balMatch = body.match(/\$[\d,.]+/);

  return {
    ok: true,
    balance: balMatch ? balMatch[0] : val('Balance') || '$0',
    topUp: val('Automatic Top Up') || 'N/A',
    payment: val('Payment Method') || 'N/A',
    loc: val('LINES OF CODE') || '—',
    threads: val('THREADS') || '—',
    messages: val('MESSAGES') || '—',
  };
}
