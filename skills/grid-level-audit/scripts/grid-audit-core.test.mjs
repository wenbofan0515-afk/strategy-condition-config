import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditGridLevels, normalizeGrid } from './grid-audit-core.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.join(root, '..', 'assets', 'input-example.json');
const loadFixture = () => JSON.parse(fs.readFileSync(examplePath, 'utf8'));

function pool(input, taskPoolId = 'pool-color') {
  return input.backend_snapshot.verticals[0].task_pools.find(item => item.task_pool_id === taskPoolId);
}

test('完整源表和两个active任务池可通过，inactive和店铺收录分别记录', () => {
  const result = auditGridLevels(loadFixture());
  assert.equal(result.status, 'passed');
  const shoe = result.verticals.find(item => item.vertical === '鞋类');
  const book = result.verticals.find(item => item.vertical === '图书');
  assert.equal(shoe.active_task_pools.length, 2);
  assert.equal(shoe.inactive_task_pools.length, 1);
  assert.equal(shoe.excluded_task_pools.length, 1);
  assert.equal(shoe.cross_pool_consistent, true);
  assert.equal(shoe.blacklist.enabled_nonclean, 1);
  assert.equal(book.status, 'not_applicable');
});

test('渠道收录保留，店铺收录排除', () => {
  const result = auditGridLevels(loadFixture());
  const shoe = result.verticals.find(item => item.vertical === '鞋类');
  assert.deepEqual(shoe.active_task_pools.map(item => item.task_pool_id).sort(), ['pool-channel', 'pool-color']);
  assert.deepEqual(shoe.excluded_task_pools.map(item => item.task_pool_id), ['pool-store']);
});

test('跨任务池处理等级冲突会失败', () => {
  const input = loadFixture();
  const channel = pool(input, 'pool-channel');
  channel.levels.find(item => item.level_name === '处理等级2').grids = [];
  channel.levels.find(item => item.level_name === '处理等级2').total = 0;
  channel.levels.find(item => item.level_name === '处理等级3').grids = [{ grid_id: '200-300' }];
  channel.levels.find(item => item.level_name === '处理等级3').total = 1;
  const result = auditGridLevels(input);
  assert.equal(result.status, 'failed');
  assert.ok(result.issues.some(item => item.type === 'wrong_level_in_pool'));
  assert.ok(result.issues.some(item => item.type === 'cross_pool_level_conflict'));
});

test('任务池缺失网格和额外网格都会进入差异', () => {
  const input = loadFixture();
  const color = pool(input);
  color.levels.find(item => item.level_name === '处理等级1').grids = [];
  color.levels.find(item => item.level_name === '处理等级1').total = 0;
  color.levels.find(item => item.level_name === '处理等级4').grids = [{ grid_id: '999-1000' }];
  color.levels.find(item => item.level_name === '处理等级4').total = 1;
  const result = auditGridLevels(input);
  assert.equal(result.status, 'failed');
  assert.ok(result.issues.some(item => item.type === 'missing_grid_in_pool'));
  assert.ok(result.issues.some(item => item.type === 'extra_grid_in_pool'));
});

test('同一任务池重复配置网格会失败', () => {
  const input = loadFixture();
  const color = pool(input);
  color.levels.find(item => item.level_name === '处理等级1').grids.push({ grid_id: '100-200' });
  color.levels.find(item => item.level_name === '处理等级1').total = 2;
  const result = auditGridLevels(input);
  assert.equal(result.status, 'failed');
  assert.ok(result.issues.some(item => item.type === 'duplicate_grid_in_pool'));
});

test('不清理网格缺少黑名单或等级网格进入黑名单会失败', () => {
  const input = loadFixture();
  input.blacklist_snapshot.records = [{ vertical: '鞋类', grid_id: '100-200', status: 'enabled' }];
  const result = auditGridLevels(input);
  assert.equal(result.status, 'failed');
  assert.ok(result.issues.some(item => item.type === 'blacklist_missing'));
  assert.ok(result.issues.some(item => item.type === 'active_blacklist_conflict'));
});

test('黑名单审批中进入待核验状态', () => {
  const input = loadFixture();
  input.blacklist_snapshot.records = [{ vertical: '鞋类', grid_id: '300-400', status: 'pending' }];
  const result = auditGridLevels(input);
  assert.equal(result.status, 'pending');
  assert.ok(result.issues.some(item => item.type === 'blacklist_pending'));
});

test('源表重复、空等级和未知等级不被静默覆盖', () => {
  const input = loadFixture();
  input.sources[0].records.push({ row: 6, vertical: '鞋类', grid_id: '100-200', level: '处理等级1' });
  input.sources[0].records.push({ row: 7, vertical: '鞋类', grid_id: '500-600', level: '' });
  input.sources[0].records.push({ row: 8, vertical: '鞋类', grid_id: '600-700', level: '处理等级9' });
  input.sources[0].expected_record_count = input.sources[0].records.length;
  const result = auditGridLevels(input);
  assert.equal(result.status, 'unknown');
  assert.ok(result.issues.some(item => item.type === 'source_duplicate'));
  assert.ok(result.issues.some(item => item.type === 'source_missing_level'));
  assert.ok(result.issues.some(item => item.type === 'source_unknown_level'));
});

test('限制型处理等级按序号统一映射', () => {
  const input = loadFixture();
  const color = pool(input);
  color.levels[0].level_name = '限制型处理等级1';
  const result = auditGridLevels(input);
  assert.equal(result.status, 'passed');
});

test('日期型标签仅在显式开启修复时允许', () => {
  assert.equal(normalizeGrid('12月14日').error !== undefined, true);
  assert.deepEqual(normalizeGrid('12月14日', true).id, '12-14');
  assert.equal(normalizeGrid(46370).error !== undefined, true);
});

test('后台分页不闭合会进入未知状态', () => {
  const input = loadFixture();
  const color = pool(input);
  const level = color.levels.find(item => item.level_name === '处理等级1');
  level.total = 2;
  const result = auditGridLevels(input);
  assert.equal(result.status, 'unknown');
  assert.ok(result.issues.some(item => item.type === 'backend_incomplete'));
});
