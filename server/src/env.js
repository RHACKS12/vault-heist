// Load environment variables from a .env file if one exists.
//
// Node has no built-in auto-loading of .env, so importing this module FIRST (before
// anything reads process.env) makes `npm start`, `npm run generate:announcer`, etc.
// pick up keys from .env at the repo root or in server/. Inline env vars still work
// and take precedence. Requires Node >= 20.12 (process.loadEnvFile); older Node just
// skips it, so pass vars inline instead.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config.js';

if (typeof process.loadEnvFile === 'function') {
  for (const p of [path.join(REPO_ROOT, '.env'), path.join(REPO_ROOT, 'server', '.env')]) {
    if (existsSync(p)) {
      try { process.loadEnvFile(p); } catch { /* malformed .env — ignore */ }
    }
  }
}
