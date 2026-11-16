> 这是实现前的架构审查快照。当前 App、修复和构建状态以 [implementation.md](implementation.md) 与 [release-gates.md](release-gates.md) 为准。

# 独立手机 App 的架构决策

2026-11-14；基线 `b6e6b48dee40818610e63da1e39e46b72a2f335d`。

## 已确定的产品范围

用户已确认：iOS 和 Android 商店 App；先供自己使用；手机远程连接自己的电脑；抽出并复用 Python Runtime；接受 Tailscale。新项目独立维护。BoardUI 提供视觉/交互参考，业务兼容由本项目实现。

## 现有系统的准确模型

当前有两条真实调用链：

1. Agent：React → Zustand chat-store → AgentProvider/事件适配 → dsGui IPC → Electron HTTP/SSE → Python AppRuntime → RuntimeThreadManager → Engine → ToolRuntime → 文件/命令/浏览器/MCP/子代理。
2. 电脑功能：React → dsGui IPC → Electron main → Git、PTY、工作区文件、预览服务、ASR、设置、系统密钥、渠道连接、通知。这些功能并不全经过 Python。

Python 管理的核心数据是 Thread、Turn、Item、Event、Goal、Task、Subagent、Approval、UserInput、Workspace/Worktree、Automation、Plugin/Skill/MCP 和 ProjectMemory。会话/条目 JSON 与事件 JSONL、其他子系统文件存储共同组成状态，不是一个统一数据库。

同一个 ToolRuntime 共享调度/基础连接，各 Engine 有会话状态。现有 ThreadLease/ProjectLease、原子写与文件锁应保留。多进程磁盘保护不等于多实例实时协同，因为审批 Future、event_bus、engine 位于进程内。

实际 HTTP 模式生成 164 个路径，其中 132 个 /v1 路径。手写 OpenAPI 总计 40 个路径，94 个实际 /v1 路径不在手写文档中。generated schema 来自禁用外部集成的隔离构造，没有启动真实模型；动态 `Request.json()` 的请求体仍缺完整类型，不能直接认为生成 schema 已描述所有协议语义。

## 目标部署

```text
iOS App / Android App
  本地打包的界面 + 原生生命周期/密钥/文件/录音/通知适配
                    │
            Tailscale 私有网络 + HTTPS
                    │
电脑 Companion（唯一服务所有者，用户级常驻）
  设备配对、独立令牌、撤销、能力/版本、请求校验、事件汇总
        ├── loopback HTTP/SSE → 单个 Python Runtime
        └── 电脑能力模块 → 文件/资产/Git/PTY/ASR/安全设置
                    │
     现有工作区、模型配置、MCP/Skills/Plugins、任务与自动化

Electron 桌面客户端 ──→ 同一个 Runtime / 电脑能力模块
```

Companion 是一个部署单元，可以包含网关与受控子进程，不要求为了形式把所有实现改成一种语言。优先复用 Python 执行内核和现有 Node 文件/Git/PTY 逻辑，抽掉 BrowserWindow/webContents 耦合。网络只开放明确的业务能力，内部主 Runtime token 留在电脑。

### 服务归属和数据兼容

- 从现有 Runtime 的可发布 Python 包构建固定版本依赖，记录源 commit、包哈希和依赖锁；不要把源码目录复制到手机工程形成不可追踪的第二份内核。
- 电脑 Companion 接管单实例锁、启动、退出、重启、日志与版本升级。先在独立测试数据目录验证，不自动迁移用户现有数据。
- Electron 只停止自己拥有的进程；连接外部 Companion 时不能因关窗、退出或改设置终止服务。现有 stopDeepseekChild 只杀本进程 child，但完整 settings restart/端口抢占路径仍须一起调整和测试。
- 保留现有数据布局。个人使用没有证据要求现在迁 PostgreSQL/Redis；新增设备授权和幂等账本可独立持久化。
- GUI 设置、用户 config.toml、环境变量和 safeStorage 密钥要做字段级迁移清单。SMTP 密码目前由 Electron 解密并注入 Python，独立服务必须有可逆迁移方案。
- 手机缓存是派生视图；Runtime 为会话/任务/审批事实来源。草稿允许离线保存，但恢复连接不自动执行草稿。

