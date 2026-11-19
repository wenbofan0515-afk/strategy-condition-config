import { createHash } from 'node:crypto';

export const LEVELS = ['处理等级1', '处理等级2', '处理等级3', '处理等级4'];
export const BLACKLIST_LEVEL = '不清理处理等级';
export const ACTIVE_POOL_STATUSES = new Set(['active']);
export const BLACKLIST_STATUSES = new Set(['enabled', 'disabled', 'pending']);
export const PENDING_ISSUES = new Set([
  'backend_incomplete',
  'blacklist_incomplete',
  'blacklist_pending',
  'pending_blacklist_conflict',
]);
export const UNCERTAIN_ISSUES = new Set([
  'source_invalid',
  'source_incomplete',
  'source_duplicate',
  'source_missing_level',
  'source_unknown_level',
  'source_invalid_grid',
  'backend_incomplete',
  'blacklist_incomplete',
]);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const key = (vertical, grid) => JSON.stringify([vertical, grid]);
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeLevel(value) {
  const label = text(value);
  if (LEVELS.includes(label)) return label;
  const limited = /^(?:限制型)?处理等级([1-4])$/.exec(label);
  if (limited) return `处理等级${limited[1]}`;
  if (label === '不清理' || label === BLACKLIST_LEVEL) return BLACKLIST_LEVEL;
  return null;
}

export function normalizeGrid(value, repairDateLabels = false) {
  const original = value;
  if (typeof value !== 'string') {
    return { id: null, original, error: '网格ID必须为原始文本，不能使用日期序号或数字' };
  }
  let id = value.trim().replace(/,+\s*$/, '').trim();
  const dateMatch = /^(\d{1,2})月(\d{1,2})日?$/.exec(id);
  let repair = null;
  if (dateMatch && repairDateLabels) {
    const month = Number(dateMatch[1]);
    const day = Number(dateMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      id = `${month}-${day}`;
      repair = { original, normalized: id };
    }
  }
  if (!/^[1-9]\d*-[1-9]\d*$/.test(id)) {
    return { id: null, original, error: '网格ID格式异常，要求正整数-正整数' };
  }
  return { id, original, repair };
}

function issue(type, details = {}) {
  return { type, ...details };
}

function validateInputEnvelope(input) {
  const errors = [];
  if (!isObject(input) || input.schema_version !== 1) errors.push(issue('input_invalid', { message: '输入须为schema_version=1的对象' }));
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(input?.period || '')) errors.push(issue('input_invalid', { message: 'period须为本期YYYYMM' }));
  if (!Array.isArray(input?.verticals) || input.verticals.length === 0 || input.verticals.some(value => !text(value))) {
    errors.push(issue('input_invalid', { message: 'verticals须明确且非空' }));
  } else if (new Set(input.verticals).size !== input.verticals.length) {
    errors.push(issue('input_invalid', { message: 'verticals不能重复' }));
  }
  if (input?.repair_date_labels !== undefined && typeof input.repair_date_labels !== 'boolean') {
    errors.push(issue('input_invalid', { message: 'repair_date_labels须为布尔值' }));
  }
  if (input?.source_scope_complete !== undefined && typeof input.source_scope_complete !== 'boolean') {
    errors.push(issue('input_invalid', { message: 'source_scope_complete须为布尔值' }));
  }
  if (!Array.isArray(input?.sources) || input.sources.length === 0) {
    errors.push(issue('input_invalid', { message: 'sources不能为空' }));
  }
  if (!isObject(input?.backend_snapshot)) errors.push(issue('input_invalid', { message: '缺少backend_snapshot' }));
  if (!isObject(input?.blacklist_snapshot)) errors.push(issue('input_invalid', { message: '缺少blacklist_snapshot' }));
  return errors;
}

function emptyExpected(verticals) {
  return Object.fromEntries(verticals.map(vertical => [vertical, new Map()]));
}

