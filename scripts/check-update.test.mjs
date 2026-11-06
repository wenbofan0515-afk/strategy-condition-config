import test from 'node:test';
import assert from 'node:assert/strict';
import { checkUpdate, compareVersions } from './check-update.mjs';

test('数字版本比较，不接受无效版本', () => {
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('v2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('1.1.1', 'v1.1.1'), 0);
  for (const value of ['1.2', '1.2.3-beta', '../main', '01.2.3']) assert.throws(() => compareVersions(value, '1.0.0'));
});
test('旧版提示，同版及本地更高版不降级', async () => {
  const fetcher = async () => ({ ok: true, text: async () => '1.1.1\n' });
  assert.equal((await checkUpdate({ current: '1.1.0', fetcher })).status, 'update_available');
  for (const current of ['1.1.1', '2.0.0']) assert.equal((await checkUpdate({ current, fetcher })).status, 'current');
});
test('断网、HTTP失败、无效版本及标签不一致只报告未知', async () => {
  for (const fetcher of [async () => { throw Error('network'); }, async () => ({ok:false}),
    async () => ({ ok:true, text:async ()=>'bad' }),
    async url => ({ ok:true, text:async () => url.includes('/main/') ? '1.1.1' : '1.1.0' })]) {
    assert.equal((await checkUpdate({current:'1.1.0', fetcher})).status, 'unavailable');
  }
});
