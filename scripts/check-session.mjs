#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolveRpaRoot } from './lib.mjs';
import { checkSession } from './session-check.mjs';

const args = process.argv.slice(2);
try {
  if (args.some((arg) => arg !== '--login')) throw new Error('未知参数');
  if (process.env.CLOUD_RUNTIME === '1') throw new Error('本人本地登录入口不适用于云端运行');
  const root = resolveRpaRoot();
  const api = await import(pathToFileURL(`${root}/src/browser_api.js`));
  const constants = await import(pathToFileURL(`${root}/src/constants.js`));
  if (args.includes('--login')) console.log('将打开独立 Chromium 登录窗口，请用本人账号登录；最多等待 5 分钟。不会配置策略。');
  console.log(JSON.stringify(await checkSession(api, constants, root, args.includes('--login')), null, 2));
} catch {
  console.error('环境或登录检查未通过。先运行 setup-environment.mjs；已具备依赖时，请按 setup-and-login.md 完成本人登录。未执行策略写入。');
  process.exitCode = 1;
}
