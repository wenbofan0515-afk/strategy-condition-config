#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadPlan, resolveRpaRoot, findPriority, applyPatch, stable } from './lib.mjs';
import { assertLevel } from './execute-plan.mjs';

const file = process.argv[2];
if (!file) throw new Error('用法：node verify-config.mjs <plan.json>');
const plan = loadPlan(file); const root = resolveRpaRoot();
const snapshotIndex = process.argv.indexOf('--before');
const snapshot = snapshotIndex < 0 ? null : JSON.parse(fs.readFileSync(process.argv[snapshotIndex + 1], 'utf8'));
if (snapshot && stable(snapshot.plan) !== stable(plan)) throw new Error('快照计划与当前计划不一致');
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
const result = { task: plan.task, verification_scope: snapshot ? '完整处理等级与写前快照比较' : '仅目标条件，不证明非目标字段保持不变', verified: [], errors: [] };
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 }); const verticals = await getVerticalList(session.page);
  if (snapshot) {
    if (!Array.isArray(snapshot.groups) || !snapshot.groups.length) throw new Error('快照缺少 groups');
    for (const group of snapshot.groups) {
      try {
        const detail = await getVerticalDetail(session.page, group.verticalId);
        assertLevel(detail, group, group.expected);
        result.verified.push({ vertical: group.vertical, level_id: group.before.deal_level_id, ok: true });
      } catch (error) { result.errors.push({ vertical: group.vertical, error: error.message }); }
    }
  } else {
  for (const operation of plan.operations) {
    try { const v=verticals.find((x)=>x.vertical_name===operation.vertical); if(!v)throw Error('未找到垂类'); const d=await getVerticalDetail(session.page,v.id); const t=findPriority(d,operation); const expected=applyPatch(t.priority,operation.patch||{}); if(stable(t.priority)!==stable(expected))throw Error('当前回读与计划不一致'); result.verified.push({vertical:operation.vertical,priority_id:t.priority.priority_id,ok:true}); }
    catch(error){result.errors.push({vertical:operation.vertical,error:String(error.message||error)})}
  }
  }
} finally { await session.browser.close(); }
console.log(JSON.stringify(result,null,2)); if(result.errors.length)process.exitCode=1;
