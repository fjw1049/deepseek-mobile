import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { RuntimeClient } from "./protocol";
import {
  saveDeviceCredential,
  loadDeviceCredential,
  clearDeviceCredential,
} from "./native-credentials";

type Device = {
  id: string;
  name: string;
  created_at: number;
  revoked_at: number | null;
};
export function PairingPanel({
  connect,
}: {
  connect: (client: RuntimeClient) => Promise<void>;
}) {
  const [url, setUrl] = useState(localStorage.getItem("runtime-url") ?? ""),
    [name, setName] = useState("我的手机"),
    [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState<{
    url: string;
    token: string;
    deviceId: string;
  } | null>(null);
  const finish = async (
    value: { url: string; token: string; deviceId: string },
    save: boolean,
  ) => {
    if (save) await saveDeviceCredential(value);
    localStorage.setItem("runtime-url", value.url);
    await connect(new RuntimeClient(value.url, value.token));
    setPending(null);
  };
  return (
    <section className="record-card" aria-label="配对电脑">
      <h2>首次配对</h2>
      <p className="muted">在电脑「设备管理」获取地址与配对码。</p>
      <form
        className="sheet-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const client = new RuntimeClient(url.trim(), "");
            const result = await client.request<{
              token: string;
              device: Device;
            }>("/v1/mobile/devices/pair", "POST", {
              code: code.trim(),
              name: name.trim(),
            });
            const value = {
              url: client.base,
              token: result.token,
              deviceId: result.device.id,
            };
            setPending(value);
            setCode("");
            await finish(value, true);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          配对服务地址
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://电脑服务地址"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <details className="pairing-options"><summary>设备名称（可选）</summary>
        <label>
          设备名称
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        </details>
        <label>
          一次性配对码
          <input
            required
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCDEF-GHJKLM"
            autoComplete="one-time-code"
            autoCapitalize="characters"
          />
        </label>
        <button className="primary" disabled={busy || !!pending}>
          {busy ? "正在连接…" : "配对并连接"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <div className="actions">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await finish(pending, false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            仅本次连接
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await finish(pending, true);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            重试安全保存并连接
          </button>
        </div>
      )}
      <p className="muted">
        {Capacitor.isNativePlatform()
          ? "设备令牌保存在本机系统安全存储中。"
          : "网页预览只在本次打开期间保留设备令牌，关闭后需重新配对。"}
      </p>
      {Capacitor.isNativePlatform() && (
        <div className="actions">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const saved = await loadDeviceCredential();
                if (!saved) throw new Error("还没有保存的设备，请先配对");
                await finish(saved, false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            连接已保存的电脑
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await clearDeviceCredential();
                setError(
                  "已清除本机保存的连接。电脑上的设备授权可由管理员撤销。",
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            忘记保存的连接
          </button>
        </div>
      )}
    </section>
  );
}
export function DeviceTools({ client }: { client: RuntimeClient }) {
  const [role, setRole] = useState(""),
    [devices, setDevices] = useState<Device[]>([]),
    [current, setCurrent] = useState<Device | null>(null);
  const [pairCode, setPairCode] = useState<{
      code: string;
      expires_at: number;
    } | null>(null),
    [review, setReview] = useState<Device | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void client
      .request<{ role: string; device: Device | null }>(
        "/v1/mobile/devices/session",
        "GET",
        undefined,
        controller.signal,
      )
      .then(async (session) => {
        if (!live) return;
        setRole(session.role);
        setCurrent(session.device);
        if (session.role === "admin") {
          const result = await client.request<Device[]>(
            "/v1/mobile/devices",
            "GET",
            undefined,
            controller.signal,
          );
          if (live) setDevices(result);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [client, refresh]);
  return (
    <section aria-label="设备管理">
      <h2>设备管理</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {role === "device" ? (
        <article className="record-card">
          <h3>{current?.name || "当前设备"}</h3>
          <p>已配对 · 设备管理请在电脑操作</p>
        </article>
      ) : role === "admin" ? (
        <>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setPairCode(
                  await client.request(
                    "/v1/mobile/devices/pair-codes",
                    "POST",
                    {},
                  ),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            生成手机配对码
          </button>
          {pairCode && (
            <article className="record-card">
              <strong style={{ fontSize: 24, letterSpacing: 2 }}>
                {pairCode.expires_at * 1000 > now
                  ? pairCode.code
                  : "配对码已过期"}
              </strong>
              <p>
                剩余{" "}
                {Math.max(
                  0,
                  Math.ceil((pairCode.expires_at * 1000 - now) / 1000),
                )}{" "}
                秒 · 单次使用
              </p>
            </article>
          )}
          <button disabled={busy} onClick={() => setRefresh((v) => v + 1)}>
            刷新设备列表
          </button>
          {devices.map((device) => (
            <article className="record-card" key={device.id}>
              <h3>{device.name}</h3>
              <p className="muted">
                添加于 {new Date(device.created_at * 1000).toLocaleString()} ·{" "}
                {device.revoked_at ? "已撤销" : "已授权"}
              </p>
              {!device.revoked_at && (
                <button disabled={busy} onClick={() => setReview(device)}>
                  撤销此设备
                </button>
              )}
            </article>
          ))}
          {review && (
            <section
              className="action-card"
              role="dialog"
              aria-label="撤销设备确认"
            >
              <h3>撤销 {review.name}？</h3>
              <p>撤销后，该设备将断开并失去访问权限。</p>
              <div className="actions">
                <button disabled={busy} onClick={() => setReview(null)}>
                  取消
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await client.request(
                        `/v1/mobile/devices/${encodeURIComponent(review.id)}`,
                        "DELETE",
                      );
                      setReview(null);
                      setRefresh((v) => v + 1);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认撤销设备
                </button>
              </div>
            </section>
          )}
        </>
      ) : busy ? (
        <p>正在读取设备状态…</p>
      ) : null}
    </section>
  );
}
