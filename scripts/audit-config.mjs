#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolveRpaRoot, allLevels } from './lib.mjs';

const requested = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const root = resolveRpaRoot();
const { openBrowser, ensureLogin, getVerticalList, getVerticalDetail } = await import(pathToFileURL(`${root}/src/browser_api.js`));
const { LIST_PAGE_URL } = await import(pathToFileURL(`${root}/src/constants.js`));
const session = await openBrowser({ userDataDir: `${root}/.browser-profile`, headless: true });
const result = { verticals: [], errors: [] };
try {
  await ensureLogin(session.page, LIST_PAGE_URL, { timeoutSeconds: 20 });
  const verticals = await getVerticalList(session.page);
  const targets = requested.length ? verticals.filter((x) => requested.includes(x.vertical_name)) : verticals;
  for (const vertical of targets) {
    try {
      const detail = await getVerticalDetail(session.page, vertical.id);
      const levels = allLevels(detail);
      result.verticals.push({
        vertical: vertical.vertical_name,
        list_id: vertical.id,
        levels: levels.map((level) => ({
          id: level.deal_level_id,
          name: level.name,
          sort: level.sort_val,
          priorities: (level.priority || []).map((priority) => ({ id: priority.priority_id, name: priority.priority_name_show, sort: priority.sort_val })),
        })),
        mix_levels: (detail.level_mix?.data || []).map((level) => ({ id: level.deal_level_id, name: level.name, priorities: (level.priority || []).map((p) => ({ id: p.priority_id, name: p.priority_name_show, sort: p.sort_val })) })),
      });
    } catch (error) { result.errors.push({ vertical: vertical.vertical_name, error: String(error.message || error) }); }
  }
} finally { await session.browser.close(); }
console.log(JSON.stringify(result, null, 2));
if (result.errors.length) process.exitCode = 1;
