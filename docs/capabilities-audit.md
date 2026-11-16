> 当前功能实现与验收状态以 [2026-11-15 完整更新](function-audit-20261115.md) 为准；下文为架构/先前审查记录。

> 这是实现前的架构审查快照。当前 App、修复和构建状态以 [implementation.md](implementation.md) 与 [release-gates.md](release-gates.md) 为准。

# 独立手机 App：产品能力与部署审查

范围：只读源码审查；目标已确认是 iOS/Android 商店 App、个人手机连接自己的电脑、抽出复用现有 Python Runtime。未修改仓库、未调用模型、未读取运行凭据。以下路径相对 `/Users/fjw/Desktop/deepseek-tui-py-main`。

## 决定性结论

1. 不需要为大部分 Agent 能力另造后端：实际 FastAPI routes 比手写 OpenAPI 广泛很多。`contracts/runtime-api.openapi.yaml` 缺 automation/plugin/browser/CUA 等大量实际 HTTP 路由。应从 `build_fastapi_app(... http_mode=True)` 实际挂载的 schema 生成和核验移动协议，再补机器可读缺项；不能仅据手写合同判断功能缺失。
2. 现有产品运行生命周期依附 Electron。`packages/workbench/src/main/index.ts:1383` 在 `window-all-closed` 无条件 `stopDeepseekChild()`；`:1391` before-quit 再次停服务。手机无法在桌面关窗后继续使用。第一优先是独立电脑 Companion 用户级常驻服务，桌面和手机都连它。不能直接把 GUI 换皮称为 App 完成。
3. Runtime 并非无状态云 API。大量数据、MCP 子进程、浏览器 profile、桌面自动化、工作区路径属于同一台电脑和用户。手机只做控制与观察；工作区/凭据/插件执行仍在电脑。对当前个人使用目标无需引入多租户云执行。
4. 电脑服务不能只抽 Python 而丢掉 Electron main 功能：文件、Git、PTY、ASR、市场目录、配置写入、密钥解密和通知有大量 IPC 实现。应盘点迁移到 Companion 的功能，并用明确的能力发现协议让手机知道该电脑有哪些能力。

## 功能矩阵

| 能力 | 真实实现/现有接口 | 手机接入策略与缺口 |
|---|---|---|
| Agent/Ask/Plan/Goal | `server/threads/models.py:94,262-275` 模式字段；`engine/orchestrator/tooling.py:869-935` Ask/Plan 服务端工具约束；`server/routes.py:2052` goal 更新 | 复用服务端策略，不将模式变成 UI 标签；计划确认/追问/审批要可在手机恢复 |
| Durable tasks | `tools/task/manager.py`，`server/routes.py:1608-1696` list/detail/conversation/cancel/resume/files/restore | 任务在电脑继续；手机重连后取快照；不能关闭 UI 等同取消任务 |
| 子代理 | `tools/subagent/manager.py`；`server/routes.py:2014,2024` conversation/resume；`/jobs` 汇总 | 复用子代理消息卡与执行层级；手机不能只展示最终 assistant 文本 |
| 定时自动化 | `server/routes.py:508-644` CRUD、permissions、run/pause/resume/runs/discussion/delivery；`tools/runtime.py:281-312` scheduler | 服务端 API 已有。调度器依赖 tasks=True，运行在 Runtime asyncio loop，不是系统级定时任务；电脑休眠/服务停止不能执行 |
| 自动化补跑/投递 | `tools/automation.py:708` 超过30分钟的 misfire 丢弃；`automation/delivery.py`、pipeline.py | UI 应显示电脑离线、计划错过、投递不明等真实状态；不承诺手机后台可靠执行调度 |
| 飞书/邮件/企业微信 | `server/routes.py:415-506` ingress/test-send；Electron `ipc/register-app-ipc-handlers.ts:1002-1082` 配置/secret | 任务执行和投递可复用 Python；配置与凭据管理需独立 API，并且不要向手机返完整 secret |
| MCP | `server/routes.py:1188-1220` startup/preload-status/servers；legacy apps/mcp/tools；`mcp/manager.py` | Runtime 管理发现和执行；MCP JSON 读写仍在 Electron IPC `:1237-1286`，手机需结构化管理接口/受限操作，不能随意同步桌面 stdio 命令到手机执行 |
| Skills | `server/routes.py:1271` skills 列表；`integrations/skills.py`；Electron `register-app-ipc-handlers.ts:677-940` read/delete/zip-install | 列表可复用；安装/删除/阅读补 Companion API，保留 builtin 禁删/路径防越界等规则 |
| Plugins | `server/routes.py:1331-1600` list/inspect/registry/install/action/delete/marketplaces/update | 多数已有 HTTP，可复用；当前可用动作/权限需遵守 host，不把插件元数据当可信执行授权 |
| 应用市场 | Electron `register-app-ipc-handlers.ts:1409-1416` catalog get/refresh/skill markdown，`services/modelscope-marketplace.ts` | 下载/市场聚合属于 Electron main。要在独立 Companion 提供该逻辑或移动端只查询公开目录、安装落在电脑 |
| 项目记忆 | `state/memory.py:86` 每项目JSON+FileLease，`:150-174` 失效条件校验；`tools/memory.py:21,123,205` 读写与Ask/Plan限制 | Agent工具可直接复用。未见专门 memory HTTP 管理路由；若要手机记忆列表/编辑页面需新增结构化API，不能让手机写电脑JSON |
| 用量 | `server/routes.py:1705` `/v1/usage` 仅 group_by=model scope=session 或 group_by=thread+thread_id；Electron IPC `:1586-1605` 精细账本聚合/删除 | 不要把 runtime usage 当完整首页热力图 API。个人账本图表若要一致，抽出 usage-ledger-service 能力或增加对应 Runtime聚合接口 |
| 会话分享 | `server/share_routes.py:154-279` settings/shares/preview/restore/revoke | 已有 HTTP；独立 share service 是快照分享/恢复，非实时连接中继/同步服务 |
| 浏览器 | `server/browser_routes.py:30-381` status/frame/view/input/action/attach/cookie-sync/install/preferences/workflows/control/artifacts/export；`:390` workbench bridge 注册 | Python 浏览器控制很多已经 HTTP。Electron 内嵌标签页、下载对话框、WebContents bridge 另需电脑 companion；远程 frame/control需设备授权 |
| CUA | `server/routes.py:791-1180` thread/task frame/control/setup/apps/permissions；`cua/setup.py:40` 平台限制 | 手机显示电脑截图并控制电脑；不是手机 OS 自动化。打开系统权限页仍要人在电脑完成，手机端应引导/显示待处理 |
| 工作区/Git/终端 | Electron IPC `register-app-ipc-handlers.ts:1310-1401,1424-1496`；Python已有workspace/status与worktree/restore | Agent读写文件工具可用，不等于手机交互式文件浏览/Git/PTTY API存在。这些交互需从main服务抽出，绝不能暴露任意 shell/path无约束接口 |
| ASR | Electron IPC `:545-573`，`services/asr-transcription-service.ts` | 手机原生录音→授权电脑转写/服务接口；不把服务商 Key打包进App |
| 通知/宠物/外部编辑器 | Electron IPC `:1419-1422,1532-1544,1565-1581` | 系统通知需移动端实现；桌面宠物/打开本机编辑器不机械复制，可映射成电脑动作，或标注仅电脑可用 |

