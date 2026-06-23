![AmpCode Checker](https://ampcode.com/app-icon-192.png)

# AmpCode Account Checker

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Playwright](https://img.shields.io/badge/Playwright-real_browser-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-real_browser-40B5A4?logo=puppeteer&logoColor=white)](https://pptr.dev/)
[![License](https://img.shields.io/badge/license-ISC-blue)](./LICENSE)

> Multi-engine account checker for **auth.ampcode.com**. Real browser. Anti-detection.
> Two engines. One purpose. Zero false positives.

---

## Why

AmpCode's auth runs on a React SPA behind Cloudflare. Headless requests get blocked. Cookie-only checkers return false negatives. This tool opens a **real Chrome window** with genuine TLS fingerprint, logs in like a human, and scrapes the actual settings page. If it says valid, it's valid.

## Choose Your Engine

| | Playwright | Puppeteer |
|---|---|---|
| **Stealth** | Real TLS/JA3 via `channel: "chrome"` | `puppeteer-real-browser` wrapper |
| **Clicks** | `getByRole` native locators (React-safe) | `page.evaluate(el.click())` (fragile on SPAs) |
| **Speed** | Faster inline password detect | Slower URL-based redirect polling |
| **Install** | Downloads Chromium (~180MB) | Uses system Chrome |
| **Use when** | You need maximum stealth | You're used to Puppeteer APIs |

```bash
pnpm playwright   # Recommended
pnpm puppeteer    # Legacy
```

## Quick Start

```bash
git clone https://github.com/sittiev/ampcode-browser-based-checker.git
cd ampcode-browser-based-checker

pnpm install
pnpm playwright
```

First run auto-downloads Chrome for Testing. Put your accounts in `ampcode_login_pass.txt`:

```
email1@gmail.com:password1
email2@outlook.com:password2
```

Supports `:` or `|` separator.

## Setup

```bash
pnpm playwright:setup    # Interactive config wizard
pnpm puppeteer:setup     # Same, for Puppeteer engine
```

Or edit `packages/<engine>/config.json`:

```jsonc
{
  "threads": 2,
  "headless": false,
  "startLine": 1,
  "outputDir": "results",
  "delay": { "min": 1500, "max": 3500 }
}
```

## Output

Accounts land in `results/` grouped by status:

```
results/
├── valuable.txt    ✦ Balance > $0 or active top-up/payment
├── valid.txt       Login OK, no balance
├── wrong.txt       Wrong password
├── blocked.txt     Banned / suspended
├── broken.txt      Auth flow broken (site changed?)
├── errors.txt      Other failures
└── summary.txt     Run stats (time, CPM, counts)
```

## Features

- **Real Chrome fingerprint** — `channel: "chrome"`, genuine TLS/JA3, no headless chromium tells
- **Anti-detection** — strips `navigator.webdriver`, fakes plugins, languages, chrome runtime, permissions
- **CDP session clearing** — each account gets fresh cookies/cache, no cross-account leakage
- **Multi-worker** — parallel checking, configurable threads, random delays between accounts
- **Smart classification** — marks accounts valuable if balance > $0, top-up active, or payment method present
- **Grouped output** — 6 files by status, 1 summary
- **Interactive CUI** — readline wizard for all config fields (`--setup`)
- **Resumable** — `startLine` offset lets you pick up where you left off
- **Portuguese labels** — handles AmpCode's PT auth flow ("Continuar", "Entrar", "Pular")
- **TypeScript strict mode** — full type safety, zero implicit `any`
- **pnpm monorepo** — both engines share architecture, independent deps

## How It Works

```
accounts.txt  ──►  N workers  ──►  Chrome sessions  ──►  AmpCode login
                                                            │
                                                    settings page scrape
                                                            │
                                              Balance, TopUp, Payment
                                                            │
                                              results/ grouped by status
```

Each worker: opens Chrome → navigates to settings → fills email → clicks "Continuar" → password appears inline → fills password → clicks "Sign in" → skips passkey prompt → scrapes billing data → repeats for next account.

## Project Structure

```
ampcode-browser-based-checker/
├── tsconfig.base.json        # Shared strict TS config
├── pnpm-workspace.yaml
├── packages/
│   ├── playwright/           # @ampcode/playwright (v2.0)
│   │   ├── index.ts
│   │   ├── config.json
│   │   └── src/ (7 modules)
│   └── puppeteer/            # @ampcode/puppeteer (v1.1)
│       ├── index.ts
│       ├── config.json
│       └── src/ (7 modules)
```

Shared modules across both engines: `config`, `accounts`, `browser`, `checker`, `ui`, `output`, `cui`, `types`.

## Development

```bash
pnpm playwright           # Run via tsx
pnpm puppeteer            # Run via tsx

# Type-check only (no emit)
cd packages/playwright && npx tsc --noEmit
cd packages/puppeteer && npx tsc --noEmit

# Build to JS
cd packages/playwright && npx tsc
```

## Gotchas

- **Portuguese buttons**: "Continuar", "Entrar", "Pular". Locators must match exactly.
- **Password inline**: React SPA doesn't redirect URL after email step. Playwright polls `input[type="password"]` in DOM.
- **"Sign in" × 2**: AmpCode has two "Sign in" buttons ("Sign in" + "Sign in with a passkey"). Playwright uses `{ exact: true }`.
- **Text scraping**: Settings data is `document.body.innerText`. Any UI label change breaks extraction.
- **`launchPersistentContext`**: Can't reuse `userDataDir` across workers. Each gets its own temp dir.
- **Chrome required**: `channel: "chrome"` needs Chrome installed. Not Playwright's bundled Chromium.

## License

ISC
