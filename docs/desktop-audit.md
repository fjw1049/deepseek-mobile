> 当前功能实现与验收状态以 [2026-11-15 完整更新](function-audit-20261115.md) 为准；下文为架构/先前审查记录。

> 这是实现前的架构审查快照。当前 App、修复和构建状态以 [implementation.md](implementation.md) 与 [release-gates.md](release-gates.md) 为准。

# Electron/React 架构审查：独立手机客户端

范围：2026-11-14，只读源码审查；目标 iOS/Android 商店 App，个人手机连接自己的电脑，复用 Python Runtime。没有调用模型，没有修改原仓库。以下路径相对 `/Users/fjw/Desktop/deepseek-tui-py-main`。这不是全仓逐行审计，结论覆盖实际查看的入口、传输、状态、宿主能力与相关路由。

## 真实架构

React 组件 → Zustand chat-store → DeepseekRuntimeProvider → `window.dsGui` → Electron preload IPC → main HTTP/SSE → Python Runtime。

但文件、Git、终端、ASR、配置、用量账本、市场目录、操作系统对话框等有第二条链：React → dsGui → Electron main 本机服务，完全不经过 Python HTTP。把 UI 换成手机无法自动取得这些能力。

核心依据：
- `src/preload/index.ts:1-250`（下文此处前缀为 packages/workbench/）暴露 dsGui。
- `src/shared/ds-gui-api.ts` 是宿主 API 合约。
- `src/renderer/src/agent/types.ts:171,438,487` 定义 ChatBlock、ThreadEventSink、AgentProvider。
- `src/renderer/src/agent/deepseek-runtime.ts:827-2428` 做会话/消息归一化与 SSE 映射，仍强依赖 dsGui。
- `src/renderer/src/store/chat-store.ts:1859,1908` 明确缺少 preload 即报错；不能整个照搬。
- `src/main/index.ts:856` 实际 JSON HTTP client，自动 ensureRuntime、附 bearer、不同超时与设置重试。
- `src/main/index.ts:1226` 实际 SSE client，将帧发回 renderer，而不是浏览器直接连服务器。
- `src/main/ipc/register-app-ipc-handlers.ts:538-1480+` 本机能力集中注册。

## 最高优先级结论

### 1. Runtime 生命周期必须独立于窗口

`src/main/deepseek-process.ts:358` 启动 Python 子进程，`:370` 固定 `--host 127.0.0.1`。`src/main/settings-store.ts:460` 固定 loopback base URL。`src/main/index.ts:1383` window-all-closed 调用 stopDeepseekChild，macOS 也先停；`:1391` before-quit 同样停止。

因此“关桌面窗口仍能在手机继续任务”现在不成立。应由独立电脑常驻进程管理 Runtime，Electron 与手机均为客户端。已有 `runtime-lifecycle.ts` 是串行启动/重启队列，不等于操作系统常驻服务。

### 2. AppSettings 不能原样远程暴露

`src/main/ipc/register-app-ipc-handlers.ts:538` settings:get 返回 store.load()；`src/shared/app-settings.ts:80` DeepseekSettingsV1 包含 apiKey/runtimeToken；其他 provider/ASR/search 设置也含 apiKey。`src/main/settings-store.ts:367,416` 读写本地 JSON。

移动 API 必须拆成无秘密的模型目录、能力清单、会话策略、偏好设置。电脑保留模型密钥；手机只持有可撤销设备凭据。不要通过 settings:get 导出整份配置，也不要使用现有任意 config 文本写入 IPC 作为远程管理 API。

### 3. 多客户端审批不能各自自动裁决

`deepseek-runtime.ts:588` 从 GUI approvalPolicy 派生 auto_approve/trust_mode；`:1368` 发 turn 时读取它；`:2286-2315` 收 approval.required 后 GUI 依据 settings 自动允许/拒绝；`:2323-2346` elevation 同样。

手机和桌面同时连接时，各端设置可能不同。手机应显示 Runtime 的有效策略，提交带稳定 ID 的决定；策略与第一有效决策由电脑 Runtime 裁定。直接复制 renderer 自动回复逻辑会让 UI 偏好变成执行权限来源。

