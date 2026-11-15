> 最新深审：移动适配已集中到Runtime的独立mobile包，修复会话竞态与Git首次提交等问题，36项手机回归通过，原生包已更新。[本轮完整记录](docs/deep-audit-20261115.md)。

> 最新：已补齐附件/文档、语音接入、文件/Git/PTY、浏览器与CUA控制、扩展配置、设备配对和原生分享/本地通知。[本轮功能与验收边界](docs/function-audit-20261115.md)。真实模型验收6次通过；电脑预览使用5178，离线回归使用5180/17880。

# DeepSeek Mobile

独立的 iOS / Android 客户端。直接调用现有 Python Runtime；模型调用、工具、审批、追问、会话和任务仍由原系统执行。先跑通 App，Mac mini 部署与远程网络在后续处理。

当前交付：可运行的移动端主链路、两个原生工程、离线真实 Runtime 联调及 iOS 未签名构建，以及已通过签名校验的 Android 调试 APK 和未签名商店 AAB。**尚未商店上线**；用户尚无 Apple Developer / Google Play 账号。本版本也不等于所有桌面能力均已完成手机适配。

安装包：[Android APK](artifacts/deepseek-mobile-0.1.0-debug.apk) · [未签名 AAB](artifacts/deepseek-mobile-0.1.0-unsigned.aab) · [iOS 未签名构建](artifacts/ios-unsigned-app.zip) · [实际界面截图](screenshots/mobile-chat.png)

## 电脑直接验证（2026-11-15 更新）

双击项目目录里的 `启动真实预览.command`，或运行 `npm run live:preview`。它启动现有 Runtime 的独立测试实例与 App 预览，然后打开浏览器；不会修改现有 7878 服务。

- 地址：http://127.0.0.1:5178/
- App 服务地址：`/runtime`
- 本机测试访问令牌：`mobile-live-review`（不是上游模型密钥）
- 终端会隐藏输入官方 DeepSeek API Key，仅在进程内存中使用，不写入源码、App 或报告。
- 固定使用官方 `deepseek-flash`，自动验收最多6次，用户显式开放后另6次生成请求，每次最多 1024 输出 token，含重试；本功能仅供明确启动的真实小范围验证。
- `npm run live:check` 检查前端和测试 Runtime 是否都可连接。关闭终端会停止该次预览；再次启动需重新输入模型 Key。
- 当前真实验证覆盖图片/PDF/Office理解、追问、写文件授权、停止和会话重新同步。任务/自动化/子代理等已启用并共享同一模型额度限制；未进行付费后台长任务测试。

详细证据见 [真实验证报告](docs/live-verification-20261115.md)。

## 已接入

- 服务鉴权连接；会话列表、搜索、新建、分叉、归档。
- Markdown/代码回复、思考与工具结果、流式消息、停止、追加指令。
- 执行/规划/问答模式；通过已有 Goal 接口创建、暂停和继续目标。
- 工具审批、提权确认、结构化追问与取消。
- 断线重新拉取快照和 SSE；切回 App 恢复同步。不自动重发写请求。
- 现有任务、自动化、工作区、技能、插件、MCP、用量接口的查询入口；任务停止/恢复和自动化运行/暂停。

新增功能、对应证据和未完成项见[功能矩阵](docs/function-audit-20261115.md)。真实ASR待电脑凭据；手机任意桌面输入和可靠后台推送未实现，原生系统能力待真机验收。

## 开发运行

Node 22+，原Runtime及Workbench依赖已安装。文档提取依赖可安装到原Runtime虚拟环境：`uv pip install --python "$RUNTIME_SOURCE/.venv/bin/python" -r requirements-companion.txt`。在本目录执行 `npm ci`，再运行 `npm run dev`。浏览器打开 http://127.0.0.1:5178，服务地址使用 `/runtime`，输入现有 Runtime 访问令牌；开发代理默认连接 `http://127.0.0.1:7878`，可用 `RUNTIME_URL` 改变目标。

已有 Runtime 正在运行时直接连接它。需要独立启动时：

```sh
export RUNTIME_SOURCE=/Users/fjw/Desktop/deepseek-tui-py-main
export RUNTIME_WORKSPACE=/path/to/your/workspace
export DEEPSEEK_RUNTIME_TOKEN='你自己生成的访问令牌'
npm run runtime:start
```

启动器先打包现有桌面ASR/Git/模型目录和共享PTY适配模块，再调用旧项目的 `python -m deepseek_tui serve --http`，没有复制 Engine。不要同时让 Electron 和另一个服务进程持有同一套运行数据。上游模型 Key 使用电脑原有配置；手机不保存它。手动输入的访问令牌仅存内存。原生App可通过一次性配对码获得独立设备凭据，保存在Keychain/Keystore并可撤销；Web不持久保存令牌。

连接实际手机时，填写电脑可达地址而不是手机的 `localhost`。调试 APK 支持本地 HTTP；发布版 Android 要求 HTTPS。iOS 已加入局域网用途说明和本地网络 ATS 配置，仍需真机验证。此阶段没有自动开放公网端口、安装 Tailscale 或改动系统网络。

## 验证与构建

```sh
npm test
npm run build
RUNTIME_SOURCE=/Users/fjw/Desktop/deepseek-tui-py-main npm run test:e2e
npm run native:sync
npm run ios
npm run android
```

E2E 使用本机 Chrome、旧 Runtime 的 `.venv` 和一个临时 `DEEPSEEK_HOME`。**真实 HTTP 路由、线程管理器、Engine、SSE 与审批桥，只有 LLM 换成离线脚本**；不读取个人会话，不调用付费模型。测试自动启动并关闭自己的服务，使用 5180、17880 端口。

iOS：在 Xcode 中选择自己的签名团队后安装；当前机器无有效签名证书。Android：配置 JDK 21 与 Android SDK 36 / Build Tools 35 后运行 `npm run android:apk`。商店包使用 `npm run android:bundle`，随后由自己的上传密钥签名。当前 `com.fjw.deepseek.mobile` 和应用名称是开发占位，商店注册前需确认。

## 审查资料

- [实现与验证记录](docs/implementation.md)
- [原系统架构审查](docs/architecture.md)
- [完整产品能力映射](docs/capabilities-audit.md)
- [发布验收清单](docs/release-gates.md)
- `contracts/`：原系统实际路由和协议库存。
- `research/boardui-ai-chat/`：界面参考研究；第三方编译脚本没有进入 App 发布包。

原仓库基线：`b6e6b48dee40818610e63da1e39e46b72a2f335d`。此前审查发现的跨会话 PathGrants 问题已在原 Runtime 修复（核心代码增加 3 行及 1 项回归测试，48 项相关测试通过）。补丁保存在 `runtime-patches/`；App 继续调用这一个原 Runtime，没有复制第二套引擎。
