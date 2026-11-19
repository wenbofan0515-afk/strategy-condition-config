#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const required = [
  'SKILL.md', 'README.md', 'VERSION', 'CHANGELOG.md', 'agents/openai.yaml',
  'references/grid-level-audit-workflow.md', 'references/task-pool-scope.md', 'references/audit-output.md',
  'scripts/audit-grid-levels.mjs', 'scripts/verify-grid-audit.mjs', 'scripts/grid-audit-core.mjs',
  'scripts/check-update.mjs', 'scripts/package-skill.sh',
];
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
const version = fs.existsSync(path.join(root, 'VERSION')) ? fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim() : null;
const nodeMajor = Number(process.versions.node.split('.')[0]);
const result = {
  skill_root: root,
  version,
  node: process.versions.node,
  node_supported: nodeMajor >= 18,
  required_files: required.length,
  missing_files: missing,
  offline_ready: missing.length === 0 && /^\d+\.\d+\.\d+$/.test(version || '') && nodeMajor >= 18,
  network: 'not_checked',
  backend: 'not_checked',
};
console.log(JSON.stringify(result, null, 2));
if (!result.offline_ready) process.exitCode = 1;
