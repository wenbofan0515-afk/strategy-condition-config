import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const required = ['SKILL.md', 'VERSION', 'agents/openai.yaml', 'scripts/doctor.mjs', 'scripts/run-tests.mjs',
  'scripts/lib.mjs', 'scripts/runtime-guards.mjs', 'references/task-matrix.md', 'references/mix-reference.md',
  'references/grid-workflow/workflow.md', 'references/grid-workflow/scripts/grid-core.mjs'];

export function inspectInstallation(root, {adapterRoot, nodeVersion = process.versions.node} = {}) {
  const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
  const version = fs.existsSync(path.join(root, 'VERSION')) ? fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim() : null;
  const declared = fs.existsSync(path.join(root, 'SKILL.md')) ? fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8').match(/^  version: "([^"]+)"$/m)?.[1] : null;
  const skillInstalled = missing.length === 0 && /^\d+\.\d+\.\d+$/.test(version ?? '') && declared === version;
  const nodeReady = Number(nodeVersion.split('.')[0]) >= 22;
  const adapterMissing = adapterRoot ? ['src/browser_api.js', 'src/constants.js', 'package.json'].filter(file => !fs.existsSync(path.join(adapterRoot, file))) : [];
  return {version, skill_installed: skillInstalled, missing_skill_files: missing,
    offline_ready: skillInstalled && nodeReady, node: nodeVersion, node_ready: nodeReady,
    adapter: {status: !adapterRoot ? 'not_configured' : adapterMissing.length ? 'incomplete' : 'files_present', missing: adapterMissing},
    authentication: 'not_checked', platform_permissions: 'not_checked', platform_writes: 'not_performed'};
}

// The trusted source commit/version must come from outside this package. A self-provided manifest is not a signature.
export function verifyPackage(packageRoot, {expectedVersion, expectedCommit}) {
  if (!/^\d+\.\d+\.\d+$/.test(expectedVersion ?? '') || !/^[a-f0-9]{40}$/.test(expectedCommit ?? '')) throw Error('须提供独立可信来源的版本和完整提交ID');
  if (fs.lstatSync(packageRoot).isSymbolicLink()) throw Error('不接受符号链接包目录');
  const manifestPath = path.join(packageRoot, 'manifest.json');
  if (fs.lstatSync(manifestPath).isSymbolicLink()) throw Error('清单不能是符号链接');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== expectedVersion || manifest.commit !== expectedCommit || manifest.tag !== `v${expectedVersion}` || manifest.source !== 'https://github.com/wenbofan0515-afk/strategy-condition-config') throw Error('包来源、版本或提交不匹配');
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw Error('文件清单缺失');
  const expected = new Set();
  for (const file of manifest.files) {
    const rel = file.path;
    if (typeof rel !== 'string' || !rel.startsWith('strategy-condition-config/') || rel.includes('\\') || rel.split('/').some(part => !part || part === '.' || part === '..') || path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel) || /[:\x00-\x1f]/.test(rel) || expected.has(rel) || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw Error('清单存在非法路径、重复或哈希');
    let current = packageRoot;
    for (const part of rel.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw Error('包内含符号链接'); }
    const data = fs.readFileSync(current);
    if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) throw Error(`文件校验失败：${rel}`);
    if (file.git_blob_sha1 && createHash('sha1').update(Buffer.from(`blob ${data.length}\0`)).update(data).digest('hex') !== file.git_blob_sha1) throw Error(`Git blob不匹配：${rel}`);
    expected.add(rel);
  }
  const actual = [];
  const walk = rel => {
    for (const item of fs.readdirSync(path.join(packageRoot, rel), {withFileTypes: true})) {
      if (item.isSymbolicLink()) throw Error('包内含符号链接');
      const name = `${rel}/${item.name}`;
      if (item.isDirectory()) walk(name); else if (item.isFile()) actual.push(name); else throw Error('包内含特殊文件');
    }
  };
  walk('strategy-condition-config');
  if (actual.length !== expected.size || actual.some(file => !expected.has(file))) throw Error('包文件集合不闭合');
  const root = path.join(packageRoot, 'strategy-condition-config');
  if (!inspectInstallation(root).skill_installed || fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim() !== expectedVersion) throw Error('技能必需文件或版本不完整');
  return {verified: true, version: expectedVersion, commit: expectedCommit, files: actual.length, source_trust: 'compare_commit_and_archive_sha256_with_independent_source'};
}
