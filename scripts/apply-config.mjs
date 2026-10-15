#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlan, resolveRpaRoot, findPriority, applyPatch, stripPatchedFields, stable, fieldSummary } from './lib.mjs';

const file = process.argv[2];
const yes = process.argv.includes('--yes');
if (!file) throw new Error('用法：node apply-config.mjs <plan.json> --yes');
const plan = loadPlan(file);
if (!yes) throw new Error('写入需要显式提供 --yes');
if (plan.confirmation?.confirmed !== true) throw new Error('计划 confirmation.confirmed 不是 true，停止写入');
const root = resolveRpaRoot();
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail, saveLevel } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const backupDir = path.join(root, 'backups'); fs.mkdirSync(backupDir, { recursive: true });
const beforePath = path.join(backupDir, `${stamp}_strategy_condition_before.json`);
const resultPath = path.join(backupDir, `${stamp}_strategy_condition_result.json`);
const result = { task: plan.task, beforePath, resultPath, operations: [], errors: [] };
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 });
  const verticals = await getVerticalList(session.page);
  const prepared = [];
  for (const operation of plan.operations) {
    const vertical = verticals.find((item) => item.vertical_name === operation.vertical);
    if (!vertical) throw new Error(`${operation.vertical} 未找到`);
    const detail = await getVerticalDetail(session.page, vertical.id);
    const target = findPriority(detail, operation);
    const modified = applyPatch(target.priority, operation.patch || {});
    prepared.push({ operation, vertical, detail, target, modified });
    result.operations.push({ vertical: operation.vertical, level_id: target.level.deal_level_id, priority_id: target.priority.priority_id, before: fieldSummary(target.priority, ['supplier_nums', 'channel_id', 'goods_id', 'is_black']), after: fieldSummary(modified, ['supplier_nums', 'channel_id', 'goods_id', 'is_black']), verified: false });
  }
  fs.writeFileSync(beforePath, JSON.stringify({ plan, prepared: prepared.map(({ operation, detail, target }) => ({ operation, detail, level: target.level, priority: target.priority })) }, null, 2));
  for (const item of prepared) {
    await saveLevel(session.page, item.detail.id, item.modified);
    const afterDetail = await getVerticalDetail(session.page, item.vertical.id);
    const after = findPriority(afterDetail, item.operation);
    const errors = [];
    if (stable(stripPatchedFields(after.priority, item.operation.patch || {})) !== stable(stripPatchedFields(item.target.priority, item.operation.patch || {}))) errors.push('非目标字段发生变化');
    const expected = applyPatch(item.target.priority, item.operation.patch || {});
    if (stable(after.priority) !== stable(expected)) errors.push('目标字段回读不一致');
    if (errors.length) throw new Error(`${item.operation.vertical}：${errors.join('；')}`);
    result.operations.find((x) => x.vertical === item.operation.vertical).verified = true;
  }
} catch (error) {
  result.errors.push(String(error.stack || error));
  process.exitCode = 1;
} finally {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  await session.browser.close();
  console.log(JSON.stringify(result, null, 2));
}
