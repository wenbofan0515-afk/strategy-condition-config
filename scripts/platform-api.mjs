import {assertApiResponse} from './runtime-guards.mjs';

const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// Keep login/profile ownership in the trusted adapter; only replace permissive business-code parsing.
export function strictPlatformApi(transport, constants) {
  const {GATEWAY_BASE, CENTER_ID, TASK_TOKEN} = constants;
  if (typeof transport.fetchInPage !== 'function' || typeof GATEWAY_BASE !== 'string' || !GATEWAY_BASE.startsWith('https://') || CENTER_ID == null || !TASK_TOKEN) throw Error('可信适配器/后台常量缺失');
  const call = async (page, suffix, options, contract) => assertApiResponse(await transport.fetchInPage(page, GATEWAY_BASE + suffix, options), contract);
  return {
    ...transport,
    getVerticalList: async page => (await call(page, `/dealLevelVerticalList?centerId=${encodeURIComponent(CENTER_ID)}`, {timeoutMs: 20000}, {
      validateData: data => Array.isArray(data) && data.every(row => record(row) && row.id != null && typeof row.vertical_name === 'string'),
    })).data,
    getVerticalDetail: async (page, listId) => (await call(page, `/dealLevelVerticalDetail?list_id=${encodeURIComponent(listId)}&task_token=${encodeURIComponent(TASK_TOKEN)}`, {timeoutMs: 20000}, {
      validateData: data => record(data) && String(data.id) === String(listId) && ['level_ordinary', 'level_unlimit', 'level_un_limit', 'level_define'].some(k => record(data[k]) && Array.isArray(data[k].data)) &&
        ['level_ordinary', 'level_unlimit', 'level_un_limit', 'level_define', 'level_mix'].every(k => data[k] === undefined || record(data[k]) && Array.isArray(data[k].data)),
    })).data,
    saveLevel: async (page, listDetailId, level, updateTab = 1) => {
      if (updateTab !== 1) throw Error('普通等级保存不支持混排或其他update_tab');
      if (!record(level) || !Array.isArray(level.priority) || level.deal_level_id == null) throw Error('待保存完整等级缺失');
      const payload = {list_detail_id: listDetailId, action: 1, update_tab: 1, deal_level_id: level.deal_level_id, is_un_limit: level.is_un_limit, deal_level: level.name, deal_level_data: level};
      return call(page, '/dealLevelVerticalEdit', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)}, {requireData: false});
    },
  };
}
