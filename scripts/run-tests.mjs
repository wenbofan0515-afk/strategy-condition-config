#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 2 || Number(process.versions.node.split('.')[0]) < 22) {
  console.error('用法：node scripts/run-tests.mjs；需要Node.js 22+'); process.exitCode = 1;
} else {
  const files = ['scripts', 'references/grid-workflow/scripts'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.test.mjs')).sort().map(name => path.join(root, dir, name)));
  const result = spawnSync(process.execPath, ['--test', ...files], {cwd: root, stdio: 'inherit', shell: false});
  if (result.error) console.error('离线测试进程未启动');
  process.exitCode = result.status ?? 1;
}
