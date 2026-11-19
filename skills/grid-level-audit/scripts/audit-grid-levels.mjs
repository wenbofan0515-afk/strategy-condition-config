#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditGridLevels, renderMarkdown } from './grid-audit-core.mjs';

function usage() {
  return '用法：node scripts/audit-grid-levels.mjs <input.json> <output.json> [--markdown report.md]';
}

const [, , inputPath, outputPath, ...args] = process.argv;
if (!inputPath || !outputPath) {
  console.error(usage());
  process.exitCode = 1;
} else {
  try {
    const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
    const result = auditGridLevels(input);
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
    const markdownIndex = args.indexOf('--markdown');
    if (markdownIndex >= 0 && args[markdownIndex + 1]) {
      const markdownPath = path.resolve(args[markdownIndex + 1]);
      fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
      fs.writeFileSync(markdownPath, renderMarkdown(result));
    }
    console.log(JSON.stringify({ status: result.status, output: path.resolve(outputPath), issues: result.summary?.issue_count ?? result.issues?.length ?? 0 }, null, 2));
    if (['failed', 'pending', 'unknown'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'unknown', type: 'input_invalid', message: error.message }, null, 2));
    process.exitCode = 1;
  }
}
