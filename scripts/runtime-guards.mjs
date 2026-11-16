import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const copy = v => structuredClone(v);
const fingerprint = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
const requireValue = (ok, message) => { if (!ok) fail('INVALID_STRUCTURE', message); };

// Never include raw response bodies, redirect URLs or authentication parameters in errors.
export function assertApiResponse(response, {requireData = true, validateData} = {}) {
  const body = response?.body;
  const codes = record(body) ? ['code', 'status'].filter(k => Object.hasOwn(body, k)) : [];
  if (response?.ok !== true || !codes.length || codes.some(k => body[k] !== 0)) {
    fail('API_RESPONSE_REJECTED', '接口未满足 HTTP 成功及全部已返回业务码为0的契约');
  }
  if (requireData) requireValue(Object.hasOwn(body, 'data') && body.data !== null && body.data !== undefined, '接口缺少必需data');
  if (validateData) requireValue(validateData(body.data) === true, '接口data结构不完整');
  return body;
}

export function assertPartition(ids, data) {
  requireValue(Array.isArray(ids) && ids.every(v => typeof v === 'string' && v.length > 0), '请求ID集合残缺');
  requireValue(record(data), '校验结果不是对象');
  const keys = ['grid_id_valid', 'grid_id_invalid', 'grid_id_skip'];
  requireValue(keys.every(k => Array.isArray(data[k])), '校验结果缺少valid/invalid/skip集合');
  const all = keys.flatMap(k => data[k]);
  requireValue(new Set(ids).size === ids.length && new Set(all).size === all.length, '请求或校验分区重复、重叠');
  assert.deepEqual([...all].sort(), [...ids].sort(), '校验分区未逐ID覆盖输入');
  return {valid: [...data.grid_id_valid], invalid: [...data.grid_id_invalid], skip: [...data.grid_id_skip]};
}

