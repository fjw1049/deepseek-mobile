import { useEffect, useRef, useState } from "react";
import { RuntimeClient } from "./protocol";
import {
  sendBrowserClick,
  sendBrowserKey,
  type BrowserBinding,
} from "./browser-input";
type View = {
  active: boolean;
  task_running?: boolean;
  task_turn_id?: string | null;
  task_paused?: boolean;
  owner?: string;
  generation?: number;
  scene?: { scene_id?: string };
  viewport?: { width: number; height: number };
  url?: string;
  image?: string | null;
  tabs?: { id: string; title?: string; url?: string }[];
  error?: string;
  transferring?: boolean;
  dialog?: { id?: string; dialog_id?: string; type?: string; message?: string };
};
export function BrowserControls({
  client,
  threadId,
}: {
  client: RuntimeClient;
  threadId: string;
}) {
  const [view, setView] = useState<View | null>(null),
    [url, setUrl] = useState(""),
    [dialogText, setDialogText] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [viewError, setViewError] = useState(""),
    [confirmStop, setConfirmStop] = useState<{ generation?: number; turnId?: string | null } | null>(null);
  const base = `/v1/threads/${encodeURIComponent(threadId)}/browser`;
  const live = useRef(true),
    viewRequest = useRef(0);
  const busyRef = useRef(false);
  busyRef.current = busy;
  async function refresh(signal?: AbortSignal) {
    const request = ++viewRequest.current;
    const next = await client.request<View>(base + "/view", "GET", undefined, signal);
    if (live.current && request === viewRequest.current) {
      setView(next);
      setViewError("");
    }
  }
  useEffect(() => {
    live.current = true;
    setView(null);
    setError("");
    setViewError("");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (document.visibilityState === "visible" && !busyRef.current) {
        try { await refresh(controller.signal); }
        catch (e) {
          if (!controller.signal.aborted) setViewError(e instanceof Error ? e.message : String(e));
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1500);
    }
    void poll();
    return () => {
      live.current = false;
      controller.abort();
      clearTimeout(timer);
      viewRequest.current++;
    };
  }, [client, base]);
  async function run(fn: () => Promise<unknown>) {
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function action(body: Record<string, unknown>) {
    return client.request(base + "/action", "POST", {
      ...body,
      ...(typeof view?.generation === "number"
        ? { generation: view.generation }
        : {}),
    });
  }
  function binding(): BrowserBinding {
    if (
      view?.owner !== "user" ||
      typeof view.generation !== "number" ||
      !view.scene?.scene_id
    )
      throw new Error("请先接管并刷新可操作画面");
    return { generation: view.generation, scene_id: view.scene.scene_id };
  }
  async function input(body: Record<string, unknown>) {
    return client.request(base + "/input", "POST", { ...body, ...binding() });
  }
  const canInput =
    !!view?.active && view.owner === "user" && !!view.image?.startsWith("data:image/") && !!view.scene?.scene_id && typeof view.generation === "number" && !busy && !view.transferring && !view.error && !viewError;
  const status = view?.task_paused ? "任务已暂停" : view?.owner === "user" ? "由你控制" : view?.task_running ? "正在操作网页" : "浏览器已就绪";
  let pageTitle = "当前网页";
  if (view?.active && view.url) {
    try { pageTitle = view.tabs?.find(tab => tab.url === view.url)?.title || new URL(view.url).hostname; } catch { /* Do not present an invalid URL as a link. */ }
  }
  return (
    <section className="sheet-form browser-panel" aria-label="浏览器控制">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {viewError && <p className="error" role="alert">画面更新失败：{viewError}。正在自动重连。</p>}
      {view?.error && (
        <p className="error" role="alert">
          无法读取浏览器画面：{view.error}
        </p>
      )}
      {view?.active && view.image?.startsWith("data:image/") && (
        <img
          className="browser-frame"
          src={view.image}
          alt="可操作的电脑浏览器画面"
          style={{
            width: "100%",
            borderRadius: 12,
            touchAction: "pan-y",
            opacity: busy ? 0.7 : 1,
          }}
          onClick={(e) => {
            if (!canInput || view?.dialog) return;
            const bounds = e.currentTarget.getBoundingClientRect();
            const x =
              ((e.clientX - bounds.left) *
                (view.viewport?.width ?? e.currentTarget.naturalWidth)) /
              bounds.width;
            const y =
              ((e.clientY - bounds.top) *
                (view.viewport?.height ?? e.currentTarget.naturalHeight)) /
              bounds.height;
            void run(() => sendBrowserClick(client, base, binding(), x, y));
          }}
        />
      )}
      {view?.active && !view.image && !view.error && !viewError && <p role="status">{view.dialog ? "网页正在等待确认" : "正在同步电脑画面…"}</p>}
      <p className="browser-status" role="status">{!view ? "正在连接电脑浏览器…" : view.active ? status : "当前没有打开的网页"}</p>
      <p className="muted">{view?.active ? "关闭面板不停止任务。" : "在聊天中告诉助手要浏览什么。"}</p>
      {view?.active && <p className="browser-page-title">{pageTitle}</p>}
      <div className="actions">
        <button disabled={busy} onClick={() => void run(() => refresh())}>
          刷新画面
        </button>
        {view?.active && (
          <button
            disabled={busy || view.transferring}
            onClick={() =>
              void run(() =>
                client.request(base + "/control", "POST", {
                  owner: view.owner === "user" ? "agent" : "user",
                  generation: view.generation,
                }),
              )
            }
          >
            {view.owner === "user" ? "交还智能体" : "接管浏览器"}
          </button>
        )}
        {view?.active && (
          <button
            disabled={busy}
            onClick={() => setConfirmStop({ generation: view.generation, turnId: view.task_turn_id })}
          >
            停止浏览器任务
          </button>
        )}
      </div>
      {confirmStop && <section className="action-card" aria-label="确认停止浏览器任务"><p>停止当前浏览器任务？</p><div className="actions"><button onClick={() => setConfirmStop(null)}>继续任务</button><button disabled={busy || confirmStop.generation !== view?.generation || confirmStop.turnId !== view?.task_turn_id} onClick={() => { const generation = confirmStop.generation; setConfirmStop(null); void run(() => client.request(base + "/control", "POST", { owner: "stopped", generation })); }}>确认停止</button></div></section>}

      {view?.dialog && (
        <section className="action-card" role="dialog" aria-label="网页对话框">
          <h3>网页正在等待确认</h3>
          <p>{view.dialog.message}</p>
          {view.dialog.type === "prompt" && (
            <label>
              网页提示输入
              <input
                value={dialogText}
                maxLength={8000}
                onChange={(e) => setDialogText(e.target.value)}
              />
            </label>
          )}
          <div className="actions">
            {[false, true].map((accept) => (
              <button
                key={String(accept)}
                disabled={!canInput}
                onClick={() =>
                  void run(async () => {
                    await action({
                      action: "handle_dialog",
                      dialog_id: view.dialog!.id ?? view.dialog!.dialog_id,
                      accept,
                      text: dialogText,
                    });
                    setDialogText("");
                  })
                }
              >
                {accept ? "确认网页对话框" : "取消网页对话框"}
              </button>
            ))}
          </div>
        </section>
      )}
      <details className="browser-manual" key={view?.active ? "active" : "inactive"}>
        <summary>{view?.active ? "手动操作网页" : "手动打开网址"}</summary>
        <p className="muted">{view?.active ? "接管后，先点击网页中的输入框。" : "网址会在电脑浏览器中打开。"}</p>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const parsed = new URL(url);
            if (!["https:", "http:"].includes(parsed.protocol))
              throw new Error("请输入 HTTP(S) 地址");
            await action({ action: "open", url: parsed.href });
          });
        }}
      >
        <label>
          网页地址
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <button
          className="primary"
          disabled={busy || (view?.active && view.owner !== "user")}
        >
          打开网页
        </button>
      </form>
      {view?.active && <>
      {!canInput && <p className="muted">{view.owner !== "user" ? "请先接管。" : "画面尚未就绪，暂不能遥控。"}</p>}
      <div className="actions">
        {[
          ["back", "后退"],
          ["forward", "前进"],
          ["reload", "重新加载"],
        ].map(([a, label]) => (
          <button
            key={a}
            disabled={!canInput || !!view?.dialog}
            onClick={() => void run(() => action({ action: a }))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="actions">
        {[-450, 450].map((delta) => (
          <button
            key={delta}
            disabled={!canInput || !!view?.dialog}
            onClick={() =>
              void run(() =>
                input({ kind: "wheel", delta_y: delta, x: 150, y: 150 }),
              )
            }
          >
            {delta < 0 ? "向上滚动" : "向下滚动"}
          </button>
        ))}
      </div>
      <details className="browser-keyboard"><summary>输入文字与快捷键</summary>
      <label>
        向网页输入文字
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={8000}
        />
      </label>
      <div className="actions">
        <button
          disabled={!canInput || !!view?.dialog || !text}
          onClick={() =>
            void run(async () => {
              await input({ kind: "text", text });
              setText("");
            })
          }
        >
          输入文字
        </button>
        {(["Enter", "Tab", "Escape"] as const).map((key) => (
          <button
            key={key}
            disabled={!canInput || !!view?.dialog}
            onClick={() =>
              void run(() => sendBrowserKey(client, base, binding(), key))
            }
          >
            {{ Enter: "回车", Tab: "切换输入框", Escape: "取消（Esc）" }[key]}
          </button>
        ))}
      </div>
      </details>
      {(view?.tabs?.length ?? 0) > 1 && (
        <label>
          浏览器标签页
          <select
            aria-label="浏览器标签页"
            value=""
            disabled={!canInput || !!view?.dialog}
            onChange={(e) =>
              void run(() =>
                action({ action: "switch_tab", tab_id: e.target.value }),
              )
            }
          >
            <option value="" disabled>
              切换标签页
            </option>
            {view!.tabs!.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || t.url || t.id}
              </option>
            ))}
          </select>
        </label>
      )}
      </>}
      </details>
    </section>
  );
}
