import {createHash} from 'node:crypto';

export const LEVELS = ['处理等级1', '处理等级2', '处理等级3', '处理等级4'];
export const BLACK = '不清理处理等级';
export const ALL_LEVELS = [...LEVELS, BLACK];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = value => typeof value === 'string' ? value.trim() : '';
const key = (vertical, grid) => JSON.stringify([vertical, grid]);
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, 'en', {numeric:true}));
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requireValue(test, message) { if (!test) throw new Error(message); }

export function normalizeGrid(value, repairDates = false) {
  const original = value;
  if (typeof value !== 'string') return {id:null, original, error:'网格ID必须为原始文本，不能使用日期序号或数字'};
  let id = value.trim().replace(/,+\s*$/, '').trim();
  const match = /^(\d{1,2})月(\d{1,2})日?$/.exec(id);
  let repair = null;
  if (match && repairDates) {
    const month = Number(match[1]), day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      id = `${month}-${day}`;
      repair = {original, normalized:id};
    }
  }
  if (!/^[1-9]\d*-[1-9]\d*$/.test(id)) return {id:null, original, error:'网格ID格式异常，要求正整数-正整数'};
  return {id, original, repair};
}

function validateEnvelope(input) {
  requireValue(object(input) && input.schema_version === 1, '输入须为schema_version=1的对象');
  requireValue(/^\d{4}(0[1-9]|1[0-2])$/.test(input.period || ''), 'period须为本期YYYYMM');
  requireValue(label(input.task_token) && label(input.task_pool), '须明确task_token和task_pool');
  requireValue(Array.isArray(input.verticals) && input.verticals.length > 0 && input.verticals.every(v => label(v) === v && v), 'verticals须明确且非空');
  requireValue(new Set(input.verticals).size === input.verticals.length, 'verticals不能重复');
  requireValue(['explicit_nonclean', 'universe_minus_active'].includes(input.blacklist_mode), '须明确blacklist_mode');
  requireValue(input.repair_date_labels === undefined || typeof input.repair_date_labels === 'boolean', 'repair_date_labels须为布尔值');
  requireValue(input.skip_invalid === undefined || typeof input.skip_invalid === 'boolean', 'skip_invalid须为布尔值');
  requireValue(Array.isArray(input.sources) && input.sources.length > 0, 'sources不能为空');
  const ids = new Set();
  for (const source of input.sources) {
    requireValue(object(source) && label(source.id) && label(source.sheet_name) && label(source.snapshot_id), '来源须有id、sheet_name、snapshot_id');
    requireValue(!ids.has(source.id), '来源id重复，不要重复汇总同一sheet'); ids.add(source.id);
    requireValue(source.complete === true && source.hidden_included === true, `${source.id}缺少完整读取及隐藏行证明`);
    requireValue(Array.isArray(source.records) && source.expected_record_count === source.records.length, `${source.id}来源条数不闭合`);
    requireValue(source.records.every(object), `${source.id}有残缺记录对象`);
  }
}

