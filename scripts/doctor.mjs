#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { resolveRpaRoot } from './lib.mjs';

// Filesystem-only inspection: does not open a browser or initiate login.
try {
  const root = resolveRpaRoot();
  const required = ['src/browser_api.js', 'src/constants.js'];
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error(`缺少依赖：${missing.join(', ')}`);
  console.log(JSON.stringify({ ok: true, root, node: process.version,
    profile_exists: fs.existsSync(path.join(root, '.browser-profile')),
    authentication: '未检测；后续只读预检确认登录态',
    capabilities: { existing_priority_conditions: true, create_or_reorder: false, mix_write: false, feishu_registration: false },
  }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
