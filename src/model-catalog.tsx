import { useEffect, useState } from "react";
import { RuntimeClient } from "./protocol";
type Provider = {
  id: string;
  configured: boolean;
  models: string[];
  discoverable: boolean;
  default_model?: string;
  source?: string;
};
export function ModelCatalog({
  client,
  provider,
  onSelect,
}: {
  client: RuntimeClient;
  provider: string;
  onSelect: (provider: string, model: string) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState(provider);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void client
      .request<{ providers: Provider[]; active_provider: string }>(
        "/v1/model-catalog",
        "GET",
        undefined,
        controller.signal,
      )
      .then((result) => {
        setProviders(result.providers);
        setSelected(
          result.providers.some((row) => row.id === provider)
            ? provider
            : result.active_provider,
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [client]);
  const current = providers.find((row) => row.id === selected);
  return (
    <section className="sheet-form" aria-label="电脑模型目录">
      <label>
        电脑已配置的提供商
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setError("");
          }}
        >
          {!providers.length && <option value="">暂无模型目录</option>}
          {providers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.id}
              {row.configured ? "" : "（未配置密钥）"}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <>
          <label>
            可选模型
            <select
              aria-label="电脑模型目录中的模型"
              value=""
              onChange={(e) => onSelect(current.id, e.target.value)}
            >
              <option value="" disabled>
                选择模型（{current.source ?? "电脑配置"}）
              </option>
              {current.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !current.configured || !current.discoverable}
            onClick={async () => {
              const id = current.id;
              setBusy(true);
              setError("");
              try {
                const result = await client.request<{ models: string[] }>(
                  `/v1/model-catalog/${encodeURIComponent(id)}/refresh`,
                  "POST",
                  {},
                );
                setProviders((rows) =>
                  rows.map((row) =>
                    row.id === id
                      ? { ...row, models: result.models, source: "提供商返回" }
                      : row,
                  ),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "无法获取模型列表");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在获取…" : "刷新模型列表"}
          </button>
          {!current.discoverable && (
            <p className="muted">
              此协议暂不支持模型发现；可以选择已配置模型，或在下方填写模型 ID。
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
