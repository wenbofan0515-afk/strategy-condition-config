# 网格处理等级校验流程

## 输入契约

校验器接受一个 JSON 输入文件，结构如下：

```json
{
  "schema_version": 1,
  "period": "202611",
  "repair_date_labels": false,
  "source_scope_complete": true,
  "require_grid_validity": true,
  "verticals": ["鞋类"],
  "sources": [
    {
      "id": "source-sheet-1",
      "sheet_name": "示例网格策略",
      "snapshot_id": "sha256-or-feishu-revision",
      "read_at": "2026-11-19T10:00:00+08:00",
      "complete": true,
      "hidden_included": true,
      "expected_record_count": 1,
      "records": [
        {
          "row": 2,
          "vertical": "鞋类",
          "grid_id": "100-200",
          "level": "处理等级1",
          "grid_name": "示例网格"
        }
      ]
    }
  ],
  "backend_snapshot": {
    "snapshot_id": "backend-1",
    "read_at": "2026-11-19T10:03:00+08:00",
    "complete": true,
    "verticals": [
      {
        "vertical": "鞋类",
        "vertical_id": "12",
        "complete": true,
        "task_pools": [
          {
            "task_pool_id": "pool-1",
            "task_pool_name": "渠道属性（配色）关联",
            "task_pool_type": "grid_distribution",
            "status": "active",
            "complete": true,
            "levels": [
              {
                "level_id": "31",
                "level_name": "处理等级1",
                "complete": true,
                "total": 1,
                "grids": [{"grid_id": "100-200"}]
              },
              {
                "level_id": "32",
                "level_name": "处理等级2",
                "complete": true,
                "total": 0,
                "grids": []
              },
              {
                "level_id": "33",
                "level_name": "处理等级3",
                "complete": true,
                "total": 0,
                "grids": []
              },
              {
                "level_id": "34",
                "level_name": "处理等级4",
                "complete": true,
                "total": 0,
                "grids": []
              }
            ]
          }
        ]
      }
    ]
  },
  "blacklist_snapshot": {
    "snapshot_id": "black-1",
    "read_at": "2026-11-19T10:04:00+08:00",
    "complete": true,
    "total": 0,
    "records": []
  }
}
```

必需快照字段：

- 源表 `complete=true`、`hidden_included=true`、记录数闭合
- 后台垂类、任务池和等级分页均有完整性标记
- 黑名单 `complete=true` 且 `total` 等于记录数
- 所有读取时点和 snapshot ID 可回溯

## 源表整理

源表以 `垂类 + 网格ID` 为主键。允许的期望等级为：

- `处理等级1`
- `处理等级2`
- `处理等级3`
- `处理等级4`
- `不清理处理等级`

对每条记录保留源文件或飞书来源、sheet、物理行号、原始网格 ID 和标准化网格 ID。网格 ID必须是原始文本，标准格式为 `正整数-正整数`。

日期标签只有在输入明确 `repair_date_labels=true` 时才允许把 `12月14日` 还原为 `12-14`，并在结果保留原值和修复记录。数字日期序号和其他无法证明的格式直接标记异常。

## 后台整理

后台读取必须来自当前已授权的可信适配器或当前内置浏览器会话。记录：

- 垂类 ID 和名称
- 任务池 ID、名称、类型和启用状态
- 处理等级真实 ID 和名称
- 每个等级的完整分页结果和总数
- 后台读取时点、URL 或适配器证据

处理等级必须按真实后台名称映射到等级1至4。`处理等级1`至`处理等级4`和已核实的`限制型处理等级1`至`限制型处理等级4`统一映射到对应序号，同时保留原始名称和真实等级 ID 作为证据。名称未知、等级 ID 缺失、分页不闭合或同一等级返回多个不一致对象时，结果进入 `backend_incomplete` 或 `unknown`。

## 逐池校验

对每个 active 任务池：

1. 读取等级1至4中的全部网格。
2. 同一网格出现在多个等级时记录 `duplicate_grid_in_pool`。
3. 期望等级与实际等级不同时记录 `wrong_level_in_pool`。
4. 期望网格未出现时记录 `missing_grid_in_pool`。
5. 实际网格未出现在源表时记录 `extra_grid_in_pool`。
6. 零数量等级仍必须有完整的空集合证据。

## 跨池校验

同一垂类存在两个或以上 active 任务池时，使用所有 active 任务池的实际映射比较：

- 集合缺失或多出记录为 `cross_pool_missing_grid`
- 同一网格处理等级不同为 `cross_pool_level_conflict`

只比较实际启用任务池。inactive 任务池保留状态和读取证据，不加入一致性计算。

## 黑名单校验

分发系统黑名单页面独立读取，不能从任务池结果推导。

- 期望为“不清理处理等级”的网格必须存在且 `status=enabled`。
- 期望为等级1至4的网格不得为 `enabled`。
- 期望为等级1至4的网格如果为 `pending`，记录待核验冲突。
- active 任务池中的网格如果处于开启黑名单，记录 `active_blacklist_conflict`。
- `source_scope_complete=true` 时，源表范围内多出的开启黑名单记录记录为 `unexpected_blacklist`。范围不完整时只报告限制，不擅自关闭或判定业务错误。

## 失败处置

- 源表读取不完整时停止业务结论生成，保留结构化错误。
- 后台分页不闭合时不以空集合替代，结果为 `pending` 或 `unknown`。
- 黑名单页面不可读时不以旧快照代替当前状态。
- 不重复提交后台写请求，因为本 Skill 没有写入口。
- 读取句柄失效时按内置浏览器恢复规则重新绑定并只读检查，恢复失败则停止线上读取。

## 缺配证据与零配置

新采集使用 `require_grid_validity: true`。老快照可以按原口径重放，交付时标明未做有效性核验。先对闭合的等级1–4分页比对，在已启用服务网格池内形成缺配候选，再按 **垂类、实际任务池 ID、网格 ID** 查询候选在该池是否可配置。使用已授权后台的网格校验（`gridCheck`）能力，核对当前接口契约。按同一粒度提交候选 ID，检查返回的有效、无效 ID 集合是否互斥、是否与请求闭合，并留存分页、时点及任务池证据。返空、超时、权限不足和分页不闭合均记为待核验。不得以别的任务池、商品是否在线或单纯未查到替代。

在对应 `task_pools[]` 内填 `grid_validity_snapshot: {snapshot_id, read_at, complete, records}`，其中 `records` 为 `{grid_id, status}`，状态为 `valid`、`invalid` 或 `unknown`。`complete` 表示该批证据完整，候选未覆盖或重复返回时按未知处理。已确认无效的缺配候选保留在排除明细，跨池比较也按实际缺失侧的证据处理。已经配置的网格、错级、额外配置、重复配置及黑名单仍按独立证据校验。

生效等级1–4均为空时，核对相同垂类和实际任务池的当前实时任务，使用同一网格粒度，排除其他版本和历史批次。自定义等级和关联人员只作线索。`live_task_snapshot: {snapshot_id, read_at, complete, task_count}` 有闭合的正任务数可确认已启用。缺证据或实时任务数为零时保留待核验。正式明确未启用的池记录为未启用。

普通版按一级类目＋品牌核对。保留二级到一级的父子映射与源表行号。同一聚合键的源表子项涉及多个处理等级，或同时包含等级1–4和不清理时，保留整池待核验及样例，取得业务取档规则后再判。黑名单仍以其独立页面、源表及原网格键核对。