### 远程连接与设备身份

- Tailscale 提供网络可达性，Companion 的设备授权负责本应用权限，两者分开。
- 建议 Tailscale Serve 给 loopback Companion 提供 tailnet 内 HTTPS；不启用公开 Funnel，不直接把 7878 暴露到公网。
- 配对票据短时、一次性，电脑显式展示/确认，兑换成可逐设备撤销的随机凭据。二维码不包含永久主 Runtime token。
- 凭据保存在 iOS Keychain / Android Keystore 支持的安全存储；普通 Preferences/localStorage 只保存非秘密界面偏好。
- 模型、SMTP、MCP OAuth 等执行秘密留在电脑；手机读取无秘密的模型目录和配置状态，修改秘密使用专门写入流程。
- 电脑睡眠、离线、服务升级、手机未连 tailnet 显示为不同连接状态。任务只有电脑运行时才可执行，自动化错过触发不伪装已完成。

### 消息与多客户端一致性

- 使用 snapshot + latest_seq + SSE。先拉 ThreadDetail，再从 latest_seq 订阅；重连执行去重，`stream.resync_required` 后重新取快照。
- seq 在 Runtime 全局递增，某个线程出现 100→104 合法，不能当作丢失3条消息。
- 手机后台不保持虚假的在线状态；恢复前台刷新快照、pending approvals、pending user inputs 和活跃 turn。继续执行是电脑职责。
- 当前发送 turn 缺持久幂等键。必须补 client_request_id → turn 的原子对应关系：相同请求返回同一结果，不同内容复用同键返回冲突。网关简单重试无法消除“电脑已执行但响应丢失”的窗口。
- 审批首个有效决定生效；第二端的 stale/404 重新查询后显示已处理。手机不得照搬桌面收到事件后按本地设置自动允许的逻辑。
- 原始逐线程 SSE 不够完成全局活动/通知；新增电脑端活动汇总，前台列表可低频刷新，后台提醒需要独立推送方案。APNs/FCM 的配置与凭据是后续交付，未实现时明确仅前台/重连可见。

## 手机产品逻辑

主导航按手机任务划分：**对话、活动、工作区、设备/设置**。对话页采用 BoardUI 的侧移会话抽屉、主消息列和结果抽屉，但状态全部来自实际协议。

| 页面/流程 | 必须包含的真实行为 |
|---|---|
| 首次使用 | 电脑在线检查、Tailscale连接说明、配对、能力版本检查、重连与撤销 |
| 会话 | 项目选择、新建、搜索、重命名、归档、分叉、历史、分享/导入 |
| 输入 | Agent/Plan/Ask/Goal、真实provider/model/effort、文件/图片/语音、运行中steer、停止 |
| 消息 | 正文、推理、代码、工具状态、错误、任务、子代理、用量；避免丢弃未知事件 |
| 需要处理 | 工具审批、提权、结构化追问、计划确认、浏览器人工协助、worktree冲突 |
| 活动 | Goal、tasks、subagents、automations、投递结果、待确认发送、电脑离线和重启后的中断 |
| 工作区 | 远程文件树、阅读/编辑、代码差异、Git、终端、HTML/PDF/图片/表格预览 |
| 浏览器/CUA | 查看电脑画面，显式切换控制权，坐标/画面generation校验，权限在电脑授权 |
| 扩展 | 已安装 MCP/Skills/Plugins、目录/详情/安装与状态；运行落在电脑，遵守已有模式策略 |
| 设置 | 模型目录、有效执行策略、通知、主题、项目记忆入口、精细用量、数据与归档、设备连接 |
| 电脑专属动作 | 外部编辑器、桌面宠物、系统权限页保留为电脑动作或电脑专属说明，不做手机伪按钮 |

