"""Local transport limits; independent of credentials, network and Runtime startup."""
SMOKE_MAX_BYTES = 250_000
PERSONAL_MAX_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_TOKENS = 1024


def validate_payload(payload: dict, request_bytes: int, *, personal: bool) -> None:
    if payload.get('model') != 'deepseek-flash':
        raise RuntimeError('当前电脑服务仅支持 deepseek-flash，请在模型设置中选择该模型。')
    tokens = payload.get('max_tokens')
    if not isinstance(tokens, int) or isinstance(tokens, bool) or not 0 < tokens <= MAX_OUTPUT_TOKENS:
        raise RuntimeError('输出额度与电脑服务配置不一致，请检查电脑端模型配置。')
    limit = PERSONAL_MAX_BYTES if personal else SMOKE_MAX_BYTES
    if request_bytes > limit:
        if personal:
            raise RuntimeError('消息、历史和附件合计超过个人服务的 16 MiB 请求上限。请减少附件，或新建会话后发送。')
        raise RuntimeError('请求超过开发验证的 250 KB 输入上限。日常使用请连接个人服务；本次未调用模型。')
