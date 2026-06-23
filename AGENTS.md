# AGENTS.md

## Project Overview

Multi-engine account checker for `auth.ampcode.com`. **pnpm monorepo** written in **TypeScript strict mode**. Two engines — Playwright (recommended) and Puppeteer (legacy). Both use real Chrome with anti-detection to log in, scrape billing/usage from settings page.

## Commands

```bash
pnpm install              # Install all workspace deps + download Chromium (Playwright)
pnpm playwright           # Run Playwright engine (via tsx)
pnpm puppeteer            # Run Puppeteer engine (via tsx)
pnpm playwright:setup     # CUI setup wizard for Playwright
pnpm puppeteer:setup      # CUI setup wizard for Puppeteer

# Type checking
cd packages/playwright && npx tsc --noEmit
cd packages/puppeteer && npx tsc --noEmit

# Build to JS
cd packages/playwright && npx tsc
```

No linter, no tests, no formatter.

## Architecture (Monorepo)

```
packages/
├── playwright/            # @ampcode/playwright (v2.0, recommended)
│   ├── index.ts           # Orchestrator
│   ├── config.json
│   └── src/
│       ├── config.ts      # Config loader (config.json → typed Config)
│       ├── accounts.ts    # Combo file / inline account parser
│       ├── browser.ts     # chromium.launchPersistentContext + anti-detection
│       ├── checker.ts     # Auth flow + settings scraper (Playwright native locators)
│       ├── ui.ts          # Terminal output: banner, per-account, summary
│       ├── output.ts      # File output: grouped by status into results/*.txt
│       ├── cui.ts         # Interactive readline config wizard
│       └── types.ts       # Shared interfaces (ResultEntry, Stats, UiOptions)
└── puppeteer/             # @ampcode/puppeteer (v1.1, legacy)
    ├── index.ts
    ├── config.json
    └── src/
        ├── config.ts
        ├── accounts.ts
        ├── browser.ts     # puppeteer-real-browser connect() + CDP clearing
        ├── checker.ts     # Auth via evaluate(el.click()) — legacy style
        ├── ui.ts
        ├── output.ts
        ├── cui.ts
        └── types.ts       # Same interfaces as Playwright
```

**Data flow** (identical in both engines):
1. `config.ts` → typed `Config` (all `readonly`, defaults applied)
2. `accounts.ts` → `Account[]` from combo file or inline array (`:` or `|` separator)
3. Main loop spawns N workers (`Promise.all()`), N = min(threads, account count)
4. Worker: `browser.ts` creates session → `checker.ts` per-account → `ui.ts` real-time output
5. All workers done: `output.ts` grouped files + `ui.ts` summary

## Engine Comparison

| Trait | Playwright | Puppeteer |
|---|---|---|
| Browser launch | `chromium.launchPersistentContext(channel:"chrome")` | `puppeteer-real-browser` `connect()` |
| Anti-detection | Real TLS/JA3 fingerprint + initScripts | Wrapper library (less stealth) |
| Button clicks | `getByRole/getByText` native locators | `page.evaluate(el.click())` — **may fail on React SPAs** |
| Auth flow | `waitForPasswordField()` (DOM polling, handles inline render) | URL-based redirect detection (`waitUrl`) |
| Strict-mode risks | Resolved via `.first()` + `clickButtonByText()` iteration | None (always uses `evaluate`) |
| Install size | Downloads Chromium (~180MB) | Uses system Chrome |
| Type coverage | Fully typed (Playwright native types) | Partially typed (`any` for page/browser) |
| Run command | `npx tsx index.ts` | `npx tsx index.ts` |

## TypeScript Rules

Following Google TS Style Guide + best practices from Medium/Testomat:

