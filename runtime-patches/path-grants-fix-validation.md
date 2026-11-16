> 更新：该补丁现已回补原仓库，原仓库同组回归再次 48 passed。下文保留此前隔离验证证据。

# PathGrants 最小修复验证

所有修改仅在 `/tmp/deepseek-mobile-audit/isolated-runtime`，原仓库未修改。

补丁：`path-grants-isolation.patch`。包含核心文件3行增加（导入、注释、独立PathGrants实例）与一个双Engine回归测试。`git apply --check` 在原仓库通过，未执行 apply。

修复点：共享 ToolRuntime 构建 per-engine ToolContext 时传入 `path_grants=PathGrants()`；现有 SubAgentRuntime 构造仍引用 `engine.tool_context.path_grants`，所以同一个 Engine 内的子代理继续共享会话授权。

实际两次 `RuntimeThreadManager._build_engine_for_thread` → `Engine.create` 复现脚本：`reproduce_path_grants.py`。临时数据根，禁用 MCP/plugins/tasks/automations，启用 subagents 但不派发任务；模型调用0。

| 观察 | 修复前 | 修复后 |
|---|---|---|
| 两Engine的PathGrants同一对象 | true | false |
| B构建后A已有授权数 | 0 | 1 |
| B能看到从A新增的授权 | true | false |
| A新增授权写入A磁盘记录 | false | true |
| A新增授权写入B磁盘记录 | true | false |
| 各Engine子代理共享其父Engine授权 | true | true |
| 模型调用 | 0 | 0 |

原始结果：`path-grants-before.json`、`path-grants-after.json`。

相关离线回归：`tests/engine/test_per_engine_context.py`、`tests/engine/test_engine_audit_fixes.py`、`tests/test_path_access.py`。隔离副本执行 **48 passed**；其中47项为现有测试，1项是新增双Engine授权/回调/子代理共享回归。输出在 `path-grants-regression-tests.txt`。

适用边界：验证会话授权对象与回调隔离，不证明所有工具、平台、真实模型和原生移动App端到端安全。该修复应进入抽出的Runtime版本，或明确授权后回补原项目。
