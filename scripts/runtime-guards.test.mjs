import test from 'node:test';
import assert from 'node:assert/strict';
import {assertApiResponse, assertPartition, collectPages, assertReadOnlyResume,
  gridDictionaryConfiguration, verifyBlackRecord, auditMixPlacement, waitForReadback} from './runtime-guards.mjs';
import {strictPlatformApi} from './platform-api.mjs';

const response = data => ({ok: true, body: {code: 0, status: 0, data}});
test('HTTP/业务码必须同时成功，不允许90000、矛盾码或缺失结构', () => {
  assert.deepEqual(assertApiResponse(response([])).data, []);
  assert.equal(assertApiResponse(response(0)).data, 0);
  assert.equal(assertApiResponse(response(false)).data, false);
  for (const r of [null, {}, {ok: true, body: {}}, {ok: false, body: {code: 0}},
    {ok: true, body: {code: 0, status: 90000}}, {ok: true, body: {code: 90000}},
    {ok: true, body: {code: 0, status: undefined}}, {ok: true, body: {status: '0'}}, response(null), response(undefined)]) {
    assert.throws(() => assertApiResponse(r));
  }
  assert.doesNotThrow(() => assertApiResponse({ok: true, body: {status: 0}}, {requireData: false}));
  assert.throws(() => assertApiResponse(response({}), {validateData: Array.isArray}), /结构/);
});
test('错误只报告契约，不拼接可能含敏感重定向参数的响应', () => {
  assert.throws(() => assertApiResponse({ok: true, body: {code: 90000, msg: 'private-test-marker'}}), e => !e.message.includes('private-test-marker'));
});
test('valid/invalid/skip逐ID互斥闭合，不能按数量自证', () => {
  const d = {grid_id_valid: ['a'], grid_id_invalid: ['b'], grid_id_skip: ['c']};
  assert.deepEqual(assertPartition(['a', 'b', 'c'], d).invalid, ['b']);
  assert.throws(() => assertPartition(['a', 'b', 'c'], {...d, grid_id_skip: ['a']}));
  assert.throws(() => assertPartition(['a', 'b', 'c'], {...d, grid_id_valid: ['wrong']}));
  assert.throws(() => assertPartition(['a'], {grid_id_valid: ['a']}));
});
const rows = Array.from({length: 23}, (_, i) => ({id: i + 1, grid_id: `${i + 1}-9`}));
const pageOf = n => ({total: rows.length, list: rows.slice((n - 1) * 10, n * 10)});
test('按实际每页10条完整取回，不把请求page_size当作实际分页', async () => {
  const calls = [];
  const d = await collectPages(async n => { calls.push(n); return pageOf(n); }, {scopeKey: 'period/pool/vertical/source'});
  assert.deepEqual(calls, [1, 2, 3]); assert.equal(d.total, 23); assert.deepEqual(d.list, rows);
  assert.deepEqual((await collectPages(async () => ({total: 0, list: []}), {scopeKey: 'empty'})).list, []);
});
test('null/空total、重复记录、空缺页、总量变化均不产生成功快照', async () => {
  for (const bad of [null, false, '', undefined, -1]) await assert.rejects(collectPages(async () => ({total: bad, list: []}), {scopeKey: 'x'}));
  await assert.rejects(collectPages(async n => n === 2 ? {...pageOf(n), total: 24} : pageOf(n), {scopeKey: 'x'}), e => e.code === 'READ_SNAPSHOT_CHANGED');
  await assert.rejects(collectPages(async n => n === 2 ? {...pageOf(n), list: []} : pageOf(n), {scopeKey: 'x'}), /不闭合/);
  await assert.rejects(collectPages(async n => n === 2 ? {...pageOf(n), list: pageOf(1).list} : pageOf(n), {scopeKey: 'x'}), /重复/);
});
test('只读超时保留已读页；同范围首页复验后才续读，旧范围不复用', async () => {
  let checkpoint;
  await assert.rejects(collectPages(async n => { if (n === 3) throw Error('timeout'); return pageOf(n); }, {
    scopeKey: 'current', onCheckpoint: c => { checkpoint = c; },
  }), /timeout/);
  const calls = [];
  const d = await collectPages(async n => { calls.push(n); return pageOf(n); }, {scopeKey: 'current', checkpoint});
  assert.deepEqual(calls, [1, 3]); assert.equal(d.list.length, 23);
  await assert.rejects(collectPages(async n => pageOf(n), {scopeKey: 'old-period', checkpoint}), /范围/);
  await assert.rejects(collectPages(async n => ({...pageOf(n), list: n === 1 ? rows.slice(1, 11) : pageOf(n).list}), {scopeKey: 'current', checkpoint}), /首页/);
});
const scope = {period: '209901', source_sha256: 'a'.repeat(64), vertical: '示例', task_token: 'pool-token', task_pool: 'pool'};
const saved = () => ({action: 'save', request_key: 'L1', started_at: 'start', completed_at: 'end', response: response({})});
test('已受理日志只能恢复只读验收；不明、缺档、重复或换池均停止', () => {
  const journal = {scope, steps: [saved()]};
  assert.deepEqual(assertReadOnlyResume(scope, journal, ['L1']), {action: 'read_only', repeat_writes: false});
  for (const bad of [{...journal, steps: []}, {...journal, steps: [saved(), saved()]},
    {...journal, steps: [{...saved(), response: undefined}]}, {...journal, steps: [{...saved(), completed_at: null}]},
    {...journal, scope: {...scope, task_pool: 'another'}}]) assert.throws(() => assertReadOnlyResume(scope, bad, ['L1']));
});
test('异步0到部分到完整仅重复读；预算耗尽标待同步，不伪造完成', async () => {
  let reads = 0; const waited = [];
  const result = await waitForReadback({read: async () => [0, 2, 3][reads++], verify: n => ({matches: n === 3, pending: true}),
    maxAttempts: 4, intervalMs: 20, wait: async ms => waited.push(ms)});
  assert.equal(result.verified, true); assert.equal(reads, 3); assert.deepEqual(waited, [20, 20]);
  const pending = await waitForReadback({read: async () => 0, verify: () => ({matches: false, pending: true}),
    maxAttempts: 2, intervalMs: 0, wait: async () => {}});
  assert.equal(pending.verified, false); assert.equal(pending.status, 'accepted_readback_pending');
});
test('分页变化可只读重查，权限/结构/确定性字段差异不按延迟循环', async () => {
  let reads = 0;
  const r = await waitForReadback({read: async () => { if (!reads++) { const e = Error('changed'); e.code = 'READ_SNAPSHOT_CHANGED'; throw e; } return []; },
    verify: () => ({matches: true}), maxAttempts: 2, intervalMs: 0, wait: async () => {}});
  assert.equal(r.verified, true);
  for (const checked of [{matches: false, pending: false}, {}]) {
    let calls = 0;
    await assert.rejects(waitForReadback({read: async () => calls++, verify: () => checked, maxAttempts: 3, intervalMs: 0, wait: async () => {}}));
    assert.equal(calls, 1);
  }
});
test('网格字典只忽略优先级直接动态计数，嵌套业务字段及顺序仍比较', () => {
  const before = [{deal_level_id: 1, priority: [{priority_id: 2, task_nums: 10, condition: {task_nums: {value: 10}}}, {priority_id: 3}]}];
  const after = structuredClone(before); after[0].priority[0].task_nums++;
  assert.deepEqual(gridDictionaryConfiguration(before), gridDictionaryConfiguration(after));
  after[0].priority[0].condition.task_nums.value++;
  assert.notDeepEqual(gridDictionaryConfiguration(before), gridDictionaryConfiguration(after));
  after[0].priority.reverse(); assert.notDeepEqual(gridDictionaryConfiguration(before), gridDictionaryConfiguration(after));
  assert.throws(() => gridDictionaryConfiguration([{}]));
});
const oldBlack = () => ({id: 10, detail_id: 8, vertical_id: 8, grid_id: '15-20', child_category_id: 0, root_brand_id: 0, status: 1, create_goods_limit_cfg: 2, updated_at: 'old', opt_user: 'old'});
const blackOptions = {action: 'restore', detailId: 8, verticalId: 8, buildCfg: 2};
test('历史0维度保持原样，恢复审批中不误报损坏，也不冒充开启', () => {
  const before = oldBlack(), after = {...before, status: 2, updated_at: 'new', opt_user: 'new'};
  assert.deepEqual(verifyBlackRecord(before, after, blackOptions), {status: 2, pending: true, at_target: false});
  assert.equal(verifyBlackRecord(before, {...after, status: 0}, blackOptions).at_target, true);
  for (const patch of [{id: 11}, {root_brand_id: 20}, {create_goods_limit_cfg: 1}, {status: 9}]) assert.throws(() => verifyBlackRecord(before, {...after, ...patch}, blackOptions));
});
test('新增不能套用历史0维度豁免；关闭需独立目标状态', () => {
  const added = {...oldBlack(), child_category_id: 15, root_brand_id: 20, status: 2};
  assert.equal(verifyBlackRecord(null, added, {...blackOptions, action: 'add'}).pending, true);
  assert.throws(() => verifyBlackRecord(null, {...added, root_brand_id: 0}, {...blackOptions, action: 'add'}));
  assert.throws(() => verifyBlackRecord(undefined, added, {...blackOptions, action: 'add'}));
  const before = {...oldBlack(), status: 0};
  assert.equal(verifyBlackRecord(before, {...before, status: 1}, {...blackOptions, action: 'close'}).at_target, true);
});
const mix = () => ({level_mix_open: 1, level_mix: {data: [{priority: [
  {source_deal_level_id: 10, source_priority_id: 1, sort_val: 9},
  {source_deal_level_id: 10, source_priority_id: 2, sort_val: 0},
  {source_deal_level_id: 20, source_priority_id: 3, sort_val: 0},
  {source_deal_level_id: 30, source_priority_id: 4, sort_val: -1},
]}]}});
const anchor = {anchorLevelId: 10, targetLevelId: 20, targetPriorityId: 3};
test('混排依据真实开关、来源ID和数组最后锚点，旧sort_val不触发重排', () => {
  const d = mix(), before = structuredClone(d);
  assert.equal(auditMixPlacement(d, anchor).correctly_placed, true); assert.deepEqual(d, before);
  d.level_mix_open = 0; assert.deepEqual(auditMixPlacement(d, anchor), {enabled: false, action: 'preserve'});
  delete d.level_mix_open; assert.throws(() => auditMixPlacement(d, anchor), /开关/);
});
test('混排等级末尾及全局第二位不能替代处理等级1最后来源引用后的位置', () => {
  const d = mix(); d.level_mix.data[0].priority.reverse();
  assert.equal(auditMixPlacement(d, anchor).correctly_placed, false);
  const duplicate = mix(); duplicate.level_mix.data[0].priority.push(structuredClone(duplicate.level_mix.data[0].priority[2]));
  assert.throws(() => auditMixPlacement(duplicate, anchor), /重复/);
  assert.throws(() => auditMixPlacement(mix(), {...anchor, anchorLevelId: 99}), /锚点/);
});
const constants = {GATEWAY_BASE: 'https://example.invalid/distribute', CENTER_ID: 1, TASK_TOKEN: 'test'};
test('通用入口使用严格响应适配，90000不再返回空配置或保存成功', async () => {
  let calls = 0;
  const api = strictPlatformApi({fetchInPage: async () => { calls++; return {ok: true, body: {status: 90000, data: {}}}; }}, constants);
  await assert.rejects(api.getVerticalList(null)); await assert.rejects(api.getVerticalDetail(null, 8));
  await assert.rejects(api.saveLevel(null, 8, {deal_level_id: 4, priority: []})); assert.equal(calls, 3);
  await assert.rejects(api.saveLevel(null, 8, {deal_level_id: 4, priority: []}, 3), /混排/); assert.equal(calls, 3);
});
test('严格适配拒绝残缺详情并保留合法空列表/数组，保存仍需后续回读', async () => {
  let reply = response([]), payload;
  const api = strictPlatformApi({fetchInPage: async (_, url, options) => { payload = options; return reply; }}, constants);
  assert.deepEqual(await api.getVerticalList(null), []);
  for (const data of [{}, {id: 8}, {id: 9, level_ordinary: {data: []}}, {id: 8, level_ordinary: {data: []}, level_define: null}]) {
    reply = response(data); await assert.rejects(api.getVerticalDetail(null, 8));
  }
  reply = response({id: 8, level_ordinary: {data: []}}); assert.equal((await api.getVerticalDetail(null, 8)).id, 8);
  reply = {ok: true, body: {code: 0}}; await api.saveLevel(null, 8, {deal_level_id: 4, name: 'sample', priority: []});
  assert.equal(JSON.parse(payload.body).update_tab, 1);
});
