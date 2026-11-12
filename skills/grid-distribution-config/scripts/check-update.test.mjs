import test from 'node:test';
import assert from 'node:assert/strict';
import {checkUpdate, compareVersions} from './check-update.mjs';

const config = {repository:'https://github.com/example/example-skill', tag_prefix:'grid-v', skill_path:'skills/grid-distribution-config'};
const hash = 'a'.repeat(40);
test('版本按整数比较而非字典序', () => assert.equal(compareVersions('1.10.0', '1.9.0'), 1));
test('正式tag新版提醒，私有仓库也走本人Git权限', () => {
  let args;
  const result = checkUpdate({config, current:'1.0.0', runner:(...values) => {args = values; return {status:0, stdout:`${hash}\trefs/tags/grid-v1.0.0\n${hash}\trefs/tags/grid-v1.1.0\n`};}});
  assert.equal(result.status, 'update_available'); assert.equal(result.latest, '1.1.0');
  assert.equal(args[2].env.GIT_TERMINAL_PROMPT, '0'); assert.equal(args[2].timeout, 6000);
  assert.equal(args[1].at(-1), 'refs/tags/grid-v*');
  assert.equal(result.url, 'https://github.com/example/example-skill/tree/grid-v1.1.0/skills/grid-distribution-config');
});
test('策略版本标签不误报为网格新版', () => {
  const result = checkUpdate({config, current:'1.0.0', runner:() => ({status:0, stdout:`${hash}\trefs/tags/grid-v1.0.0\n${hash}\trefs/tags/v9.0.0\n`})});
  assert.equal(result.status, 'current'); assert.equal(result.latest, '1.0.0');
});
test('无权限或网络错误只报告未知，不展示helper输出', () => {
  const result = checkUpdate({config, current:'1.0.0', runner:() => ({status:128, stdout:'', stderr:'private diagnostic'})});
  assert.equal(result.status, 'unavailable'); assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
});
test('无正式标签不冒充已是最新', () => {
  assert.equal(checkUpdate({config, current:'1.0.0', runner:() => ({status:0, stdout:`${hash}\trefs/tags/draft\n`})}).status, 'unavailable');
});
test('版本来源禁止携带凭据或任意协议', () => {
  let called = false;
  const result = checkUpdate({config:{repository:'https://token@github.com/example/test'}, current:'1.0.0', runner:() => {called = true;}});
  assert.equal(result.status, 'unavailable'); assert.equal(called, false);
});
