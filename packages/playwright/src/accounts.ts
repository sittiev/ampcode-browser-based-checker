import { existsSync, readFileSync } from 'fs';
import type { Config } from './config.js';

export interface Account {
  email: string;
  password: string;
}

export function loadAccounts(cfg: Config): Account[] {
  let allAccounts: Account[] = [];

  if (cfg.comboFile && existsSync(cfg.comboFile)) {
    const raw = readFileSync(cfg.comboFile, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    allAccounts = lines
      .map((line) => {
        const sep = line.includes(':') ? ':' : '|';
        const parts = line.split(sep);
        return {
          email: (parts[0] ?? '').trim(),
          password: (parts[1] ?? '').trim(),
        };
      })
      .filter((a) => a.email && a.password);
  }

  if (!allAccounts.length && cfg.accounts?.length) {
    allAccounts = cfg.accounts.filter((a) => a.email && a.password);
  }

  if (!allAccounts.length) {
    console.error('  [ERR] No accounts. Add to config.json accounts[] or set comboFile');
    process.exit(1);
  }

  const skip = cfg.startLine - 1;
  if (skip >= allAccounts.length) {
    console.error(`  [ERR] startLine ${cfg.startLine} > total ${allAccounts.length}`);
    process.exit(1);
  }

  return allAccounts.slice(skip);
}