export function buildPlan(input) {
  validateEnvelope(input);
  const scope = new Set(input.verticals), issues = [], warnings = [], repairs = [], groups = new Map();
  const addIssue = (type, detail) => issues.push({type, ...detail});
  let excludedRows = 0, includedRows = 0;
  for (const source of input.sources) for (const record of source.records) {
    const ref = {source_id:source.id, sheet_name:source.sheet_name, row:record.row};
    const vertical = label(record.vertical);
    if (!vertical) { addIssue('垂类缺失', ref); continue; }
    if (!scope.has(vertical)) { excludedRows++; continue; }
    includedRows++;
    if (!Number.isSafeInteger(record.row) || record.row < 1) addIssue('来源物理行号缺失', {...ref, vertical});
    const grid = normalizeGrid(record.grid_id, input.repair_date_labels === true);
    if (grid.error) { addIssue(grid.error, {...ref, vertical, original_grid_id:record.grid_id ?? null}); continue; }
    if (grid.repair) repairs.push({...ref, vertical, ...grid.repair});
    const level = label(record.level), entry = {vertical, grid_id:grid.id, level, grid_name:label(record.grid_name) || null, ...ref};
    if (!groups.has(key(vertical, grid.id))) groups.set(key(vertical, grid.id), []);
    groups.get(key(vertical, grid.id)).push(entry);
    if (!level) addIssue('业务调整等级缺失', entry);
    else if (!ALL_LEVELS.includes(level)) addIssue('业务调整等级未知', entry);
  }
  const targets = Object.fromEntries(input.verticals.map(vertical => [vertical, {groups:Object.fromEntries(ALL_LEVELS.map(level => [level, []])), provenance:[], skipped_invalid:[]}]));
  for (const entries of groups.values()) {
    const first = entries[0], levels = new Set(entries.map(r => r.level));
    if (levels.size > 1) addIssue('跨来源业务调整等级不一致', {vertical:first.vertical, grid_id:first.grid_id, sources:entries});
    if (levels.size === 1 && ALL_LEVELS.includes(first.level)) targets[first.vertical].groups[first.level].push(first.grid_id);
    targets[first.vertical].provenance.push({grid_id:first.grid_id, sources:entries});
  }
  for (const vertical of input.verticals) if (!targets[vertical].provenance.length) addIssue('目标垂类无来源记录', {vertical});

  if (input.blacklist_mode === 'universe_minus_active') {
    const universe = input.universe;
    requireValue(object(universe) && universe.complete === true && label(universe.snapshot_id) && universe.period === input.period, '全量反向匹配须提供本期完整universe快照');
    requireValue(Array.isArray(universe.records) && universe.expected_record_count === universe.records.length && universe.records.every(object), '全量网格记录数不闭合');
    const all = new Map(input.verticals.map(v => [v, new Set()]));
    for (const record of universe.records) {
      const vertical = label(record.vertical);
      if (!vertical) { addIssue('全量垂类缺失', {record}); continue; }
      if (!scope.has(vertical)) continue;
      const grid = normalizeGrid(record.grid_id, input.repair_date_labels === true);
      if (grid.error) { addIssue('全量网格ID异常', {vertical, original_grid_id:record.grid_id ?? null}); continue; }
      if (grid.repair) repairs.push({source_id:'universe', vertical, ...grid.repair});
      all.get(vertical).add(grid.id);
    }
    for (const vertical of input.verticals) {
      const target = targets[vertical], ids = all.get(vertical);
      if (!ids.size) addIssue('目标垂类全量网格为空', {vertical});
      const active = new Set(LEVELS.flatMap(level => target.groups[level]));
      for (const grid of active) if (!ids.has(grid)) addIssue('有效等级网格不在本期全量表', {vertical, grid_id:grid});
      for (const grid of target.groups[BLACK]) if (!ids.has(grid)) addIssue('不清理来源网格不在本期全量表', {vertical, grid_id:grid});
      target.groups[BLACK] = [...ids].filter(grid => !active.has(grid));
      target.universe_unique_count = ids.size;
    }
  }

  const seenInvalid = new Set();
  requireValue(input.invalid_grids === undefined || Array.isArray(input.invalid_grids), 'invalid_grids须为数组');
  for (const invalid of input.invalid_grids || []) {
    requireValue(object(invalid) && scope.has(invalid.vertical) && label(invalid.reason) && label(invalid.evidence), '无效网格须有范围、原因与当前校验证据');
    const grid = normalizeGrid(invalid.grid_id);
    requireValue(!grid.error, '无效记录ID格式不正确');
    const unique = key(invalid.vertical, grid.id);
    requireValue(!seenInvalid.has(unique), '无效网格记录重复'); seenInvalid.add(unique);
    const target = targets[invalid.vertical];
    const level = ALL_LEVELS.find(level => target.groups[level].includes(grid.id));
    requireValue(level, '无效网格不属于本次计划');
    if (input.skip_invalid !== true) { addIssue('无效网格尚未授权跳过', invalid); continue; }
    target.groups[level] = target.groups[level].filter(id => id !== grid.id);
    target.skipped_invalid.push({...invalid, level});
  }
  for (const target of Object.values(targets)) {
    for (const level of ALL_LEVELS) target.groups[level] = sorted(new Set(target.groups[level]));
    target.source_unique_count = target.provenance.length;
    target.counts = Object.fromEntries(ALL_LEVELS.map(level => [level, target.groups[level].length]));
    target.active_count = LEVELS.reduce((sum, level) => sum + target.counts[level], 0);
    target.effective_count = target.active_count + target.counts[BLACK];
  }
  return {
    schema_version:1, kind:'grid-distribution-plan', period:input.period, task_token:input.task_token, task_pool:input.task_pool,
    verticals:input.verticals, blacklist_mode:input.blacklist_mode, input_sha256:digest(input), ready:issues.length === 0,
    source_snapshots:input.sources.map(({id, sheet_name, snapshot_id, expected_record_count}) => ({id, sheet_name, snapshot_id, expected_record_count})),
    universe_snapshot_id:input.universe?.snapshot_id ?? null, included_rows:includedRows, excluded_rows:excludedRows,
    unique_source_grids:groups.size, duplicates_merged:[...groups.values()].reduce((sum, entries) => sum + entries.length - 1, 0),
    repairs, issues, warnings, targets,
  };
}

