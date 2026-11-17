#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectInstallation} from './installation.mjs';

// Filesystem-only inspection: does not open a browser or initiate login.
try {
  if (process.argv.length !== 2) throw Error('用法：node scripts/doctor.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fallback = path.join(process.cwd(), 'level_config_rpa');
  const adapterRoot = process.env.STRATEGY_CONFIG_RPA_ROOT || (fs.existsSync(fallback) ? fallback : undefined);
  const result = inspectInstallation(root, {adapterRoot});
  console.log(JSON.stringify({...result, next: !result.offline_ready ? '修复技能文件或Node版本' : result.adapter.status === 'files_present' ? '后台依赖和登录态仍需单独检查' : '技能文件就绪；后台使用内置浏览器，或另行提供可信适配器'}, null, 2));
  if (!result.offline_ready) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
