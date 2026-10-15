---
name: strategy-condition-config
description: Configure and audit ShiHuo task-distribution strategy conditions, processing levels, priorities, channel collections, mixed queues, and Feishu registration. Use for requests involving task distribution configuration, priority conditions, channel IDs, latest goods IDs, mixed-queue references, screenshots, or restoring handlers.
metadata:
  short-description: 识货策略条件配置与验收
---

# 策略条件配置

用于把用户提供的专项需求转换为后台处理等级/优先级配置，并完成写前确认、最小字段修改、写后回读和飞书登记。

## 默认工作方式

除非用户明确确认执行，先只读检查并输出配置确认稿。用户说“开始配置”“配置吧”“开始调整”等，视为确认当前已经明确的范围；如果范围、垂类、任务池、渠道集合或来源不明确，继续停在预检阶段并提出一个最关键的问题。

每次执行按以下顺序：

1. 阅读相关专项规则：先读 [task-matrix.md](references/task-matrix.md)，需要字段映射时读 [field-mapping.md](references/field-mapping.md)，涉及混排/截图时读对应 reference。
2. 检查 `lark-cli`、`sh-cli` 版本和登录态，不读取或回显凭据。
3. 用 `lark-cli --as user sheets ...` 读取最新飞书表格；记录 revision、目标 sheet 和行定位。
4. 用 `level_config_rpa` 的现有后台接口读取垂类列表、详情、处理等级、优先级和混排。
5. 输出预检：范围、处理等级、优先级、任务池、字段和值、顺序、处理人、混排、登记位置、预期变化。
6. 只有获得本次写入确认后才保存；复制对象时只 patch 需求明确的字段。
7. 保存后立即逐垂类回读，检查字段、ID、顺序、处理人、混排和非目标字段。
8. 需求要求截图登记时，按指定 sheet/列/垂类定位，写入后回读目标单元格。

## 首次使用信息

这是公用 Skill，不内置任何人的负责垂类、排除垂类或专项例外。安装完成后的第一次使用，必须先向用户确认：

- 当前负责垂类。
- 长期排除的垂类。
- 需要长期记住的专项例外，例如某垂类不配置店铺抓取标、某商城不参与任务。

在用户提供这些信息前，只能做全量只读检查或解析需求，不能把示例垂类当作用户范围。不要把这些信息写入 Skill 源文件；如需持久化，必须由用户明确指定安全的本地配置位置。

## 必须遵守的安全和正确性规则

- 优先级名称只是展示名称，不能代替渠道集合筛选条件。需求给出渠道集合 ID 时，必须显式校验 `channel_id`。
- 普通条件修改要同步 `form_data`、`special_form_data`、`condition`；写后逐字段回读。
- `商品渠道数量` (`supplier_nums`) 和 `商品 SKU 平均渠道数` (`goods_sku_avg_bind_num_opt`) 是不同字段，不能按名称相似替换。
- 商品 ID 只以最新飞书批次为输入；历史 ID 默认保留，不能用旧快照覆盖线上配置。
- 处理等级顺序、优先级顺序和混排引用是独立对象；保存优先级不会自动更新混排。
- 开混排垂类必须检查目标优先级引用和相对顺序；未开混排垂类不能为了补齐而新建混排。
- 复制优先级/处理等级时保存非目标字段快照，确保排序、处理人、原有条件和其他优先级不变。
- 不读取、打印、保存或复制 Cookie、SSO token、AK、密码、App Secret。
- 后台浏览器 profile 固定使用项目 `level_config_rpa/.browser-profile`，不要误用上级目录或用户日常 Chrome。

## 任务规则路由

按专项名称读取 [task-matrix.md](references/task-matrix.md)，不要把一个专项的条件套到另一个专项。已覆盖：核心商品/新建品补渠道、新品在售率、渠道在线率、唯品会 113179、无供给店铺、商品全周清、95 分、待补渠道标签、发展部趋势品、核心网格 113719、数码新品、115851、不完整有佣/抖音任务、有效上线率和全局分发黑名单。

## 常用对话入口

- “检查这个需求怎么配置”：只读解析并输出确认稿。
- “配置前发我确认”：只做预检，不写入。
- “开始配置”：执行当前确认范围。
- “只检查我负责的垂类 / 检查所有垂类”：按范围审计。
- “补混排”：只检查/修复混排引用，仍需写前确认。
- “登记截图”：定位指定飞书 sheet 并回读登记结果。
- “恢复原处理人”：必须使用写前快照或当前明确来源，不能猜测。

## 工具入口

通用审计和计划执行脚本位于 `scripts/`。它们通过 `STRATEGY_CONFIG_RPA_ROOT` 指向现有 `level_config_rpa`；未设置时尝试当前项目下的 `level_config_rpa`。执行写入必须同时提供计划文件和 `--yes`。

- `preflight-config.mjs`：读取计划并生成只读变更摘要。
- `apply-config.mjs`：执行已确认计划，保存前快照、逐项保存、逐项回读。
- `audit-config.mjs`：全垂类或指定垂类只读审计。
- `verify-config.mjs`：对保存结果执行结构化验收。

详细规则：

- [task-matrix.md](references/task-matrix.md)
- [field-mapping.md](references/field-mapping.md)
- [vertical-scope.md](references/vertical-scope.md)
- [mix-reference.md](references/mix-reference.md)
- [feishu-registration.md](references/feishu-registration.md)
- [failure-prevention.md](references/failure-prevention.md)
