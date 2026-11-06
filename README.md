# 策略条件配置 Skill

当前版本：**[v1.1.0](https://github.com/wenbofan0515-afk/strategy-condition-config/tree/v1.1.0)**（2026-11-06）。

用于识货任务分发策略的需求解析、配置预检、条件修改和写后验收。支持普通条件完整性检查、混排引用核对和飞书截图登记流程。具体能力边界见 [SKILL.md](SKILL.md)，各版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 安装

在 Codex 中发送：

```text
请使用 skill-installer，从 https://github.com/wenbofan0515-afk/strategy-condition-config 安装仓库根目录的 Skill，名称为 strategy-condition-config，版本使用 v1.1.0。
```

安装后在下一轮输入 `$strategy-condition-config`；为避免旧会话已经加载的规则干扰，建议新开会话。

## 从旧版更新

GitHub 更新不会自动替换其他电脑已安装的 Skill。旧版用户在 Codex 中发送：

```text
请把本机 strategy-condition-config Skill 更新为 https://github.com/wenbofan0515-afk/strategy-condition-config 的最新已发布版本。先确认实际安装位置和版本，备份原 Skill；保留我的个人垂类、配置和登录态，不要把备份或凭据上传。下载到临时目录校验后再替换 Skill 文件，报告安装后的版本号和来源提交。不要修改线上策略。完成后告诉我是否需要新开会话。
```

安装器默认不会覆盖同名目录。更新时先备份旧目录，校验新版后再替换，失败恢复备份；不能直接删除原 Skill。个人数据不属于 Skill 发布内容，若旧目录中存在个人文件，应单独保留，不覆盖为其他人的设置。

## 版本规则

- `v主版本.次版本.修订版本`，例如 `v1.1.1`。
- 不兼容的接口或计划格式变更递增主版本；兼容的新能力递增次版本；缺陷修复和文档纠错递增修订版本。
- 本次为首次正式编号，历史无版本号提交不追造版本号。
- 发布时同步 `VERSION`、Skill 元数据、首页、更新日志和 Git 标签；GitHub Release 可补充发布说明，但不作为唯一版本来源。每次运行以本机安装版本为准；不在配置过程中静默更新可执行脚本。

## 使用前提

Skill 不携带账号、凭据或个人负责垂类。首次使用按用户需求确认范围，并检查本人后台登录态和所需工具。安装 Skill 不代表已有后台权限或接口依赖。通用脚本目前只修改已有优先级条件；混排保存等操作须使用已核实的专用工具，不会因安装新版而自动执行线上变更。