function buildExpected(input, issues) {
  const expected = emptyExpected(input.verticals);
  const provenance = emptyExpected(input.verticals);
  const seen = new Map();
  const scope = new Set(input.verticals);
  const repairDateLabels = input.repair_date_labels === true;

  for (const source of input.sources || []) {
    if (!isObject(source) || !text(source.id) || !text(source.sheet_name) || !text(source.snapshot_id)) {
      issues.push(issue('source_invalid', { source_id: source?.id ?? null }));
      continue;
    }
    if (source.complete !== true || source.hidden_included !== true) {
      issues.push(issue('source_incomplete', { source_id: source.id, sheet_name: source.sheet_name }));
    }
    if (!Array.isArray(source.records) || source.expected_record_count !== source.records.length) {
      issues.push(issue('source_incomplete', { source_id: source.id, sheet_name: source.sheet_name, message: '来源条数不闭合' }));
      continue;
    }
    for (const record of source.records) {
      const vertical = text(record?.vertical);
      if (!vertical || !scope.has(vertical)) continue;
      const grid = normalizeGrid(record?.grid_id, repairDateLabels);
      const ref = { source_id: source.id, sheet_name: source.sheet_name, row: record?.row, vertical, original_grid_id: record?.grid_id ?? null };
      if (grid.error) {
        issues.push(issue('source_invalid_grid', { ...ref, message: grid.error }));
        continue;
      }
      const level = normalizeLevel(record?.level);
      const entry = { ...ref, grid_id: grid.id, level, grid_name: text(record?.grid_name) || null };
      if (grid.repair) entry.repair = grid.repair;
      if (!Number.isSafeInteger(record?.row) || record.row < 1) {
        issues.push(issue('source_invalid', { ...entry, message: '来源物理行号缺失' }));
      }
      if (!level) {
        issues.push(issue(text(record?.level) ? 'source_unknown_level' : 'source_missing_level', entry));
      }
      const uniqueKey = key(vertical, grid.id);
      if (seen.has(uniqueKey)) {
        issues.push(issue('source_duplicate', { ...entry, previous: seen.get(uniqueKey) }));
      } else {
        seen.set(uniqueKey, entry);
        expected[vertical].set(grid.id, level);
        provenance[vertical].set(grid.id, entry);
      }
    }
  }
  return { expected, provenance };
}

function isExcludedTaskPool(taskPool) {
  const type = text(taskPool?.task_pool_type).toLowerCase();
  const name = text(taskPool?.task_pool_name);
  if (type === 'store_collection' || type === 'store-collection' || type === '店铺收录') {
    return { excluded: true, reason: 'task_pool_type' };
  }
  if (!type && name === '店铺收录') return { excluded: true, reason: 'exact_name' };
  return { excluded: false };
}

function addPoolIssue(issues, type, details) {
  issues.push(issue(type, details));
}

function collectPoolActual(taskPool, vertical, issues) {
  const result = {
    vertical,
    task_pool_id: text(taskPool.task_pool_id),
    task_pool_name: text(taskPool.task_pool_name),
    task_pool_type: text(taskPool.task_pool_type) || null,
    status: text(taskPool.status),
    counts: Object.fromEntries(LEVELS.map(level => [level, 0])),
    actual_by_grid: {},
    grid_levels: {},
    complete: taskPool.complete === true,
    issues: [],
  };
  if (!result.task_pool_id || !result.task_pool_name) {
    addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id || null, message: '任务池缺少唯一ID或名称' });
  }
  if (!ACTIVE_POOL_STATUSES.has(result.status)) {
    addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, message: 'active任务池状态未知' });
  }
  if (taskPool.complete !== true) {
    addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, task_pool_name: result.task_pool_name, message: '任务池读取不完整' });
  }
  if (!Array.isArray(taskPool.levels)) {
    addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, message: '缺少等级1至4结果' });
    return result;
  }
  const seenLevels = new Set();
  for (const levelRecord of taskPool.levels) {
    const level = normalizeLevel(levelRecord?.level_name);
    if (!level || !LEVELS.includes(level)) {
      addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level_id: levelRecord?.level_id ?? null, level_name: levelRecord?.level_name ?? null, message: '处理等级名称未知' });
      continue;
    }
    if (seenLevels.has(level)) {
      addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level, message: '同一任务池重复返回处理等级' });
      continue;
    }
    seenLevels.add(level);
    if (levelRecord.complete !== true) {
      addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level, message: '处理等级分页不完整' });
    }
    if (!Array.isArray(levelRecord.grids) || levelRecord.total !== levelRecord.grids.length) {
      addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level, message: '处理等级数量与记录不闭合' });
      continue;
    }
    result.counts[level] = levelRecord.grids.length;
    const localIds = new Set();
    for (const gridRecord of levelRecord.grids) {
      const grid = normalizeGrid(gridRecord?.grid_id);
      if (grid.error) {
        addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level, original_grid_id: gridRecord?.grid_id ?? null, message: grid.error });
        continue;
      }
      if (localIds.has(grid.id)) {
        addPoolIssue(issues, 'duplicate_grid_in_pool', { vertical, task_pool_id: result.task_pool_id, task_pool_name: result.task_pool_name, grid_id: grid.id, level });
      }
      localIds.add(grid.id);
      if (!result.grid_levels[grid.id]) result.grid_levels[grid.id] = [];
      result.grid_levels[grid.id].push(level);
    }
  }
  for (const level of LEVELS) {
    if (!seenLevels.has(level)) {
      addPoolIssue(issues, 'backend_incomplete', { vertical, task_pool_id: result.task_pool_id, level, message: '缺少处理等级对象' });
    }
  }
  for (const [grid, levels] of Object.entries(result.grid_levels)) {
    result.actual_by_grid[grid] = levels.length === 1 ? levels[0] : null;
    if (levels.length > 1) {
      addPoolIssue(issues, 'duplicate_grid_in_pool', { vertical, task_pool_id: result.task_pool_id, task_pool_name: result.task_pool_name, grid_id: grid, levels });
    }
  }
  return result;
}