### 4. 预览 URL、终端 owner 都是桌面本机对象

`workspace-preview-server.ts:90` 严格 Host=127.0.0.1:port；`:156` 只监听 loopback；`:237` 返回 localhost URL。手机中的 localhost 是手机，不能直接打开。需授权资产/预览路由或受控隧道，保留现有 realpath/路径越界/隐藏文件检查，不把整个工作区公开。

`terminal-service.ts:85,122,180` PTY 关联 BrowserWindow/webContents 并发送 IPC。需要电脑侧独立 terminal session owner，手机 resize/input/output/exit 通道；断开订阅与杀进程必须分开。

## 能力归属与兼容矩阵

| 能力 | 当前执行位置与依据 | HTTP 是否可直接复用 | App/电脑服务工作 |
|---|---|---|---|
| 会话/消息/模式/模型/停止/追加 | Python；AgentProvider methods | 是，核心 /v1/threads、turns、interrupt、steer | 提取 transport-free 归一化逻辑，新增手机传输 |
| 流式事件 | main/index.ts:1226 → deepseek-runtime.ts:1726 | Python 已有 events | fetch stream bearer、seq 去重、resync、前后台恢复；不能持久化 IPC streamId 当服务端资源 |
| 工具/审批/追问/子代理/Goal | ChatBlock union 与 ThreadEventSink | 核心 API 可复用 | 原有事件分支不能降级为 role/content；审批策略统一到 Runtime |
| 文件浏览/读写/搜索 | main/services/workspace-service.ts:864,908,963；IPC :1446+ | 当前这些 GUI 行为走 IPC，非通用 HTTP 文件接口 | 新电脑工作区服务，受限 workspace ID + relative path；并发写版本/冲突处理 |
| 图片/附件 | FloatingComposer.tsx:1316,1326，writePasteImageFile 写电脑路径；:1447 buildOutboundMessage | sendUserMessage 只传 prompt | 手机选文件/拍照→上传→电脑资产引用；不可把手机路径 @mention 发给电脑 |
| Git 分支/diff/stage/commit/pull/push | git-service.ts:305,706,820,912,1305,1087,1117；IPC :1310+ | GUI Git 操作没有同等通用 HTTP | 电脑服务复用 Git 语义；写动作明确审批、并发与失败，不经聊天模拟 |
| 终端 | terminal-service.ts:65，node-pty | GUI PTY 为 IPC | 电脑持有 PTY；手机仅终端控制视图，独立流式会话 |
| HTML/图片/文档预览 | workspace-preview-server.ts | 已有本机 HTTP，不能远程直用 | 资产 ID/授权 URL、远程路径重写、移动格式展示 |
| 浏览器自动化 | Python browser/service.py:604；browser_routes.py | 是 /browser/state、frame、view、input、action、control 等 | 优先用已有截图/输入协议；区分手机内浏览与电脑 Agent 浏览 |
| Electron 浏览器桥 | main/services/browser-bridge.ts:42；main/index.ts:962 | 是私有 loopback CDP bridge，不应直暴露 | 桌面活跃时可复用；独立服务使用 Python 私有浏览器回退 |
| CUA 控制/截图 | Python server/routes.py:791/802/821；Electron cua-window-preview.ts:126 本机窗口/权限 | Python 已有状态/控制/frame；本机权限操作仍电脑专属 | 手机看截图/接管；系统屏幕录制授权在电脑完成，不能手机绕过 |
| ASR | main/services/asr-transcription-service.ts:64 发 multipart 上游；IPC :545 | 当前未有等价手机 HTTP | 手机录音→电脑转写→文本；密钥不下发手机 |
| 模型目录/探测 | preload:34；IPC :579,581,1166 | GUI 目录/探测经 main | 独立无密钥目录接口，模型 ID 与 display name 分离 |
| MCP/Skills/Plugins | Python routes.py:788、1268；另有 main skill/config/marketplace 管理 | 部分已有，安装/原始配置编辑等有 IPC 分支 | 逐操作映射；不把修改本机配置文本的任意能力下放 |
| 自动化与频道 | Python routes.py:508-633；main 设置管理/密钥 | CRUD/run/pause/resume/history 等已有 | 手机管理任务可复用；频道密钥仍电脑保管 |
| 用量与热力图 | main/services/usage-ledger-service.ts；preload queryUsage | GUI queryUsage 经 IPC，Python 另有账本实现 | 选择唯一权威账本/时区聚合协议，不复制本地数据库到手机 |
| 桌面完成通知 | chat-store.ts:303 → dsGui.showTurnCompleteNotification → main/index.ts:286 | 无移动后台通知链 | 电脑侧事件观察→推送或手机重连恢复；不可依赖手机前台 SSE 触发通知 |
| 设置/偏好 | settings-store JSON + renderer localStorage | 无统一跨端配置协议 | 模型/安全/执行策略归电脑；主题/草稿/布局归设备；哪些跨端同步显式定义 |
| 桌面宠物/窗口材质/快捷键/打开编辑器 | Electron 本机 | 不适用手机直接复用 | 手机重新交互设计，按能力显示而非虚假按钮 |

