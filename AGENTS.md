# AGENTS.md

## Project Overview

Multi-engine account checker for `auth.ampcode.com`. **pnpm monorepo** with two independent engines — Playwright (recommended) and Puppeteer (legacy). Both use real Chrome browsers with anti-detection measures to log in, then scrape billing/usage data from the AmpCode settings page.

## Commands

```bash
pnpm install              # Install all workspace deps + download Chromium (Playwright)
pnpm playwright           # Run Playwright engine
pnpm puppeteer            # Run Puppeteer engine
pnpm playwright:setup     # CUI setup wizard for Playwright
pnpm puppeteer:setup      # CUI setup wizard for Puppeteer
```

No build step, no tests, no linter configured.

## Architecture (Monorepo)

```
ampcode-checker/
├── package.json              # Root workspace — pnpm orchestration scripts
├── pnpm-workspace.yaml       # packages/*
├── packages/
│   ├── playwright/           # @ampcode/playwright (v2.0, recommended)
│   │   ├── index.js          # Orchestrator
│   │   ├── config.json
│   │   └── src/
│   │       ├── config.js     # Config loader (config.json → typed object)
│   │       ├── accounts.js   # Combo file / inline account parser
│   │       ├── browser.js    # chromium.launchPersistentContext + anti-detection
│   │       ├── checker.js    # Auth flow + settings scraper (Playwright native locators)
│   │       ├── ui.js         # Terminal output: banner, per-account, summary
│   │       ├── output.js     # File output: grouped by status into results/*.txt
│   │       └── cui.js        # Interactive readline config wizard
│   └── puppeteer/            # @ampcode/puppeteer (v1.1, legacy)
│       ├── index.js
│       ├── config.json
│       └── src/              # Same module names, Puppeteer implementation
│           ├── config.js
│           ├── accounts.js
│           ├── browser.js    # puppeteer-real-browser connect() + CDP clearing
│           ├── checker.js    # Auth via evaluate(el.click()) — legacy style
│           ├── ui.js
│           ├── output.js
│           └── cui.js
```

**Data flow** (identical in both engines):
1. `config.js` loads `config.json` → typed config
2. `accounts.js` loads combo file or inline accounts array (supports `:` and `|` separators)
3. Main loop spawns N workers (N = min(threads, account count))
4. Each worker: `browser.js` creates session → `checker.js` per-account → `ui.js` real-time output
5. After all workers finish: `output.js` writes grouped files + `ui.js` prints summary

## Engine Comparison

| Trait | Playwright | Puppeteer |
|---|---|---|
| Browser launch | `chromium.launchPersistentContext(channel:"chrome")` | `puppeteer-real-browser` `connect()` |
| Anti-detection | Real TLS/JA3 fingerprint + initScripts | Wrapper library (less stealth) |
| Button clicks | `getByRole/getByText` native locators | `page.evaluate(el.click())` — **may fail on React SPAs** |
| Auth flow | `waitForPasswordField()` (DOM polling, handles inline render) | URL-based redirect detection (`waitUrl`) |
| Strict-mode risks | Resolved via `.first()` + `clickButtonByText()` iteration | None (always uses `evaluate`) |
| Install size | Larger (downloads Chromium) | Smaller (uses system Chrome) |

## Key Details — Playwright Engine

### Anti-Detection (browser.js)
- `channel: "chrome"` — uses installed Chrome, real TLS/JA3 fingerprint
- `ignoreDefaultArgs: ["--enable-automation"]` — removes navigator.webdriver
- `--disable-blink-features=AutomationControlled` — hides blink AutomationControlled flag
- `addInitScript` overrides: `navigator.webdriver` → `undefined`, `chrome.runtime`, `navigator.plugins` (array with .item/.namedItem/.refresh), `navigator.languages`, `permissions.query`
- Custom UA: Chrome 131 on Windows, `bypassCSP: true`
- `viewport`, `locale`, `timezoneId`, `geolocation` set to São Paulo

### Button Clicking — Playwright Native Locators (checker.js)
**CRITICAL**: Never use `page.evaluate(el.click())` — it fails on React/Next.js apps. Use Playwright native locators:

```js
// Exact match to avoid "Sign in" also matching "Sign in with a passkey"
const signInBtn = page.getByRole("button", { name: "Sign in", exact: true });
if (await signInBtn.count() > 0) await signInBtn.first().click();

// Fallback: iterate buttons by innerText
async function clickButtonByText(page, patterns) {
  const buttons = page.locator("button");
  const count = await buttons.count();
  for (const pattern of patterns) {
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).innerText();
      if (pattern.test(text)) { await buttons.nth(i).click(); return true; }
    }
  }
  return false;
}
```

For form inputs:
```js
await page.getByRole("textbox", { name: /email/i }).fill(email);
await page.locator('input[type="password"]').first().fill(password);
```

### Auth Flow (checker.js)
- Navigates to `https://ampcode.com/settings` — unauthenticated users redirect to auth page
- Email step: finds email input (multiple locator strategies) → fills email → clicks "Continuar" (PT) / "Continue" (EN)
- **Password appears inline** (React SPA, no URL redirect) — uses `waitForPasswordField()` polling DOM for `input[type="password"]`
- Password step: finds password input → fills password → clicks "Sign in" with `{ exact: true }` to avoid strict-mode collision with "Sign in with a passkey"
- Passkey prompt: clicks "Pular" / "Skip" or last button as fallback
- Verification: navigates to settings again, checks URL doesn't redirect to auth.ampcode.com
- If back on email input → wrong password