## 数据和配置归属

`config/paths.py:50` 由 `$DEEPSEEK_HOME` 或 `~/.deepseek` 定位。包含 config.toml、threads、tasks、sessions、memories、worktrees、browser、skills、mcp.json、agents/registries、agents/runs、automations、plugins/.host、settings.json、usage.json。不是所有状态都在一个 SQLite 数据库里：

- MemoryStore 使用每项目 JSON + FileLease（`state/memory.py:86,215`）。
- TaskStore 读取 tasks/*.json 与 queue 文件（`tools/task/store.py:196-267`）。
- AgentStore 使用按代理JSON及兼容旧registry（`tools/subagent/store.py:108-139`）。
- 自动化 inbox 与投递配置还有独立 JSONL/TOML（`automation/inbox.py:49-57,277-296`）。

新项目不能随意同时启动第二套独立 Runtime 共享这些目录。迁移需要单一服务所有者、版本兼容、备份与可逆升级，避免双 scheduler、队列或文件状态相互踩踏。

密钥耦合：`packages/workbench/src/main/channel-secrets.ts:1,53-81` 使用 Electron safeStorage 加密/解密 SMTP 密码；`:99` 注入 Runtime环境。`deepseek-process.ts:395-401` 读取 GUI配置 API Key并解密邮件secret后 spawn。独立Python服务如果绕开这条链，邮件投递可能丢失凭据。需要明确迁移到电脑系统 keychain/credential store、一次迁移旧密钥；手机只拿设备凭据，保持模型/邮件秘密在电脑。

## 独立服务与发布缺口

- Runtime CLI `AppServerOptions` 支持独立 HTTP 服务，默认 loopback；不是必须重写，但要拆掉 Electron拥有进程的前提（server/app.py:503-533；deepseek-process.ts）。
- Companion需要可安装的用户级守护、自启动/升级/退出、单实例锁、重启恢复、健康/能力版本、电脑睡眠与离线状态、设备撤销。不要把“桌面关闭窗口”当作手机任务中断信号。
- 桌面发布已有 electron-builder 和平台release脚本、mac签名/公证、R2渠道（`packages/workbench/electron-builder.config.cjs:72-110`），这些并不产出 iOS/Android。此次文件名范围检索未找到 ios/android工程、xcodeproj、gradle、Podfile、React Native/Capacitor原生项目。
- `services/session-shares/compose.yaml` 仅是公开分享服务部署（默认loopback:8787、upload key、volume、restart、healthcheck），不能拿它充当手机远程执行后端。
- 手机联电脑要补配对、加密可达连接、token撤销、连接状态和移动前后台恢复。后台审批/完成提醒需要推送策略；纯SSE无法保证手机进后台仍收到。
- 商店签名、bundle/package ID、隐私声明、截图与审核所需体验、真机和发布账号是独立交付项。当前源码不提供已完成证据，不能宣称已有可上架包。

## 可复用离线测试与新增验收

已有覆盖资产：`tests/contract/test_automations.py`、`test_automation_ingress.py`、`test_plugins_api.py`、`test_cua_status.py`、`test_cua_setup.py`、`test_subagent_mailbox_sse.py`；`tests/test_delivery_journal.py`、`test_durable_resume.py`、`test_subagent_restart_resume.py`、`test_project_memory.py`、`test_memory_lifecycle.py`、`test_workbench_usage_ledger.py`；Electron runtime-lifecycle/config-write/workspace/git/ASR等测试。

本次没有运行这些测试，存在测试文件不是已通过证明。

新增重点：关闭桌面窗口后手机任务继续；单Companion与桌面并发连接；两端审批同一请求只生效一次；断网/SSE重放去重；手机前后台切换；电脑休眠恢复与自动化misfire显示；密钥迁移与设备撤销；上传/下载/远程文件权限；跨Runtime/App版本兼容；CI产出可安装原生包与真机验证。均可先用脚本化provider和fixture完成，不需要个人付费模型批跑。
