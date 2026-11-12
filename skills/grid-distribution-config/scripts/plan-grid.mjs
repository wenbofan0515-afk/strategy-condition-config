#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {buildPlan} from './grid-core.mjs';

try {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length || path.resolve(input) === path.resolve(output)) throw new Error('用法：node scripts/plan-grid.mjs <input.json> <new-plan.json>，不得覆盖输入');
  const plan = buildPlan(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', {flag:'wx', mode:0o600});
  console.log(JSON.stringify({output:path.resolve(output), ready:plan.ready, unique_source_grids:plan.unique_source_grids,
    counts:Object.fromEntries(Object.entries(plan.targets).map(([v, t]) => [v, t.counts])), issues:plan.issues.length}, null, 2));
  if (!plan.ready) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
