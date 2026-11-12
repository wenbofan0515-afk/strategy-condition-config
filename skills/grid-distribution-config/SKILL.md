---
name: grid-distribution-config
description: 识货兼职平台网格月度汇总、处理等级1至4重建、黑名单对账与截图登记。Use when the user asks to summarize grid sheets, configure service grids, reconcile blacklist status, or register real platform screenshots; priority filter conditions belong to strategy-condition-config.
metadata:
  short-description: 兼职平台网格汇总、配置与黑名单验收
  version: "1.0.0"
---

# 网格配置

版本以包内 [VERSION](VERSION) 为准，安装与升级见 [README.md](README.md)。首次使用运行 `node scripts/check-update.mjs`；只提示新版，不静默替换运行中的代码。私有仓库无本机 GitHub 登录时版本检查会报告未知，不能据此认定已是最新。

## 工作边界

本 Skill 合并网格来源汇总、等级分配、黑名单、复核及登记流程。不修改优先级筛选条件、处理等级定义、处理人或混排；这些属于策略条件配置。网格ID通常是“二级类目ID-品牌ID”，线下商品池仍以当前页面实际维度为准。

通用包不内置个人垂类、排除项、月份、业务数量、表格token、账号和登录态。优先复用本次需求及已授权本地范围；缺失时只问一个最关键的问题，不从账号可见范围推断负责范围。

## 按任务阅读

| 本次动作 | 必须阅读 |
| --- | --- |
| 新电脑、登录、页面入口 | [setup-and-login.md](references/setup-and-login.md) |
| 五sheet或其他多表汇总、刷新汇总 | [source-summary.md](references/source-summary.md) |
| 重建处理等级1至4、线下池 | [platform-workflow.md](references/platform-workflow.md) |
| 不清理、全量反向匹配、黑名单审批与状态 | [blacklist.md](references/blacklist.md) |
| B至F列、截图、配置状态与日期 | [registration.md](references/registration.md) |
| 中断、数量不一致、历史脚本 | [recovery.md](references/recovery.md) |

## 执行顺序

1. 明确本期来源sheet、业务调整等级列、负责/排除垂类、任务token、任务池、黑名单口径和登记位置。月份每次重新确认；不套历史链接或数量。
2. 使用 `feishu-sheets-user-edit` 及本人 `lark-cli --as user` 完整读取来源，包含隐藏行、筛选行、分页和真实末行；记录读取时点、revision、来源行号。
3. 按垂类+网格归并。只有业务调整等级决定等级；任何来源为空、未知或不同均列异常，不以建议等级或关联输出等级兜底。评估结论为空不阻断。完整规则见来源汇总文档。
4. 生成本期计划、各垂类等级1至4和不清理数量、异常与黑名单差异。只汇总或只检查的请求不操作后台。
5. 后台只读预检：核实登录、垂类ID、任务池、四档真实等级ID、网格有效性、完整原配置与黑名单状态。未通过不删除、不上传。
6. 用户要求写前确认时输出一份具体确认稿；明确范围后用户说“开始配置”等即可执行。新范围、新删除对象、授权/权限变化需确认，已确认的常规阶段无需反复询问。
7. 保存来源与当前配置快照。按确认范围删除旧网格分配，再重建等级1至4；不删除处理等级定义。若要求先全部1至4再黑名单，严格分两阶段。
8. 最后对账黑名单：上传/新增、恢复、待审批、需关闭分别处理。`only_check`不是完成，提交成功不是开启生效；数量延迟时保留回执、只读复查，不重复提交。
9. 独立按网格集合及其等级逐项回读，不能只比数量或脚本生成的expected；检查非目标垂类、任务池、定义和策略未变。每档零数量也要验证。
10. 按指定位置登记真实页面截图、本人配置人及本次配置日期，并回读值、图片和格式。最终区分已提交、已审批、已开启、已核验、待同步及无效跳过。

## 离线工具

脚本仅做本地规划与核验，不联网配置后台：

```bash
node scripts/doctor.mjs
node --test scripts/*.test.mjs
node scripts/plan-grid.mjs /absolute/path/input.json /absolute/path/plan.json
node scripts/verify-state.mjs /absolute/path/plan.json /absolute/path/current-state.json
```

输入格式与例子见 [plan-format.md](references/plan-format.md) 和 [assets/input-example.json](assets/input-example.json)。输入中的当前读取证据由 Codex 按来源规则收集；示例是假数据，不能直接写后台。

计划器遇到异常仍生成可审阅结果并以非零退出，`ready:false`时不得配置。核验器不访问后台，不证明读取或登录成功；当前状态须来自本次真实全量回读。独立核验来源成员关系与非目标对象仍由流程负责。

后台执行可用当前内置浏览器，或本人已授权的可信项目适配器。安装本Skill不自动安装内部项目、不授予权限，也不会让硬编码旧脚本变成安全的通用执行器。历史接口仅为定位线索，先确认当前页面和schema。

## 关键约束

- 不隐藏、丢弃或填默认等级以消除异常；同网格跨sheet“等级1”和“不清理”同样冲突，不自选等级1优先。
- 网格ID读取用原始值，日期标签只在明确授权后还原；日期序号不能直接当ID。`12月14日`可还原为`12-14`，保留原值及备注。
- 无效网格须有后台校验凭据和原因；只有用户授权跳过后才排除，并在汇总指定备注列登记，不删除来源记录。
- 黑名单口径为“全量减等级1至4”时必须提供本期完整全量表；没有时不能用零行或旧文件替代。只按不清理来源配置是另一种口径，不混用。
- 不复制凭据、profile、业务快照到Skill或GitHub；不接管用户日常Chrome。页面句柄失效按恢复流程重新绑定，写前后核对目标URL。
- 截图只能来自目标真实后台页面；可在真图上框选，不重绘、不伪造数字。为显示数量进入批量删除/勾选界面后必须取消，绝不确认删除。

## 交付

交付本期来源清单与时点、计划及确认依据、分档实际网格集合/数量、无效明细及备注位置、黑名单状态差异、写前快照、写后证据和登记入口。测试通过、配置回读通过和业务实际生效分别表述。
