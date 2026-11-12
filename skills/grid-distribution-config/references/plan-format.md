# 离线计划与状态格式

输入只放本次已授权的业务数据，保存到本机包外。示例在 `assets/`，是假数据。脚本不会取数、登录、上传或配置；`complete/hidden_included`等字段是本次采集证据的声明，须由实际全量读取和行数核对支撑，不可手填true跳过读取。

## 输入

`schema_version:1`；`period`为YYYYMM；明确 `task_token`、`task_pool`、`verticals`、`blacklist_mode`。

`blacklist_mode`只接受：

- `explicit_nonclean`：来源里明确的“不清理处理等级”集合。
- `universe_minus_active`：本期完整全量网格减等级1至4；必须提供同周期`universe`。

`sources[]`每个元素须有唯一`id`、真实`sheet_name`、本期读取`revision/批次`作为`snapshot_id`、`complete:true`、`hidden_included:true`、`expected_record_count`及`records`。条数是该来源本次规范化记录总数，包含其他垂类（会记排除数），不能用可见行数。空白行可在记录前剔除，但保留物理行号，不重编号。

`records[]`字段：

| 字段 | 意义 |
| --- | --- |
| vertical | 来源垂类文本，必须存在 |
| grid_id | 原始文本ID；不从typed日期序号猜测 |
| level | 来源权威业务调整等级，空值将记异常 |
| grid_name | 可选网格名称 |
| row | 来源物理行号，必须为正整数 |

采集时另留文档URL、表头映射、原始响应、源revision前后核验及行数账本。脚本不使用结论或方向选等级，因此无需塞入这两列；汇总写表时按原来源另行保留。

`universe`结构为`{period, snapshot_id, complete:true, expected_record_count, records:[{vertical,grid_id}]}`。输入总行数和去重后各垂类网格数分开核验。非当前scope记录不配置；没有当前垂类的全量数据会阻断。

`repair_date_labels:true`仅在用户已授权时使用。`invalid_grids`可填`{vertical,grid_id,reason,evidence}`；`evidence`指向本次校验回执。只有用户授权后的`skip_invalid:true`才剔除，否则记异常。不配置无效ID也不改源等级。

## 计划输出

`ready:false`和`issues`表示阻断，不能写后台。即使某些目标数组看起来可用，也不能绕过异常；可单独处理无异常垂类须先限定新计划及确认范围。

`targets[垂类].groups`按五档保留ID集合；`counts`是有效目标数；`skipped_invalid`保留无效原因与原等级；`provenance`保留来源sheet和行。`source_unique_count`是来源唯一数，`effective_count`在反向匹配下可大于来源数。`repairs`记录日期型原值及还原值。

`input_sha256`只证明此计划使用了哪份本地输入，不证明该输入正确或最新；最终验收仍需对照真实来源。计划文件默认新建、已有则拒绝覆盖。

## 当前状态

`state`须有同一期`period/task_token/task_pool/verticals`、`complete:true`、`active_total`、`blacklist_total`与对应数组。总量应来自分页接口/页面总数，数组须完整取回。

- `active[]`：`{vertical,grid_id,level}`，level须先按本次后台等级字典映射为业务1至4，记录ID与原映射另留证据。
- `blacklist[]`：`{vertical,grid_id,status}`，status为`enabled/disabled/pending`，根据当前页面核实的编码转换，不猜0/1/2。包含历史关闭记录，核验器只将enabled算生效。
- `protected_before_sha256/protected_after_sha256`：非目标对象完整写前/写后快照按同一已确认规范计算的SHA256；不要为通过验收直接复制相同值。无快照时仍可判断目标集合，但不能宣称非目标对象保持不变。

核验输出区分`configuration_matches`、`non_target_verified`和`passed`。待审批、待恢复、多余开启、成员错配、分页不完整、未知状态都不能算完成；非目标缺证据时`passed:false`且列限制。

服务网格当前回读和黑名单可能需分不同页面取得，合并时保留各自采集时间。若审批状态在翻页期间变化，重新取稳定快照后核验，不覆盖真实差异。
