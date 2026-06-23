# AGENTS.md

## Project Overview

Multi-engine account checker for `auth.ampcode.com`. **pnpm monorepo** written in **TypeScript (strict mode)** with two independent engines — Playwright (recommended) and Puppeteer (legacy). Both use real Chrome browsers with anti-detection measures to log in, then scrape billing/usage data from the AmpCode settings page.

## Commands

```bash
pnpm install              # Install all workspace deps + download Chromium (Playwright)
pnpm playwright           # Run Playwright engine (via tsx)
pnpm puppeteer            # Run Puppeteer engine (via tsx)
pnpm playwright:setup     # CUI setup wizard for Playwright
pnpm puppeteer:setup      # CUI setup wizard for Puppeteer
```

**Type checking:**
```bash
cd packages/playwright && npx tsc --noEmit   # Typecheck Playwright
cd packages/puppeteer && npx tsc --noEmit    # Typecheck Puppeteer
```

**Build (compile to JS):**
```bash
cd packages/playwright && npx tsc            # Compile Playwright → dist/
cd packages/puppeteer && npx tsc             # Compile Puppeteer → dist/
```

No linter configured.

## Architecture (Monorepo)

```
ampcode-checker/
├── package.json              # Root workspace — pnpm orchestration scripts
├── pnpm-workspace.yaml       # packages/*
├── tsconfig.base.json        # Shared TS strict config (extends Google TS style)
├── packages/
│   ├── playwright/           # @ampcode/playwright (v2.0, recommended)
│   │   ├── index.ts          # Orchestrator
│   │   ├── config.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── config.ts     # Config loader (config.json → typed Config)
│   │       ├── accounts.ts   # Combo file / inline account parser
│   │       ├── browser.ts    # chromium.launchPersistentContext + anti-detection
│   │       ├── checker.ts    # Auth flow + settings scraper (Playwright native locators)
│   │       ├── ui.ts         # Terminal output: banner, per-account, summary
│   │       ├── output.ts     # File output: grouped by status into results/*.txt
│   │       ├── cui.ts        # Interactive readline config wizard
│   │       └── types.ts      # Shared interfaces (ResultEntry, Stats, UiOptions)
│   └── puppeteer/            # @ampcode/puppeteer (v1.1, legacy)
│       ├── index.ts
│       ├── config.json
│       ├── tsconfig.json
│       └── src/
│           ├── config.ts
│           ├── accounts.ts
│           ├── browser.ts    # puppeteer-real-browser connect() + CDP clearing
│           ├── checker.ts    # Auth via evaluate(el.click()) — legacy style
│           ├── ui.ts
│           ├── output.ts
│           ├── cui.ts
│           └── types.ts      # Same interfaces as Playwright
```

**Data flow** (identical in both engines):
1. `config.ts` loads `config.json` → typed `Config` interface with strict readonly fields
2. `accounts.ts` loads combo file or inline accounts array (supports `:` and `|` separators)
3. Main loop spawns N workers (N = min(threads, account count))
4. Each worker: `browser.ts` creates session → `checker.ts` per-account → `ui.ts` real-time output
5. After all workers finish: `output.ts` writes grouped files + `ui.ts` prints summary

## Engine Comparison

| Trait | Playwright | Puppeteer |
|---|---|---|
| Browser launch | `chromium.launchPersistentContext(channel:"chrome")` | `puppeteer-real-browser` `connect()` |
| Anti-detection | Real TLS/JA3 fingerprint + initScripts | Wrapper library (less stealth) |
| Button clicks | `getByRole/getByText` native locators | `page.evaluate(el.click())` — **may fail on React SPAs** |
| Auth flow | `waitForPasswordField()` (DOM polling, handles inline render) | URL-based redirect detection (`waitUrl`) |
| Strict-mode risks | Resolved via `.first()` + `clickButtonByText()` iteration | None (always uses `evaluate`) |
| Install size | Larger (downloads Chromium) | Smaller (uses system Chrome) |
| Type coverage | Fully typed (Playwright native types) | Partially typed (`any` for browser/page objects) |

## TypeScript Style Guide (Google TS Style)

This project follows Google's TypeScript style guide and best practices:

- **Strict mode** enabled (`strict: true`) — no implicit `any`, strict null checks, noUncheckedIndexedAccess
- **Named exports** only — no `export default` (ensures uniform imports and prevents accidental renaming)
- **`const` over `let`** by default — never `var`
- **Single quotes** for string literals
- **Semicolons required** — no ASI reliance
- **No `#` private fields** — use TypeScript's `private` keyword
- **Type imports**: `import type { X }` for type-only imports
- **`readonly` arrays/interfaces** for immutability
- **No `any`** except when interfacing with untyped JS libraries (see puppeteer browser.ts)
- **Explicit return types** on exported functions for documentation and safety
- **Error handling**: `catch (err: unknown)` with `instanceof Error` checks, always throw `Error` instances
- **File names**: PascalCase for classes, camelCase for modules
- **No `namespace`** or `module` keywords — use ES module imports

