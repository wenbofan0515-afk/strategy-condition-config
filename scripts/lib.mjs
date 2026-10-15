import fs from 'node:fs';
import path from 'node:path';

export function resolveRpaRoot() {
  const candidates = [
    process.env.STRATEGY_CONFIG_RPA_ROOT,
    path.join(process.cwd(), 'level_config_rpa'),
  ].filter(Boolean);
  const root = candidates.find((item) => fs.existsSync(path.join(item, 'src', 'browser_api.js')));
  if (!root) throw new Error('未找到 level_config_rpa，请设置 STRATEGY_CONFIG_RPA_ROOT');
  return root;
}

export function loadPlan(file) {
  const plan = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!plan || !Array.isArray(plan.operations)) throw new Error('计划缺少 operations');
  return plan;
}

export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function stable(value) { return JSON.stringify(value); }

export function allLevels(detail) {
  return [
    ...(detail.level_ordinary?.data || []),
    ...(detail.level_unlimit?.data || []),
    ...(detail.level_un_limit?.data || []),
    ...(detail.level_define?.data || []),
  ];
}

export function findPriority(detail, operation) {
  const levels = allLevels(detail).filter((level) =>
    operation.level_name ? level.name === operation.level_name : true,
  );
  if (levels.length !== 1) {
    throw new Error(`${operation.vertical} 目标处理等级数量=${levels.length}`);
  }
  const priorities = (levels[0].priority || []).filter((priority) => {
    if (operation.priority_id != null && String(priority.priority_id) !== String(operation.priority_id)) return false;
    if (operation.priority_name && String(priority.priority_name_show || '').trim() !== operation.priority_name) return false;
    return true;
  });
  if (priorities.length !== 1) {
    throw new Error(`${operation.vertical} 目标优先级数量=${priorities.length}`);
  }
  return { level: levels[0], priority: priorities[0] };
}

function conditionObject(existing, field, patch) {
  const current = existing?.condition?.[field] || {};
  return {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.value !== undefined ? { value: patch.value } : {}),
    ...(patch.show_name !== undefined ? { show_name: patch.show_name } : {}),
  };
}

export function applyPatch(priority, patch) {
  const result = clone(priority);
  const fields = patch?.condition_fields || [];
  if (!Array.isArray(fields)) throw new Error('patch.condition_fields 必须为数组');
  result.form_data ||= {};
  result.special_form_data ||= {};
  result.condition ||= {};
  for (const field of fields) {
    if (!field?.key || field.value === undefined) throw new Error('条件 patch 缺少 key/value');
    const formValue = field.form_value !== undefined ? field.form_value : field.value;
    const specialValue = field.special_value !== undefined ? field.special_value : formValue;
    result.form_data[field.key] = clone(formValue);
    result.special_form_data[field.key] = clone(specialValue);
    result.condition[field.key] = conditionObject(result, field.key, field);
  }
  if (patch.goods_id !== undefined) {
    const value = Array.isArray(patch.goods_id) ? patch.goods_id.join(',') : String(patch.goods_id);
    result.form_data.goods_id = value;
    result.special_form_data.goods_id = value;
    result.condition.goods_id = conditionObject(result, 'goods_id', {
      title: '商品ID', value, show_name: value,
    });
  }
  if (patch.channel_id !== undefined) {
    const value = String(patch.channel_id);
    result.form_data.channel_id = value;
    result.special_form_data.channel_id = value;
    result.condition.channel_id = conditionObject(result, 'channel_id', {
      title: '渠道集合', value, show_name: value,
    });
  }
  if (patch.supplier_nums !== undefined) {
    const value = clone(patch.supplier_nums.value ?? patch.supplier_nums);
    const show = clone(patch.supplier_nums.show_name ?? ['小于', value[1]]);
    result.form_data.supplier_nums = value;
    result.special_form_data.supplier_nums = value;
    result.condition.supplier_nums = conditionObject(result, 'supplier_nums', {
      title: '商品渠道数量', value, show_name: show,
    });
  }
  if (patch.is_black !== undefined) {
    const value = clone(patch.is_black.value ?? patch.is_black);
    result.form_data.is_black = value;
    result.special_form_data.is_black = value;
    result.condition.is_black = conditionObject(result, 'is_black', {
      title: '分发黑名单', value, show_name: value,
    });
  }
  return result;
}

export function stripPatchedFields(priority, patch) {
  const result = clone(priority);
  const keys = new Set((patch?.condition_fields || []).map((item) => item.key));
  if (patch?.goods_id !== undefined) keys.add('goods_id');
  if (patch?.channel_id !== undefined) keys.add('channel_id');
  if (patch?.supplier_nums !== undefined) keys.add('supplier_nums');
  if (patch?.is_black !== undefined) keys.add('is_black');
  for (const key of keys) {
    delete result.form_data?.[key];
    delete result.special_form_data?.[key];
    delete result.condition?.[key];
  }
  return result;
}

export function patchedKeys(patch = {}) {
  return [
    ...(patch.condition_fields || []).map((item) => item.key),
    ...(patch.goods_id !== undefined ? ['goods_id'] : []),
    ...(patch.channel_id !== undefined ? ['channel_id'] : []),
    ...(patch.supplier_nums !== undefined ? ['supplier_nums'] : []),
    ...(patch.is_black !== undefined ? ['is_black'] : []),
  ];
}

export function fieldSummary(priority, keys) {
  return Object.fromEntries(keys.map((key) => [key, {
    form_data: priority.form_data?.[key],
    special_form_data: priority.special_form_data?.[key],
    condition: priority.condition?.[key],
  }]));
}
