import { createInterface } from 'readline';
import { join } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import chalk from 'chalk';

const CFG_PATH = join(__dirname, '..', 'config.json');

function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => resolve(answer.trim()));
  });
}

export async function setup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log(chalk.yellow('  ╔' + '═'.repeat(50) + '╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.white('  AmpCode Checker — Interactive Setup') + ' '.repeat(12) + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚' + '═'.repeat(50) + '╝'));
  console.log('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cfg: Record<string, any> = {};
  if (existsSync(CFG_PATH)) {
    try { cfg = JSON.parse(readFileSync(CFG_PATH, 'utf8')); } catch { /* start fresh */ }
  }

  const threads = await question(rl, chalk.white('  Threads') + chalk.gray(` (${cfg.threads ?? 2}): `));
  if (threads && !isNaN(Number(threads))) cfg.threads = parseInt(threads, 10);

  const headless = await question(rl, chalk.white('  Headless (y/n)') + chalk.gray(` (${cfg.headless ? 'y' : 'n'}): `));
  if (headless) cfg.headless = headless.toLowerCase().startsWith('y');

  const combo = await question(rl, chalk.white('  Combo file') + chalk.gray(` (${cfg.comboFile || 'ampcode_login_pass.txt'}): `));
  if (combo) cfg.comboFile = combo;

  const profile = await question(rl, chalk.white('  Chrome profile path') + chalk.gray(` (${cfg.chromeProfile || 'none'}): `));
  if (profile && profile.toLowerCase() !== 'none') cfg.chromeProfile = profile;
  else if (profile.toLowerCase() === 'none') cfg.chromeProfile = '';

  const outDir = await question(rl, chalk.white('  Output directory') + chalk.gray(` (${cfg.outputDir || 'results'}): `));
  if (outDir) cfg.outputDir = outDir;

  const delayMin = await question(rl, chalk.white('  Delay min (ms)') + chalk.gray(` (${cfg.delay?.min ?? 1500}): `));
  if (delayMin && !isNaN(Number(delayMin))) {
    if (!cfg.delay) cfg.delay = {};
    cfg.delay.min = parseInt(delayMin, 10);
  }

  const delayMax = await question(rl, chalk.white('  Delay max (ms)') + chalk.gray(` (${cfg.delay?.max ?? 3500}): `));
  if (delayMax && !isNaN(Number(delayMax))) {
    if (!cfg.delay) cfg.delay = {};
    cfg.delay.max = parseInt(delayMax, 10);
  }

  const proxyOn = await question(rl, chalk.white('  Use proxy (y/n)') + chalk.gray(` (${cfg.proxy?.enabled ? 'y' : 'n'}): `));
  if (proxyOn) {
    if (!cfg.proxy) cfg.proxy = {};
    cfg.proxy.enabled = proxyOn.toLowerCase().startsWith('y');
  }

  if (cfg.proxy?.enabled) {
    const proxyList = await question(rl, chalk.white('  Proxy list file') + chalk.gray(` (${cfg.proxy?.list || 'proxies.txt'}): `));
    if (proxyList) cfg.proxy.list = proxyList;
  }

  const startLine = await question(rl, chalk.white('  Start line') + chalk.gray(` (${cfg.startLine ?? 1}): `));
  if (startLine && !isNaN(Number(startLine))) cfg.startLine = parseInt(startLine, 10);

  writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), 'utf8');

  console.log('');
  console.log(chalk.green('  ✓ Config saved to config.json'));
  console.log('');

  rl.close();
}