## 浏览器与 CUA 补充

Python browser_routes.py:71/79/88/98 提供 frame/view/input/action；控制动作带 generation 防陈旧控制。browser/service.py:634 尝试附着 Workbench，:698 为 WorkbenchBrowserSession，:716 失败回退私有浏览器，:676 可 headless。因此不必为手机重做全部浏览器自动化，也不应让手机接触 Electron 的 CDP token。

Electron browser-bridge.ts:42 明确只接受本应用 webview guest，按 tab 限制 debugger 目标并用每次启动 token；这组设计是本机安全边界，不应简单代理任意 CDP 到手机。

CUA 的“查看”与“真实触屏操控”不是同一件事，现有状态/frame/control API 能支撑观测和授权接管，不足以证明完整手机远程桌面 UI 已存在。

## 数据归属

- Python thread/items/events 是会话事实源。
- renderer 的视图、草稿、模型偏好、pinned threads、环境偏好存在 localStorage：`store/chat-pane-sessions.ts:43`、`chat-store-helpers.ts:133`、`chat-layout-store.ts:39` 等。手机不会自动得到桌面置顶/草稿/分屏信息。
- GUI 配置 JSON 除偏好还含执行/凭据配置，不可整个同步。
- 手机新项目应有自己的本地缓存，缓存不成为执行事实源；每个请求必须明确连接的 computer ID、thread ID、workspace ID。

## 建议落地边界

独立新项目可包含 mobile 客户端、协议包、电脑 companion 服务；Python Runtime 以版本固定的外部依赖/构建产物复用，避免整仓拷贝或让 mobile import 旧仓绝对路径。

Companion 不要做 `invoke(anyIpcName,payload)`；按能力暴露明确接口，先覆盖配对、能力清单、Runtime 传输、上传/资产，再补文件/Git/终端/ASR。现有 Electron-only 实现可逐项提炼或重新实现于电脑 companion，保持契约测试。长远最好避免同时产生 Node 与 Python 两套同名文件/Git事实源。

首个验收闭环：退出桌面窗口→手机仍能连接→创建并发消息→后台返回恢复→远程审批→停止→查看结果；全部用 fake provider/录制事件离线验证，不用个人模型批跑。

现有可借鉴测试（本次未运行）：
- main/runtime-lifecycle.test.ts
- main/services/workspace-service.test.ts、workspace-preview-server.test.ts
- main/services/git-service.integration.test.ts、git-file-diff.test.ts
- main/services/terminal-service.test.ts
- main/services/browser-bridge.test.ts、cua-window-preview.test.ts
- main/ipc/app-ipc-schemas.test.ts、config-write.test.ts
- renderer/src/agent/deepseek-runtime.test.ts
- renderer/src/store/chat-store-goal-resync.test.ts、chat-store-decisions.test.ts、chat-store-rewind-resend.test.ts

未核实：所有 mobile OS 后台策略、商店审核、原生壳选型、私网连接基础设施和签名账号。这些属于部署与真机验证，不应由桌面源码推断已满足。
