#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = 'https://raw.githubusercontent.com/wenbofan0515-afk/strategy-condition-config';
export function compareVersions(a, b) {
  const parse = value => {
    if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('无效版本');
    return value.replace(/^v/, '').split('.').map(BigInt);
  };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export async function checkUpdate({ current, fetcher = fetch } = {}) {
  try {
    current ??= fs.readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
    compareVersions(current, current);
    const signal = AbortSignal.timeout(6000);
    const read = async ref => {
      const response = await fetcher(`${repo}/${ref}/VERSION`, { signal, redirect: 'error' });
      if (!response.ok) throw new Error('版本来源不可用');
      const value = (await response.text()).trim();
      compareVersions(value, value);
      return value;
    };
    const latest = await read('main');
    // A main-branch edit alone is not a release; require the matching tag.
    if (await read(`v${latest.replace(/^v/, '')}`) !== latest) throw new Error('版本标签不一致');
    return { status: compareVersions(current, latest) < 0 ? 'update_available' : 'current', current, latest,
      url: `https://github.com/wenbofan0515-afk/strategy-condition-config/tree/v${latest.replace(/^v/, '')}` };
  } catch {
    return { status: 'unavailable', current: current || null, message: '版本检查未完成，不能确认是否最新；可继续当前任务。' };
  }
}

export async function notifyUpdate() {
  const result = await checkUpdate();
  if (result.status === 'update_available') console.error(`发现 strategy-condition-config 新版：v${result.current} → v${result.latest}。建议及时更新。可对 Codex 说：请更新此 Skill 到最新正式版，保留个人配置和登录态。${result.url}`);
  else if (result.status === 'unavailable') console.error(result.message);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  console.log(JSON.stringify(await notifyUpdate(), null, 2));
}