- **`strict: true`** — no implicit `any`, strict null checks, noUncheckedIndexedAccess
- **Named exports only** — no `export default`
- **`const` over `let`** by default — never `var`
- **Single quotes**, semicolons required
- **No `#` private fields** — use TypeScript `private`
- **Type imports**: `import type { X }` for type-only
- **`readonly`** on all interface fields and arrays (`readonly string[]`)
- **Discriminated unions**: `status: 'OK' | 'WRONG' | 'BLOCKED' | 'BROKEN' | 'ERR'`
- **Catch `unknown`**: `catch (err: unknown)` + `err instanceof Error`
- **No `any`** except Puppeteer (library has no types)
- **No `namespace`** — ES modules only
- **CamelCase** for variables/functions, **PascalCase** for interfaces/types
- **Explicit return types** on exported functions

### Key patterns:

```ts
// Typed config — all readonly deeply
export interface Config {
  readonly threads: number;
  readonly delay: { readonly min: number; readonly max: number };
}

// Discriminated union for status
export interface ResultEntry {
  status: 'OK' | 'WRONG' | 'BLOCKED' | 'BROKEN' | 'ERR';
}

// Unknown in catch
catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
}

// Readonly arrays
const STEALTH_ARGS: readonly string[] = ['--no-sandbox', ...];
```

## Key Details — Playwright Engine

### Anti-Detection (browser.ts)
- `channel: "chrome"` — real TLS/JA3 fingerprint from installed Chrome
- `ignoreDefaultArgs: ["--enable-automation"]` — removes `navigator.webdriver`
- `--disable-blink-features=AutomationControlled`
- `addInitScript` overrides: `webdriver`→`undefined`, fake `chrome.runtime`, `plugins` (5-item array with `.item/.namedItem/.refresh`), `languages`, `permissions.query`
- Custom UA: Chrome 131 Win, `bypassCSP: true`
- `viewport`, `locale`, `timezoneId`, `geolocation` set to São Paulo

### Button Clicking (checker.ts)
**CRITICAL**: Never `page.evaluate(el.click())` — fails on React. Use Playwright native locators:

```ts
// Exact match avoids "Sign in" also matching "Sign in with a passkey"
const btn = page.getByRole("button", { name: "Sign in", exact: true });
if (await btn.count() > 0) await btn.first().click();

// Iterate by innerText
async function clickButtonByText(page: Page, patterns: RegExp[]): Promise<boolean> {
  const buttons = page.locator("button");
  for (const pattern of patterns) {
    for (let i = 0; i < await buttons.count(); i++) {
      if (pattern.test(await buttons.nth(i).innerText())) {
        await buttons.nth(i).click();
        return true;
      }
    }
  }
  return false;
}
```

For inputs:
```ts
await page.getByRole("textbox", { name: /email/i }).fill(email);
await page.locator('input[type="password"]').first().fill(password);
```

### Auth Flow (checker.ts)
1. Navigate to `https://ampcode.com/settings` (redirects to auth if not logged in)
2. Find email input (5 locator strategies) → fill → click "Continuar" (PT) / "Continue" (EN)
3. **Password appears inline** (React SPA, no URL change) → `waitForPasswordField()` polls DOM for `input[type="password"]` every 200ms
4. Fill password → click "Sign in" with `{ exact: true }` (avoids "Sign in with a passkey")
5. Handle passkey prompt: click "Pular"/"Skip" or last button
6. Navigate to settings → verify URL doesn't redirect to `auth.ampcode.com`
7. If back on email input → wrong password

### Valuable Detection (`isValuable()`)
- Balance > $0
- OR TopUp is not "Off"/"N/A"
- OR Payment method is not "Not Configured"/"Balance"/"N/A"

## Key Details — Puppeteer Engine

- `puppeteer-real-browser` `connect()` with `userDataDir` in customConfig
- Auth: URL-based detection (`waitUrl`) — assumes redirects between steps
- Clicks: `page.evaluate(el.click())` via `clickText()` — fragile on SPAs
- Anti-detection: wrapper library stealth + `STEALTH_ARGS`
- Session isolation: CDP `clearBrowserCookies` + `clearBrowserCache` per account
- Types: `page`/`browser` are `any` (library has no TypeScript types)

## Shared Modules (both engines)

All modules share identical API signatures:

### config.ts
- `loadConfig(): Config` — reads `config.json`, applies defaults, caps threads at `cpus().length`
- Returns fully typed `Config` with all `readonly` fields

