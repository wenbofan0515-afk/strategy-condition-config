import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectInstallation, verifyPackage} from './installation.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const commit = 'a'.repeat(40), version = '9.8.7';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-install-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const skill = path.join(root, 'strategy-condition-config'); fs.mkdirSync(skill);
  for (const name of ['SKILL.md', 'VERSION', 'agents', 'assets', 'references', 'scripts']) fs.cpSync(path.join(source, name), path.join(skill, name), {recursive: true});
  fs.writeFileSync(path.join(skill, 'VERSION'), version + '\n');
  fs.writeFileSync(path.join(skill, 'SKILL.md'), fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8').replace(/^  version: "[^"]+"$/m, `  version: "${version}"`));
  const manifest = {version, commit, tag: `v${version}`, source: 'https://github.com/wenbofan0515-afk/strategy-condition-config', files: []};
  const walk = dir => { for (const item of fs.readdirSync(dir, {withFileTypes: true})) { const file = path.join(dir, item.name); if (item.isDirectory()) walk(file); else { const data = fs.readFileSync(file); manifest.files.push({path: path.relative(root, file).split(path.sep).join('/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex')}); } } };
  walk(skill);
  const save = () => fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest)); save();
  return {root, skill, manifest, save};
}
test('新电脑未配置适配器仍能验证技能安装；Node和适配器状态独立', t => {
  const {root, skill} = fixture(t);
  const result = inspectInstallation(skill); assert.equal(result.skill_installed, true); assert.equal(result.offline_ready, true); assert.equal(result.adapter.status, 'not_configured');
  assert.equal(inspectInstallation(skill, {nodeVersion: '20.0.0'}).offline_ready, false);
  assert.equal(inspectInstallation(skill, {adapterRoot: root}).adapter.status, 'incomplete');
  const env = {...process.env}; delete env.STRATEGY_CONFIG_RPA_ROOT;
  const processResult = spawnSync(process.execPath, [path.join(skill, 'scripts/doctor.mjs')], {cwd: root, env, encoding: 'utf8'});
  assert.equal(processResult.status, 0); assert.equal(JSON.parse(processResult.stdout).adapter.status, 'not_configured');
  fs.unlinkSync(path.join(skill, 'references/grid-workflow/workflow.md'));
  assert.equal(inspectInstallation(skill).skill_installed, false);
});
test('离线包验证受信版本提交、每文件哈希及完整集合，拒绝损坏/额外文件', t => {
  const {root, skill} = fixture(t);
  assert.equal(verifyPackage(root, {expectedVersion: version, expectedCommit: commit}).verified, true);
  assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: 'b'.repeat(40)}), /不匹配/);
  fs.writeFileSync(path.join(skill, 'unexpected.txt'), 'extra');
  assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: commit}), /不闭合/);
  fs.unlinkSync(path.join(skill, 'unexpected.txt'));
  fs.appendFileSync(path.join(skill, 'scripts/lib.mjs'), '\n// damaged');
  assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: commit}), /校验失败/);
});
test('离线包拒绝越界、Windows绝对路径、重复清单及缺网格文件', t => {
  const {root, manifest, save} = fixture(t), original = structuredClone(manifest.files);
  for (const bad of ['strategy-condition-config/../escape', 'C:\\escape', 'strategy-condition-config/a:b', 'strategy-condition-config//file']) {
    manifest.files = [{...original[0], path: bad}]; save();
    assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: commit}), /非法/);
  }
  manifest.files = [original[0], original[0]]; save();
  assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: commit}), /重复/);
  manifest.files = original.filter(file => !file.path.endsWith('references/grid-workflow/workflow.md')); save();
  assert.throws(() => verifyPackage(root, {expectedVersion: version, expectedCommit: commit}), /不闭合/);
});
