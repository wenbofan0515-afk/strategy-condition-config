# 校验结果格式

## 顶层结果

`audit-grid-levels.mjs` 输出一个 JSON 对象：

```json
{
  "schema_version": 1,
  "kind": "grid-level-audit",
  "period": "202611",
  "status": "passed",
  "input_sha256": "sha256",
  "source": {
    "snapshot_ids": ["source-1"],
    "read_at": "2026-11-19T10:00:00+08:00",
    "complete": true
  },
  "backend": {
    "snapshot_id": "backend-1",
    "read_at": "2026-11-19T10:03:00+08:00",
    "complete": true
  },
  "blacklist": {
    "snapshot_id": "black-1",
    "read_at": "2026-11-19T10:04:00+08:00",
    "complete": true
  },
  "summary": {},
  "verticals": [],
  "issues": [],
  "limitations": []
}
```

## 状态

- `passed` 表示所有必需快照完整，源表、active 任务池和黑名单约束均通过。
- `failed` 表示存在明确配置差异或冲突。
- `pending` 表示数据读取不完整、黑名单审批中或状态未知。
- `not_applicable` 表示垂类当前没有 active 任务池。
- `unknown` 表示缺少关键源数据或无法完成判断。

## 垂类结果

每个 `verticals[]` 元素包含：

```json
{
  "vertical": "鞋类",
  "status": "passed",
  "active_task_pools": [
    {
      "task_pool_id": "pool-1",
      "task_pool_name": "渠道属性（配色）关联",
      "counts": {
        "处理等级1": 2,
        "处理等级2": 1,
        "处理等级3": 0,
        "处理等级4": 1
      },
      "source_match": true,
      "actual_by_grid": {
        "100-200": "处理等级1"
      },
      "issues": []
    }
  ],
  "inactive_task_pools": [],
  "excluded_task_pools": [],
  "cross_pool_consistent": true,
  "blacklist": {
    "expected_nonclean": 1,
    "enabled_nonclean": 1,
    "mismatches": []
  }
}
```

## 差异类型

报告使用稳定的 `type` 值，便于后续汇总：

| 类型 | 含义 |
| --- | --- |
| `source_duplicate` | 源表同一垂类和网格重复 |
| `source_missing_level` | 源表等级为空 |
| `source_unknown_level` | 源表等级不在允许集合 |
| `source_invalid_grid` | 源表网格 ID 格式异常 |
| `backend_missing_vertical` | 后台未找到源表垂类 |
| `backend_incomplete` | 后台快照或分页不完整 |
| `blacklist_incomplete` | 黑名单读取不完整或记录状态无法判断 |
| `missing_grid_in_pool` | 已启用任务池缺配，正式校验须有该池下网格有效证据 |
| `grid_validity_pending` | 缺配候选的有效性尚无法确认 |
| `pool_activation_pending` | 等级配置为零，尚缺实时任务或正式启用状态证据 |
| `nonclean_grid_in_pool` | 不清理网格错误进入等级1至4 |
| `wrong_level_in_pool` | 网格进入任务池但处理等级错误 |
| `extra_grid_in_pool` | active 任务池出现源表没有的网格 |
| `duplicate_grid_in_pool` | 同一任务池内网格进入多个处理等级 |
| `cross_pool_missing_grid` | 同一垂类不同 active 任务池的网格集合不一致 |
| `cross_pool_level_conflict` | 同一垂类不同 active 任务池的处理等级不一致 |
| `blacklist_missing` | 不清理网格没有黑名单记录 |
| `blacklist_not_enabled` | 不清理网格黑名单未开启 |
| `blacklist_pending` | 黑名单状态处于审批中或未知 |
| `active_blacklist_conflict` | 等级1至4网格处于开启黑名单状态 |
| `pending_blacklist_conflict` | 等级1至4网格存在未完成的黑名单状态 |
| `unexpected_blacklist` | 完整源表范围内出现额外开启黑名单 |

## 报告要求

Markdown 报告按垂类和任务池展示：

- 源表及读取证据
- active、inactive 和排除任务池
- 等级1至4数量
- 源表匹配结果
- 跨任务池一致性
- 黑名单预期和实际状态
- 差异明细及来源行号
- 读取不完整、待核验和未知限制

数量、状态和差异均从 JSON 结果生成，不在 Markdown 中另行计算。

汇总使用 `verticals[].task_pool_summary`，每个垂类内两对任务池分别各占一行。记录 `family`、`status`、`selected_task_pool_id` 及各后台版本的粒度和状态。明细引用实际任务池 ID。`cross_pool_consistent` 为 `null` 表示含未建立服务网格映射的任务池，可比任务池未发现差异。

`active_task_pools[].invalid_grid_exclusions` 保存已确认无效的候选及其快照 ID、时点和源行，`summary.invalid_grid_exclusion_count` 单独计数，汇总配置异常数排除这部分。已核验的实时任务数和快照保存在 `live_task_evidence`。

## 飞书表格版式

- 用户已指定表格时原地更新「汇总」和「明细」。使用 `feishu-sheets-user-edit` 及 `lark-cli --as user`，写后读回数值、结构和样式。
- 「汇总」按垂类聚合。普通版和服务网格版共用一个任务池族结果。用户要求去掉的独立「商品关联任务」「跨池一致性」栏保持省略，实际任务池身份和跨池结论留在明细及机器结果。
- 保留三条问题概览「等级配置」「待核验」「黑名单」。同类问题在汇总按原因和垂类合并，用计数或简短说明展示，逐网格证据放在可筛选的「明细」。无效网格说明独立于异常计数。
- 汇总内需要留存的长表使用一个连续、默认收起的原生行分组，覆盖标题下方的全部长表。问题概览留在组外。先取消组内手动隐藏，避免左侧展开按钮消失。按实际长度确定分组边界，删除行或重写范围后重新回读边界。
- 验收收起时的实际可见行，确认概览可见、长表无漏行，左侧有「＋」可展开。检查明细页筛选范围、状态样式、冻结标题、数值格式和真正空白单元格。
