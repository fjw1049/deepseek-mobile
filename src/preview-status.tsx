import { useEffect, useState } from "react";
import { RuntimeClient, ApiError } from "./protocol";
type Status = {
  model: string;
  remaining_requests: number | null;
  max_requests: number | null;
  mode?: "personal" | "smoke-test";
  max_output_tokens?: number;
  max_request_bytes?: number;
  manual_enabled: boolean;
};
export function PreviewStatus({ client }: { client: RuntimeClient }) {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await client.request<Status>(
          "/v1/preview-status",
          "GET",
          undefined,
          controller.signal,
        );
        if (live) {
          setStatus(next);
          timer = setTimeout(() => void refresh(), 5000);
        }
      } catch (e) {
        if (live) {
          setStatus(null);
          if (!(e instanceof ApiError && e.status === 404))
            timer = setTimeout(() => void refresh(), 10000);
        }
      }
    }
    void refresh();
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [client]);
  if (!status) return null;
  if (status.mode === "personal") return (
    <section className="record-card" aria-label="模型服务">
      <h3>{status.model}</h3>
      <p>个人服务 · 固定模型 · 思考关闭</p>
      <p className="muted">按用量计费 · 输出上限：{status.max_output_tokens ?? 1024} tokens。</p>
      {status.max_request_bytes != null && <p className="muted">请求上限：{(status.max_request_bytes / 1024 / 1024).toFixed(1)} MiB</p>}
    </section>
  );
  return (
    <details className="preview-status" aria-label="开发预览调用限制">
      <summary>
        <span className="budget-dot" /> {status.model}{" "}
        <span>· 开发预览剩余 {status.remaining_requests} 次</span>
      </summary>
      <div className="preview-status-body">
        <strong>
          官方 {status.model} ·{" "}
          {status.manual_enabled ? "手动验证" : "自动验收"}
        </strong>
        <p>
          还可调用 {status.remaining_requests} 次，每次最多 1024 输出
          token。工具续答也消耗次数；这是开发预览的调用上限，不是账户余额。日常使用请连接电脑上的正式工作台。
        </p>
        {!status.manual_enabled && status.remaining_requests === 0 && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setStatus(
                  await client.request("/v1/preview-status/manual", "POST", {}),
                );
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            开始手动验证（再开放 6 次调用）
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
