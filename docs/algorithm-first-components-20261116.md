# 算法优先的成熟组件替代方案

2026-11-16。拟议选型，未安装或开通服务。本方案替代上一版的基础设施组件选择，继续保留其数据隔离、执行权限、幂等和双端一致性要求。

## 核心决策

主要研发投入放在上下文、记忆、任务分解、工具选择、多代理协作、模型选择策略和效果评测。通用能力优先采用成套服务及官方 SDK；生产优先评估托管，本地用官方开发栈。现有 Python Runtime 和 React/Electron/Capacitor 保留，不随基础设施调整重写算法引擎或全部界面。

上一版偏向可控的自建组合，但用户当前更看重减少非算法研发。因此改为 Supabase 统一账号、数据库和附件存储；公共执行环境优先验证 Daytona，E2B 备选；不从零搭建沙箱平台。这是优先级改变后的工程选择，不宣称某个产品在所有场景都最好。

## 替代清单

| 能力 | 推荐 | 替代的工作 | 仍须由我们负责 |
|---|---|---|---|
| 注册登录、密码恢复、登录会话 | Supabase Auth + 官方 SDK | 独立 Keycloak 部署、自己签发/刷新身份令牌 | 账号与空间关联、平台回调、安全存储和退出 |
| 数据库、附件存储、管理工具 | Supabase PostgreSQL + Storage + Studio | 分别拼装身份数据库、对象存储和管理后台 | 数据模型、RLS、资源授权、业务事务 |
| Shell、PTY、文件、Git、执行环境生命周期 | Daytona 优先兼容验证，E2B 备选 | 自建容器调度、环境创建、终端与文件传输设施 | 现有工具语义适配、空间归属、秘密及网络边界 |
| 多模型协议、虚拟 Key、调用成本 | 多提供商阶段采用 LiteLLM Gateway | 自研通用模型网关和供应商重复适配 | 算法模型路由、特殊参数兼容、真实用量核对 |
| Agent 追踪、提示词版本、评测记录 | Langfuse，先接开发环境 | 自建链路面板、提示词后台、评测结果后台 | 评测集、评分标准、实验设计和算法改进 |
| 异常与性能 | 公共预发布时接 Sentry | 自建错误聚合与监控界面 | 错误处理、脱敏与采样 |
| 手机后台通知 | 发布阶段接 OneSignal Capacitor SDK | 自建推送投递后台和平台适配 | 设备绑定、发送时机、退出解绑和平台凭据 |
| 接口与客户端状态 | OpenAPI SDK + TanStack Query | 手写大量类型和重复请求缓存逻辑 | SSE reducer、消息业务解释、未知写操作对账 |

