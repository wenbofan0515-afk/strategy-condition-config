// Adapter injection keeps tests offline and prevents production writes.
export async function checkSession(api, constants, root, login = false) {
  let session;
  try {
    session = await api.openBrowser({ userDataDir: `${root}/.browser-profile`, headless: !login });
    await api.ensureLogin(session.page, constants.LIST_PAGE_URL, { headless: !login, timeoutSeconds: login ? 300 : 20 });
    const verticals = await api.getVerticalList(session.page);
    if (!Array.isArray(verticals) || !verticals.length || verticals[0].id == null) throw new Error('列表不可读');
    const detail = await api.getVerticalDetail(session.page, verticals[0].id);
    if (!detail || typeof detail !== 'object' || detail.id == null) throw new Error('详情不可读');
    return { ok: true, mode: login ? '本人交互登录验证' : '后台会话验证',
      vertical_count: verticals.length, list_readable: true, detail_readable: true,
      configuration_written: false, account_identity: '请本人核对页面账号；未采集账号信息' };
  } catch {
    // Raw browser errors may include SSO redirect parameters; never echo them.
    throw new Error('会话验证未通过：检查依赖、本人登录、网络及 profile 占用情况。未执行策略写入；不导出凭证、不自动申请权限。');
  } finally {
    if (session) await session.browser.close().catch(() => {});
  }
}
