# BoardUI AI Chat 移动端调查与项目兼容方案

调查日期：2026-11-14。目标：[组件说明](https://www.boardui.com/zh-hans/components/ai-chat)、[实际模板](https://www.boardui.com/zh-hans/templates/ai-chat)。

## 结论与交付边界

目标是响应式 React 网页模板，当前证据没有显示独立 iOS/Android 应用。手机与桌面共享组件，靠断点改变布局。可以参考它的视觉、状态切换和信息组织，把当前项目的真实 Agent 能力接进去。

**本目录保存的是公开页面已交付的 JavaScript/CSS、可读格式化代码、运行截图和分析证据，不是原始完整 TSX 工程，也不是已经可构建的手机 App。** 没有取得服务端源码、原始项目配置、完整源文件命名或所有延迟加载分支。模板公开提示通过 Pro 和 CLI 获取完整源代码；没有访问付费源代码下载接口。三个核心 bundle 未声明 sourceMappingURL，原始类型、注释和模块路径未恢复。部署资产本身不能当作拥有完整原始源码或再分发授权的证明。

默认聊天是演示：预设消息、定时推进任务、固定上下文比例。模板并没有替用户实现模型调用、真实上传、ASR、Git 或浏览器执行。尤其默认 `GlassComposer` 未传 `onSubmit`，点击发送没有形成会话消息；语音仅翻转本地布尔状态并显示波形。

## 目录与代码入口

- `evidence/assets/`：首次加载记录 88 份脚本/样式，其中 87 份保留字节通过 SHA-256 校验；一个站点辅助 script.js 因同名碰撞未保留，manifest 明确标记 unavailable。之后重新获取的内容已变化，单独记录，不冒充原始采集。核心聊天代码全部保留。包括页面公共依赖，不全是聊天专用代码。
- `evidence/template.html`：公开模板 HTML；`mobile-dom.html`：浏览器加载后的 DOM。
- `readable/ai-chat.js` ← `2gm4k41lqf1pe.js`：AiChatShell、AiChatSidebar、AiChatGalleryPanel 等。
- `readable/chat-and-code.js` ← `2x-mkcjonn738.js`：AiChatContainer、对话场景、AgentProgress、AiChatCodePanel。
- `readable/chat-layout.js` ← `3ea1g8xhtvg04.js`：Composer、GlassComposer、StatusBar、AddMenu、ModelMenu、ProjectFolderMenu。
- `readable/settings.js` ← `2ulhcatv1asnj.js`：SettingsModal 与通用、资料、存储、工具设置。
- 其他 `readable/` 文件是辅助组件/站点共用代码，名称是调查时的分析标签，不是作者原始文件名。
- `evidence/*.png`、`*.yaml`：390×844 手机模拟下截图、可访问树；`interaction-log.json` 记录操作成功与失败，点击成功不等于业务实现。
- `evidence/rea-bundle.json.gz`：压缩保存的 REA 证据包，解压后可导入；`scripts/`：本次采集脚本，使用本机 Playwright 安装路径。脚本含网络浏览操作，应在开发环境运行，不能作为产品代码。文件名碰撞问题已在采集脚本修正。

可读代码是对浏览器 bundle 的格式化，保留其真实逻辑与模块数字 ID，没有伪造原始变量名。组件依赖通过 Turbopack 的 `e.i(...)` 解析，不能直接把单个文件作为 React 源文件导入。

## 移动布局和状态

| 项目 | 代码观察 | 迁移含义 |
|---|---|---|
| 根布局 | `h-dvh`，外边距 12px，flex/overflow-hidden | 主聊天区域占剩余高度；软键盘与安全区仍需真机验证 |
| 导航抽屉 | 小于 lg 时，260px 导航，主区域横移 272px，圆角变成 32px | 是侧移揭露式导航，非简单覆盖菜单 |
| 导航动画 | 325ms，缓动 `[0.42,0,0.58,1]`，侧栏缩放 .94→1 | 可直接作为交互规格 |
| 桌面侧栏 | lg 起常驻，手机以按钮打开 | 使用同一份导航数据 |
| 代码面板 | xl 以下以右侧抽屉显示，宽 `min(410px,100%-12px)`，遮罩 black/40 | 手机代码与聊天分层显示 |
| 桌面代码面板 | 默认 410px，可拖到 320–560px | 手机不需要桌面拖动分栏 |
| 抽屉互斥 | 开导航先关闭代码；开代码先关闭导航 | 保存两个布尔状态并约束互斥，或统一 overlay 状态 |
| 聊天区 | 可纵向滚动，消息靠底，演示增加内容后 smooth scroll | 真流式下须尊重用户主动上翻 |
| 输入器 | 52px 高，单行 input，圆角胶囊，附件/模型/麦克风/发送 | 并非多行长文本或图片附件编辑器 |
| 弹层 | 顶部弹出，附件最大宽 `100vw-32px` | 小屏不应固定桌面宽度 |
| 无障碍 | aria-label、aria-hidden、pressed、expanded、dialog、键盘快捷键 | 仍需验证抽屉焦点限制、返回键、读屏 |

lg/xl 是实际代码里的 Tailwind 断点名；数值须以保存的 CSS 定义为准，不能只凭框架默认值断言。

## 功能矩阵

证据等级：**运行+代码**＝浏览器观察并核查处理逻辑；**代码**＝已定位处理逻辑，未逐条完成端到端测试；**展示**＝硬编码、空处理或占位，不代表业务存在。

| 功能 | 实现与限制 | 证据 |
|---|---|---|
| 打开/关闭导航、遮罩关闭 | 本地状态与动画 | 运行+代码；ai-chat.js:566 |
| 仓库树展开/折叠 | 单组本地状态，搜索时强制展开 | 代码；ai-chat.js:947 |
| 快速搜索 | 搜索仓库名、会话标题和菜单标签；Ctrl/Cmd+L；不是消息全文搜索 | 代码；ai-chat.js:1014 |
| 最近会话切换 | 仅 landing-page-design、image-generation、coding-scenario 三个 ID 切换场景 | 代码；ai-chat.js:603 |
| 新智能体/自动化/定制/支持 | `href="#"`，没有对应工作流 | 展示；ai-chat.js:857 |
| 设置 | 打开共用 SettingsModal，详见下表 | 代码；ai-chat.js:1253 |
| 浅色/深色 | 调用站点 ThemeToggle | 代码；ai-chat.js:1238 |
| 账户/团队/套餐/升级 | 示例身份与按钮，不证明认证/订阅 | 展示 |
| 项目面包屑 | 显示固定项目与当前示例场景 | 运行+代码 |
| 分享、更多 | button 没有 onClick | 运行+代码；chat-and-code.js:2080 |
| 用户/助手消息 | 预设数组逐段显示，有动画、代码与演示内容 | 代码；chat-and-code.js:1931 |
| 编码任务进度 | 5 步演示；默认每步 3000ms，完成后延迟 1000ms 回调 | 运行+代码；chat-and-code.js:429 |
| 任务收起/展开 | 本地状态控制高度；非中止任务 | 代码；chat-and-code.js:531 |
| 思考计时/加载/玻璃输入器 | 演示任务状态驱动效果 | 运行+代码 |
| 模型菜单 | 四个硬编码标签；切换本地选中值 | 运行+代码；chat-layout.js:1294 |
| 推理力度 | Low/Medium/Balanced/High/Very High/Max，数字本地状态 | 运行+代码；chat-layout.js:636 |
| 输入/Enter/发送 | Composer 支持可选回调，但默认模板未接线；点击后文本仍在 input | 运行+代码；chat-layout.js:259、513 |
| 附件菜单 | 文件/文件夹、Goal、Plan mode、Documents、Spreadsheets、Presentations、Code blocks | 运行+代码；chat-layout.js:1100 |
| 附件/插件动作 | 共用 onSelect 只关闭菜单，没有上传或插件执行 | 代码；chat-layout.js:1230 |
| 麦克风 | pressed 状态+波形，无录音/转写接入 | 运行+代码；chat-layout.js:326 |
| 工作目录选择 | 三个示例目录，仅更新本地标签 | 运行+代码；chat-layout.js:1355 |
| 分支 Main、模式 Agent | 状态栏展示按钮，无切换实现 | 运行+代码；chat-layout.js:423 |
| 上下文 57% | 常量 | 运行+代码；chat-layout.js:449 |
| 代码抽屉 | 打开/关闭有效 | 运行+代码；ai-chat.js:642 |
| Changes/Browser | 本地 tab 切换 | 运行+代码；chat-and-code.js:994 |
| 变更计数/代码 | 固定 12 条、+156/-23 与示例文件；不是实际 Git diff | 运行+代码 |
| Browser preview | 仅一个占位 div，无浏览器执行 | 运行+代码；chat-and-code.js:976 |
| 终端/展开/切换面板 | 通用按钮未绑定业务处理 | 代码；chat-and-code.js:962 |
| 撤销变更 | 示例控件，不应解释成真实文件回滚 | 代码；chat-and-code.js 的变更区域 |
| 好评/差评 | 可选 toast 回调，无反馈持久化 | 代码；chat-and-code.js:1186 |
| 复制回复 | 通用反馈组件只切换 Copied 提示，没有剪贴板写入 | 代码；chat-and-code.js:1217；其他复制控件需单独检查 |
| 图像生成场景 | 预设提示、进度、结果图；shell 延时 900ms 注入固定图库条目 | 代码；ai-chat.js:581，chat-and-code.js:1497 |
| 图库 | 网格、选中/收藏本地状态；不是图像模型接口 | 代码；ai-chat.js:313 |
| 页面语言和 Pro 浮层 | BoardUI 网站功能，不属于你的 Agent 核心需求 | 运行观察 |

### 设置对话框的附属功能

`settings.js` 包含较多共用设置代码，不能把同 bundle 所有组件都算成此模板当前可达功能。

| 页面/入口 | 已确认代码行为 | 未证明的业务 |
|---|---|---|
| General | 套餐/限额、review provider、PR destination、4 个通知/声音开关 | 订阅、系统通知授权、真正 GitHub 集成 |
| Profile | 邮箱、姓名、生日选择器、账户/公开资料、设备 ID、保存反馈 | 用户资料服务端保存、退出其他设备 |
| Storage | 示例文件数组、筛选/搜索/排序/分页/选择、文件菜单和本地状态 | 云端真实文件服务、持久化删除/上传 |
| Tools | 示例 workspace/MCP server 列表、认证等待开关与服务器展开 | 真正启动 MCP、OAuth、远程工具执行 |
| Marketplace | 仅传入对应外部内容 prop 时显示；AI Chat 未传 | 不应列为本模板已实现市场 |
| Appearance/Billing/Rules/Desktop/Plugins/Developer/Skills/Git | 导航项没有 page 字段，点击处理未接 | 独立设置业务页面 |

## 与当前项目的兼容设计（建议，不是 BoardUI 原实现）

工作假设：手机作为当前 Python Runtime 的远程客户端，实际代码、文件、终端、Git 和电脑操作仍在电脑/服务器执行。若目标是纯手机离线运行或多人云服务，部署边界需要另行设计。

```text
手机界面（借鉴 BoardUI 布局）
  ├─ 会话抽屉 / 聊天 / 模型配置 / 代码结果抽屉
  ├─ approval / elevation / user_input / subagent 卡片
  └─ 移动传输与设备适配（新增）
       ├─ HTTPS 请求 + 带 Authorization 的 SSE fetch 流
       ├─ 文件上传 / 录音 / 安全凭据 / 前后台恢复
       └─ Python Runtime（复用）→ Provider / Tools / Workspace

桌面 Electron（保留）→ dsGui IPC → 同一 Runtime 契约
```

| 需要接的能力 | 现有实现位置（相对仓库根目录） | 处理建议 |
|---|---|---|
| 会话 CRUD、分叉、归档 | `contracts/runtime-api.openapi.yaml`；`agent/types.ts` 的 AgentProvider | 复用契约，移动导航不依赖示例仓库数组 |
| 发消息/模型/力度 | `packages/workbench/src/renderer/src/agent/deepseek-runtime.ts:1352`；`src/deepseek_tui/server/threads/models.py:260` | 用真实 provider/model ID，删除演示模型标签映射假设 |
| 停止/追加指令 | OpenAPI interrupt、steer | 真正取消与进度折叠必须分开 |
| 消息类型 | `packages/workbench/src/renderer/src/agent/types.ts:171` ChatBlock | 保留 reasoning/tool/approval/elevation/user_input/subagent/evolution，不能降为 role/content |
| 流式与恢复 | `src/deepseek_tui/server/routes.py:691`；`server/threads/store.py:604` | since_seq 重放、按 seq 去重；resync_required 后拉快照 |
| 当前传输依赖 | `deepseek-runtime.ts:827,1821,2391`；`src/main/index.ts:856,1246` | 抽出 request/startStream/settings 最小依赖，桌面 IPC 与移动 HTTP 分别实现 |
| 附件 | `components/chat/FloatingComposer.tsx:1250,1307` | 现有附件使用电脑路径 mention；新增上传→Runtime 可访问文件/资产，不传手机路径 |
| 语音 | `src/main/services/asr-transcription-service.ts:64` | Electron main 实现不能直接搬手机；新增录音与转写通道 |
| 鉴权 | `src/deepseek_tui/server/auth.py:114` | 当前单 bearer；设备配对、安全保存、撤销与 HTTPS 需补设计 |
| CORS | `src/deepseek_tui/server/app.py:69` | 按客户端部署限定 origin；不要把 token 放 URL |
| 分享 | `server/share_routes.py`、`server/share_service.py` | 分享/导入不等于实时多端同步 |
| 终端/工作区/浏览器 | Electron main services 与 Python 工具 | 手机呈现远程结果、发起动作和审批；不假设手机具备桌面执行环境 |

原生 EventSource 无法直接设置自定义 bearer header，Web 客户端应使用支持 header 的 fetch 流或受控代理。现有 Runtime 单 token 不构成多租户体系；若做公开多人 App，需要身份、会话归属和工作区隔离。

建议先在现有 React 技术栈内做移动布局与传输适配，待真机验证后决定 PWA/原生壳。当前报告不把某个壳框架选型当成既定决定。

## 实施顺序与验收

1. 移动交互：导航、消息区、输入区、结果抽屉；用本地 fixture 事件验证。宽度 320/390/430/768，长代码无页面级横向溢出。
2. 接真实 Runtime：列表→创建→发送→流式→停止→审批→追问→恢复。使用现有测试与假 provider，不消耗个人模型账户。
3. 真机连接：设备配对、断网、切后台、重新连接、seq 去重、resync、键盘和安全区。
4. 附件与语音：真正上传、取消、大小限制、资产引用、权限与转写失败处理。
5. 再补远程代码/变更/浏览器结果。演示的计数和定时器必须全部换成 Runtime 事实。

重点复用测试：`tests/contract/test_threads_crud.py`、`test_app_server_auth.py`、`test_approval_lifecycle.py`、`test_turn_user_input_integration.py`、`test_session_hydration.py` 与前端 `deepseek-runtime.test.ts`。本次仅调查与采集，未修改产品代码，未运行模型评测。

## REA 证据与覆盖限制

- 浏览器发现：`ev_cfccf1dd8dbc4f5e302762873c3c93f2372a426227fe5d0c03fa6021da63b566`。
- 页面观察：`ev_45395f5551953d2beeec249137b957155899fce24150811ed420c2aa1ff112f5`。
- 三个核心 bundle 静态分析：`ev_af6ec38f09777209c37fa32dc0b4e4df59e645143ff94d57c5de207e6aca34fc`；3 文件、111179 字节、0 解析失败。REA 未完整恢复 Turbopack 模块语义，4653 个语义未知项仍存在，不能把扫描完成当作全部逻辑还原。
- 首次 REA controlled scenario 返回 cleanup_incomplete，错误响应过大，已保留在证据包；不能把它当成功的端到端采集。后续独立浏览器采集与 REA passive inspection 成功。
- 第一轮交互因“关闭代码”同时匹配遮罩与按钮而失败；修正为精确选择后重跑。最新 interaction-log 中 Pro 提示关闭超时是提示未再显示，其余 14 项操作成功。运行点击不能单独证明任何后台能力。
- 手机验证是桌面 Chrome 的移动视口/触摸模拟，不是 iOS/Android 真机；未验证软键盘、系统返回、后台挂起和通知。
- 设置、图库与子菜单的完整运行覆盖仍需看 exploration-log；未成功的操作只按静态代码判断。本报告不是“所有功能均已验证”的完成声明。

下一阶段可以基于这些证据独立实现可维护的移动界面，并连接现有 Runtime。若要求逐文件的原始 TSX、原作者目录和完整构建工程，需要取得官方完整源码后再做兼容，不能从压缩后的页面资源中保证无损恢复。