function comparePoolToExpected(pool, expected, provenance, vertical, issues) {
  const actual = pool.actual_by_grid;
  for (const [grid, expectedLevel] of expected.entries()) {
    if (!expectedLevel) continue;
    const actualLevel = actual[grid];
    if (expectedLevel === BLACKLIST_LEVEL) {
      if (actualLevel !== undefined) {
        const source = provenance.get(grid);
        addPoolIssue(issues, 'nonclean_grid_in_pool', { vertical, task_pool_id: pool.task_pool_id, task_pool_name: pool.task_pool_name, grid_id: grid, expected_level: expectedLevel, actual_level: actualLevel, source_row: source?.row ?? null });
      }
      continue;
    }
    if (actualLevel === undefined) {
      const source = provenance.get(grid);
      addPoolIssue(issues, 'missing_grid_in_pool', { vertical, task_pool_id: pool.task_pool_id, task_pool_name: pool.task_pool_name, grid_id: grid, expected_level: expectedLevel, source_row: source?.row ?? null });
    } else if (actualLevel !== expectedLevel) {
      const source = provenance.get(grid);
      addPoolIssue(issues, 'wrong_level_in_pool', { vertical, task_pool_id: pool.task_pool_id, task_pool_name: pool.task_pool_name, grid_id: grid, expected_level: expectedLevel, actual_level: actualLevel, source_row: source?.row ?? null });
    }
  }
  for (const [grid, actualLevel] of Object.entries(actual)) {
    if (!expected.has(grid)) {
      addPoolIssue(issues, 'extra_grid_in_pool', { vertical, task_pool_id: pool.task_pool_id, task_pool_name: pool.task_pool_name, grid_id: grid, actual_level: actualLevel });
    }
  }
  pool.source_match = !issues.some(item => item.task_pool_id === pool.task_pool_id && ['missing_grid_in_pool', 'wrong_level_in_pool', 'extra_grid_in_pool'].includes(item.type));
}

function comparePools(vertical, pools, issues) {
  if (pools.length < 2) return true;
  const reference = pools[0];
  let consistent = true;
  for (const current of pools.slice(1)) {
    const grids = new Set([...Object.keys(reference.actual_by_grid), ...Object.keys(current.actual_by_grid)]);
    for (const grid of sorted(grids)) {
      const referenceLevel = reference.actual_by_grid[grid];
      const currentLevel = current.actual_by_grid[grid];
      if (referenceLevel === undefined || currentLevel === undefined) {
        consistent = false;
        issues.push(issue('cross_pool_missing_grid', {
          vertical,
          reference_task_pool_id: reference.task_pool_id,
          task_pool_id: current.task_pool_id,
          grid_id: grid,
          reference_level: referenceLevel ?? null,
          actual_level: currentLevel ?? null,
        }));
      } else if (referenceLevel !== currentLevel) {
        consistent = false;
        issues.push(issue('cross_pool_level_conflict', {
          vertical,
          reference_task_pool_id: reference.task_pool_id,
          task_pool_id: current.task_pool_id,
          grid_id: grid,
          reference_level: referenceLevel,
          actual_level: currentLevel,
        }));
      }
    }
  }
  return consistent;
}

