# 运行校验函数

模块为 Skill 根目录 `scripts/runtime-guards.mjs`，均不登录、不发送写请求。它们用于已有可信专项适配器；不会自动改造历史runner。通用策略入口的HTTP严格检查和保存意图日志已经接入，网格/黑名单专项按需显式调用这些函数。

## HTTP与校验集合

`assertApiResponse(response, {requireData, validateData})` 接受可信 `fetchInPage` 的 `{ok, body}`。要求HTTP成功、至少一个业务码且所有返回的 `code/status` 数值均为0。读取默认要求非null的data；接口结构由 `validateData(data) => boolean` 指定。保存端点若契约仅返回业务码，可显式 `requireData:false`，但只说明受理，仍须独立回读。不打印原body、认证参数或跳转URL。

`assertPartition(requestIds, data)` 要求 `grid_id_valid/grid_id_invalid/grid_id_skip` 三个数组互斥、无重复且逐ID闭合。skip不代表已开启，须查真实状态；有效集合也不等于正式已提交。

## 分页与已受理续接

`collectPages(readPage, {scopeKey, checkpoint?, onCheckpoint?})` 的 `readPage(pageNumber)` 只返回通过HTTP/结构检查的 `{total, list}`；list中保留真实记录ID和网格ID。`scopeKey`包含本期、来源指纹、垂类与任务池。函数按实际返回页大小读取、检查总量与唯一性，并在成功页后调用 `onCheckpoint`。调用方原子保存检查点；只读瞬时网络错误的有限重试由适配器负责。

异常的 `error.checkpoint` 可保留已读页，但 `READ_SNAPSHOT_CHANGED` 时必须重取稳定集合。检查点首页/总数一致不是中间记录完全不变的保证，存在并发更新时不复用旧页。`collectPages`按现有固定页大小接口建模；若当前接口是游标或变化页大小，使用其专用完整读取契约。

`assertReadOnlyResume(expectedScope, journal, expectedSaveKeys)` 的范围为 `{period, source_sha256, vertical, task_token, task_pool}`，`journal.scope`必须一致。`journal.steps[]`需有 `action:delete|save`、`started_at/completed_at`及原 `{ok,body}` 响应；保存步骤另有唯一 `request_key`，与本期所有非空档/批次的 `expectedSaveKeys`闭合。通过仅返回 `{action:'read_only', repeat_writes:false}`；未知回执、缺档、重复、换源/池均停止。旧日志结构不同先按真实证据归一，不补假回执。

`waitForReadback({read, verify, maxAttempts, intervalMs, wait, onObservation?})` 只调用注入的只读函数。`verify(current)`返回 `{matches:boolean, pending?:boolean}`；只有已确认为同步未完成时设置 `pending:true`。分页总量变化也可再读；结构、权限、非目标字段差异直接抛错。预算耗尽返回 `verified:false/status:accepted_readback_pending`，不能当完成，不能自动重提或继续后续写入。次数与间隔按本次实测明确设置；注入wait使测试不真实等待，单次间隔最多60秒以便报告进度。

## 字段与位置核验

`gridDictionaryConfiguration(levels)` 仅从 `levels[i].priority[j]` 直接属性分离三类已核实动态任务计数，保留其他层级同名字段、所有业务条件和数组顺序；原始响应另存，不把投影结果当写入对象。

`verifyBlackRecord(before, after, {action, detailId, verticalId, buildCfg})` 使用本次页面核实的状态码 `0开启/1关闭/2审批中`，换schema先改专用映射。新增action为add，before必须明确为null以表示已查证不存在；新增网格组成严格核验。restore/close需完整写前对象；历史0维度原样比较，不猜修复。根级状态及三项已核实更新元数据单独处理，其他字段完整比较。结果 `pending/at_target`只说明本条状态；最终开启集合、非目标全量与实际分发仍需独立验收。

`auditMixPlacement(detail, {anchorLevelId, targetLevelId, targetPriorityId})` 是只读位置审计，ID取当前定义；检查真实 `level_mix_open`，沿读取数组定位锚点来源等级的最后引用，不按 `sort_val` 排序。关闭时返回preserve，未知开关、重复目标、缺锚点停止；位置结果不检查全部来源名称，也不生成或保存混排数组，完整验收仍按 [混排规则](../../mix-reference.md)。