### Valuable Account Detection (`isValuable()`)
- Balance > $0
- OR TopUp is not "Off"/"N/A"
- OR Payment method is not "Not Configured"/"Balance"/"N/A"

## Key Details — Puppeteer Engine

- Uses `puppeteer-real-browser` `connect()` with `userDataDir` in customConfig
- Auth flow uses URL-based detection (`waitUrl`) — assumes redirects between steps
- Button clicks use `page.evaluate(el.click())` via `clickText()` helper — works for server-rendered pages but fragile on SPAs
- Anti-detection via the wrapper library's built-in stealth + Chrome args in `STEALTH_ARGS`
- Each worker calls `clearSession()` before checking next account (CDP cookie + cache clearing)

## Shared Modules

Both engines share identical architecture and APIs across these modules:

### accounts.js
- Priority: combo file → inline `accounts[]` → exit with error
- Separator: `:` or `|`
- Applies `startLine - 1` skip offset
- Exports: `load(cfg) → [{email, password}]`

### ui.js
- `banner()` — ASCII header with engine-specific branding
- `start(config)` — prints config summary
- `result(entry, opts)` — per-account console line (color-coded by status, green bold for valuable)
- `summary()` — elapsed time, CPM, status breakdown, valuable count
- `getStats()` — returns mutable stats object for external patching

### output.js
- `writeGrouped(outputDir, results)` — writes accounts to `valid.txt`, `valuable.txt`, `wrong.txt`, `blocked.txt`, `broken.txt`, `errors.txt`
- `writeSummary(outputDir, total, stats, elapsed)` — writes `summary.txt`
- Clears previous output files at start of each run

### cui.js
- Interactive readline wizard (`readline.createInterface`)
- Prompts: threads, headless, combo file, chrome profile, output dir, delay range, proxy, start line
- Writes directly to `config.json`
- Triggered by `--setup` CLI flag or `"cui": true` in config

### config.js
- Loads `config.json` from package root
- Caps threads at `os.cpus().length`
- Resolves `chromeProfile` to absolute path
- Returns typed config object with defaults for all fields

## Concurrency Model

- Shared `nextIdx` counter — workers atomically pull jobs (safe: JS async loop single-threaded)
- Workers run in parallel via `Promise.all()`
- Random delay between accounts (`delay.min`–`delay.max` ms)
- Thread count capped at `os.cpus().length`

## Session Isolation

- Each worker: unique temp `userDataDir` in `os.tmpdir()`
- Between accounts: CDP `Network.clearBrowserCookies` + `Network.clearBrowserCache`
- Persistent profile mode: set `chromeProfile` in config → single shared profile (only safe when threads=1)
- Temp profiles deleted on worker exit unless using persistent mode

## Configuration (config.json)

```jsonc
{
  "threads": 2,             // 1-N (capped at CPU count)
  "startLine": 1,           // 1-based resume offset
  "headless": false,        // true = hidden Chrome
  "chromeProfile": "",      // Path to persistent Chrome profile
  "outputDir": "results",   // Grouped output directory
  "comboFile": "ampcode_login_pass.txt",
  "accounts": [],           // Inline fallback
  "viewport": { "width": 1280, "height": 800 },
  "delay": { "min": 1500, "max": 3500 },  // ms between accounts
  "timeout": {
    "navigation": 30000,
    "element": 15000,
    "login": 20000
  },
  "proxy": { "enabled": false, "list": "" },
  "ui": {
    "showProgress": true,
    "showPerAccount": true,
    "compact": false
  },
  "cui": false              // true = always run interactive setup
}
```

## Dependencies

**Root workspace**: none (pnpm orchestration only)

**@ampcode/playwright**: `playwright`, `chalk`, `dotenv`

**@ampcode/puppeteer**: `puppeteer-real-browser`, `chalk`, `dotenv`

## Gotchas

- **Portuguese UI labels**: Buttons are "Continuar", "Entrar", "Pular" — locators must match these
- **Never use `page.evaluate(el.click())` in Playwright engine**: Use `getByRole/getByText` or `clickButtonByText()` iterator
- **"Sign in" strict mode**: `getByRole("button", { name: /sign in/i })` matches two buttons on AmpCode. Use `{ exact: true }` or iterate by `innerText`
- **Password appears inline**: The React SPA doesn't redirect URLs after "Continuar". Playwright engine polls `input[type="password"]` in DOM. Puppeteer engine relies on `/password` URL redirect (may not always work).
- **Text-based scraping fragile**: Settings data extracted from `document.body.innerText` — any UI label change breaks extraction
- **`.env` loaded but unused**: Accounts come from combo file or `config.json`, not `.env`
- **`channel: "chrome"`** requires Chrome installed on the system
- **`launchPersistentContext`** can't reuse the same `userDataDir` concurrently across workers
- **pnpm required**: PNPM workspaces — running `npm install` at root will fail