function validateBlacklist(input, expected, activePools, issues) {
  const snapshot = input.blacklist_snapshot;
  const result = {
    complete: snapshot?.complete === true,
    expected_nonclean: 0,
    enabled_nonclean: 0,
    expected_nonclean_for_vertical: {},
    enabled_nonclean_for_vertical: {},
    mismatches: [],
    records: [],
  };
  if (!isObject(snapshot) || snapshot.complete !== true || !Array.isArray(snapshot.records) || snapshot.total !== snapshot.records.length) {
    issues.push(issue('blacklist_incomplete', { message: '黑名单读取不完整或数量不闭合' }));
    return result;
  }
  const current = new Map();
  for (const record of snapshot.records) {
    const vertical = text(record?.vertical);
    const grid = normalizeGrid(record?.grid_id);
    if (!vertical || grid.error || !BLACKLIST_STATUSES.has(record?.status)) {
      issues.push(issue('blacklist_incomplete', { vertical: vertical || null, original_grid_id: record?.grid_id ?? null, status: record?.status ?? null, message: '黑名单记录残缺、网格ID异常或状态未知' }));
      continue;
    }
    const uniqueKey = key(vertical, grid.id);
    if (current.has(uniqueKey)) {
      issues.push(issue('blacklist_incomplete', { vertical, grid_id: grid.id, message: '黑名单网格重复' }));
      continue;
    }
    current.set(uniqueKey, { ...record, vertical, grid_id: grid.id });
    result.records.push({ ...record, vertical, grid_id: grid.id });
  }
  for (const [vertical, expectedMap] of Object.entries(expected)) {
    for (const [grid, level] of expectedMap.entries()) {
      const row = current.get(key(vertical, grid));
      if (level === BLACKLIST_LEVEL) {
        result.expected_nonclean += 1;
        result.expected_nonclean_for_vertical[vertical] = (result.expected_nonclean_for_vertical[vertical] || 0) + 1;
        if (row?.status === 'enabled') {
          result.enabled_nonclean += 1;
          result.enabled_nonclean_for_vertical[vertical] = (result.enabled_nonclean_for_vertical[vertical] || 0) + 1;
        } else if (!row) {
          const item = issue('blacklist_missing', { vertical, grid_id: grid });
          issues.push(item); result.mismatches.push(item);
        } else if (row.status === 'pending') {
          const item = issue('blacklist_pending', { vertical, grid_id: grid, status: row.status });
          issues.push(item); result.mismatches.push(item);
        } else {
          const item = issue('blacklist_not_enabled', { vertical, grid_id: grid, status: row.status });
          issues.push(item); result.mismatches.push(item);
        }
      } else if (row?.status === 'enabled') {
        const item = issue('active_blacklist_conflict', { vertical, grid_id: grid, expected_level: level });
        issues.push(item); result.mismatches.push(item);
      } else if (row?.status === 'pending') {
        const item = issue('pending_blacklist_conflict', { vertical, grid_id: grid, expected_level: level });
        issues.push(item); result.mismatches.push(item);
      }
    }
  }
  for (const pool of activePools) for (const [grid, level] of Object.entries(pool.actual_by_grid)) {
    const row = current.get(key(pool.vertical, grid));
    if (row?.status === 'enabled') {
      const item = issue('active_blacklist_conflict', { vertical: pool.vertical, grid_id: grid, task_pool_id: pool.task_pool_id, actual_level: level });
      if (!issues.some(existing => existing.type === item.type && existing.vertical === item.vertical && existing.grid_id === item.grid_id && existing.task_pool_id === item.task_pool_id)) {
        issues.push(item); result.mismatches.push(item);
      }
    }
  }
  if (input.source_scope_complete === true) {
    const expectedKeys = new Set();
    for (const [vertical, expectedMap] of Object.entries(expected)) for (const grid of expectedMap.keys()) expectedKeys.add(key(vertical, grid));
    for (const row of result.records) {
      if (row.status === 'enabled' && !expectedKeys.has(key(row.vertical, row.grid_id))) {
        const item = issue('unexpected_blacklist', { vertical: row.vertical, grid_id: row.grid_id });
        issues.push(item); result.mismatches.push(item);
      }
    }
  }
  return result;
}

