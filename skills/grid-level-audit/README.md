# 网格处理等级一致性校验 Skill

当前版本为 **v1.0.0**。

本 Skill 读取本期网格策略汇总表、当前后台已启用任务池的等级1至4网格集合和分发系统黑名单页面，校验以下关系：

- 源表中的业务调整等级与后台实际处理等级一致
- 同一垂类下所有已启用任务池的网格处理等级一致
- 未启用任务池与配置缺失清晰区分
- 不清理网格与分发系统黑名单状态一致
- 店铺收录任务池排除，渠道收录类任务池保留

本 Skill 只读校验，不执行线上配置变更。

## 使用

安装后使用 `$grid-level-audit`，或直接描述需要核对的垂类、来源表和读取快照。

```text
使用 $grid-level-audit，按本期网格策略汇总表核对指定垂类所有已启用任务池的网格处理等级，并检查不清理网格的分发黑名单状态。
```

输入快照由 Codex 按本 Skill 的读取流程收集。脚本输入必须同时包含源表快照、任务池快照和黑名单快照，不能使用空对象或旧结果填补读取失败。

## 检查

```bash
node scripts/doctor.mjs
node --test scripts/*.test.mjs
node scripts/audit-grid-levels.mjs assets/input-example.json /tmp/grid-level-audit-result.json --markdown /tmp/grid-level-audit-report.md
node scripts/verify-grid-audit.mjs assets/input-example.json /tmp/grid-level-audit-result.json
```

版本检查会读取 GitHub 正式版本和对应标签。检查失败时报告未知。SkillHub 和 GitHub 发布包需要分别验收，离线测试通过不代表业务后台读取成功。
