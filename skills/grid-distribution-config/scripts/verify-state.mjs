#!/usr/bin/env node
import fs from 'node:fs';
import {verifyState} from './grid-core.mjs';

try {
  const [plan, state, ...extra] = process.argv.slice(2);
  if (!plan || !state || extra.length) throw new Error('用法：node scripts/verify-state.mjs <plan.json> <current-state.json>');
  const result = verifyState(JSON.parse(fs.readFileSync(plan, 'utf8')), JSON.parse(fs.readFileSync(state, 'utf8')));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
