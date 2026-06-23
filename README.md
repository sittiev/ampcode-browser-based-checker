# AmpCode Account Checker

> Multi-engine account checker for auth.ampcode.com — Playwright + Puppeteer

Monorepo with two independent engines. Both use real Chrome browsers with anti-detection measures to log into AmpCode, scrape billing/usage data, and classify accounts.

## Engines

| Engine | Package | Anti-Detection | Speed |
|---|---|---|---|
| **Playwright** | `@ampcode/playwright` | Native `channel: "chrome"`, real TLS/JA3 fingerprint, init scripts to strip `webdriver` | Fast |
| **Puppeteer** | `@ampcode/puppeteer` | `puppeteer-real-browser` wrapper, CDP cookie/cache clearing | Moderate |

## Quick Start

```bash
# Requirements: Node.js ≥18, pnpm
pnpm install

# Run Playwright edition
pnpm playwright

# Run Puppeteer edition
pnpm puppeteer

# Interactive setup (either engine)
pnpm playwright:setup
pnpm puppeteer:setup
```

## Setup

### 1. Create combo file

Create `ampcode_login_pass.txt` (or configure a custom path in `config.json`):

```
email1@gmail.com:password1
email2@outlook.com:password2
email3@yahoo.com|password3
```

Supports `:` or `|` as separator.

### 2. Configure

Run interactive setup:
```bash
pnpm playwright:setup
```

Or edit `packages/<engine>/config.json` directly:

```jsonc
{
  "threads": 2,
  "headless": false,
  "startLine": 1,
  "comboFile": "ampcode_login_pass.txt",
  "outputDir": "results",
  "delay": { "min": 1500, "max": 3500 },
  "timeout": {
    "navigation": 30000,
    "element": 15000,
    "login": 20000
  }
}
```

### 3. Run

```bash
# Playwright (recommended)
pnpm playwright

# Puppeteer (legacy)
pnpm puppeteer
```

## Output

Results are grouped into `results/` directory:

| File | Content |
|---|---|
| `valuable.txt` | Accounts with balance > $0, active top-up, or configured payment |
| `valid.txt` | Valid accounts (no balance/payment) |
| `wrong.txt` | Wrong password |
| `blocked.txt` | Blocked/banned |
| `broken.txt` | Broken auth flow |
| `errors.txt` | Other errors |
| `summary.txt` | Run statistics |

## Features

- **Real browser fingerprint** — uses installed Chrome, not headless chromium
- **Anti-detection** — strips `navigator.webdriver`, fakes plugins, languages, chrome runtime
- **Multi-threaded** — configurable worker pool (capped at CPU count)
- **Session isolation** — each account gets fresh cookies/cache via CDP
- **Grouped output** — results split by status into separate files
- **Smart classification** — marks accounts as valuable if they have balance, top-up, or payment method
- **Interactive CUI** — terminal wizard for config setup (`--setup` flag)
- **Resumable** — `startLine` lets you resume from any position
- **Configurable delays** — random delay range between accounts to avoid rate limiting
- **Portuguese UI support** — handles AmpCode's PT auth flow (Continuar, Entrar, Pular)

## Choosing an Engine

**Use Playwright** if:
- You need maximum stealth (real TLS fingerprint, native `channel: "chrome"`)
- The site uses Cloudflare / anti-bot protection
- You want `getByRole`/`getByText` locators (more reliable than CSS selectors)

**Use Puppeteer** if:
- You're used to Puppeteer APIs
- `puppeteer-real-browser` is sufficient for your target
- You don't want the Playwright install size

## Project Structure

```
ampcode-checker/
├── package.json              # Root monorepo (pnpm workspaces)
├── pnpm-workspace.yaml
├── packages/
│   ├── playwright/           # @ampcode/playwright
│   │   ├── index.js
│   │   ├── config.json
│   │   └── src/
│   │       ├── config.js     # Config loader
│   │       ├── accounts.js   # Combo file parser
│   │       ├── browser.js    # Chromium launch + anti-detection
│   │       ├── checker.js    # Auth flow + scraper
│   │       ├── ui.js         # Terminal output
│   │       ├── output.js     # File output
│   │       └── cui.js        # Interactive setup wizard
│   └── puppeteer/            # @ampcode/puppeteer
│       ├── index.js
│       ├── config.json
│       └── src/
│           └── ...           # Same modules, Puppeteer variant
└── ampcode_login_pass.txt    # Default combo file
```

## License

ISC
