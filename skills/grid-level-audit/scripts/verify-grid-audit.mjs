#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, LEVELS, BLACKLIST_LEVEL, normalizeGrid, normalizeLevel } from './grid-audit-core.mjs';

const [, , inputPath, resultPath] = process.argv;

function fail(message) {
  throw new Error(message);
}

function taskPoolExcluded(taskPool) {
  const type = typeof taskPool?.task_pool_type === 'string' ? taskPool.task_pool_type.trim().toLowerCase() : '';
  const name = typeof taskPool?.task_pool_name === 'string' ? taskPool.task_pool_name.trim() : '';
  return type === 'store_collection' || type === 'store-collection' || type === '店铺收录' || (!type && name === '店铺收录');
}

function buildExpected(input) {
  const expected = new Map();
  const seen = new Map();
  for (const source of input.sources) {
    for (const record of source.records) {
      if (!input.verticals.includes(record.vertical)) continue;
      const grid = normalizeGrid(record.grid_id, input.repair_date_labels === true);
      if (grid.error) continue;
      const level = normalizeLevel(record.level);
      if (!level) continue;
      const unique = `${record.vertical}\u0000${grid.id}`;
      if (seen.has(unique)) fail(`源表重复网格无法独立复核：${record.vertical}/${grid.id}`);
      seen.set(unique, true);
      if (!expected.has(record.vertical)) expected.set(record.vertical, new Map());
      expected.get(record.vertical).set(grid.id, level);
    }
  }
  return expected;
}

// Independent interpretation of the two mutually exclusive backend pairs.
const pairedNames = new Map([
  ['商品关联任务', ['商品关联任务', 'primary_category_brand']],
  ['商品关联任务-服务网格', ['商品关联任务', 'service_grid']],
  ['线下商品池(新)', ['线下商品池', 'primary_category_brand']],
  ['线下商品池（新）', ['线下商品池', 'primary_category_brand']],
  ['渠道维度线下商品池', ['线下商品池', 'primary_category_brand']],
  ['线下商品池-服务网格', ['线下商品池', 'service_grid']],
]);

function confirmedRead(snapshot) {
  return snapshot?.complete === true && typeof snapshot.snapshot_id === 'string' && snapshot.snapshot_id.trim()
    && !Number.isNaN(Date.parse(snapshot.read_at));
}

function participationStatus(pool) {
  if (pool.status === 'inactive') return 'inactive';
  const levels = Array.isArray(pool.levels) ? pool.levels : [];
  const empty = pool.complete === true && levels.length === 4 && LEVELS.every(level => levels.some(row =>
    normalizeLevel(row?.level_name) === level && row.complete === true && row.total === 0
    && Array.isArray(row.grids) && row.grids.length === 0));
  if (!empty) return pool.status === 'active' ? 'active' : 'unknown';
  const live = pool.live_task_snapshot;
  return confirmedRead(live) && Number.isSafeInteger(live.task_count) && live.task_count > 0 ? 'active' : 'unknown';
}

function missingDisposition(snapshot, grid, required) {
  if (confirmedRead(snapshot) && Array.isArray(snapshot.records)) {
    const records = snapshot.records.filter(record => normalizeGrid(record?.grid_id).id === grid);
    if (records.length === 1 && records[0].status === 'invalid') return 'excluded';
    if (records.length === 1 && records[0].status === 'valid') return 'missing_grid_in_pool';
  }
  return required || snapshot !== undefined ? 'grid_validity_pending' : 'missing_grid_in_pool';
}