### accounts.ts
- `loadAccounts(cfg: Config): Account[]` — combo file → inline array → error
- Splits on `:` or `|`, applies `startLine - 1` offset

### ui.ts
- `banner()` — engine-specific ASCII header
- `start(config)` — config summary before run
- `result(entry, opts)` — per-account colored line (green bold for valuable)
- `summary()` — elapsed time, CPM, breakdown, valuable count
- `getStats()` — returns mutable stats ref

### output.ts
- `writeGrouped(dir, results)` → `valid.txt`, `valuable.txt`, `wrong.txt`, `blocked.txt`, `broken.txt`, `errors.txt`
- `writeSummary(dir, total, stats, elapsed)` → `summary.txt`
- Clears all output files at run start

### cui.ts
- `setup()` — interactive readline wizard
- Prompts: threads, headless, combo file, chrome profile, output dir, delay, proxy, start line
- Writes `config.json`
- Trigger: `--setup` flag or `"cui": true`

### types.ts (both engines identical)
```ts
export interface ResultEntry {
  line: number;
  email: string;
  password: string;
  status: 'OK' | 'WRONG' | 'BLOCKED' | 'BROKEN' | 'ERR';
  valuable: boolean;
}
export interface Stats { ok: number; wrong: number; blocked: number; broken: number; err: number; valuable: number; total: number; completed: number; }
```

## Concurrency

- Shared `nextIdx` counter — workers atomically pull jobs (single-threaded async loop per worker, no race)
- `Promise.all()` parallel execution
- Random delay between accounts (`delay.min`–`delay.max` ms)
- Threads capped at `cpus().length`

## Session Isolation

- Each worker: unique `userDataDir` in `tmpdir()`
- Between accounts: CDP `clearBrowserCookies` + `clearBrowserCache`
- Persistent profile: `chromeProfile` in config → shared (only when threads=1)
- Temp dirs deleted on worker exit (unless persistent profile)

## Config (config.json)

```jsonc
{
  "threads": 2,             // 1-N, capped at CPU cores
  "startLine": 1,           // 1-based resume offset
  "headless": false,        // true = invisible Chrome
  "chromeProfile": "",      // Path for persistent profile
  "outputDir": "results",   // Grouped output
  "comboFile": "ampcode_login_pass.txt",
  "accounts": [],           // Inline fallback
  "viewport": { "width": 1280, "height": 800 },
  "delay": { "min": 1500, "max": 3500 },
  "timeout": { "navigation": 30000, "element": 15000, "login": 20000 },
  "proxy": { "enabled": false, "list": "" },
  "ui": { "showProgress": true, "showPerAccount": true, "compact": false },
  "cui": false              // true = always run setup wizard
}
```

## Dependencies

**Root**: none (pnpm orchestration only)

**@ampcode/playwright**: `playwright`, `chalk`, `dotenv` | Dev: `typescript`, `tsx`, `@types/node`

**@ampcode/puppeteer**: `puppeteer-real-browser`, `chalk`, `dotenv` | Dev: `typescript`, `tsx`, `@types/node`

## Gotchas

- **Portuguese labels**: "Continuar", "Entrar", "Pular" — locators must match
- **No `page.evaluate(el.click())` in Playwright**: Use `getByRole` or `clickButtonByText()`
- **"Sign in" × 2**: Two buttons match `/sign in/i`. Use `{ exact: true }` or iterate `innerText`
- **Password inline**: React SPA doesn't change URL after email. Playwright polls DOM. Puppeteer relies on `/password` URL (may miss).
- **Text scraping**: `document.body.innerText` — any AmpCode UI change breaks it
- **`.env` not used**: Accounts from combo file or `config.json`
- **`channel: "chrome"`** needs Chrome on system
- **`launchPersistentContext`** can't share `userDataDir` across workers
- **pnpm only**: `npm install` at root fails
- **`DOM` lib required** in tsconfig for `navigator`, `window`, `document` types
- **Puppeteer `any`**: Library lacks TS types, `page`/`browser` are untyped