### Key TypeScript patterns used:

```ts
// Typed config with readonly deeply nested
export interface Config {
  readonly threads: number;
  readonly delay: { readonly min: number; readonly max: number };
  // ...
}

// Discriminated union for status
export interface ResultEntry {
  status: 'OK' | 'WRONG' | 'BLOCKED' | 'BROKEN' | 'ERR';
  // ...
}

// Unknown in catch blocks
catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
}

// Readonly arrays for immutable data
const STEALTH_ARGS: readonly string[] = [...];
```

## Key Details — Playwright Engine

### Anti-Detection (browser.ts)
- `channel: "chrome"` — uses installed Chrome, real TLS/JA3 fingerprint
- `ignoreDefaultArgs: ["--enable-automation"]` — removes navigator.webdriver
- `--disable-blink-features=AutomationControlled` — hides blink AutomationControlled flag
- `addInitScript` overrides: `navigator.webdriver` → `undefined`, `chrome.runtime`, `navigator.plugins` (array with .item/.namedItem/.refresh), `navigator.languages`, `permissions.query`
- Custom UA: Chrome 131 on Windows, `bypassCSP: true`
- `viewport`, `locale`, `timezoneId`, `geolocation` set to São Paulo

### Button Clicking — Playwright Native Locators (checker.ts)
**CRITICAL**: Never use `page.evaluate(el.click())` — it fails on React/Next.js apps. Use Playwright native locators:

```ts
// Exact match to avoid "Sign in" also matching "Sign in with a passkey"
const signInBtn = page.getByRole("button", { name: "Sign in", exact: true });
if (await signInBtn.count() > 0) await signInBtn.first().click();

// Fallback: iterate buttons by innerText
async function clickButtonByText(page: Page, patterns: RegExp[]): Promise<boolean> {
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
```ts
await page.getByRole("textbox", { name: /email/i }).fill(email);
await page.locator('input[type="password"]').first().fill(password);
```

### Auth Flow (checker.ts)
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
- **Type note**: `page` and `browser` objects typed as `any` because `puppeteer-real-browser` doesn't ship types

## Shared Modules

Both engines share identical architecture and APIs across these modules:

### accounts.ts
- Priority: combo file → inline `accounts[]` → exit with error
- Separator: `:` or `|`
- Applies `startLine - 1` skip offset
- Exports: `loadAccounts(cfg: Config): Account[]`

### ui.ts
- `banner()` — ASCII header with engine-specific branding
- `start(config)` — prints config summary
- `result(entry, opts)` — per-account console line (color-coded by status, green bold for valuable)
- `summary()` — elapsed time, CPM, status breakdown, valuable count
- `getStats()` — returns mutable stats object for external patching

### output.ts
- `writeGrouped(outputDir, results)` — writes accounts to `valid.txt`, `valuable.txt`, `wrong.txt`, `blocked.txt`, `broken.txt`, `errors.txt`
- `writeSummary(outputDir, total, stats, elapsed)` — writes `summary.txt`
- Clears previous output files at start of each run

### cui.ts
- Interactive readline wizard (`createInterface`)
- Prompts: threads, headless, combo file, chrome profile, output dir, delay range, proxy, start line
- Writes directly to `config.json`
- Triggered by `--setup` CLI flag or `"cui": true` in config

### config.ts
- Loads `config.json` from package root
- Caps threads at `cpus().length`
- Resolves `chromeProfile` to absolute path
- Returns typed `Config` interface with all fields readonly and defaults applied

## Concurrency Model

- Shared `nextIdx` counter — workers atomically pull jobs (safe: JS async loop single-threaded)
- Workers run in parallel via `Promise.all()`
- Random delay between accounts (`delay.min`–`delay.max` ms)
- Thread count capped at `cpus().length`

## Session Isolation

- Each worker: unique temp `userDataDir` in `tmpdir()`
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
**Dev:** `typescript`, `tsx`, `@types/node`

**@ampcode/puppeteer**: `puppeteer-real-browser`, `chalk`, `dotenv`  
**Dev:** `typescript`, `tsx`, `@types/node`

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
- **`tsx` for running**: TypeScript executed directly via `tsx` (no pre-compile needed); `tsc` only for type checking and optional build
- **DOM types in tsconfig**: `lib: ["ES2022", "DOM"]` is required because browser init scripts reference `navigator`, `window`, `document`
- **Puppeteer `any` types**: `puppeteer-real-browser` doesn't provide TypeScript types, so `browser.ts` and `checker.ts` use `any` for page/browser objects
