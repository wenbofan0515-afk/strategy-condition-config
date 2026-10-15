#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlan, resolveRpaRoot } from './lib.mjs';
import { prepareChanges, executeGroups } from './execute-plan.mjs';

const file = process.argv[2];
const yes = process.argv.includes('--yes');
if (!file) throw new Error('用法：node apply-config.mjs <plan.json> --yes');
const plan = loadPlan(file);
if (!yes) throw new Error('写入需要显式提供 --yes');
if (plan.confirmation?.confirmed !== true) throw new Error('计划 confirmation.confirmed 不是 true，停止写入');
const root = resolveRpaRoot();
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail, saveLevel } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const stamp = `${Date.now()}_${process.pid}`;
const backupDir = path.join(root, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
const beforePath = path.join(backupDir, `${stamp}_strategy_condition_before.json`);
const resultPath = path.join(backupDir, `${stamp}_strategy_condition_result.json`);
const result = { task: plan.task, beforePath, resultPath, operations: [], errors: [] };
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 });
  const verticals = await getVerticalList(session.page);
  const snapshots = [];
  for (const operation of plan.operations) {
    if (snapshots.some((item) => item.vertical === operation.vertical)) continue;
    const vertical = verticals.find((item) => item.vertical_name === operation.vertical);
    if (!vertical) throw new Error(`${operation.vertical} 未找到`);
    const detail = await getVerticalDetail(session.page, vertical.id);
    snapshots.push({ vertical: operation.vertical, verticalId: vertical.id, detail });
  }
  const groups = prepareChanges(plan, snapshots);
  fs.writeFileSync(beforePath, JSON.stringify({ plan, groups }, null, 2), { mode: 0o600, flag: 'wx' });
  result.operations = plan.operations.map((operation, index) => ({ index, vertical: operation.vertical, saved: false, verified: false }));
  result.follow_up = { mix: '未执行，需单独核验混排引用', registration: '未执行，需单独登记及回读截图' };
  await executeGroups(groups, {
    read: (id) => getVerticalDetail(session.page, id),
    save: (id, level) => saveLevel(session.page, id, level),
  }, (group, status) => {
    for (const operation of group.operations) result.operations[operation.index][status] = true;
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), { mode: 0o600 });
  });
} catch (error) {
  result.errors.push(String(error.stack || error));
  process.exitCode = 1;
} finally {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), { mode: 0o600 });
  await session.browser.close();
  console.log(JSON.stringify(result, null, 2));
}