function totalOf(value) {
  requireValue((typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0, '分页total缺失或非法');
  return Number(value);
}

// Pure read orchestration: caller supplies the current endpoint/schema and retry policy.
export async function collectPages(readPage, {scopeKey, checkpoint, onCheckpoint = () => {}} = {}) {
  requireValue(typeof scopeKey === 'string' && scopeKey.length > 0, '分页须提供本期来源/垂类/任务池scopeKey');
  const first = await readPage(1);
  requireValue(record(first) && Array.isArray(first.list), '分页缺少list');
  const total = totalOf(first.total), size = first.list.length;
  requireValue(size <= total && (total === 0 || size > 0), '分页为空或超过声明总量');
  const pageCount = total === 0 ? 1 : Math.ceil(total / size);
  const state = {scopeKey, total, first_page_sha256: fingerprint(first.list), pages: [[1, copy(first)]]};
  if (checkpoint) {
    requireValue(checkpoint.scopeKey === scopeKey && checkpoint.total === total && checkpoint.first_page_sha256 === state.first_page_sha256, '检查点范围、总数或首页变化，停止续接');
    requireValue(Array.isArray(checkpoint.pages) && checkpoint.pages.every(p => Array.isArray(p) && p.length === 2 && Number.isSafeInteger(p[0]) && p[0] >= 1 && p[0] <= pageCount), '检查点页结构残缺');
    requireValue(new Set(checkpoint.pages.map(p => p[0])).size === checkpoint.pages.length, '检查点页码重复');
    const savedFirst = checkpoint.pages.find(p => p[0] === 1);
    requireValue(savedFirst && fingerprint(savedFirst[1]) === fingerprint(first), '检查点首页内容不一致');
    state.pages = copy(checkpoint.pages);
  }
  const pages = new Map(state.pages);
  for (let n = 1; n <= pageCount; n++) {
    try {
      const page = pages.has(n) ? pages.get(n) : await readPage(n);
      requireValue(record(page) && Array.isArray(page.list), '分页缺少list');
      if (totalOf(page.total) !== total) fail('READ_SNAPSHOT_CHANGED', '分页期间总量变化，须重读稳定集合');
      requireValue(page.list.length === (n === pageCount ? total - size * (n - 1) : size), '分页条数不闭合');
      pages.set(n, copy(page)); state.pages = [...pages];
      await onCheckpoint(copy(state));
    } catch (e) { e.checkpoint = copy(state); throw e; }
  }
  const list = Array.from({length: pageCount}, (_, i) => pages.get(i + 1).list).flat();
  requireValue(list.length === total && list.every(record), '完整分页对象/总量不闭合');
  for (const key of ['id', 'grid_id']) {
    if (key === 'id' || list.some(row => Object.hasOwn(row, key))) {
      requireValue(list.every(row => Object.hasOwn(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== ''), `分页缺少${key}`);
      requireValue(new Set(list.map(row => String(row[key]))).size === total, `分页${key}重复`);
    }
  }
  return {total, list, checkpoint: copy(state)};
}

export function assertReadOnlyResume(expectedScope, journal, expectedSaveKeys) {
  requireValue(record(expectedScope) && record(journal) && record(journal.scope), '续接范围/日志缺失');
  for (const key of ['period', 'source_sha256', 'vertical', 'task_token', 'task_pool']) {
    requireValue(typeof expectedScope[key] === 'string' && expectedScope[key].length > 0 && journal.scope[key] === expectedScope[key], `续接${key}不一致`);
  }
  requireValue(Array.isArray(journal.steps) && Array.isArray(expectedSaveKeys) && new Set(expectedSaveKeys).size === expectedSaveKeys.length, '续接步骤/计划残缺或重复');
  const saved = [];
  for (const step of journal.steps) {
    requireValue(record(step) && ['delete', 'save'].includes(step.action) && step.started_at && step.completed_at, '存在结果未知的写请求；禁止重提');
    assertApiResponse(step.response, {requireData: false});
    if (step.action === 'save') saved.push(step.request_key);
  }
  requireValue(new Set(saved).size === saved.length, '发现重复保存日志');
  assert.deepEqual([...saved].sort(), [...expectedSaveKeys].sort(), '尚有未证实受理的保存；需单独审计');
  return {action: 'read_only', repeat_writes: false};
}

export async function waitForReadback({read, verify, maxAttempts, intervalMs, wait, onObservation = () => {}}) {
  requireValue(typeof read === 'function' && typeof verify === 'function' && typeof wait === 'function', '须注入只读、核验及等待函数');
  requireValue(Number.isSafeInteger(maxAttempts) && maxAttempts > 0 && Number.isSafeInteger(intervalMs) && intervalMs >= 0 && intervalMs <= 60000, '只读复核须有明确次数/间隔上限');
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const current = await read();
      const checked = await verify(current);
      requireValue(record(checked) && typeof checked.matches === 'boolean', '回读核验结果残缺');
      if (checked.matches) return {verified: true, status: 'verified', attempts: attempt, current};
      if (checked.pending !== true) fail('READBACK_MISMATCH', '回读发生确定性字段/成员差异，停止后续写入');
      last = {reason: 'accepted_readback_pending', attempt};
    } catch (e) {
      if (e.code !== 'READ_SNAPSHOT_CHANGED') throw e;
      last = {reason: 'pagination_changed', attempt};
    }
    await onObservation(copy(last));
    if (attempt < maxAttempts) await wait(intervalMs);
  }
  return {verified: false, status: 'accepted_readback_pending', attempts: maxAttempts, last_observation: last};
}

export function gridDictionaryConfiguration(levels) {
  requireValue(Array.isArray(levels) && levels.every(l => record(l) && Array.isArray(l.priority)), '网格等级字典残缺');
  const result = copy(levels);
  for (const level of result) for (const priority of level.priority) {
    requireValue(record(priority), '优先级不是完整对象');
    for (const key of ['task_nums', 'finish_task_nums', 'pending_task_nms']) delete priority[key];
  }
  return result;
}

