#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolveRpaRoot } from './lib.mjs';

const args = process.argv.slice(2);
try {
  if (args.some((arg) => arg !== '--install-deps')) throw new Error('用法：node setup-environment.mjs [--install-deps]');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更新版本');
  const root = resolveRpaRoot();
  for (const file of ['src/constants.js', 'package.json']) {
    if (!fs.existsSync(path.join(root, file))) throw new Error(`项目缺少 ${file}`);
  }
  const require = createRequire(path.join(root, 'package.json'));
  const run = (command, arguments_) => {
    const result = spawnSync(command, arguments_, { cwd: root, stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) throw new Error('依赖命令未完成，请检查上方安装诊断；不继续登录或配置');
  };
  if (args.includes('--install-deps')) {
    if (process.platform === 'win32') throw new Error('自动安装入口目前支持 macOS/Linux；Windows 请先按可信项目说明准备 npm 与 Playwright，再运行只读检查');
    run('npm', [fs.existsSync(path.join(root, 'package-lock.json')) ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund']);
    const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
    if (!fs.existsSync(cli)) throw new Error('未找到项目 Playwright CLI，停止安装');
    run(process.execPath, [cli, 'install', 'chromium']);
  }
  let playwright;
  try { playwright = require('playwright'); }
  catch { throw new Error('项目尚未安装 Playwright；确认项目可信后运行 --install-deps'); }
  const browserInstalled = fs.existsSync(playwright.chromium.executablePath());
  console.log(JSON.stringify({ ok: browserInstalled, node: process.version, project_found: true,
    playwright_available: true, chromium_installed: browserInstalled,
    next: browserInstalled ? '运行 check-session.mjs，只读验证登录态' : '确认后运行 setup-environment.mjs --install-deps',
  }, null, 2));
  if (!browserInstalled) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
