import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPlan, verifyState, normalizeGrid, BLACK} from './grid-core.mjs';

const fixture = () => JSON.parse(fs.readFileSync(new URL('../assets/input-example.json', import.meta.url)));
const current = () => JSON.parse(fs.readFileSync(new URL('../assets/state-example.json', import.meta.url)));
const V = '示例垂类';
const changeRecords = (input, records) => { input.sources[0].records = records; input.sources[0].expected_record_count = records.length; return input; };

test('完整样例计划分档且不修改输入', () => {
  const input = fixture(), before = structuredClone(input), plan = buildPlan(input);
  assert.equal(plan.ready, true); assert.equal(plan.targets[V].counts['处理等级1'], 1);
  assert.equal(plan.targets[V].counts[BLACK], 1); assert.deepEqual(input, before);
});
for (const bad of [null, {}, false, 0]) test(`残缺输入拒绝：${JSON.stringify(bad)}`, () => assert.throws(() => buildPlan(bad)));
for (const value of [null, {}, false, 0, '']) test(`等级不通过默认值兜底：${JSON.stringify(value)}`, () => {
  const input = fixture(); input.sources[0].records[0].level = value;
  const plan = buildPlan(input); assert.equal(plan.ready, false); assert.ok(plan.issues.some(i => i.type === '业务调整等级缺失'));
});
test('未知建议等级不能替代业务等级', () => {
  const input = fixture(); input.sources[0].records[0].level = '建议等级1';
  assert.equal(buildPlan(input).ready, false);
});
test('任何来源缺失等级都阻断，即使另一来源非空', () => {
  const input = fixture(), source = structuredClone(input.sources[0]);
  source.id = 'second'; source.records[0].level = null; input.sources.push(source);
  const plan = buildPlan(input); assert.equal(plan.ready, false); assert.ok(plan.issues.some(i => i.type === '跨来源业务调整等级不一致'));
});
test('不清理与有效等级冲突不能用有效等级覆盖', () => {
  const input = fixture(), source = structuredClone(input.sources[0]);
  source.id = 'second'; source.records[0].level = BLACK; input.sources.push(source);
  const plan = buildPlan(input); assert.equal(plan.ready, false);
  assert.equal(plan.issues.find(i => i.type === '跨来源业务调整等级不一致').sources.length, 2);
});
test('同级重复合并但保留来源', () => {
  const input = fixture(), source = structuredClone(input.sources[0]); source.id = 'second'; input.sources.push(source);
  const plan = buildPlan(input); assert.equal(plan.ready, true); assert.equal(plan.unique_source_grids, 2);
  assert.equal(plan.duplicates_merged, 2); assert.equal(plan.targets[V].provenance[0].sources.length, 2);
});
test('隐藏行证明缺失不得继续', () => {
  const input = fixture(); input.sources[0].hidden_included = false;
  assert.throws(() => buildPlan(input), /隐藏行/);
});
test('来源条数与实际数据不闭合不得继续', () => {
  const input = fixture(); input.sources[0].expected_record_count = 3;
  assert.throws(() => buildPlan(input), /不闭合/);
});
test('来源重复不是五sheet已读全的证据', () => {
  const input = fixture(); input.sources.push(structuredClone(input.sources[0]));
  assert.throws(() => buildPlan(input), /重复/);
});
test('缺物理行号阻断，不重新编号', () => {
  const input = fixture(); delete input.sources[0].records[0].row;
  assert.equal(buildPlan(input).ready, false);
});
test('范围外垂类不纳入目标', () => {
  const input = fixture(); const records = input.sources[0].records;
  records.push({...records[0], vertical:'其他示例垂类'}); input.sources[0].expected_record_count++;
  const plan = buildPlan(input); assert.equal(plan.excluded_rows, 1); assert.deepEqual(Object.keys(plan.targets), [V]);
});
test('范围内没有数据不能按空表清除后台', () => {
  const input = fixture(); input.verticals.push('缺数据示例垂类'); assert.equal(buildPlan(input).ready, false);
});
test('ID末尾配置逗号可去掉；日期还原须显式授权', () => {
  assert.equal(normalizeGrid('12-14,').id, '12-14'); assert.equal(normalizeGrid('12月14日').id, null);
  assert.equal(normalizeGrid('12月14日', true).id, '12-14'); assert.equal(normalizeGrid('13月14日', true).id, null);
  assert.equal(normalizeGrid(46370, true).id, null);
});
test('日期还原记录原值，不直接接受序号', () => {
  const input = fixture(); input.repair_date_labels = true; input.sources[0].records[0].grid_id = '12月14日';
  const plan = buildPlan(input); assert.equal(plan.ready, true); assert.equal(plan.repairs[0].original, '12月14日');
  input.sources[0].records[0].grid_id = 46370; assert.equal(buildPlan(input).ready, false);
});
test('全量反向匹配包含来源未列出的其他网格', () => {
  const input = fixture(); input.blacklist_mode = 'universe_minus_active';
  input.universe = {period:input.period, snapshot_id:'full-1', complete:true, expected_record_count:3,
    records:[...input.sources[0].records.map(({vertical, grid_id}) => ({vertical, grid_id})), {vertical:V, grid_id:'900000003-900000003'}]};
  const plan = buildPlan(input); assert.equal(plan.ready, true); assert.equal(plan.targets[V].counts[BLACK], 2);
  assert.equal(plan.targets[V].effective_count, 3);
});
test('全量反向匹配不得用旧月或缺失全量表', () => {
  const input = fixture(); input.blacklist_mode = 'universe_minus_active'; assert.throws(() => buildPlan(input));
  input.universe = {period:'209812', snapshot_id:'old', complete:true, expected_record_count:0, records:[]};
  assert.throws(() => buildPlan(input), /本期/);
});
test('四档网格不在全量表为异常，不静默丢弃', () => {
  const input = fixture(); input.blacklist_mode = 'universe_minus_active';
  input.universe = {period:input.period, snapshot_id:'full', complete:true, expected_record_count:1, records:[{vertical:V, grid_id:'900000002-900000002'}]};
  const plan = buildPlan(input); assert.equal(plan.ready, false); assert.ok(plan.issues.some(i => i.type.includes('有效等级网格不在')));
});
test('无效跳过需要授权和证据', () => {
  const input = fixture(); input.invalid_grids = [{vertical:V, grid_id:'900000001-900000001', reason:'示例状态无效', evidence:'example-check-receipt'}];
  assert.equal(buildPlan(input).ready, false); input.skip_invalid = true;
  const plan = buildPlan(input); assert.equal(plan.ready, true); assert.equal(plan.targets[V].counts['处理等级1'], 0);
  assert.equal(plan.targets[V].skipped_invalid.length, 1);
  delete input.invalid_grids[0].evidence; assert.throws(() => buildPlan(input));
});
test('真实回读集合全部一致可通过', () => assert.equal(verifyState(buildPlan(fixture()), current()).passed, true));
test('数量相同但网格ID不同仍不通过', () => {
  const state = current(); state.active[0].grid_id = '900000003-900000003';
  assert.equal(verifyState(buildPlan(fixture()), state).passed, false);
});
test('数量相同但等级错位仍不通过', () => {
  const state = current(); state.active[0].level = '处理等级2';
  assert.equal(verifyState(buildPlan(fixture()), state).passed, false);
});
for (const [status, type] of [['pending', '黑名单待审批'], ['disabled', '黑名单待恢复']]) test(`黑名单${status}不是已开启`, () => {
  const state = current(); state.blacklist[0].status = status;
  const result = verifyState(buildPlan(fixture()), state); assert.equal(result.passed, false); assert.equal(result.differences[0].type, type);
});
test('多余开启黑名单与四档冲突须关闭，历史关闭记录可保留', () => {
  const state = current(); state.blacklist.push({...state.active[0], status:'enabled'}); state.blacklist_total++;
  const result = verifyState(buildPlan(fixture()), state); assert.equal(result.passed, false);
  assert.ok(result.differences.some(i => i.type === '四档与开启黑名单冲突'));
  state.blacklist[1].status = 'disabled'; assert.equal(verifyState(buildPlan(fixture()), state).passed, true);
});
test('分页总量不闭合拒绝判断', () => {
  const state = current(); state.blacklist_total++;
  assert.throws(() => verifyState(buildPlan(fixture()), state), /不闭合/);
});
test('重复记录不能靠去重掩盖', () => {
  const state = current(); state.active.push({...state.active[0]}); state.active_total++;
  assert.equal(verifyState(buildPlan(fixture()), state).passed, false);
});
test('旧月份和错误任务池不能拿来验收', () => {
  const state = current(); state.task_pool = '错误池'; assert.throws(() => verifyState(buildPlan(fixture()), state));
});
test('未知状态或残缺记录拒绝', () => {
  const state = current(); state.blacklist[0].status = 0; assert.throws(() => verifyState(buildPlan(fixture()), state));
  state.blacklist[0] = {}; assert.throws(() => verifyState(buildPlan(fixture()), state));
});
test('没有非目标快照只能说配置匹配', () => {
  const state = current(); delete state.protected_after_sha256;
  const result = verifyState(buildPlan(fixture()), state); assert.equal(result.configuration_matches, true);
  assert.equal(result.non_target_verified, null); assert.equal(result.passed, false);
});
test('非目标对象变化不能被目标正确掩盖', () => {
  const state = current(); state.protected_after_sha256 = 'b'.repeat(64);
  assert.equal(verifyState(buildPlan(fixture()), state).passed, false);
});
