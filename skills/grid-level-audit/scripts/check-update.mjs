#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const repo = 'https://raw.githubusercontent.com/wenbofan0515-afk/strategy-condition-config';
const skillPath = 'skills/grid-level-audit';
const skillSlug = 'grid-level-audit';

export function compareVersions(a, b) {
  const parse = value => {
    if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('无效版本');
    return value.replace(/^v/, '').split('.').map(Number);
  };
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

export function parseSkillHubVersion(payload) {
  if (payload?.ok !== true || !Array.isArray(payload?.data?.results)) throw new Error('SkillHub版本响应不可用');
  const record = payload.data.results.find(item => item?.slug === skillSlug);
  if (!record?.version) throw new Error('SkillHub未找到该Skill');
  compareVersions(record.version, record.version);
  return record.version;
}

export async function readSkillHubVersion({ runner = execFile } = {}) {
  const { stdout } = await runner('sh-cli', [
    'skillhub', 'search', skillSlug, '--limit', '20',
    '--scene-id=sh-cli-skillhub', '--formatter=json',
  ], { timeout: 6000, maxBuffer: 1024 * 1024 });
  return parseSkillHubVersion(JSON.parse(stdout));
}

export async function checkUpdate({ current, fetcher = fetch, skillhubFetcher = readSkillHubVersion } = {}) {
  try {
    current ??= fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
    compareVersions(current, current);
    const signal = AbortSignal.timeout(6000);
    const read = async ref => {
      const response = await fetcher(`${repo}/${ref}/${skillPath}/VERSION`, { signal, redirect: 'error' });
      if (!response.ok) throw new Error('GitHub版本来源不可用');
      const value = (await response.text()).trim();
      compareVersions(value, value);
      return value;
    };
    const githubLatest = await read('main');
    const tag = `grid-level-audit-v${githubLatest.replace(/^v/, '')}`;
    if (await read(tag) !== githubLatest) throw new Error('GitHub版本标签不一致');
    const skillhubLatest = await skillhubFetcher();
    const githubCompared = compareVersions(current, githubLatest);
    const skillhubCompared = compareVersions(current, skillhubLatest);
    const status = githubCompared === -1 || skillhubCompared === -1
      ? 'update_available'
      : githubCompared === 1 && skillhubCompared === 1
        ? 'local_ahead'
        : 'current';
    return {
      status,
      current,
      latest: githubLatest,
      github_latest: githubLatest,
      skillhub_latest: skillhubLatest,
      url: `https://github.com/wenbofan0515-afk/strategy-condition-config/releases/tag/${tag}`,
    };
  } catch {
    return { status: 'unavailable', current: current || null, message: '版本检查未完成，不能确认 GitHub 和 SkillHub 是否最新；可继续当前任务。' };
  }
}

export async function notifyUpdate() {
  const result = await checkUpdate();
  if (result.status === 'update_available') {
    console.error(`发现 grid-level-audit 新版：本机 v${result.current}，GitHub v${result.github_latest}，SkillHub v${result.skillhub_latest}。建议按现有 Skill 升级流程更新并保留个人配置和登录态。${result.url}`);
  } else if (result.status === 'unavailable') {
    console.error(result.message);
  } else if (result.status === 'local_ahead') {
    console.error(`本机 v${result.current} 高于远端已发布版本：GitHub v${result.github_latest}，SkillHub v${result.skillhub_latest}；不代表本地改动已发布或其他电脑已更新。`);
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  console.log(JSON.stringify(await notifyUpdate(), null, 2));
}
