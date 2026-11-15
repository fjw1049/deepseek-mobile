import { useEffect, useState } from "react";
import { RuntimeClient, ApiError } from "./protocol";
type Status = {
  model: string;
  remaining_requests: number;
  max_requests: number;
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
  return (
    <details className="preview-status" aria-label="真实模型验证额度">
      <summary>
        <span className="budget-dot" /> {status.model}{" "}
        <span>· 剩余 {status.remaining_requests} 次验证</span>
      </summary>
      <div className="preview-status-body">
        <strong>
          官方 {status.model} ·{" "}
          {status.manual_enabled ? "手动验证" : "自动验收"}
        </strong>
        <p>
          还可调用 {status.remaining_requests} 次，每次最多 1024 输出
          token。工具续答也消耗次数；此预览仅用于有限验证。
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