function verifyTaskPoolSummary(pools, summary) {
  if (!Array.isArray(summary)) return false;
  const groups = new Map();
  for (const pool of pools) {
    if (taskPoolExcluded(pool)) continue;
    const name = pool.task_pool_name.trim();
    const pair = pairedNames.get(name);
    const family = pair?.[0] ?? name;
    const key = pair ? `pair:${family}` : `pool:${pool.task_pool_id}`;
    if (!groups.has(key)) groups.set(key, { family, variants: [] });
    groups.get(key).variants.push({
      task_pool_id: pool.task_pool_id,
      task_pool_name: name,
      config_grain: pair?.[1] ?? pool.config_grain ?? 'service_grid',
      status: participationStatus(pool),
    });
  }
  const shape = group => JSON.stringify([group.family, group.status, group.selected_task_pool_id, group.variants.map(v => JSON.stringify([v.task_pool_id, v.task_pool_name, v.config_grain, v.status])).sort()]);
  const expected = [...groups.values()].map(group => {
    const active = group.variants.filter(pool => pool.status === 'active');
    const status = active.length > 1 ? 'conflict' : active.length === 1 ? 'active' : group.variants.every(pool => pool.status === 'inactive') ? 'inactive' : 'unknown';
    return shape({ ...group, status, selected_task_pool_id: active.length === 1 ? active[0].task_pool_id : null });
  }).sort();
  return JSON.stringify(expected) === JSON.stringify(summary.map(shape).sort());
}

function buildActual(input) {
  const actual = new Map();
  const participation = new Map();
  for (const vertical of input.backend_snapshot.verticals || []) {
    if (!input.verticals.includes(vertical.vertical)) continue;
    const pools = [];
    for (const taskPool of vertical.task_pools || []) {
      if (taskPoolExcluded(taskPool)) continue;
      if (participationStatus(taskPool) !== 'active') continue;
      const grain = pairedNames.get(taskPool.task_pool_name.trim())?.[1] ?? taskPool.config_grain ?? 'service_grid';
      const byGrid = new Map();
      for (const levelRecord of grain === 'primary_category_brand' ? [] : taskPool.levels || []) {
        const level = normalizeLevel(levelRecord.level_name);
        if (!LEVELS.includes(level)) continue;
        for (const gridRecord of levelRecord.grids || []) {
          const grid = normalizeGrid(gridRecord.grid_id);
          if (grid.error) continue;
          const current = byGrid.get(grid.id) || [];
          current.push(level);
          byGrid.set(grid.id, current);
        }
      }
      const mapping = new Map();
      for (const [grid, levels] of byGrid.entries()) mapping.set(grid, levels.length === 1 ? levels[0] : null);
      pools.push({
        task_pool_id: taskPool.task_pool_id,
        task_pool_name: taskPool.task_pool_name,
        actual_by_grid: mapping,
        config_grain: grain,
        snapshot: taskPool,
      });
    }
    actual.set(vertical.vertical, pools);
    participation.set(vertical.vertical, pools.map(pool => pool.task_pool_id));
  }
  return { actual, participation };
}

function compareMaps(left, right) {
  const differences = [];
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const grid of keys) {
    if (left.get(grid) !== right.get(grid)) differences.push(grid);
  }
  return differences.sort();
}

