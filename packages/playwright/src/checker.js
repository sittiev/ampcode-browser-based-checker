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

async function waitForPasswordField(page, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await page.locator('input[type="password"]').count();
    if (count > 0) return true;
    await sleep(200);
  }
  return false;
}

async function waitForElementGone(page, selector, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await page.locator(selector).count();
    if (count === 0) return true;
    await sleep(200);
  }
  return false;
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

async function findEmailInput(page) {
  for (const sel of [
    page.getByRole("textbox", { name: /email|e-mail/i }),
    page.getByPlaceholder(/email|e-mail/i),
    page.locator('input[type="email"]'),
    page.locator('input[name="email"]'),
    page.locator("input").first(),
  ]) {
    if (await sel.count()) return sel;
  }
  return null;
}

async function findPasswordInput(page) {
  for (const sel of [
    page.locator('input[type="password"]').first(),
    page.getByPlaceholder(/senha|password/i),
    page.getByLabel(/senha|password/i),
  ]) {
    if (await sel.count()) return sel;
  }
  return null;
}

async function clickButtonByText(page, patterns) {
  // Try exact match first (avoids "Sign in" matching "Sign in with a passkey")
  const buttons = page.locator("button");
  const count = await buttons.count();
  for (const pattern of patterns) {
    for (let i = 0; i < count; i++) {
      try {
        const text = await buttons.nth(i).innerText();
        if (pattern.test(text)) {
          await buttons.nth(i).click();
          return true;
        }
      } catch { /* stale element, skip */ }
    }
  }
  return false;
}

async function checkAccount(page, cfg, email, password) {
  const timeout = cfg.timeout;

  await page.goto("about:blank", { waitUntil: "domcontentloaded" }).catch(() => {});

  // Navigate to settings — will redirect to auth if not logged in
  await page.goto(SETTINGS_URL, {
    waitUntil: "domcontentloaded",
    timeout: timeout.navigation,
  });
  await sleep(2000);

  let url = page.url();

  // ── Already authenticated ──
  if (url.includes("/settings") && !url.includes("auth.")) {
    // Extract directly
  }
  // ── Auth page ──
  else if (url.includes("auth.") || !url.includes("/settings")) {
    // ── EMAIL STEP ──
    const emailInput = await findEmailInput(page);
    if (!emailInput) throw new Error("no-email-input");

    await emailInput.click();
    await sleep(300);
    await emailInput.fill(email);
    await sleep(500);

    // Click "Continuar" (PT) or "Continue" (EN)
    const contClicked = await clickButtonByText(page, [
      /^continuar$/i,
      /^continue$/i,
      /continuar/i,
      /continue/i,
    ]);
    if (!contClicked) {
      // fallback: press Enter
      await emailInput.press("Enter");
    }

    // Wait for password field to appear INLINE (no URL redirect on React SPA)
    const pwAppeared = await waitForPasswordField(page, 15000);
    if (!pwAppeared) {
      // Maybe redirected to /password URL
      await sleep(3000);
      url = page.url();
      const hasPw = (await page.locator('input[type="password"]').count()) > 0;
      if (!hasPw && !url.includes("/password")) {
        throw new Error("no-password-step");
      }
    }

    // ── PASSWORD STEP ──
    await sleep(800);

    const pwInput = await findPasswordInput(page);
    if (!pwInput) throw new Error("no-password-input");

    await pwInput.click();
    await sleep(200);
    await pwInput.fill(password);
    await sleep(500);

    // Click "Entrar" / "Sign in" (exact match to avoid "Sign in with a passkey")
    let signed = false;

    // Strategy 1: try button with exact text "Sign in" (not "Sign in with a passkey")
    const signInBtn = page.getByRole("button", { name: "Sign in", exact: true });
    if (await signInBtn.count() > 0) {
      await signInBtn.first().click().catch(() => {});
      signed = true;
    }

    // Strategy 2: click by PT text "Entrar"
    if (!signed) {
      signed = await clickButtonByText(page, [/^entrar$/i, /entrar/i]);
    }

    // Strategy 3: click first primary/branded submit button
    if (!signed) {
      const primaryBtn = page.locator('button[type="submit"]').first();
      if (await primaryBtn.count() > 0) {
        await primaryBtn.click().catch(() => {});
        signed = true;
      }
    }

    // Strategy 4: press Enter in password field
    if (!signed) {
      await pwInput.press("Enter");
    }

    // Wait for redirect to settings (or error)
    await sleep(3000);

    // Handle passkey enrollment prompt
    url = page.url();
    if (url.includes("passkey")) {
      await sleep(1500);
      // Click "Pular" or "Skip"
      await clickButtonByText(page, [/^pular$/i, /^skip$/i, /not now/i, /maybe later/i]);
      await sleep(2000);
    }

    // Verify we reached settings
    url = page.url();
    if (!url.includes("/settings") || url.includes("auth.")) {
      // Might still be on auth page — check for errors
      const body = await page.evaluate(() => document.body.innerText);
      if (/bloqueado|blocked|ban/i.test(body)) throw new Error("blocked");
      if (/incorrect|incorreta|invalid|wrong|inválida/i.test(body)) throw new Error("wrong-pass");
      // Check if we're back to email step
      const hasEmail = (await page.locator('input[type="email"]').count()) > 0 ||
        (await page.locator('input[required]').count()) > 0;
      if (hasEmail) throw new Error("wrong-pass");
      throw new Error("auth-stuck");
    }
  }

  // ── EXTRACT BILLING DATA ──
  await page.goto(SETTINGS_URL, {
    waitUntil: "domcontentloaded",
    timeout: timeout.navigation,
  });
  await sleep(3000);

  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("Balance"),
      { timeout: timeout.element }
    );
  } catch { /* continue */ }
  await sleep(2000);

  const body = await page.evaluate(() => document.body.innerText);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  const val = (label) => {
    const i = lines.findIndex((l) => l === label);
    return i >= 0 ? lines[i + 1] || null : null;
  };

  const balMatch = body.match(/\$[\d,.]+/);

  return {
    ok: true,
    balance: balMatch ? balMatch[0] : val("Balance") || "$0",
    topUp: val("Automatic Top Up") || "N/A",
    payment: val("Payment Method") || "N/A",
    loc: val("LINES OF CODE") || "—",
    threads: val("THREADS") || "—",
    messages: val("MESSAGES") || "—",
  };
}

module.exports = { checkAccount, isValuable, sleep, randDelay, pad };
