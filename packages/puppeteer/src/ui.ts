import chalk from 'chalk';
import type { ResultEntry, UiOptions, Stats } from './types.js';

let startTime: number | null = null;
let stats: Stats = {
  ok: 0,
  wrong: 0,
  blocked: 0,
  broken: 0,
  err: 0,
  valuable: 0,
  total: 0,
  completed: 0,
};

export function banner(): void {
  console.log('');
  console.log(
    '  ' + chalk.yellow('╭') + chalk.yellow('─'.repeat(46)) + chalk.yellow('╮'),
  );
  console.log(
    '  ' +
      chalk.yellow('│') +
      '  ' +
      chalk.bold.white('AmpCode Account Checker') +
      ' '.repeat(15) +
      chalk.gray('v1.1') +
      '  ' +
      chalk.yellow('│'),
  );
  console.log(
    '  ' +
      chalk.yellow('│') +
      '  ' +
      chalk.gray('Puppeteer real-browser  •  anti-detection') +
      ' '.repeat(2) +
      chalk.yellow('│'),
  );
  console.log(
    '  ' + chalk.yellow('╰') + chalk.yellow('─'.repeat(46)) + chalk.yellow('╯'),
  );
  console.log('');
}

interface StartConfig {
  total?: number;
  threads?: number;
  headless?: boolean;
  delay?: { min: number; max: number };
  ui?: { showProgress?: boolean };
}

export function start(config: StartConfig): void {
  startTime = Date.now();
  stats = {
    ok: 0,
    wrong: 0,
    blocked: 0,
    broken: 0,
    err: 0,
    valuable: 0,
    total: config.total ?? 0,
    completed: 0,
  };

  if (config.ui?.showProgress !== false) {
    console.log(
      chalk.gray('  Accounts: ') +
        chalk.white(stats.total) +
        chalk.gray('  │  Workers: ') +
        chalk.white(config.threads) +
        chalk.gray('  │  Headless: ') +
        chalk.white(config.headless ? 'yes' : 'no'),
    );
    if (config.delay) {
      console.log(
        chalk.gray('  Delay: ') +
          chalk.white(config.delay.min + '-' + config.delay.max + 'ms'),
      );
    }
    console.log('');
  }
}

export function result(entry: ResultEntry, opts: UiOptions): void {
  if (!opts.showPerAccount) return;

  updateStats(entry);

  const idx = String(entry.line).padStart(3);
  let line: string;

  switch (entry.status) {
    case 'OK': {
      const v = entry.valuable;
      const marker = v ? chalk.green.bold(' [OK] ') : chalk.white(' [OK] ');
      const prefix = `[${chalk.gray(idx)}]${marker}`;
      const details =
        chalk.gray(' │ Bal: ') +
        chalk.white(entry.balance || '$0') +
        chalk.gray(' │ TopUp: ') +
        chalk.white(entry.topUp || 'N/A') +
        chalk.gray(' │ Pay: ') +
        chalk.white(entry.payment || 'N/A');
      const extras = ` │ LOC: ${entry.loc || '—'} │ Thr: ${entry.threads || '—'} │ Msg: ${entry.messages || '—'}`;
      line = opts.compact
        ? v
          ? `${prefix}${chalk.white(entry.email)}${details}`
          : `${prefix}${chalk.gray(entry.email)}`
        : v
          ? `${prefix}${chalk.bold.white(entry.email)}${details}${chalk.gray(extras)}`
          : `${prefix}${chalk.white(entry.email)}${chalk.gray(details)}${chalk.gray(extras)}`;
      break;
    }
    case 'WRONG':
      line = `[${chalk.gray(idx)}] ${chalk.yellow('[WRONG]')} ${chalk.gray(entry.email)}`;
      break;
    case 'BLOCKED':
      line = `[${chalk.gray(idx)}] ${chalk.red('[BLOCKED]')} ${chalk.gray(entry.email)}`;
      break;
    case 'BROKEN':
      line = `[${chalk.gray(idx)}] ${chalk.magenta('[BROKEN]')} ${chalk.gray(entry.email)} │ ${chalk.gray(entry.error || '')}`;
      break;
    default:
      line = `[${chalk.gray(idx)}] ${chalk.red('[ERR]')} ${chalk.gray(entry.email)} │ ${chalk.red(entry.error || '')}`;
  }

  console.log(line);
}

function updateStats(entry: ResultEntry): void {
  stats.completed++;
  if (entry.status === 'OK') stats.ok++;
  else if (entry.status === 'WRONG') stats.wrong++;
  else if (entry.status === 'BLOCKED') stats.blocked++;
  else if (entry.status === 'BROKEN') stats.broken++;
  else stats.err++;
  if (entry.valuable) stats.valuable++;
}

export function summary(): void {
  const elapsed = ((Date.now() - (startTime ?? 0)) / 1000).toFixed(1);
  const cpm =
    stats.total > 0
      ? Math.round((stats.completed / (parseFloat(elapsed) || 0.1)) * 60)
      : 0;

  console.log('');
  console.log('  ' + chalk.gray('─'.repeat(46)));
  console.log(
    '  ' +
      chalk.bold('Summary') +
      chalk.gray('  │  ') +
      chalk.white(elapsed + 's') +
      chalk.gray('  │  ') +
      chalk.white(cpm + ' CPM'),
  );
  console.log('  ' + chalk.gray('─'.repeat(46)));

  const items = [
    { label: 'OK', value: stats.ok, color: chalk.green },
    { label: 'WRONG', value: stats.wrong, color: chalk.yellow },
    { label: 'BLOCKED', value: stats.blocked, color: chalk.red },
    { label: 'BROKEN', value: stats.broken, color: chalk.magenta },
    { label: 'ERRORS', value: stats.err, color: chalk.red },
  ];

  const parts = items
    .filter((i) => i.value > 0 || i.label === 'OK')
    .map((i) => i.color(`${i.label}: ${i.value}`));

  console.log('  ' + parts.join(chalk.gray('  │  ')));

  if (stats.valuable > 0) {
    console.log('');
    console.log(
      '  ' + chalk.green.bold(`✦ ${stats.valuable} valuable account(s) detected ✦`),
    );
  }

  console.log('');
}

export function getStats(): Stats {
  return stats;
}