export function verifyBlackRecord(before, after, {action, detailId, verticalId, buildCfg}) {
  requireValue(['add', 'restore', 'close'].includes(action) && record(after), '黑名单动作或回读对象无效');
  for (const key of ['id', 'detail_id', 'vertical_id', 'grid_id', 'status', 'create_goods_limit_cfg']) requireValue(Object.hasOwn(after, key) && after[key] !== null, `黑名单回读缺少${key}`);
  requireValue(/^[1-9]\d*$/.test(String(after.id)), '记录ID无效');
  requireValue(after.detail_id === detailId && after.vertical_id === verticalId && [0, 1, 2].includes(after.status), '黑名单范围/状态未知');
  requireValue([1, 2].includes(buildCfg) && after.create_goods_limit_cfg === buildCfg, '建品限制不一致');
  if (action === 'add') {
    requireValue(before === null, '新增须证实写前记录不存在，不能以undefined兜底');
    requireValue(/^[1-9]\d*-[1-9]\d*$/.test(after.grid_id) && `${after.child_category_id}-${after.root_brand_id}` === after.grid_id, '新增记录的网格组成不一致');
  } else {
    requireValue(record(before) && before.status === (action === 'restore' ? 1 : 0), '写前状态不适用于恢复/关闭');
    const protectedRecord = row => Object.fromEntries(Object.entries(row).filter(([k]) => !['status', 'updated_at', 'opt_hupu_uid', 'opt_user'].includes(k)));
    assert.deepEqual(protectedRecord(after), protectedRecord(before), '既有记录的ID或非目标字段变化');
  }
  return {status: after.status, pending: after.status === 2, at_target: after.status === (action === 'close' ? 1 : 0)};
}

// IDs come from the current ordinary/source definitions, never from display positions.
export function auditMixPlacement(detail, {anchorLevelId, targetLevelId, targetPriorityId}) {
  requireValue(record(detail) && [0, 1, '0', '1'].includes(detail.level_mix_open), '混排开关未知，不能从残留数组推断');
  if (Number(detail.level_mix_open) === 0) return {enabled: false, action: 'preserve'};
  requireValue(Array.isArray(detail.level_mix?.data), '混排等级缺失');
  requireValue([anchorLevelId, targetLevelId, targetPriorityId].every(v => /^[1-9]\d*$/.test(String(v))), '须明确真实来源等级/优先级ID');
  requireValue(String(anchorLevelId) !== String(targetLevelId), '锚点等级不能与目标来源等级混同');
  const refs = detail.level_mix.data.flatMap((level, levelIndex) => {
    requireValue(Array.isArray(level.priority), '混排引用数组缺失');
    return level.priority.map((ref, index) => {
      requireValue(record(ref) && ref.source_deal_level_id != null && (ref.source_priority_id ?? ref.priority_id) != null, '混排引用身份残缺');
      return {levelIndex, index, ref};
    });
  });
  const anchors = refs.filter(({ref}) => String(ref.source_deal_level_id) === String(anchorLevelId));
  requireValue(anchors.length > 0, '未找到实际处理等级锚点，不猜测混排等级末尾');
  const targets = refs.filter(({ref}) => String(ref.source_deal_level_id) === String(targetLevelId) && String(ref.source_priority_id ?? ref.priority_id) === String(targetPriorityId));
  requireValue(targets.length <= 1, '目标混排引用重复');
  const anchor = anchors.at(-1), target = targets[0];
  return {enabled: true, target_count: targets.length, correctly_placed: !!target && target.levelIndex === anchor.levelIndex && target.index === anchor.index + 1,
    anchor: {level_index: anchor.levelIndex, index: anchor.index}, target: target ? {level_index: target.levelIndex, index: target.index} : null};
}
