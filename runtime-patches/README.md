# Runtime 适配变更

当前原仓库工作区已应用这些变更，勿重复套用。

- `path-grants-isolation.patch`：先前授权隔离修复。
- `mobile-adapters.patch`：本轮独立mobile包、薄挂载/设备鉴权、共用PTY核心、共享Git首次提交修复及对应测试；仅收录相关文件，不含其他会话正在开发的浏览器/CUA改动。

新机器应使用含这些改动的兼容Runtime版本，再执行App的 `npm ci` 和 `npm run companion:build`。适配器打包复用原Workbench源码与依赖，运行时不包含第二套Engine。文档解析依赖见项目 `requirements-companion.txt`。部署前先验证补丁与目标版本兼容，不覆盖有其他改动的工作区。

正式Runtime只保持一个进程持有同一DEEPSEEK_HOME。ASR沿用电脑原配置；手机不持有上游模型密钥。
