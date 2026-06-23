import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { cpus } from 'os';

export interface Config {
  readonly threads: number;
  readonly startLine: number;
  readonly headless: boolean;
  readonly chromeProfile: string;
  readonly outputDir: string;
  readonly comboFile: string;
  readonly accounts: ReadonlyArray<{ email: string; password: string }>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly delay: { readonly min: number; readonly max: number };
  readonly timeout: {
    readonly navigation: number;
    readonly element: number;
    readonly login: number;
  };
  readonly proxy: { readonly enabled: boolean; readonly list: string };
  readonly ui: {
    readonly showProgress: boolean;
    readonly showPerAccount: boolean;
    readonly compact: boolean;
  };
  readonly cui: boolean;
}

interface RawConfig {
  threads?: number;
  startLine?: number;
  headless?: boolean;
  chromeProfile?: string;
  outputDir?: string;
  comboFile?: string;
  accounts?: Array<{ email: string; password: string }>;
  viewport?: { width: number; height: number };
  delay?: { min: number; max: number };
  timeout?: {
    navigation?: number;
    element?: number;
    login?: number;
  };
  proxy?: { enabled?: boolean; list?: string };
  ui?: { showProgress?: boolean; showPerAccount?: boolean; compact?: boolean };
  cui?: boolean;
}

const CFG_PATH = join(__dirname, '..', 'config.json');

export function loadConfig(): Config {
  if (!existsSync(CFG_PATH)) {
    console.error('config.json not found');
    process.exit(1);
  }

  const raw: RawConfig = JSON.parse(readFileSync(CFG_PATH, 'utf8'));

  return {
    threads: Math.max(1, Math.min(raw.threads ?? 2, cpus().length)),
    startLine: Math.max(1, raw.startLine ?? 1),
    headless: raw.headless ?? false,
    chromeProfile: raw.chromeProfile ? resolve(raw.chromeProfile) : '',
    outputDir: raw.outputDir ?? 'results',
    comboFile: raw.comboFile ?? '',
    accounts: raw.accounts ?? [],
    viewport: raw.viewport ?? { width: 1280, height: 800 },
    delay: {
      min: raw.delay?.min ?? 1500,
      max: raw.delay?.max ?? 3500,
    },
    timeout: {
      navigation: raw.timeout?.navigation ?? 30000,
      element: raw.timeout?.element ?? 15000,
      login: raw.timeout?.login ?? 20000,
    },
    proxy: {
      enabled: raw.proxy?.enabled ?? false,
      list: raw.proxy?.list ?? '',
    },
    ui: {
      showProgress: raw.ui?.showProgress ?? true,
      showPerAccount: raw.ui?.showPerAccount ?? true,
      compact: raw.ui?.compact ?? false,
    },
    cui: raw.cui ?? false,
  };
}
