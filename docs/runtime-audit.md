> 当前功能实现与验收状态以 [2026-11-15 完整更新](function-audit-20261115.md) 为准；下文为架构/先前审查记录。

> 这是实现前的架构审查快照。当前 App、修复和构建状态以 [implementation.md](implementation.md) 与 [release-gates.md](release-gates.md) 为准。

# Python Runtime 架构审查：个人手机连接自己的电脑

审查日期 2026-11-14。只读源码检查，没有修改产品代码、读取用户密钥、启动真实模型调用。结论是代码级证据，非全部平台功能端到端验证。

## 1. 真正的执行主链

1. `server/app.py:651 run_http` 创建 AppRuntime；`:681` 附近构建 FastAPI；AppRuntime.create 在 `server/runtime.py:177` 调用 `create_tool_runtime`。
2. `tools/runtime.py:174` 构建工具注册表、TaskManager、SubAgentManager/Mailbox、MCP、LSP、AutomationManager、scheduler、执行策略和 ToolContext。持久任务 worker_count=1（`:218` 附近）；自动化依赖 tasks，周期任务最终入 TaskManager，并不拥有另一个 Agent 引擎。
3. `server/app.py:515 build_fastapi_app` 创建一个 RuntimeThreadManager，挂到 app.state；数据根取 user_threads_dir/user_tasks_dir。HTTP 模式挂 `/v1/*`，同时兼容 `/legacy/*`。不要把 legacy 的内存 ThreadStore 当成新 App 会话存储。
4. `/v1/threads` → `RuntimeThreadManager.create_thread`（manager.py:668）持久化 ThreadRecord，包括 provider/model/workspace/env_mode/mode/trust/auto_approve 等，发布 thread.started。
5. `/threads/{id}/turns` → manager.py:3878 start_turn → 跨进程线程租约 → `_start_turn_claimed` → workspace/worktree 就绪与阻塞检查 → `_ensure_engine_loaded` → 检查并预留唯一 active turn → EngineHandle SendMessageOp。
6. manager.py:5178 `_build_engine_for_thread` 构建 Engine、Transcript、恢复消息/goal/plugin/path grants，注入 browser service、审批及提权桥，然后启动 engine.run。EngineHandle 用操作队列和事件队列分开 UI 与运行引擎（engine/handle.py:94、130、149、274）。
7. engine/orchestrator/core.py:1964 run 处理消息；工具执行、上下文压缩、模式、子代理均留在 Python。manager.py:5996 `_monitor_turn` 将 EngineEvent 转为 turn/item/usage/tool/approval 状态；`:7533 _emit_event` 写事件日志并广播。

## 2. 共享与隔离

**实例级共享**：Config、provider clients、工具 runtime、MCP 基础连接、TaskManager、自动化 scheduler、BrowserService、事件广播、审批/提权/追问 Future 表。

**会话级状态**：Engine、EngineHandle、消息 transcript、workspace、模式、goal、subagent manager/mailbox、工具路径授权、活跃 turn。

engine/orchestrator/core.py:1368–1410 明确在复用共享 ToolRuntime 时创建 per-engine ToolContext，复制 metadata/file_reads，并新建 subagent manager/mailbox，避免多个 Engine 抢同一个单消费者 mailbox。此隔离应保留，手机仅加客户端不应重构它。

worktree 支持隔离工作区、baseline、checkpoint、合并/发布冲突、恢复令牌。手机不能把代码视图简化成静态 diff；须呈现 publish_pending/publish_blocked 和恢复选择（models.py:244 ResolvePublishRequest 带 recovery_token）。

这些是同一用户多会话隔离，不是多租户隔离。ThreadRecord 没有 user_id/tenant_id，创建会话允许提供电脑 workspace 路径。对个人手机场景可以维持一个账户/电脑权限域，不必现在改造多人 SaaS。

## 3. 一台电脑一个常驻 Runtime，桌面与手机共用

关键设计：手机和 Electron 必须连接同一 Runtime 实例。手机网关不得通过 import/build_fastapi_app 另起一个读取相同目录的 Runtime。

