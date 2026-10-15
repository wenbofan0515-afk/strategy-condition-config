import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, clone, findPriority, stable } from './lib.mjs';
import { prepareChanges, executeGroups } from './execute-plan.mjs';

const priority = (id) => ({ priority_id: id, priority_name_show: '集合115851', handler: [42], sort: 'goods_id asc', form_data: { goods_id: '1,2' }, special_form_data: { goods_id: '1,2' }, condition: { goods_id: { value: '1,2' } } });
const detail = () => ({ id: 10, level_unlimit: { data: [{ deal_level_id: 20, is_un_limit: 1, name: '专项', handler: [42], priority: [priority(30), priority(31)] }] } });
const operation = (id = 30) => ({ vertical: '示例类目', priority_id: id, patch: { channel_id: '115851' } });
const prepare = (operations = [operation()]) => prepareChanges({ operations }, [{ vertical: '示例类目', verticalId: 1, detail: detail() }]);

test('名称不代表条件，补齐三处集合且保留源数据', () => {
  const before = priority(30), copy = clone(before), after = applyPatch(before, { channel_id: '115851' });
  assert.equal(before.form_data.channel_id, undefined);
  assert.equal(after.form_data.channel_id, '115851');
  assert.equal(after.special_form_data.channel_id, '115851');
  assert.equal(after.condition.channel_id.value, '115851');
  assert.deepEqual(before, copy);
  assert.equal(after.form_data.goods_id, '1,2');
  assert.deepEqual(after.handler, [42]);
  assert.equal(after.sort, before.sort);
});
test('渠道数和SKU平均渠道数不混用', () => {
  const after = applyPatch(priority(30), { condition_fields: [{ key: 'goods_sku_avg_bind_num_opt', value: ['lt', 3] }] });
  assert.equal(after.form_data.supplier_nums, undefined);
  assert.deepEqual(after.condition.goods_sku_avg_bind_num_opt.value, ['lt', 3]);
});
test('唯一ID跨等级定位，别名不重复，歧义拒绝', () => {
  const d = detail(); d.level_un_limit = clone(d.level_unlimit);
  assert.equal(findPriority(d, operation()).priority.priority_id, 30);
  assert.throws(() => findPriority(d, { priority_name: '集合115851' }), /数量=2/);
});
test('拒绝未知、空、重复及无效集合patch', () => {
  for (const patch of [{}, { typo: 1 }, { channel_id: '' }, { channel_id: '1', condition_fields: [{ key: 'channel_id', value: '2' }] }]) assert.throws(() => applyPatch(priority(30), patch));
  assert.throws(() => prepare([operation(), operation()]), /重复目标/);
});
test('保存完整等级并保留同级未修改优先级', async () => {
  const groups = prepare(); let current = detail(), calls = 0;
  await executeGroups(groups, { read: async () => clone(current), save: async (id, level) => {
    calls++; assert.equal(id, 10); assert.equal(level.deal_level_id, 20);
    assert.deepEqual(level.priority[1], priority(31)); current.level_unlimit.data[0] = level;
  } });
  assert.equal(calls, 1);
});
test('同一等级多目标合并一次保存', async () => {
  const groups = prepare([operation(30), operation(31)]); let current = detail(), calls = 0;
  await executeGroups(groups, { read: async () => clone(current), save: async (_, level) => {
    calls++; assert.ok(level.priority.every((p) => p.form_data.channel_id === '115851')); current.level_unlimit.data[0] = level;
  } });
  assert.equal(calls, 1);
});
test('保存前检测并发变化，不覆盖', async () => {
  const d = detail(); d.level_unlimit.data[0].handler = [99]; let calls = 0;
  await assert.rejects(executeGroups(prepare(), { read: async () => d, save: async () => { calls++; } }), /不一致/);
  assert.equal(calls, 0);
});
test('回读发现非目标变化时停止后续写入', async () => {
  const groups = prepare(); let current = detail(), calls = 0;
  await assert.rejects(executeGroups([...groups, ...groups], { read: async () => clone(current), save: async (_, level) => {
    calls++; current.level_unlimit.data[0] = level; current.level_unlimit.data[0].priority[1].handler = [99];
  } }), /不一致/);
  assert.equal(calls, 1);
});
test('结构比较不依赖对象键顺序', () => assert.equal(stable({ a: 1, b: 2 }), stable({ b: 2, a: 1 })));
