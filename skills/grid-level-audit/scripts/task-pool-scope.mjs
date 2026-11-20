const families = [
  ['商品关联任务', ['商品关联任务'], ['商品关联任务-服务网格']],
  ['线下商品池', ['线下商品池(新)', '线下商品池（新）', '渠道维度线下商品池'], ['线下商品池-服务网格']],
];

export function taskPoolScope(name, explicitGrain) {
  const label = typeof name === 'string' ? name.trim() : '';
  for (const [family, legacy, service] of families) {
    if (legacy.includes(label)) return { family, grain: 'primary_category_brand', paired: true };
    if (service.includes(label)) return { family, grain: 'service_grid', paired: true };
  }
  return { family: label, grain: explicitGrain ?? 'service_grid', paired: false };
}

export const grainLabel = grain => ({
  service_grid: '二级类目＋品牌',
  primary_category_brand: '一级类目＋品牌',
})[grain] ?? '—';

// Call once per vertical. Keep both records as evidence even when they share one summary row.
export function summarizeTaskPools(pools) {
  const groups = new Map();
  for (const pool of pools) {
    const scope = taskPoolScope(pool.task_pool_name, pool.config_grain);
    const groupKey = scope.paired ? `pair:${scope.family}` : `pool:${pool.task_pool_id || scope.family}`;
    const group = groups.get(groupKey) ?? { family: scope.family, paired: scope.paired, variants: [] };
    group.variants.push({ ...pool, config_grain: scope.grain });
    groups.set(groupKey, group);
  }
  return [...groups.values()].map(group => {
    const active = group.variants.filter(pool => pool.status === 'active');
    const unresolved = group.variants.filter(pool => !['active', 'inactive'].includes(pool.status));
    const conflict = group.paired && active.length > 1;
    const status = conflict ? 'conflict' : active.length ? 'active' : unresolved.length ? 'unknown' : 'inactive';
    return { ...group, status, selected: status === 'active' ? active[0] : null };
  });
}
