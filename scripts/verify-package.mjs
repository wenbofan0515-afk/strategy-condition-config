#!/usr/bin/env node
import path from 'node:path';
import {verifyPackage} from './installation.mjs';

try {
  const [root, version, commit, ...extra] = process.argv.slice(2);
  if (!root || extra.length) throw Error('用法：node scripts/verify-package.mjs <解压包根目录> <版本> <可信完整提交ID>');
  console.log(JSON.stringify(verifyPackage(path.resolve(root), {expectedVersion: version, expectedCommit: commit}), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
