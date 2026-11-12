# 环境、入口与本人登录

## 自动检查

先检查Node.js 22+、Git及本机已装的 `lark-cli`、`sh-cli`。按对应skill检查/安全更新工具、验证CLI登录态。网页刚登录不等于CLI认证有效；不新建认证链路，不导出Cookie，不复制其他人的profile。没有GitHub读取权限只影响版本检查，不自动发起授权。

飞书表格优先使用 `feishu-sheets-user-edit`，默认 `lark-cli --as user sheets ...`。缺失scope、权限或认证时明确报告，不切bot、不自动申请审批。

优先在Codex内置浏览器后台打开/绑定标签；不激活用户当前窗口、不接管日常Chrome。需要本人登录时先解释登录点，用户要求展示后展示已有标签，由本人扫码/MFA。工具句柄失效不等于退出登录。

## 后台入口

网格分配入口：

```text
https://backstage.shihuo.cn/parttimePlatform/#/workSpace/taskDistributionCenter/distributionConfig/task_common_supplier_attr_style_bind
```

黑名单入口：

```text
https://backstage.shihuo.cn/parttimePlatform/shihuoAppManagement/#/blackListSetting
```

`task_common_supplier_attr_style_bind`是已验证的渠道属性关联任务示例；用户指定其他任务时以本次任务token为准，不沿用此页面配置其他任务。

`levelConfigDetails/...`是处理等级/优先级条件页，不是网格分配页。服务网格分配只改变网格与已有等级的对应关系，不创建/删除策略等级或混排。

进入分配页后核对任务名称、垂类、任务池、分档筛选器及当前数据。线下池须核对该池实际配置维度，不能由名称猜测是二级类目还是一级类目。

## 可信项目可选路径

已有本人授权 `level_config_rpa` 时可复用它的浏览器/接口适配器。配置 `GRID_CONFIG_RPA_ROOT` 仅用于doctor检查文件，不会执行项目代码；路径由当前需求/工作区确定，不扫描个人目录寻找凭据。没有项目则用内置浏览器流程，不假称脚本就绪。

旧 `apply_grid_distribution_batch.mjs` 等文件可能内置月份、表格token、全量CSV、预期数量、个人垂类、等级别名及黑名单提交理由；有的旧脚本会让有效等级覆盖不清理等级冲突。不得直接复制运行。先读源码确认参数化、范围、字段、分页和写入契约，并以本Skill严格来源审计为前置。

历史适配器的`.browser-profile`属于本人本机运行资产，不进Skill和GitHub。不为修复登录而关闭其他浏览器、删锁、读钥匙串整库或复制会话。登录和配置分别报告。