function statusFromIssues(issues, hasActivePools, hasExpectedData) {
  if (issues.some(item => item.type === 'input_invalid' || UNCERTAIN_ISSUES.has(item.type))) return 'unknown';
  if (issues.some(item => !PENDING_ISSUES.has(item.type))) return 'failed';
  if (issues.length || !hasExpectedData) return hasActivePools ? 'pending' : 'unknown';
  return hasActivePools ? 'passed' : 'not_applicable';
}

function countIssues(issues) {
  return issues.reduce((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});
}

function buildVerticalResult(vertical, expectedMap, provenance, backendVertical, allIssues, blacklist) {
  const localIssues = allIssues.filter(item => item.vertical === vertical || item.reference_task_pool_id && backendVertical?.task_pools?.some(pool => pool.task_pool_id === item.reference_task_pool_id) || item.task_pool_id && backendVertical?.task_pools?.some(pool => pool.task_pool_id === item.task_pool_id));
  const activeTaskPools = [];
  const inactiveTaskPools = [];
  const excludedTaskPools = [];
  const taskPools = Array.isArray(backendVertical?.task_pools) ? backendVertical.task_pools : [];
  for (const taskPool of taskPools) {
    const exclusion = isExcludedTaskPool(taskPool);
    const descriptor = { task_pool_id: text(taskPool.task_pool_id) || null, task_pool_name: text(taskPool.task_pool_name) || null, task_pool_type: text(taskPool.task_pool_type) || null, status: text(taskPool.status) || null };
    if (exclusion.excluded) {
      excludedTaskPools.push({ ...descriptor, reason: exclusion.reason });
    } else if (taskPool.status === 'active') {
      activeTaskPools.push(collectPoolActual(taskPool, vertical, allIssues));
    } else if (taskPool.status === 'inactive') {
      inactiveTaskPools.push(descriptor);
    } else {
      allIssues.push(issue('backend_incomplete', { vertical, task_pool_id: descriptor.task_pool_id, message: '任务池启用状态未知' }));
    }
  }
  for (const pool of activeTaskPools) comparePoolToExpected(pool, expectedMap, provenance, vertical, allIssues);
  const crossPoolConsistent = comparePools(vertical, activeTaskPools, allIssues);
  const blacklistForVertical = {
    expected_nonclean: blacklist.expected_nonclean_for_vertical?.[vertical] || 0,
    enabled_nonclean: blacklist.enabled_nonclean_for_vertical?.[vertical] || 0,
    mismatches: blacklist.mismatches.filter(item => item.vertical === vertical),
  };
  const localHasFailure = allIssues.some(item => item.vertical === vertical && !PENDING_ISSUES.has(item.type));
  const localHasPending = allIssues.some(item => item.vertical === vertical && PENDING_ISSUES.has(item.type));
  let status = 'passed';
  if (activeTaskPools.length === 0 && !localHasFailure && !localHasPending) status = 'not_applicable';
  else if (localHasFailure) status = 'failed';
  else if (localHasPending) status = 'pending';
  return {
    vertical,
    status,
    expected_by_grid: Object.fromEntries(sorted([...expectedMap.keys()]).map(grid => [grid, expectedMap.get(grid)])),
    active_task_pools: activeTaskPools.map(pool => ({ ...pool, issues: allIssues.filter(item => item.task_pool_id === pool.task_pool_id && item.vertical === vertical) })),
    inactive_task_pools: inactiveTaskPools,
    excluded_task_pools: excludedTaskPools,
    cross_pool_consistent: crossPoolConsistent,
    blacklist: blacklistForVertical,
    issue_counts: countIssues(localIssues),
  };
}

