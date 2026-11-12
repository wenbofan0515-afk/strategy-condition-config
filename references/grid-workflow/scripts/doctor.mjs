#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const commands = Object.fromEntries(['git', 'lark-cli', 'sh-cli'].map(command => {
  const result = spawnSync(command, ['--version'], {encoding:'utf8', timeout:6000});
  return [command, result.status === 0 ? 'available' : 'unavailable'];
}));
const project = process.env.GRID_CONFIG_RPA_ROOT;
const adapter = project ? ['src/browser_api.js', 'package.json'].every(file => fs.existsSync(path.join(project, file))) : false;
const skillRoot = fileURLToPath(new URL('../../../', import.meta.url));
const required = ['workflow.md', 'references/plan-format.md', 'scripts/grid-core.mjs'];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (!fs.existsSync(path.join(skillRoot, 'VERSION'))) missing.push('../../VERSION');
const nodeReady = Number(process.versions.node.split('.')[0]) >= 22;
console.log(JSON.stringify({version:fs.existsSync(path.join(skillRoot, 'VERSION')) ? fs.readFileSync(path.join(skillRoot, 'VERSION'), 'utf8').trim() : null, node:process.versions.node,
  offline_ready:nodeReady && missing.length === 0, missing, commands, adapter_files_present:adapter,
  browser_session:'not_checked', platform_permissions:'not_checked', platform_writes:'not_performed'}, null, 2));
if (!nodeReady || missing.length) process.exitCode = 1;