已有跨进程 ThreadLease/ProjectLease 和 Store 文件锁：manager.py:1082 申请线程租约；正在别的 Runtime 运行时拒绝；manager.py:7607 启动恢复获取不到 live lease 就跳过，不会故意抢活跃线程。不能声称现有代码完全没有多进程防护。

但每个实例 event_bus、engine、pending approval Future 都在内存中，不共享。第二个实例不能处理第一个实例的审批；初始磁盘重放之后，SSE 只监听本实例 event_bus（routes.py:57）。因此文件锁安全不等于实时多实例一致性。运行进程常驻、启动去重和桌面退出后的生命周期是上线必要工作。

推荐独立项目里的 Companion Gateway 通过 loopback HTTP 代理现有 Runtime，负责配对设备、远程连接、文件/语音设备能力、撤销与版本兼容。Runtime 保留模型和执行秘密。不要把主 Runtime bearer 直接作为永久通用二维码明文凭据；设备应有独立可撤销授权。

## 4. 双端竞态和断线：具体缺口

### P1：发送缺少幂等键

`server/threads/models.py:260 StartTurnRequest` 没有 client_request_id/idempotency_key；manager.py:3916 左右每次生成新 UUID turn。租约和 `_active_lock` 防止同线程同时执行两个 turn，但无法防止弱网重试在上一轮已经完成后重复执行。应新增持久 request→turn 映射，同键同 payload 返回已有 turn，不同 payload 冲突。若不能更改 Runtime，网关可实现有界持久幂等账本，但需解决网关提交后崩溃且未拿到 turn_id 的不确定窗口；最终最好让 Runtime 在建立 turn 的同一操作内落实。

### P1：审批是单次决策，多端后到者需要对账

`approval.py:61 resolve` 同步检查并 pop Future，没有 await，因此单事件循环下首个决策胜出；第二端 `routes.py:257` 返回 404 approval_not_found，不能误显示“服务坏了”。应刷新 pending 与 turn 状态，展示“已在其他设备处理/已失效”。不能自动重新允许审批；审批完成事件或短时结果查询可改善体验。

### P1：手机后台挂起与恢复不是 SSE 本身能解决

前台事件流 routes.py:57 先订阅后重放，去重复；15 秒 heartbeat，队列落后时回放磁盘；不可恢复发送 stream.resync_required。手机需保存最后已处理游标，恢复后拉最新 snapshot/pending requests，再重新订阅。后台任务继续在电脑运行；不能依赖手机定时器推进 goal/task。

**seq 是整个 RuntimeThreadStore 的全局单调序列**（store.py:549 state.next_seq），日志按 thread 分开。序列间隔也可能来自其他线程或预留后失败，不能把本线程 seq 非连续判成丢包。每线程保存 lastSeenSeq，仅比较大于，不要求+1。

HTTP公开事件路由为每线程 stream，没有在 routes.py 发现全会话全局订阅端点；会话列表、pending审批跨会话通知应补轻量事件汇总或明确轮询策略，避免每个后台会话都开 SSE。

## 5. 存储、恢复与密钥

- `server/threads/store.py:65`：threads/turns/items 为文件记录，events 为每线程 JSONL，transcripts、path_grants、worktree_baselines、rewind_audit 分开保存。原子JSON、FileLease、事件 fsync 与序号预留已有（`:549`），不必为了手机立即换数据库。
- 启动恢复会把已失去进程租约的 QUEUED/IN_PROGRESS turn/item 标为 INTERRUPTED；不会透明重放所有外部副作用。重启后 UI 应明确中断并提供恢复，而不能显示原任务仍在跑。
- 审批/追问等待为进程内 Future（approval.py:36、230、320）；进程退出不能把旧 pending 当新授权。
- `server/auth.py:26` token 来自 CLI/环境/用户 runtime.token 或生成，文件 chmod 0600。`:114` 除 health 外默认守卫所有路由；`:143` 只收 Authorization/X-Deepseek-Runtime-Token，不接受 query token。
- `client/factory.py:62` 通过 SecretsManager 解析 provider key。保持 provider key 在电脑端。手机仅请求可用模型和配置非秘密摘要。
- `config/loader.py:224` 负责用户/项目/环境/CLI/managed 配置合并与项目限制；新项目不能复制 config TOML 与个人 .deepseek 目录作为发布资产。

