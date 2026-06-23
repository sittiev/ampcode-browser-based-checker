import { writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import type { ResultEntry, Stats } from './types.js';

function ensure(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function append(filePath: string, text: string): void {
  ensure(dirname(filePath));
  appendFileSync(filePath, text + '\n', 'utf8');
}

export function writeGrouped(outputDir: string, results: readonly ResultEntry[]): void {
  ensure(outputDir);

  const statuses = ['valid', 'wrong', 'blocked', 'broken', 'errors', 'valuable'];
  for (const s of statuses) {
    const p = join(outputDir, `${s}.txt`);
    if (existsSync(p)) unlinkSync(p);
  }

  for (const r of results) {
    let file: string;
    switch (r.status) {
      case 'OK':
        file = r.valuable ? 'valuable.txt' : 'valid.txt';
        break;
      case 'WRONG':
        file = 'wrong.txt';
        break;
      case 'BLOCKED':
        file = 'blocked.txt';
        break;
      case 'BROKEN':
        file = 'broken.txt';
        break;
      default:
        file = 'errors.txt';
    }

    let line: string;
    if (r.status === 'OK') {
      line = `${r.email}:${r.password || ''} │ Balance: ${r.balance || '$0'} │ TopUp: ${r.topUp || '—'} │ Payment: ${r.payment || '—'}`;
    } else {
      line = `${r.email}:${r.password || ''} │ ${r.error || r.status}`;
    }
    append(join(outputDir, file), line);
  }
}

export function writeSummary(
  outputDir: string,
  total: number,
  stats: Stats,
  elapsed: string,
): void {
  ensure(outputDir);
  const lines = [
    `Checked  : ${total}`,
    `Elapsed  : ${elapsed}s`,
    `CPM      : ${Math.round((total / (parseFloat(elapsed) || 0.1)) * 60)}`,
    `OK       : ${stats.ok}`,
    `WRONG    : ${stats.wrong}`,
    `BLOCKED  : ${stats.blocked}`,
    `BROKEN   : ${stats.broken}`,
    `ERRORS   : ${stats.err}`,
    `VALUABLE : ${stats.valuable}`,
  ];
  writeFileSync(join(outputDir, 'summary.txt'), lines.join('\n'), 'utf8');
}
