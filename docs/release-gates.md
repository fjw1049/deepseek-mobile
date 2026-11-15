# 发布状态（2026-11-15）

功能、测试与限制以[当前功能矩阵](function-audit-20261115.md)和 `artifacts/verification.json` 为准。

已完成：独立App、现有Runtime适配、21项单元/27项手机界面回归、43项移动接口+18项原服务回归、6次官方flash真实验收。文件分享/通知/配对安全存储已实现，但源码和编译不能替代真机行为。

仍需实际手机验收：键盘/安全区、录音、文件分享、Keychain/Keystore、局域网、睡眠恢复、撤销和前后台；ASR需用户在电脑配置凭据。当前仅本地通知，没有可靠的APNs/FCM后台推送。

商店尚未发布：用户尚无Apple Developer和Google Play账号；当前交付Android调试APK、未签名AAB、未签名iPhone构建及工程。正式名称、应用ID、签名、隐私和支持页面、审核可访问环境准备后才能提交。

Mac mini部署与远程网络按用户要求后置。现有启动脚本复用唯一Runtime；勿让两个进程持有同一DEEPSEEK_HOME。写操作不自动重试，所有旧接口尚无统一幂等/对账协议。