export function auditGridLevels(input) {
  const envelopeIssues = validateInputEnvelope(input);
  if (envelopeIssues.length) {
    return {
      schema_version: 1,
      kind: 'grid-level-audit',
      period: input?.period ?? null,
      status: 'unknown',
      input_sha256: digest(input),
      summary: { issue_count: envelopeIssues.length, issue_counts: countIssues(envelopeIssues) },
      verticals: [],
      issues: envelopeIssues,
      limitations: ['输入契约未通过，未生成业务校验结论'],
    };
  }
  const issues = [];
  const { expected, provenance } = buildExpected(input, issues);
  const backend = input.backend_snapshot;
  const backendVerticals = new Map((backend.verticals || []).map(vertical => [text(vertical.vertical), vertical]));
  if (backend.complete !== true) issues.push(issue('backend_incomplete', { message: '后台垂类快照不完整' }));
  const backendResults = new Map();
  for (const vertical of input.verticals) {
    if (!backendVerticals.has(vertical)) issues.push(issue('backend_missing_vertical', { vertical }));
  }
  const blacklistPlaceholder = {
    expected_nonclean_for_vertical: Object.fromEntries(input.verticals.map(vertical => [vertical, [...expected[vertical].values()].filter(level => level === BLACKLIST_LEVEL).length])),
    enabled_nonclean_for_vertical: Object.fromEntries(input.verticals.map(vertical => [vertical, 0])),
    mismatches: [],
  };
  for (const backendVertical of backendVerticals.values()) {
    if (!input.verticals.includes(text(backendVertical.vertical))) continue;
    if (backendVertical.complete !== true) issues.push(issue('backend_incomplete', { vertical: backendVertical.vertical, message: '垂类任务池列表不完整' }));
    backendResults.set(text(backendVertical.vertical), backendVertical);
  }
  const verticals = input.verticals.map(vertical => buildVerticalResult(vertical, expected[vertical], provenance[vertical], backendResults.get(vertical), issues, blacklistPlaceholder));
  const activePools = verticals.flatMap(verticalResult => verticalResult.active_task_pools.map(pool => ({ ...pool, vertical: verticalResult.vertical })));
  const blacklist = validateBlacklist(input, expected, activePools, issues);
  for (const verticalResult of verticals) {
    verticalResult.blacklist = {
      expected_nonclean: blacklist.expected_nonclean_for_vertical[verticalResult.vertical] || 0,
      enabled_nonclean: blacklist.enabled_nonclean_for_vertical[verticalResult.vertical] || 0,
      mismatches: blacklist.mismatches.filter(item => item.vertical === verticalResult.vertical),
    };
    const localIssues = issues.filter(item => item.vertical === verticalResult.vertical || (item.task_pool_id && verticalResult.active_task_pools.some(pool => pool.task_pool_id === item.task_pool_id)));
    const hasUnknown = localIssues.some(item => UNCERTAIN_ISSUES.has(item.type));
    const hasFailure = localIssues.some(item => !PENDING_ISSUES.has(item.type) && !UNCERTAIN_ISSUES.has(item.type));
    const hasPending = localIssues.some(item => PENDING_ISSUES.has(item.type));
    if (hasUnknown) verticalResult.status = 'unknown';
    else if (hasFailure) verticalResult.status = 'failed';
    else if (hasPending) verticalResult.status = 'pending';
    else if (verticalResult.active_task_pools.length === 0) verticalResult.status = 'not_applicable';
    else verticalResult.status = 'passed';
    verticalResult.issue_counts = countIssues(localIssues);
  }
  const hasActivePools = verticals.some(item => item.active_task_pools.length > 0);
  const hasExpectedData = Object.values(expected).some(map => map.size > 0);
  const status = statusFromIssues(issues, hasActivePools, hasExpectedData);
  const summary = {
    vertical_count: verticals.length,
    passed_verticals: verticals.filter(item => item.status === 'passed').length,
    failed_verticals: verticals.filter(item => item.status === 'failed').length,
    pending_verticals: verticals.filter(item => item.status === 'pending').length,
    not_applicable_verticals: verticals.filter(item => item.status === 'not_applicable').length,
    source_grid_count: Object.values(expected).reduce((sum, map) => sum + map.size, 0),
    active_task_pool_count: verticals.reduce((sum, item) => sum + item.active_task_pools.length, 0),
    inactive_task_pool_count: verticals.reduce((sum, item) => sum + item.inactive_task_pools.length, 0),
    excluded_task_pool_count: verticals.reduce((sum, item) => sum + item.excluded_task_pools.length, 0),
    issue_count: issues.length,
    issue_counts: countIssues(issues),
  };
  return {
    schema_version: 1,
    kind: 'grid-level-audit',
    period: input.period,
    status,
    input_sha256: digest(input),
    source: {
      snapshot_ids: input.sources.map(source => source.snapshot_id),
      read_at: input.sources.map(source => source.read_at).filter(Boolean),
      complete: input.sources.every(source => source.complete === true && source.hidden_included === true && source.expected_record_count === source.records?.length),
    },
    backend: {
      snapshot_id: backend.snapshot_id || null,
      read_at: backend.read_at || null,
      complete: backend.complete === true,
    },
    blacklist: {
      snapshot_id: input.blacklist_snapshot.snapshot_id || null,
      read_at: input.blacklist_snapshot.read_at || null,
      complete: input.blacklist_snapshot.complete === true && input.blacklist_snapshot.total === input.blacklist_snapshot.records?.length,
    },
    summary,
    verticals,
    issues,
    limitations: issues.filter(item => PENDING_ISSUES.has(item.type) || UNCERTAIN_ISSUES.has(item.type) || item.type === 'unknown').map(item => `${item.type}${item.message ? `：${item.message}` : ''}`),
  };
}

