> 当前功能实现与验收状态以 [2026-11-15 完整更新](function-audit-20261115.md) 为准；下文为架构/先前审查记录。

> 2026-11-15 功能复核已更新，最新功能矩阵、修复、测试及未完成项见 [功能审核](function-audit-20261115.md)。以下保留前次交付记录。

# 2026-11-14 实现记录

当前目标按用户最新指示收敛为：独立 App 先调用已有 Runtime 跑通，再标准化部署到 Mac mini；暂不建设公网中继或重新设计后端。

## 实现边界

客户端使用 React + Capacitor，独立于原仓库，两个原生工程一起维护。不是把远程 BoardUI 网站包进 WebView；生产包内是本项目源码编译出的静态资源。BoardUI 的菜单/抽屉/聊天/结果面板交互用于参考，未获得其完整 Pro 原始源码，不声称恢复了其全部源代码。

运行链：App → 带 Bearer 鉴权的现有 HTTP/SSE → RuntimeThreadManager → 原 Engine/工具。新项目只新增客户端、启动脚本和测试；未复制 Python 引擎或另造业务后端。随后在原 Runtime 回补了已复现的授权隔离最小修复。

## 已验证

1. TypeScript 严格检查与生产构建通过。
2. 7 项协议单测通过：SSE 分块/CRLF、无序列 resync、全局 seq 间隔、重复消息去重、线程隔离、最终结果替换、鉴权及写请求不自动重试、地址校验。
3. 手机尺寸 Chrome 端到端测试通过：错误令牌拒绝、正确连接、新建、真实 Engine 流式输出、代码块、追问回答、停止、恢复快照、审批同意、提权拒绝、活动/设置入口、无令牌请求拒绝。没有页面异常或横向溢出。
4. 追问链路完整经过原 Engine 的 request_user_input 工具。审批/提权用原 Runtime bridge 预置等待，验证 UI → 原 HTTP → Future 的实际决定回执，不声称该测试实际执行了高权限命令。
5. iOS generic simulator 与 generic iPhone 架构编译成功（CODE_SIGNING_ALLOWED=NO）。本机没有模拟器运行时、连接设备或有效签名身份；这些构建不等于已在 iPhone 运行。
6. 原系统此前 15 个选定离线契约文件合计 133 passed、3 skipped。PathGrants 修复先在隔离副本 48 passed，随后回补原仓库并再次 48 passed；原仓库仅该核心修复与回归测试发生变化。

测试 LLM 完全离线，无个人模型费用。`scripts/runtime-fixture.py` 是测试专用：导入原 Runtime，只注入 OfflineClient；不会进入 App 静态发布资源。

## 待验证与发布条件

- Android 调试 APK 已通过 v2 签名验证，未签名 AAB 构建和 lintVital 通过；两个包内 Web 资源与最终构建一致。首次根级 assembleDebug 在库注释依赖下载处失败，但 App APK 已完成；随后单独 app:bundleRelease 成功，未跳过发布检查。
- 真实手机的局域网、键盘、安全区、后台恢复、断网恢复、复制权限、HTTPS/CORS。
- Goal、目标模式、非空插件/MCP 数据等扩展入口需要更多端到端验收。任务权限确认与暂停自动化恢复新增 2 项浏览器 API fixture 测试通过，不等同于真实任务管理器验收。
- 当前无附件/语音、完整文件/Git/PTY、浏览器接管、后台推送和安全持久化配对流程。并非完整桌面功能手机版。
- 原 Runtime 的会话授权隔离修复已回补唯一共享版本；没有复制第二套 Engine。发布时需包含这次未提交的源代码修复。
- 用户确认尚无开发者账号；没有签名、TestFlight/Google Play 上传或商店审核结果。
- 应用正式名称、唯一应用 ID、签名归属、隐私/支持网页及审核可用连接方案须在正式提交前落实。模板逆向研究资源不用于商店交付。

## 重复运行

`npm run test:e2e` 管理自己的两个测试服务。原 Runtime 路径可通过 RUNTIME_SOURCE 指定，Python 可通过 RUNTIME_PYTHON 指定。测试启动失败会直接失败，不回退到真实模型。

官方构建工具来源：[Capacitor](https://capacitorjs.com/docs)、[Android SDK](https://developer.android.com/studio)、[Microsoft OpenJDK 21](https://learn.microsoft.com/en-us/java/openjdk/download)。工具链临时安装在 /tmp，未替换系统 Java。SDK 和 JDK 均按官方清单校验。
