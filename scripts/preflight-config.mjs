#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadPlan, resolveRpaRoot, findPriority, applyPatch, fieldSummary, patchedKeys, stable } from './lib.mjs';
import { prepareChanges } from './execute-plan.mjs';

const file = process.argv[2];
if (!file) throw new Error('用法：node preflight-config.mjs <plan.json>');
const plan = loadPlan(file);
const root = resolveRpaRoot();
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
const result = { task: plan.task, confirmed: plan.confirmation?.confirmed === true, operations: [], errors: [] };
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 });
  const verticals = await getVerticalList(session.page);
  const snapshots = [];
  for (const operation of plan.operations) {
    try {
      const vertical = verticals.find((item) => item.vertical_name === operation.vertical);
      if (!vertical) throw new Error('未找到垂类');
      const detail = await getVerticalDetail(session.page, vertical.id);
      if (!snapshots.some((item) => item.vertical === operation.vertical)) snapshots.push({ vertical: operation.vertical, verticalId: vertical.id, detail });
      const target = findPriority(detail, operation);
      const modified = applyPatch(target.priority, operation.patch || {});
      result.operations.push({
        vertical: operation.vertical,
        level_name: target.level.name,
        priority_id: target.priority.priority_id,
        priority_name: target.priority.priority_name_show,
        changed: stable(target.priority) !== stable(modified),
        before: fieldSummary(target.priority, patchedKeys(operation.patch || {})),
        after: fieldSummary(modified, patchedKeys(operation.patch || {})),
        mix: operation.mix || null,
        registration: operation.registration || null,
      });
    } catch (error) {
      result.errors.push({ vertical: operation.vertical, error: String(error.message || error) });
    }
  }
  if (!result.errors.length) {
    try { prepareChanges(plan, snapshots); }
    catch (error) { result.errors.push({ error: error.message }); }
  }
} finally {
  await session.browser.close();
}
console.log(JSON.stringify(result, null, 2));
if (result.errors.length) process.exitCode = 1;
