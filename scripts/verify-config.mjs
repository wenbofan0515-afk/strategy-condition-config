#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadPlan, resolveRpaRoot, findPriority, applyPatch, stable } from './lib.mjs';

const file = process.argv[2];
if (!file) throw new Error('用法：node verify-config.mjs <plan.json>');
const plan = loadPlan(file); const root = resolveRpaRoot();
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
const result = { task: plan.task, verified: [], errors: [] };
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 }); const verticals = await getVerticalList(session.page);
  for (const operation of plan.operations) {
    try { const v=verticals.find((x)=>x.vertical_name===operation.vertical); if(!v)throw Error('未找到垂类'); const d=await getVerticalDetail(session.page,v.id); const t=findPriority(d,operation); const expected=applyPatch(t.priority,operation.patch||{}); if(stable(t.priority)!==stable(expected))throw Error('当前回读与计划不一致'); result.verified.push({vertical:operation.vertical,priority_id:t.priority.priority_id,ok:true}); }
    catch(error){result.errors.push({vertical:operation.vertical,error:String(error.message||error)})}
  }
} finally { await session.browser.close(); }
console.log(JSON.stringify(result,null,2)); if(result.errors.length)process.exitCode=1;