export function verifyState(plan, state) {
  requireValue(object(plan) && plan.kind === 'grid-distribution-plan' && plan.ready === true, '只能核验预检通过的本期计划');
  requireValue(object(state) && state.complete === true, '当前状态必须来自全量完整回读');
  for (const field of ['period', 'task_token', 'task_pool']) requireValue(state[field] === plan[field], `当前回读${field}与计划不一致`);
  requireValue(JSON.stringify([...(state.verticals || [])].sort()) === JSON.stringify([...plan.verticals].sort()), '当前回读垂类范围不一致');
  requireValue(Array.isArray(state.active) && Array.isArray(state.blacklist), '当前回读缺少active/blacklist');
  requireValue(state.active_total === state.active.length && state.blacklist_total === state.blacklist.length, '回读条数与分页总量不闭合');
  const scope = new Set(plan.verticals), differences = [], seenActive = new Set(), seenBlack = new Set();
  for (const row of state.active) {
    requireValue(object(row) && scope.has(row.vertical) && LEVELS.includes(row.level) && !normalizeGrid(row.grid_id).error, '当前网格分配记录残缺、超范围或等级未知');
    const k = key(row.vertical, row.grid_id);
    if (seenActive.has(k)) differences.push({type:'后台有效网格重复', ...row}); seenActive.add(k);
  }
  for (const row of state.blacklist) {
    requireValue(object(row) && scope.has(row.vertical) && ['enabled', 'disabled', 'pending'].includes(row.status) && !normalizeGrid(row.grid_id).error, '黑名单记录残缺、超范围或状态未知');
    const k = key(row.vertical, row.grid_id);
    if (seenBlack.has(k)) differences.push({type:'后台黑名单网格重复', ...row}); seenBlack.add(k);
  }
  for (const vertical of plan.verticals) {
    const target = plan.targets[vertical];
    for (const level of LEVELS) {
      const expected = new Set(target.groups[level]);
      const actual = new Set(state.active.filter(r => r.vertical === vertical && r.level === level).map(r => r.grid_id));
      for (const grid_id of expected) if (!actual.has(grid_id)) differences.push({type:'等级漏配或错配', vertical, grid_id, level});
      for (const grid_id of actual) if (!expected.has(grid_id)) differences.push({type:'等级多配或错配', vertical, grid_id, level});
    }
    const expected = new Set(target.groups[BLACK]);
    const current = new Map(state.blacklist.filter(r => r.vertical === vertical).map(r => [r.grid_id, r]));
    for (const grid_id of expected) {
      const row = current.get(grid_id);
      if (!row) differences.push({type:'黑名单待新增', vertical, grid_id});
      else if (row.status === 'disabled') differences.push({type:'黑名单待恢复', vertical, grid_id});
      else if (row.status === 'pending') differences.push({type:'黑名单待审批', vertical, grid_id});
    }
    for (const [grid_id, row] of current) if (!expected.has(grid_id) && row.status !== 'disabled') differences.push({type:row.status === 'enabled' ? '黑名单待关闭' : '非目标黑名单审批中', vertical, grid_id});
    const active = new Set(LEVELS.flatMap(level => target.groups[level]));
    for (const [grid_id, row] of current) if (row.status === 'enabled' && active.has(grid_id)) differences.push({type:'四档与开启黑名单冲突', vertical, grid_id});
  }
  const before = state.protected_before_sha256, after = state.protected_after_sha256;
  const nonTarget = /^[a-f0-9]{64}$/.test(before || '') && /^[a-f0-9]{64}$/.test(after || '') ? before === after : null;
  if (nonTarget === false) differences.push({type:'非目标对象变化'});
  return {configuration_matches:differences.length === 0, non_target_verified:nonTarget, passed:differences.length === 0 && nonTarget === true,
    input_sha256:plan.input_sha256, differences, limitations:nonTarget === null ? ['缺少非目标对象前后完整快照指纹；配置匹配不等于全部验收通过'] : []};
}
