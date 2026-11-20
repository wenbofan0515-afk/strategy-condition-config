---
name: grid-level-audit
description: 只读校验识货兼职平台各垂类已启用任务池中的网格处理等级一致性，并核对分发系统黑名单与本期网格策略汇总表。Use when the user asks to inspect grid-to-processing-level mappings, compare task pools, or verify non-clean grids and blacklist status.
metadata:
  short-description: 兼职平台网格处理等级与黑名单校验
  version: "1.0.2"
---

# 网格处理等级一致性校验

当前版本：**v1.0.2**。版本来源为包内 `VERSION`，更新内容见 [CHANGELOG.md](CHANGELOG.md)。本 Skill 是独立的只读校验入口，沿用 `strategy-condition-config` 的版本检查、安装、测试和发布约定。

每次会话首次使用时，从实际安装目录运行 `node scripts/check-update.mjs`。检查本地版本、GitHub 正式版本、独立 Release 标签和公司 SkillHub 最新版本。发现新版时报告当前版本、最新版本和更新方式，按现有 Skill 的备份、下载、校验和安装流程更新，不在业务校验过程中热替换代码。检查失败标记为未知，不把未知状态当作已是最新，也不阻断当前只读校验。

## 适用范围

本 Skill 用于以下场景：

- 以本期网格策略汇总表的“业务调整等级”为期望值，核对后台网格到处理等级1至4的映射。
- 读取一个垂类当前实际启用的任务池，核对各任务池的网格处理等级是否一致。
- 区分垂类未启用任务池和已启用但配置缺失的任务池。
- 核对“不清理”网格与分发系统黑名单页面的状态。
- 生成只读的机器结果、差异明细和人可审阅的校验报告。

本 Skill 不执行处理等级修改、网格删除、网格上传、黑名单开启或关闭。策略条件、优先级字段、处理人和混排属于后续策略校验范围。

## 任务池范围

从本次后台完整读取结果中动态发现任务池，并按垂类记录启用状态。先用 `verticals` 明确本期垂类范围，源表、等级、黑名单与报告共用该范围。

- 正式分类为“店铺收录”的任务池排除在本次校验之外。
- 渠道收录、商品渠道收录、渠道属性（配色）关联和其他实际任务池保留。
- 商品关联任务、线下商品池各自按实际版本汇总，每垂类每类一行。普通版为一级类目＋品牌，服务网格版为二级类目＋品牌。
- 某垂类没有启用任务池时，记录为“无启用任务池”，不把它伪造成配置通过。
- 任务池存在且已启用，但处理等级读取不完整或只返回部分网格时，标记为读取不完整或配置缺失。

排除规则优先使用后台任务池类型或唯一 ID。仅在类型缺失时，才对标准化后完整等于“店铺收录”的名称执行排除。名称中包含“店铺”但属于渠道收录的任务池继续保留。

## 执行流程

1. 阅读 [网格校验流程](references/grid-level-audit-workflow.md) 和 [任务池范围](references/task-pool-scope.md)。
2. 检查 `lark-cli`、`sh-cli` 版本和登录态，不读取或回显凭据。
3. 获取本期网格策略汇总表。使用现有表格读取规范记录文件 SHA-256 或飞书 revision、sheet、真实表头、物理行号、读取时点、隐藏行和分页完整性。
4. 将源表整理为 `垂类 + 网格ID -> 期望处理等级`。保留原始网格 ID 和来源证据。源表重复、空等级、未知等级、日期序号和格式异常必须进入差异或待核验结果。
5. 使用当前已授权的可信后台适配器完整读取目标垂类、实际任务池、等级1至4网格集合和分页元数据。新一轮设置 `require_grid_validity=true`，对缺配候选按垂类和实际任务池查有效性，对生效配置为零的池查实时任务。记录独立读取证据。
6. 单独读取分发系统黑名单页面，保存完整分页数量、状态和读取时点。
7. 运行离线校验器或等价的结构化校验流程，分别检查任务池内部、垂类跨任务池和黑名单状态。
8. 使用独立复核器检查输入快照、任务池范围、源表映射、实际集合和结果状态。脚本成功、页面请求成功或单个任务池读取成功都不能单独作为通过依据。
9. 输出 Markdown 和 JSON。用户要求飞书报告时，按 [两页签版式](references/audit-output.md#飞书表格版式)更新指定表格并读回；兼职平台校验保持只读。

## 离线入口

脚本只处理本地输入快照，不登录、不写后台、不申请权限：

```bash
node scripts/doctor.mjs
node --test scripts/*.test.mjs
node scripts/audit-grid-levels.mjs assets/input-example.json /tmp/grid-level-audit-result.json --markdown /tmp/grid-level-audit-report.md
node scripts/verify-grid-audit.mjs assets/input-example.json /tmp/grid-level-audit-result.json
bash scripts/package-skill.sh /absolute/path/output.zip
```

输入和输出契约见 [校验流程](references/grid-level-audit-workflow.md) 与 [结果格式](references/audit-output.md)。示例数据只用于离线测试，不能直接提交后台。

## 结果解释

- `passed` 表示源表、全部已启用任务池和黑名单读取完整，且逐网格映射和黑名单约束通过。
- `failed` 表示存在缺失、额外、错配、重复、跨任务池冲突或黑名单冲突。
- `pending` 表示存在审批中、读取不完整、状态未知或无法闭合的证据。
- `not_applicable` 表示目标垂类当前没有已启用任务池，结果仅记录实际状态。
- `unknown` 表示关键源数据或后台快照不可用，不能推导业务结论。

交付至少包含来源证据、各垂类启用任务池、各池等级1至4数量、跨池一致性、逐网格差异、黑名单差异、读取完整性和独立复核结果。