Supabase 官方提供 Auth、本地开发栈和 Storage 权限机制，适合将通用部分成套接入。[Auth](https://supabase.com/docs/guides/auth)、[本地开发](https://supabase.com/docs/guides/local-development)、[Storage 权限](https://supabase.com/docs/guides/storage/security/access-control)。这不代表开启服务后自动拥有正确租户隔离，RLS 及服务端对象授权仍须实现。

Daytona 文档提供文件、Git、进程、PTY 与 Computer Use 接口，与当前工作台能力匹配。E2B 也提供隔离执行环境、命令、文件及桌面能力。[Daytona](https://www.daytona.io/docs/en/)、[E2B](https://docs.e2b.dev/)。先选一家通过兼容性测试的服务，不同时维护两套生产实现。会话持续时间、暂停恢复、持久化、MCP 子进程、浏览器与网络规则必须实测，不能由功能列表推断现有 Runtime 可直接搬入。

LiteLLM 提供统一模型调用及网关能力。[官方文档](https://docs.litellm.ai/docs/)。接入时验证推理字段、流式工具调用、多模态、取消与用量。禁用未经确认的自动回退和重试，避免改变用户选择或引入重复调用。当前单提供商联调不强制先运行网关。

Langfuse 提供追踪、提示词管理及评测功能；Sentry 提供 FastAPI 集成；OneSignal 提供 Capacitor 接入路径。[Langfuse](https://langfuse.com/docs)、[Sentry](https://docs.sentry.io/platforms/python/integrations/fastapi/)、[OneSignal](https://documentation.onesignal.com/docs/en/capacitor-sdk-setup)。它们按阶段启用，不一起成为本地启动依赖。

## 最小架构

```text
Electron / App
    ├── Supabase Auth 官方 SDK：登录与会话
    └── 共享业务 SDK → FastAPI + 现有 Runtime
                            ├── Supabase PostgreSQL / Storage
                            ├── 选定的成套执行沙箱 SDK
                            └── 现有模型客户端，按需接 LiteLLM

开发观测：Langfuse
公开预发布再接：Sentry、OneSignal
```

Supabase 处理通用基础设施，FastAPI 继续处理 Agent 业务，不把长期运行的 Agent 循环塞进短请求函数。关键写操作仍经过业务 API，不能让客户端直接写数据库表来启动任务或改变审批结果。

Supabase 的 service_role/secret 密钥不得进入客户端。服务端若用绕过 RLS 的凭据访问资源，必须自行落实严格授权；不能以“数据库有 RLS”作为已经隔离的证明。

原方案登录章节改为 Supabase Auth SDK：开发账号采用密码登录；第三方 OAuth 使用系统浏览器与 PKCE。保留安全存储、令牌有效性校验及设备撤销检查，不复制 Keycloak 的 realm 初始化和两个 OIDC client 配置流程。

数据库结构、RLS 与函数使用一套 Supabase CLI SQL migrations；不同时维护 Alembic 的另一套迁移历史。Python 如需复杂事务访问可用 SQLAlchemy，普通接口优先官方 SDK。多次独立 REST 写入不等于事务，turn 预留、幂等记录与受理状态仍需共同事务提交。

Runtime SSE 继续作为聊天事件事实来源。Supabase Realtime 如使用，只先承担目录变更通知；不能两套流各自解释同一条聊天消息。对象存储负责附件和结果资产，沙箱工作目录负责 Git/Shell 所需文件系统，两者不互相冒充。

## 本地一个账号的体验保持不变

启动器包装 Supabase CLI、本地 Runtime、数据库迁移和健康检查。首次通过本地 Auth 管理接口幂等创建一个普通开发账号和个人空间；随机密码写入忽略提交的开发文件，重启保留。开发管理密钥仅用于初始化，不交给 App 或 Electron。

用户操作仍是：启动 → 同一账号登录桌面与手机 → 测试。内部测试自动创建第二个临时账号验证隔离。真机的 API/Auth 地址必须可达；不采用手机 localhost，也不关闭发布版证书验证。

日常离线联调无需云端沙箱、监控或通知账号。保留本地 fixture/现有受控执行适配；公共沙箱另做专项验收，本地通过不代表公共发布通过。生产不开启开发账号 seed，不自动迁移个人 ~/.deepseek 数据。

## 保留自研的内容

算法核心：上下文构建压缩、记忆检索与写入、任务分解、工具选择、多代理协作、模型选择策略、质量评价和失败恢复策略。

必要业务代码：资源归属授权、审批与任务状态机、请求幂等及副作用对账、跨端消息语义、供应商适配。通用平台无法推断这些产品规则；这里应该少而清晰，并有针对性的验证。

评测平台不替代评测集和科学的实验设计。默认使用合成数据和离线 provider，个人模型账户不自动批量评测。托管追踪先只接脱敏开发样例，真实用户正文、附件和密钥不自动上传。

## 实施优先级与不做事项

1. 先采用 Supabase 本地栈，完成一个账号、两端登录与正常模型配置；不同时安装 Keycloak。
2. 提取现有共享消息/协议逻辑，修复已发现的状态和输入差异。
3. 用合成 fixture 对成套沙箱做有界试验，验证当前工具兼容性和资源隔离；选定一家后接公开执行链路。
4. 开发环境接 Langfuse 支持算法迭代；多提供商需求出现时再接 LiteLLM。
5. 公共预发布补 Sentry 与 OneSignal，以及备份恢复和跨用户验证。

首版不自建身份平台、对象存储、沙箱调度平台、模型网关、监控后台或评测面板；不为追求成套而重写已有效的 Engine、切换 Agent 框架或重画全部 UI。不在缺少成本测量时购买长期服务。

托管服务选择仍须核实目标地区可达性、数据位置、额度与费用、导出恢复和运行限制。若这些条件不满足，再采用自托管或其他供应商，而非把每个备选同时接入。本轮只完成文档与官网能力核对，未做付费服务开通、沙箱实机测试或私人数据上传。
