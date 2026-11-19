# 兼职平台策略与网格配置 Skill

当前版本：**v1.2.2**。一个入口自动识别策略条件、混排、网格汇总、等级分配、黑名单及截图登记任务。具体范围和安全规则见 [SKILL.md](SKILL.md)，变更见 [CHANGELOG.md](CHANGELOG.md)。本地修改或安装不表示已发布到 GitHub；版本检查的 `local_ahead` 表示本机高于远端已发布版本。

## 独立网格处理等级校验

仓库同时维护独立的 `grid-level-audit` Skill，位于 [skills/grid-level-audit](skills/grid-level-audit)。它只读核对本期网格策略汇总表、各垂类已启用任务池中的网格处理等级和分发系统黑名单，排除店铺收录任务池并保留渠道收录类任务池。该 Skill 使用独立版本和 Release 标签 `grid-level-audit-v版本`，公司 SkillHub 也单独发布。

## 安装或更新

在 Codex 中发送：

```text
请安装或更新 https://github.com/wenbofan0515-afk/strategy-condition-config 仓库根目录的 strategy-condition-config，使用最新正式Release，网格和策略一起安装。按 references/installation.md 执行：先备份旧版和个人文件，在临时目录校验后安装；旧独立grid-distribution-config备份后移出，避免重复。下载受阻时使用可校验的离线包，不绕过网络限制或自动申请权限。分别报告文件安装、离线测试和后台依赖/登录状态；缺内部项目不等于技能文件安装失败。安装后逐文件回读并提示新开会话，不操作线上后台。
```

安装后建议新开会话，使用 `$strategy-condition-config` 或直接描述任务。安装不代表已具备后台权限和项目依赖。

每个会话首次使用时检查新版本，仅提醒，不自动升级。网络或来源异常时显示未知。策略 v1.1.1 可检查统一版本；更早版需先手动更新。旧独立网格版只检查 `grid-v*` 标签，不会自动发现统一版本，需按上述提示词手动迁移。旧标签保留以供追溯。

不得将个人范围、业务快照或凭据放入发布包。后台真实写入仍需按照具体需求和授权执行，离线测试不等同业务验收。

完整的[在线/离线安装、Windows命令和故障判断](references/installation.md)。正式离线附件以 `strategy-condition-config-v版本-offline.zip` 命名，附SHA-256及逐文件清单；不要把GitHub自动源码ZIP误作含清单的离线附件。跨平台离线检查使用 `node scripts/run-tests.mjs` 和 `node scripts/doctor.mjs`，只需要已有Node.js 22+。
