const SETTINGS_URL = "https://ampcode.com/settings";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randDelay(cfg) {
  const min = cfg.delay?.min ?? 1500;
  const max = cfg.delay?.max ?? 3500;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function waitUrl(page, substring, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const url = page.url();
    if (url.includes(substring)) return url;
    await sleep(100);
  }
  return null;
}

async function clickText(page, tag, match) {
  return page.evaluate(([t, m]) => {
    const els = Array.from(document.querySelectorAll(t));
    const el = els.find((e) => e.textContent.trim().startsWith(m));
    if (el) { el.click(); return true; }
    return false;
  }, [tag, match]);
}

function parseBalance(bal) {
  return parseFloat((bal || "$0").replace(/[$,]/g, "").trim()) || 0;
}

function isValuable(info) {
  if (!info.ok) return false;
  if (parseBalance(info.balance) > 0) return true;
  if (info.topUp && info.topUp !== "Off" && info.topUp !== "N/A") return true;
  if (info.payment !== "Not Configured" && info.payment !== "Balance" && info.payment !== "N/A") return true;
  return false;
}

function pad(n, w) {
  const s = String(n);
  return " ".repeat(Math.max(0, w - s.length)) + s;
}

async function checkAccount(page, cfg, email, password) {
  const timeout = cfg.timeout;

  await page.goto("about:blank").catch(() => {});

  await page.goto(SETTINGS_URL, {
    waitUntil: "domcontentloaded",
    timeout: timeout.navigation,
  });

  let url = page.url();

  if ((url.includes("/settings") && !url.includes("auth.")) ||
      (!url.includes("/password") && !url.includes("auth."))) {
    // already authenticated
  } else if (url.includes("auth.") && !url.includes("/password")) {
    const input = await page.$('input[required]');
    if (!input) throw new Error("no-email-input");
    await input.type(email, { delay: 15 });
    await clickText(page, 'button', 'Continuar');
    url = await waitUrl(page, '/password', timeout.login);
    if (!url) throw new Error("no-password-step");
  }

  if (url && url.includes('/password')) {
    const input = await page.$('input[type="password"]');
    if (!input) throw new Error("no-password-input");
    await input.type(password, { delay: 10 });
    await clickText(page, 'button', 'Entrar');

    const postLoginUrl = (await waitUrl(page, 'ampcode.com/settings', timeout.login))
      || (await waitUrl(page, 'passkey', 5000))
      || page.url();

    if (postLoginUrl.includes('passkey')) {
      const skipped = await clickText(page, 'button', 'Pular');
      if (!skipped) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          if (btns.length > 1) btns[btns.length - 1].click();
        }).catch(() => {});
      }
      await sleep(1500);
    }

    await page.goto(SETTINGS_URL, {
      waitUntil: "domcontentloaded",
      timeout: timeout.navigation,
    });

    const afterUrl = page.url();
    if (afterUrl.includes("auth.")) {
      const body = await page.evaluate(() => document.body.innerText);
      if (afterUrl.includes("error")) throw new Error("wrong-pass");
      if (/bloqueado|blocked|ban/i.test(body)) throw new Error("blocked");
      const hasEmailInput = await page.$('input[type="email"], input[required]');
      if (hasEmailInput) throw new Error("wrong-pass");
      throw new Error("auth-stuck");
    }
  }

  await page.waitForFunction(() => document.body.innerText.includes("Balance"),
    { timeout: timeout.element }).catch(() => {});
  await sleep(2000);

  const body = await page.evaluate(() => document.body.innerText);
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const val = (label) => {
    const i = lines.findIndex(l => l === label);
    return i >= 0 ? lines[i + 1] || null : null;
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

module.exports = { checkAccount, isValuable, sleep, randDelay, pad };
