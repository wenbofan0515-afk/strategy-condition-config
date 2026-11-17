# 网格与策略一体化安装

安装入口为仓库根目录的 `strategy-condition-config`，同时包含网格和策略。旧独立 `grid-distribution-config` 不再作为最新安装入口。

## 在线安装提示词

```text
请安装或更新 https://github.com/wenbofan0515-afk/strategy-condition-config 仓库根目录的 strategy-condition-config，使用最新正式Release，网格和策略一起安装。

先检查实际技能目录；已有版本先备份，保留个人配置。若有旧grid-distribution-config，备份个人文件后移出技能目录，避免重复加载。

在临时目录核对版本、来源提交及文件后再安装。普通授权网络内可用官方发布附件或同标签源码；不同入口必须指向同一可信提交。下载被网络策略阻断时记录实际阶段、主机和错误，不循环重试、不禁用证书或绕过权限；有本地离线包则核验后继续，否则提供离线安装方案。没有网络审批授权不代表禁止已授权范围内的普通下载。不要自动发起新权限申请。

使用已有运行环境执行 node scripts/run-tests.mjs 和 node scripts/doctor.mjs，安装后逐文件回读。分别报告技能文件安装、离线测试、后台适配器及登录状态。缺内部项目/CLI不等于技能文件安装失败；缺Node时可用已有Python/PowerShell核对哈希后安装，测试标记未执行。不要自动联网装依赖或登录，不操作线上配置。完成后提示新开会话。
```

## 下载失败如何判断

能读到最新Release元数据，只证明版本查询成功。附件、源码归档和重定向后的下载主机可能使用不同网络路径；没有具体错误、状态码或工具审批记录时，不能断言仓库权限、Windows兼容性、代理或防火墙是根因。只记录不含签名参数/凭据的主机和失败阶段。

正式离线包包含 `strategy-condition-config/`、`manifest.json`、`OFFLINE-INSTALL.md`，发布页另附ZIP的SHA-256。GitHub自动生成的Source code ZIP不一定包含离线清单，不要混用两种验证方法。只有独立来源提供的SHA/提交才可作为核对依据；包内自带清单不等于数字签名。真实权限门禁仍需用户明确同意。

## 离线安装

1. 将正式离线ZIP放入当前工作区，从发布页或发送者核对ZIP的SHA-256。解压到新的临时目录，拒绝绝对路径、`..`、符号链接及越界条目。
2. 对照 `manifest.json` 的版本、完整提交ID、文件集合和每文件SHA-256。已有Node.js 22+时可用包内校验入口；版本和提交参数取可信发布信息，不能仅复制未知包的自述值。
3. 只复制 `strategy-condition-config/` 到实际技能目录，不把外层清单和说明作为另一个Skill。常见位置为 `~/.agents/skills/strategy-condition-config`；`CODEX_HOME`或本机配置指定其他技能目录时沿用实际目录，避免两处重复安装。不要更改系统HOME环境变量。
4. 安装后逐文件回读，再运行离线测试与doctor。缺运行时只能报告文件安装完成、测试未执行；不能虚报全部验收通过。
5. 新开会话后用 `$strategy-condition-config` 或直接描述任务。安装不会授予后台权限，不携带其他人的账号或profile。

从解压包根目录执行，参数替换为独立可信的版本和完整提交：

```text
node strategy-condition-config/scripts/verify-package.mjs . <版本> <完整提交ID>
node strategy-condition-config/scripts/run-tests.mjs
node strategy-condition-config/scripts/doctor.mjs
```

跨平台测试入口自行枚举全部策略与网格测试，不依赖Shell展开 `*.test.mjs`。Windows PowerShell中可核对ZIP：

```powershell
Get-FileHash -Algorithm SHA256 .\strategy-condition-config-v<版本>-offline.zip
```

不要原样执行带尖括号的模板；安装代理应代入实际值。Windows自动安装npm/Playwright仍不受支持；按可信项目说明准备，或使用可用的Codex内置浏览器。离线包不包含Node、CLI、浏览器或内部后台项目。

## 分开报告四种状态

|状态|通过依据|不能替代|
|---|---|---|
|技能文件安装完成|正确目录、版本、文件集合及哈希回读|运行时测试和后台访问|
|离线测试通过|已有Node22+运行跨平台测试入口成功|Windows实机未执行的测试|
|后台适配器就绪|项目依赖及浏览器检查通过|有效登录及业务权限|
|业务配置完成|本期授权、真实写后回读及业务验收|保存受理、离线测试或旧快照|

`doctor` 的 `skill_installed/offline_ready` 检查技能文件与Node版本；`adapter.status` 单独报告后台项目文件状态，缺失不阻止文件安装。需要强制接口路径时仍须满足内部项目条件，否则不得执行接口脚本。版本提醒只在联网时检查，不会自动替换代码；下载失败不能冒充已更新。

## 维护与发布

发布者从已提交的可信ref生成离线包：`python3 scripts/build-offline-package.py --ref <提交或标签> --output-dir <仓库外新目录>`。只读取已提交白名单文件，不打包工作区、个人数据或凭据；构建两次核对ZIP SHA、解压运行校验及测试，再把ZIP和`.sha256`随同正式Release发布。此脚本不自动推送、不登录、不创建Release。
