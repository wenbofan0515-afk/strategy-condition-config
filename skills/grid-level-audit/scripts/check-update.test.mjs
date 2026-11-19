import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUpdate, compareVersions, parseSkillHubVersion } from './check-update.mjs';

test('数字版本比较，不接受无效版本', () => {
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('v2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('1.0.0', 'v1.0.0'), 0);
  for (const value of ['1.2', '1.2.3-beta', '../main', '01.2.3']) assert.throws(() => compareVersions(value, '1.0.0'));
});

test('解析SkillHub版本并检查GitHub独立Release标签', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    return { ok: true, text: async () => '1.1.0\n' };
  };
  const result = await checkUpdate({ current: '1.0.0', fetcher, skillhubFetcher: async () => '1.0.0' });
  assert.equal(result.status, 'update_available');
  assert.equal(result.github_latest, '1.1.0');
  assert.equal(result.skillhub_latest, '1.0.0');
  assert.ok(urls[0].includes('/main/skills/grid-level-audit/VERSION'));
  assert.ok(urls[1].includes('/grid-level-audit-v1.1.0/skills/grid-level-audit/VERSION'));
  assert.equal(parseSkillHubVersion({ ok: true, data: { results: [{ slug: 'grid-level-audit', version: '1.2.0' }] } }), '1.2.0');
});

test('网络失败、HTTP失败、标签不一致和SkillHub失败报告未知', async () => {
  for (const fetcher of [
    async () => { throw Error('network'); },
    async () => ({ ok: false }),
    async url => ({ ok: true, text: async () => url.includes('/main/') ? '1.1.0' : '1.0.0' }),
  ]) {
    assert.equal((await checkUpdate({ current: '1.0.0', fetcher, skillhubFetcher: async () => '1.0.0' })).status, 'unavailable');
  }
  assert.equal((await checkUpdate({ current: '1.0.0', fetcher: async () => ({ ok: true, text: async () => '1.0.0' }), skillhubFetcher: async () => { throw Error('SkillHub down'); } })).status, 'unavailable');
  assert.throws(() => parseSkillHubVersion({ ok: true, data: { results: [] } }));
});