function verify(input, result) {
  const checks = [];
  const errors = [];
  if (result.kind !== 'grid-level-audit' || result.schema_version !== 1) errors.push('结果文件类型或schema_version不正确');
  if (result.input_sha256 !== digest(input)) errors.push('结果input_sha256与输入不一致');
  if (result.period !== input.period) errors.push('结果period与输入不一致');
  if (result.source?.snapshot_ids?.join('|') !== input.sources.map(source => source.snapshot_id).join('|')) errors.push('结果未保留全部源表快照ID');
  if (result.backend?.snapshot_id !== (input.backend_snapshot.snapshot_id || null)) errors.push('结果未保留后台快照ID');
  if (result.blacklist?.snapshot_id !== (input.blacklist_snapshot.snapshot_id || null)) errors.push('结果未保留黑名单快照ID');
  checks.push({ name: '结果元数据与输入快照一致', passed: errors.length === 0 });

  const expected = buildExpected(input);
  const { actual, participation } = buildActual(input);
  const resultVerticals = new Map((result.verticals || []).map(vertical => [vertical.vertical, vertical]));

  if (JSON.stringify([...resultVerticals.keys()].sort()) !== JSON.stringify([...input.verticals].sort())
      || resultVerticals.size !== (result.verticals || []).length
      || (result.issues || []).some(issue => issue.vertical && !input.verticals.includes(issue.vertical))) errors.push('结果包含范围外或重复垂类');
  let exclusionCount = 0;
  for (const vertical of input.verticals) {
    const resultVertical = resultVerticals.get(vertical);
    if (!resultVertical) {
      errors.push(`结果缺少垂类：${vertical}`);
      continue;
    }
    const expectedMap = expected.get(vertical) || new Map();
    const resultExpected = new Map(Object.entries(resultVertical.expected_by_grid || {}));
    const expectedDiff = compareMaps(expectedMap, resultExpected);
    if (expectedDiff.length) errors.push(`结果期望映射与源表不一致：${vertical}/${expectedDiff.join(',')}`);

    const resultPools = new Map((resultVertical.active_task_pools || []).map(pool => [pool.task_pool_id, pool]));
    const actualPools = actual.get(vertical) || [];
    const resultPoolIds = [...resultPools.keys()].sort();
    const actualPoolIds = actualPools.map(pool => pool.task_pool_id).sort();
    if (JSON.stringify(resultPoolIds) !== JSON.stringify(actualPoolIds)) errors.push(`结果active任务池集合与后台快照不一致：${vertical}`);
    const absenceByPool = new Map();
    for (const pool of actualPools) {
      const resultPool = resultPools.get(pool.task_pool_id);
      if (!resultPool) continue;
      const resultMap = new Map(Object.entries(resultPool.actual_by_grid || {}));
      const differences = compareMaps(pool.actual_by_grid, resultMap);
      if (differences.length) errors.push(`结果任务池映射与后台快照不一致：${vertical}/${pool.task_pool_id}/${differences.join(',')}`);
      const absence = new Map();
      absenceByPool.set(pool.task_pool_id, absence);
      if (pool.config_grain === 'primary_category_brand' || pool.snapshot.complete !== true
        || !LEVELS.every(level => pool.snapshot.levels?.some(row => normalizeLevel(row.level_name) === level
          && row.complete === true && row.total === row.grids?.length))) continue;
      const exclusions = [];
      const expectedIssues = [];
      const validity = pool.snapshot.grid_validity_snapshot;
      for (const [grid, level] of expectedMap) {
        if (!LEVELS.includes(level) || pool.actual_by_grid.has(grid)) continue;
        const disposition = missingDisposition(validity, grid, input.require_grid_validity === true);
        absence.set(grid, disposition);
        if (disposition === 'excluded') exclusions.push(JSON.stringify([grid, level, validity.snapshot_id, validity.read_at]));
        else expectedIssues.push(JSON.stringify([grid, level, disposition]));
      }
      exclusionCount += exclusions.length;
      const reportedExclusions = (resultPool.invalid_grid_exclusions || []).map(row => JSON.stringify([row.grid_id, row.expected_level, row.snapshot_id, row.read_at]));
      const reportedIssues = (result.issues || []).filter(row => row.vertical === vertical && row.task_pool_id === pool.task_pool_id
        && ['missing_grid_in_pool', 'grid_validity_pending'].includes(row.type)).map(row => JSON.stringify([row.grid_id, row.expected_level, row.type]));
      if (JSON.stringify(exclusions.sort()) !== JSON.stringify(reportedExclusions.sort())) errors.push(`无效网格排除与证据不一致：${vertical}/${pool.task_pool_id}`);
      if (JSON.stringify(expectedIssues.sort()) !== JSON.stringify(reportedIssues.sort())) errors.push(`缺配或待核验明细与证据不一致：${vertical}/${pool.task_pool_id}`);
    }

    const resultInactive = (resultVertical.inactive_task_pools || []).map(pool => pool.task_pool_id).sort();
    const expectedInactive = (input.backend_snapshot.verticals.find(item => item.vertical === vertical)?.task_pools || [])
      .filter(pool => !taskPoolExcluded(pool) && pool.status === 'inactive')
      .map(pool => pool.task_pool_id)
      .sort();
    if (JSON.stringify(resultInactive) !== JSON.stringify(expectedInactive)) errors.push(`结果inactive任务池集合与后台快照不一致：${vertical}`);

    const resultExcluded = (resultVertical.excluded_task_pools || []).map(pool => pool.task_pool_id).sort();
    const expectedExcluded = (input.backend_snapshot.verticals.find(item => item.vertical === vertical)?.task_pools || [])
      .filter(taskPoolExcluded)
      .map(pool => pool.task_pool_id)
      .sort();
    if (JSON.stringify(resultExcluded) !== JSON.stringify(expectedExcluded)) errors.push(`结果排除任务池集合与后台快照不一致：${vertical}`);

    const inputPools = input.backend_snapshot.verticals.find(item => item.vertical === vertical)?.task_pools || [];
    if (!verifyTaskPoolSummary(inputPools, resultVertical.task_pool_summary)) errors.push(`归并后任务池摘要与后台快照不一致：${vertical}`);
    const comparable = actualPools.filter(pool => pool.config_grain !== 'primary_category_brand');
    let expectedCrossPool = comparable.length < actualPools.length || inputPools.some(pool =>
      !taskPoolExcluded(pool) && participationStatus(pool) === 'unknown') ? null : true;
    for (let i = 1; i < comparable.length; i += 1) {
      for (const prior of comparable.slice(0, i)) {
        const current = comparable[i];
        for (const grid of compareMaps(prior.actual_by_grid, current.actual_by_grid)) {
          const absent = [prior, current].find(pool => !pool.actual_by_grid.has(grid));
          const disposition = absent && absenceByPool.get(absent.task_pool_id)?.get(grid);
          if (disposition === 'excluded') continue;
          if (disposition === 'grid_validity_pending') {
            if (expectedCrossPool === true) expectedCrossPool = null;
          } else expectedCrossPool = false;
        }
      }
    }
    if (resultVertical.cross_pool_consistent !== expectedCrossPool) errors.push(`结果跨任务池一致性与后台快照不一致：${vertical}`);
    checks.push({ name: `独立复核${vertical}`, passed: errors.length === 0 });
  }

  if ((result.summary?.invalid_grid_exclusion_count ?? 0) !== exclusionCount) errors.push('结果无效网格排除数量与证据不一致');
  if (result.status === 'passed' && (result.issues || []).some(item => ['missing_grid_in_pool', 'grid_validity_pending', 'pool_activation_pending'].includes(item.type))) errors.push('结果报告为passed但含缺配或待核验');
  const blacklistRecords = input.blacklist_snapshot.records || [];
  const blacklistMap = new Map();
  for (const record of blacklistRecords) {
    const grid = normalizeGrid(record.grid_id);
    if (!grid.error) blacklistMap.set(`${record.vertical}\u0000${grid.id}`, record.status);
  }
  for (const [vertical, expectedMap] of expected.entries()) {
    for (const [grid, level] of expectedMap.entries()) {
      const status = blacklistMap.get(`${vertical}\u0000${grid}`);
      if (level === BLACKLIST_LEVEL && status !== 'enabled') errors.push(`不清理网格黑名单状态不一致：${vertical}/${grid}`);
      if (LEVELS.includes(level) && status === 'enabled') errors.push(`等级网格处于开启黑名单：${vertical}/${grid}`);
    }
  }
  checks.push({ name: '独立复核黑名单状态', passed: errors.length === 0 });

  if (errors.length > 0 && result.status === 'passed') errors.push('结果报告为passed但独立复核发现差异');
  return { schema_version: 1, kind: 'grid-level-audit-verification', passed: errors.length === 0, checks, errors, active_task_pools: Object.fromEntries(participation) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (!inputPath || !resultPath) {
    console.error('用法：node scripts/verify-grid-audit.mjs <input.json> <result.json>');
    process.exitCode = 1;
  } else {
    try {
      const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
      const result = JSON.parse(fs.readFileSync(path.resolve(resultPath), 'utf8'));
      const verification = verify(input, result);
      console.log(JSON.stringify(verification, null, 2));
      if (!verification.passed) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ kind: 'grid-level-audit-verification', passed: false, errors: [error.message] }, null, 2));
      process.exitCode = 1;
    }
  }

}

export { verify };
