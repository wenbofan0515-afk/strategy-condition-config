#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

export function compareVersions(a, b) {
  const parts = value => {
    if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('无效版本');
    return value.replace(/^v/, '').split('.').map(BigInt);
  };
  const left = parts(a), right = parts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export function checkUpdate({runner = spawnSync, config, current} = {}) {
  try {
    current ??= fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
    config ??= JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
    compareVersions(current, current);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(config.repository)) throw new Error('版本来源无效');
    if (!/^[a-z][a-z0-9-]*-v$/.test(config.tag_prefix || '')) throw new Error('版本标签前缀无效');
    if (!/^skills\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.skill_path || '')) throw new Error('Skill子目录无效');
    const tagPattern = new RegExp(`^[a-f0-9]{40,64}\\s+refs/tags/${config.tag_prefix}((?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*))$`);
    const result = runner('git', ['-c', 'credential.interactive=false', 'ls-remote', '--tags', '--refs', config.repository, `refs/tags/${config.tag_prefix}*`],
      {encoding:'utf8', timeout:6000, env:{...process.env, GIT_TERMINAL_PROMPT:'0', GCM_INTERACTIVE:'Never'}, maxBuffer:1024*1024});
    if (result.status !== 0) throw new Error('远端版本不可读');
    const versions = result.stdout.split('\n').flatMap(line => {
      const match = tagPattern.exec(line.trim());
      return match ? [match[1]] : [];
    }).sort(compareVersions);
    const latest = versions.at(-1);
    if (!latest) throw new Error('没有正式版本标签');
    return {status:compareVersions(current, latest) < 0 ? 'update_available' : 'current', current, latest, url:`${config.repository.replace(/\.git$/, '')}/tree/${config.tag_prefix}${latest}/${config.skill_path}`};
  } catch {
    return {status:'unavailable', current:current || null, message:'无法确认远端正式版本；检查本人GitHub读取权限。未触发登录，未修改Skill，可继续本地任务。'};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) console.log(JSON.stringify(checkUpdate(), null, 2));
