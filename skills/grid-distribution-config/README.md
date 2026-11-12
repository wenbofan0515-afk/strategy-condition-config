# 兼职平台网格配置 Skill

当前版本：**v1.0.0**（2026-11-12）。

把月度来源汇总、服务网格处理等级1至4、黑名单、回读验收和真实截图登记合并到一个Skill。与 `strategy-condition-config` 分工：该Skill配置网格归属，策略Skill配置优先级条件，两者互不代替。

## 安装和使用

从仓库 https://github.com/wenbofan0515-afk/strategy-condition-config 的 `skills/grid-distribution-config` 路径安装，固定使用独立标签 `grid-v1.0.0`，包内版本为 `1.0.0`。仓库根目录是策略Skill，不要把根目录安装成网格Skill。安装后在新一轮输入 `$grid-distribution-config`，已有长会话建议新开会话。

```text
请使用 skill-installer，从 https://github.com/wenbofan0515-afk/strategy-condition-config 的 skills/grid-distribution-config 路径安装 grid-distribution-config，版本使用 grid-v1.0.0。
```

首次通常只需说明本次垂类、最新文档及是否只汇总。其他依赖和页面可用性由Codex检查。示例：

```text
使用 $grid-distribution-config，按这两份本月表格汇总指定sheet，包含隐藏行。
先更新现有汇总并检查等级冲突；配置前把任务池、分档数量和黑名单差异发我确认。
```

本机安装目录与GitHub是两份文件，更新仓库不代表其他电脑已升级。更新时先确认安装版本、备份旧Skill、下载并校验新版本，再替换Skill文件；个人配置和登录态保持在包外，不覆盖、不上传。

每个会话首次使用运行 `node scripts/check-update.mjs`。检查需要本机Git可读取仓库，最多等待6秒，只读远端的 `grid-v*` 正式版本标签，不会把策略Skill的 `v*` 标签当作网格新版，也不上传业务数据。失败报告未知，不阻断当前任务、不触发登录。具体来源及子目录配置见 `release.json`。

## 自带能力和边界

- 多sheet归并、同网格冲突/空等级、日期网格还原、分档统计及两种黑名单口径的离线计划器。
- 等级成员集合、黑名单开启/关闭/审批中、缺失及多余记录的离线核验器。
- 后台及飞书的可执行操作流程、入口、确认与恢复要求。
- 不打包内部后台项目、账号、业务源数据；不执行线上写入。后台配置由Codex按当前页面或可信适配器完成，不能直接运行历史硬编码脚本。

## 检查

Node.js 22及以上，无第三方npm依赖：

```bash
node scripts/doctor.mjs
node --test scripts/*.test.mjs
node scripts/plan-grid.mjs assets/input-example.json /tmp/grid-plan-example.json
node scripts/verify-state.mjs /tmp/grid-plan-example.json assets/state-example.json
```

示例仅用于离线验证；没有任何真实垂类、业务ID、飞书token或凭据。详见 [SKILL.md](SKILL.md)、[输入与输出契约](references/plan-format.md) 和 [更新记录](CHANGELOG.md)。

打包运行 `bash scripts/package-skill.sh /absolute/path/output.zip`；打包仅包含清单内的Skill资源，排除Git、业务数据和凭据。
