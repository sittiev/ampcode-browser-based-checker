import type { CheckResult } from './checker.js';

export interface ResultEntry {
  line: number;
  email: string;
  password: string;
  status: 'OK' | 'WRONG' | 'BLOCKED' | 'BROKEN' | 'ERR';
  balance?: string;
  topUp?: string;
  payment?: string;
  loc?: string;
  threads?: string;
  messages?: string;
  error?: string;
  valuable: boolean;
}

export interface UiOptions {
  showPerAccount: boolean;
  compact: boolean;
}

export interface Stats {
  ok: number;
  wrong: number;
  blocked: number;
  broken: number;
  err: number;
  valuable: number;
  total: number;
  completed: number;
}
