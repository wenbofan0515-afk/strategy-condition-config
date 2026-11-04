import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, clone, findPriority, stable, validatePatch, conditionIssues, levelConfiguration, mixConfiguration } from './lib.mjs';

test('混排计数独立于引用、顺序和处理人验收', () => {
  const base = { data: [{ priority: [{ priority_id: 1, finish_task_nums: 16, handler: 'original' }, { priority_id: 2 }] }] };
  const current = clone(base);
  current.data[0].priority[0].finish_task_nums = 18;
  assert.equal(stable(mixConfiguration(base)), stable(mixConfiguration(current)));
  current.data[0].priority.reverse();
  assert.notEqual(stable(mixConfiguration(base)), stable(mixConfiguration(current)));
  current.data[0].priority.reverse();
  current.data[0].priority[0].handler = 'changed';
  assert.notEqual(stable(mixConfiguration(base)), stable(mixConfiguration(current)));
});
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

test('实时计数变化不冒充配置并发，保存使用最新计数并容许写后继续增长', async () => {
  const groups = prepare(); let current = detail(), calls = 0;
  current.level_unlimit.data[0].task_nums = 100;
  current.level_unlimit.data[0].priority[0].finish_task_nums = 10;
  await executeGroups(groups, { read: async () => clone(current), save: async (_, level) => {
    calls++; assert.equal(level.task_nums, 100); assert.equal(level.priority[0].finish_task_nums, 10);
    current.level_unlimit.data[0] = level;
    current.level_unlimit.data[0].priority[0].finish_task_nums++;
  } });
  assert.equal(calls, 1);
});
test('实时计数排除不掩盖限额、处理人、条件与顺序变化', async () => {
  for (const mutate of [l => l.expected_limit = 1, l => l.priority[0].handler = [99],
    l => l.priority.reverse(), l => l.priority[0].form_data.goods_id = '9',
    l => l.priority[0].condition.task_nums = { value: 99 }]) {
    const d = detail(); mutate(d.level_unlimit.data[0]); let calls = 0;
    await assert.rejects(executeGroups(prepare(), { read: async () => d, save: async () => calls++ }), /不一致/);
    assert.equal(calls, 0);
  }
});
test('保存自动更新时间不冒充配置变化，但更新人和无效时间值仍比较', () => {
  const base = detail().level_unlimit.data[0], changed = clone(base);
  changed.updated = '2026-11-04 10:28:15'; changed.updated_time = '2026-11-04T10:28:15.115+08:00';
  assert.equal(stable(levelConfiguration(changed)), stable(levelConfiguration(base)));
  changed.updated_by = 99;
  assert.notEqual(stable(levelConfiguration(changed)), stable(levelConfiguration(base)));
  delete changed.updated_by; changed.updated = 'unknown';
  assert.notEqual(stable(levelConfiguration(changed)), stable(levelConfiguration(base)));
});

test('缺失、null、空及部分残缺的条件对象均拒绝，所有快捷分支适用', () => {
  const patches = [{ channel_id: '115851' }, { goods_id: '3' }, { supplier_nums: ['2', 3] }, { is_black: 0 }, { condition_fields: [{ key: 'goods_created_at', value: ['2026-09-01', '2026-12-31'] }] }];
  for (const name of ['form_data', 'special_form_data', 'condition']) {
    for (const bad of [undefined, null, {}, [], 'invalid']) {
      const source = priority(30); source[name] = bad;
      for (const patch of patches) assert.throws(() => applyPatch(source, patch), /条件结构不完整/);
    }
  }
  const source = priority(30); source.form_data.shop_id = '1';
  assert.ok(conditionIssues(source).some((issue) => issue.includes('special_form_data.shop_id')));
  assert.throws(() => applyPatch(source, patches[0]), /条件结构不完整/);
});
test('合法不同编码和空值保持原样，不盲目复制覆盖', () => {
  const source = priority(30);
  source.form_data.flag = false; source.special_form_data.flag = 0; source.condition.flag = { value: '0', show_name: '否' };
  source.form_data.empty = null; source.special_form_data.empty = null; source.condition.empty = { value: null };
  const after = applyPatch(source, { channel_id: '115851' });
  assert.equal(after.form_data.flag, false); assert.equal(after.special_form_data.flag, 0); assert.equal(after.condition.flag.value, '0');
  assert.equal(after.special_form_data.empty, null);
});
test('条件映射显式支持三种不同编码', () => {
  const after = applyPatch(priority(30), { condition_fields: [{ key: 'flag', value: '0', form_value: false, special_value: 0 }] });
  assert.equal(after.form_data.flag, false); assert.equal(after.special_form_data.flag, 0); assert.equal(after.condition.flag.value, '0');
});
test('后台未启用的空默认字段不要求生成条件，0和false仍须保留', () => {
  const source = priority(30);
  for (const [key, value] of Object.entries({ unused: '', empty_list: [], nullable: null })) { source.form_data[key] = value; source.special_form_data[key] = value; }
  assert.deepEqual(conditionIssues(source), []);
  const after = applyPatch(source, { channel_id: '115851' });
  assert.equal(after.condition.unused, undefined);
  source.form_data.zero = 0;
  assert.ok(conditionIssues(source).length > 0);
  delete source.form_data.zero; source.form_data.disabled = false;
  assert.ok(conditionIssues(source).length > 0);
});
test('special对象存在字段但值被清空时也停止', () => {
  const source = priority(30); source.special_form_data.goods_id = '';
  assert.throws(() => applyPatch(source, { channel_id: '1' }), /有效值覆盖不一致/);
});
test('计划语法检查与真实对象检查分离', () => {
  assert.doesNotThrow(() => validatePatch({ channel_id: '1' }));
  for (const patch of [{ condition_fields: {} }, { condition_fields: [null] }, { condition_fields: [{ key: 'x', value: 1, special_vlaue: 2 }] }, { is_black: null }]) assert.throws(() => validatePatch(patch));
  const source = priority(30); source.condition.goods_id = null;
  assert.throws(() => applyPatch(source, { goods_id: '3' }), /结构/);
});
test('同级非目标对象残缺时不准备保存', () => {
  const d = detail(); delete d.level_unlimit.data[0].priority[1].special_form_data;
  assert.throws(() => prepareChanges({ operations: [operation()] }, [{ vertical: '示例类目', verticalId: 1, detail: d }]), /条件结构不完整/);
});
test('预期对象被篡改或任一后续组不安全时，全部写入前停止', async () => {
  const good = prepare()[0], bad = clone(good); bad.expected.handler = [99]; let calls = 0;
  await assert.rejects(executeGroups([good, bad], { read: async () => detail(), save: async () => calls++ }), /独立重建/);
  assert.equal(calls, 0);
});
test('回读返回同样残缺的expected也不允许判定成功', async () => {
  const group = prepare()[0]; group.expected.priority[0].special_form_data = { channel_id: '115851' }; let calls = 0;
  await assert.rejects(executeGroups([group], { read: async () => detail(), save: async () => calls++ }), /独立重建/);
  assert.equal(calls, 0);
});
