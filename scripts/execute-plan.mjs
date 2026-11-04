import { clone, findPriority, applyPatch, stable, assertConditionStructure } from './lib.mjs';

// Save whole levels once, so multiple patches cannot overwrite each other.
export function prepareChanges(plan, snapshots) {
  const groups = new Map();
  const targets = new Set();
  plan.operations.forEach((operation, index) => {
    const snapshot = snapshots.find((item) => item.vertical === operation.vertical);
    if (!snapshot) throw new Error(`未找到垂类：${operation.vertical}`);
    const target = findPriority(snapshot.detail, operation);
    const key = `${operation.vertical}:${target.level.deal_level_id}`;
    const targetKey = `${key}:${target.priority.priority_id}`;
    if (targets.has(targetKey)) throw new Error(`重复目标：${targetKey}，请合并 patch`);
    targets.add(targetKey);
    if (!groups.has(key)) groups.set(key, {
      vertical: operation.vertical, verticalId: snapshot.verticalId,
      detailId: snapshot.detail.id, before: clone(target.level),
      expected: clone(target.level), operations: [],
    });
    const group = groups.get(key);
    const position = group.expected.priority.findIndex((item) => String(item.priority_id) === String(target.priority.priority_id));
    group.expected.priority[position] = applyPatch(target.priority, operation.patch);
    group.operations.push({ index, priority_id: target.priority.priority_id, patch: clone(operation.patch) });
  });
  const prepared = [...groups.values()];
  for (const group of prepared) assertPreparedGroup(group);
  return prepared;
}

export function assertLevel(detail, group, expected) {
  const target = findPriority(detail, { vertical: group.vertical, level_id: group.before.deal_level_id, priority_id: group.operations[0].priority_id });
  if (stable(target.level) !== stable(expected)) throw new Error(`${group.vertical} 完整处理等级不一致（条件/处理人/顺序/其他优先级）`);
  for (const priority of target.level.priority || []) assertConditionStructure(priority);
}

export function assertPreparedGroup(group) {
  const rebuilt = clone(group.before);
  // The endpoint replaces a whole level, so untouched siblings must be safe too.
  for (const priority of rebuilt.priority || []) assertConditionStructure(priority);
  for (const operation of group.operations) {
    if (!operation.patch) throw new Error('快照缺少 patch，需重新预检，禁止沿用旧 expected');
    const index = rebuilt.priority.findIndex((item) => String(item.priority_id) === String(operation.priority_id));
    if (index < 0) throw new Error('快照目标不存在');
    rebuilt.priority[index] = applyPatch(rebuilt.priority[index], operation.patch);
  }
  if (stable(rebuilt) !== stable(group.expected)) throw new Error('预期等级与独立重建不一致，停止写入');
}

export async function executeGroups(groups, adapter, onSaved = () => {}) {
  for (const group of groups) assertPreparedGroup(group);
  for (const group of groups) {
    const fresh = await adapter.read(group.verticalId);
    assertLevel(fresh, group, group.before);
    if (String(fresh.id) !== String(group.detailId)) throw new Error('后台对象ID变化，停止写入');
    if (stable(group.before) !== stable(group.expected)) {
      await adapter.save(group.detailId, clone(group.expected));
      onSaved(group, 'saved');
    }
    assertLevel(await adapter.read(group.verticalId), group, group.expected);
    onSaved(group, 'verified');
  }
}