export function renderMarkdown(result) {
  const lines = [
    '# 网格处理等级一致性校验报告',
    '',
    `- 期间：${result.period || '未知'}`,
    `- 总状态：${result.status}`,
    `- 源表网格数：${result.summary?.source_grid_count ?? '未知'}`,
    `- active任务池数：${result.summary?.active_task_pool_count ?? '未知'}`,
    `- 差异数：${result.summary?.issue_count ?? '未知'}`,
    '',
    '## 读取证据',
    '',
    `- 源表快照：${(result.source?.snapshot_ids || []).join('、') || '未知'}`,
    `- 后台快照：${result.backend?.snapshot_id || '未知'}`,
    `- 黑名单快照：${result.blacklist?.snapshot_id || '未知'}`,
    `- 源表完整：${result.source?.complete === true ? '是' : '否'}`,
    `- 后台完整：${result.backend?.complete === true ? '是' : '否'}`,
    `- 黑名单完整：${result.blacklist?.complete === true ? '是' : '否'}`,
    '',
  ];
  for (const vertical of result.verticals || []) {
    lines.push(`## ${vertical.vertical}`, '', `- 状态：${vertical.status}`, `- 跨任务池一致：${vertical.cross_pool_consistent ? '是' : '否'}`, `- 期望网格数：${Object.keys(vertical.expected_by_grid || {}).length}`, '');
    lines.push('### 任务池', '', '| 状态 | 任务池 | 等级1 | 等级2 | 等级3 | 等级4 | 源表匹配 |', '| --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (const pool of vertical.active_task_pools || []) {
      lines.push(`| active | ${pool.task_pool_name} | ${pool.counts['处理等级1']} | ${pool.counts['处理等级2']} | ${pool.counts['处理等级3']} | ${pool.counts['处理等级4']} | ${pool.source_match ? '是' : '否'} |`);
    }
    for (const pool of vertical.inactive_task_pools || []) lines.push(`| inactive | ${pool.task_pool_name} | - | - | - | - | 未参与校验 |`);
    for (const pool of vertical.excluded_task_pools || []) lines.push(`| excluded | ${pool.task_pool_name} | - | - | - | - | 店铺收录排除 |`);
    lines.push('', '### 黑名单', '', `- 期望不清理：${vertical.blacklist?.expected_nonclean ?? 0}`, `- 已开启不清理：${vertical.blacklist?.enabled_nonclean ?? 0}`, `- 黑名单差异：${vertical.blacklist?.mismatches?.length ?? 0}`, '');
  }
  lines.push('## 差异明细', '');
  if (!result.issues?.length) lines.push('无差异。', '');
  else {
    lines.push('| 类型 | 垂类 | 任务池 | 网格ID | 期望等级 | 实际等级 | 说明 |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const item of result.issues) lines.push(`| ${item.type} | ${item.vertical || ''} | ${item.task_pool_name || item.task_pool_id || ''} | ${item.grid_id || ''} | ${item.expected_level || ''} | ${item.actual_level || ''} | ${(item.message || '').replaceAll('|', '\\|')} |`);
  }
  return `${lines.join('\n')}\n`;
}