附件流程：手机选择/拍摄 → 可取消上传 → 电脑临时文件 → 校验大小/类型/权限 → 原子落盘 → 返回受限资产引用 → 与请求一起提交。手机路径不是电脑路径。远程文件与预览不能绕过原有越界、符号链接和隐藏文件约束。

预览流程：电脑授权资产 → 受限读取/预览通道 → 手机隔离显示。任意生成的 HTML/JS 不应进入拥有设备凭据或原生插件权限的主 WebView，需独立受限 origin/无原生桥容器；不能把原来的 localhost URL 发给手机。

终端由电脑管理 session_id、所有者、尺寸和输出游标，手机只发输入/resize并订阅输出。切后台不自动杀终端；用户关闭终端需明确生命周期动作。

## 技术选型建议

首选候选：React + TypeScript + Capacitor 原生工程，界面资源打包在 App 内；复用现有 TypeScript 语义、Markdown/代码渲染知识，移动布局独立实现。原生插件负责键盘、App前后台、返回键、文件/录音、密钥、通知和分享。并非在远程网址上直接加载现有桌面页面。

选择这个候选的依据是现有 React DOM/TypeScript 与 BoardUI 的 Web 组件技术栈。React Native 的原生控件体验也是有效选项，但 DOM 渲染、CSS、Markdown与预览无法直接复用。最终以同一台 iPhone/Android 真机上的长会话、流式、中文键盘、代码滚动和内存表现验收候选，不把模拟器截图当决定性证据。

Capacitor 8 官方支持 iOS/Android，要求 Node 22+、Xcode26+ 等；当前检测 Node25、Xcode27.2，Android SDK/JDK尚未验证可用，iOS设备列表为空。[官方环境要求](https://capacitorjs.com/docs/getting-started/environment-setup)。

新项目建议目录（未来实现，不代表已存在代码）：

```text
apps/mobile/          手机React界面、原生ios/android工程
apps/companion/       电脑服务入口、配对与设备授权、生命周期
packages/protocol/    Runtime事件和业务类型、版本兼容、客户端契约
packages/host/        从Electron main抽离的电脑能力
contracts/           实际Runtime接口与补充的请求/事件schema
tests/fixtures/      离线脚本化provider、多端、断网、审批回放
docs/                架构、功能矩阵、发布验收
research/            参考资料，不参与打包
```

## 首要实施顺序

1. 修复已证实的隔离/一致性问题，补回归测试；确认 Runtime source package 的固定版本。
2. 在隔离数据目录建立 Companion 生命周期和双客户端连接；关掉 Electron 后手机会话仍可继续。
3. 配对、设备撤销、Tailscale HTTPS、能力发现，建立安全可达的真实链路。
4. 完成会话→输入→流式→停止/steer→审批/追问→恢复；离线测试先行。
5. 迁移附件、资产、文件/Git/PTY、ASR；再接扩展、自动化、浏览器/CUA、记忆、用量和数据管理。
6. iOS/Android真机回归、签名打包、内部发布、审核资料，再提交商店。

不能用模板动画或固定JSON冒充第4–5步。不能为了赶上架绕过第1–3步。完整功能上线以 release-gates 为准。


## 移动适配代码归属（2026-11-15 深审）

移动端专属HTTP适配位于原Runtime的 `src/deepseek_tui/mobile/`，包含files/document_text/voice/git/terminal/models/settings/devices。包入口统一挂载与关闭，`server/app.py`只保留挂载和生命周期接点，`server/auth.py`保留设备令牌校验接点；不再有 `server/mobile_*.py` 转发壳。公开API地址不变。桌面与手机继续共享Git服务和PTY核心；首次提交仓库支持的修复也位于共享Git服务。App仍是独立的deepseek-mobile项目，没有移动或复制Engine。