## 6. 已有 HTTP 能力与 App 需要补的层

已有：会话CRUD/归档/分叉/恢复；turn发送/停止/steer/压缩；goal命令；事件SSE/item懒加载；审批/提权/追问pending与决定；tasks/jobs/subagent查询恢复；worktree环境/比较/冲突/回滚；用量；skills/plugins列表与安装；MCP加载状态；自动化触发和管理；浏览器/CUA帧、控制、人工协助；分享/导入；数据库存/备份/导入导出。

对应实现 `server/routes.py:2330 build_runtime_api_router` 聚合；浏览器等还有独立 route 模块。不应只拿 OpenAPI 某个早期契约当全部实现库存。

需要新增或核实：设备配对/撤销、远程安全连接与重连、电脑在线状态、App前后台推送、消息幂等、手机文件上传到电脑工作区、语音录制/转写、远程安全资产URL、工作区选择服务、模型配置非秘密发现/修改API、能力/协议版本协商。很多本地设置/终端/文件选取原来由 Electron 完成，不能因 Python 有 tools 就认为已提供等价客户端 API。

移动操作需要保留 Agent/Plan/Ask/Goal、工具卡、审批、提权、追问、子代理/任务、worktree冲突、运行中steer/interrupt。浏览器和桌面 CUA 实际作用在电脑，手机显示电脑画面并切换控制，不是操纵手机本机其他 App。

## 7. 新发现：PathGrants 会话隔离缺口（上线前应修复验证）

`engine/orchestrator/core.py:1397` 对共享 runtime.context 做 dataclasses.replace 时只明确替换 metadata、file_reads、subagent_manager 等，没有替换可变的 path_grants（`tools/registry.py:162`）。`server/threads/manager.py:5224` 每个 Engine 随后对这一对象执行 load 并绑定当前线程的 on_change。`tools/path_access.py:103 load` 会清空并重新加载 grants。

先完成 dataclasses.replace 最小验证，随后已完成**实际 RuntimeThreadManager → Engine.create 两会话离线复现**。脚本 `/tmp/deepseek-mobile-audit/reproduce_path_grants.py` 使用临时 DEEPSEEK_HOME、真实共享 ToolRuntime 和两个实际 Engine；模型为禁止调用的 mock，不执行 turn。输出 `/tmp/deepseek-mobile-audit/path-grants-result.json`：两个 ToolContext 不同，但 PathGrants identity 相同；A 授权数从 1 在构建 B 后降为 0；随后从 A 添加的授权被 B 看到，写入 B 的磁盘授权记录而未写入 A；model_calls=0。关闭 Manager/Runtime 后临时状态自动清理。

影响推断：后创建的线程可能覆盖其他线程路径授权和持久化回调，导致错误清空、串授权或写入错误线程授权记录。需要在每 Engine 创建独立 PathGrants，仅向该 Engine 的子代理共享；新增完整双会话权限回归。上文“已有 per-engine context 隔离”不代表其中所有嵌套可变对象都已隔离。

## 8. 现成测试与新增离线验收

现成文件：tests/contract/test_events_sse.py、test_approvals.py、test_thread_store_fault_tolerance.py、test_thread_resume.py、test_thread_environment.py、test_turn_approval_integration.py；tests/workspace/test_project_lease.py；tests/test_task_queue_recovery.py；tests/test_task_approval_bridge.py。

建议新增真实场景而非镜像实现：双端同时发消息只启动一轮；发送成功但响应丢失再重试不重复执行；两端相反审批只接受第一份；不同线程插入seq后仍正确续流；断线期间溢出/压缩触发resync后无重复消息；桌面退出手机连接不中断Runtime；Runtime重启旧审批不可继续批准；撤销设备令牌立即禁止读取/执行；上传取消不遗留可执行半文件。

本审查未跑真实模型。主代理已运行的契约测试结果由主代理统一汇报；源码阅读不能替代真机和商店发布验证。
