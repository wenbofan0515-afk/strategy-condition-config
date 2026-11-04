import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSession } from './session-check.mjs';

function fixture() {
  const calls = [];
  return { calls, api: {
    openBrowser: async (options) => { calls.push(options); return { page: {}, browser: { close: async () => calls.push('closed') } }; },
    ensureLogin: async (_, url, options) => calls.push({ url, ...options }),
    getVerticalList: async () => [{ id: 1 }],
    getVerticalDetail: async () => ({ id: 10 }),
  } };
}
test('默认无头只读核验，正常关闭会话', async () => {
  const { api, calls } = fixture();
  const result = await checkSession(api, { LIST_PAGE_URL: 'https://example.test/' }, '/test/project');
  assert.deepEqual(calls[0], { userDataDir: '/test/project/.browser-profile', headless: true });
  assert.equal(result.configuration_written, false);
  assert.equal(result.detail_readable, true);
  assert.equal(calls.at(-1), 'closed');
});
test('仅显式登录打开窗口，并使用本人项目profile', async () => {
  const { api, calls } = fixture();
  await checkSession(api, { LIST_PAGE_URL: 'https://example.test/' }, '/test/project', true);
  assert.equal(calls[0].headless, false);
  assert.equal(calls[1].timeoutSeconds, 300);
});
test('页面登录但列表为空仍拒绝', async () => {
  const { api, calls } = fixture(); api.getVerticalList = async () => [];
  await assert.rejects(checkSession(api, {}, '/test/project'), /未通过/);
  assert.equal(calls.at(-1), 'closed');
});
test('详情失败不通过，且隐藏底层敏感报错', async () => {
  const { api, calls } = fixture(); api.getVerticalDetail = async () => { throw new Error('sensitive-auth-value'); };
  await assert.rejects(checkSession(api, {}, '/test/project'), (error) => !error.message.includes('sensitive-auth-value'));
  assert.equal(calls.at(-1), 'closed');
});
