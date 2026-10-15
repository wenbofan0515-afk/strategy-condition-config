# 后台字段映射

| 业务条件 | 后台字段 | 验收要求 |
|---|---|---|
| 渠道集合 ID | `channel_id` | 名称、值、`form_data`、`special_form_data`、`condition` 逐处一致 |
| 商品 ID | `goods_id` | 商品 ID 聚合值同步，去重，保留原 ID；最新批次只做增量核对 |
| 商品渠道数量 | `supplier_nums` | 例如 `['2', 3]` + 操作符“小于” |
| 商品 SKU 平均渠道数 | `goods_sku_avg_bind_num_opt` | 与 `supplier_nums` 严格区分；按专项要求启用或禁用 |
| 分发黑名单 | `is_black` | `否`、`全部` 等值必须按需求原样核对 |
| 商城 | `store` | 不把商城名称和渠道集合 ID 混为一谈 |
| 店铺抓取标 | 对应后台抓取店铺字段 | 特定垂类和专项例外单独确认 |
| 垂类/一级类目 | 对应类目字段 | 复制时保留原字段，新增时按需求配置 |
| 渠道检查任务 ID | `check_task_id` | 商品全周清专项常用，不能凭商城名推断 |
| 排序 | `supplier@sort` | 商品 ID 升序、渠道销量降序、UV 降序等按需求核对 |
| 网格优先级 | 对应网格字段 | 只有需求明确时保留、删除或新增 |
| 新品关键词扫描 | 对应新品关键词字段 | 新建品补渠道专项通常要求“是” |

## 三处同步

普通优先级条件保存时，不能只更新 UI 展示对象。对目标字段建立写前/写后断言：

```text
priority.form_data[field]
priority.special_form_data[field]
priority.condition[field].value
priority.condition[field].show_name
```

不适用的字段保持原结构，不要为了“补齐”创建空条件。
