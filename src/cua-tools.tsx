import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, RuntimeClient } from "./protocol";

type CuaState = {
  active: boolean;
  available: boolean;
  used?: boolean;
  connected?: boolean;
  owner: "idle" | "assistant" | "user";
  revision: number;
  turn_id: string | null;
  paused: boolean;
  waiting: boolean;
  transferring?: boolean;
  awaiting_permission?: boolean;
  human_reason?: string | null;
  surface?: { kind: string; app_id?: string } | null;
  unresolved: {
    call_id: string;
    turn_id: string;
    outcome?: string;
    recorded_at?: number;
  } | null;
};
type Frame = { mime_type: string; data: string; width: number; height: number };
type Owner = "user" | "assistant" | "stopped";
type Review = { owner: Owner; snapshot: CuaState };
const labels: Record<Owner, string> = {
  user: "接管并暂停",
  assistant: "交还智能体",
  stopped: "停止电脑任务",
};
const identity = (value: CuaState | null) =>
  `${value?.turn_id ?? ""}:${value?.revision ?? -1}`;

export function CuaTools({
  client,
  threadId,
}: {
  client: RuntimeClient;
  threadId: string;
}) {
  const [state, setState] = useState<CuaState | null>(null),
    [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState(""),
    [frameNote, setFrameNote] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [review, setReview] = useState<Review | null>(null),
    [reviewed, setReviewed] = useState(false);
  const live = useRef(0),
    version = useRef(0),
    stateRef = useRef<CuaState | null>(null),
    blocked = useRef(false);
  const base = `/v1/threads/${encodeURIComponent(threadId)}/cua`;
  const accept = useCallback((next: CuaState) => {
    if (identity(stateRef.current) !== identity(next)) setFrame(null);
    stateRef.current = next;
    setState(next);
  }, []);
  const refresh = useCallback(async () => {
    const generation = live.current,
      request = ++version.current;
    setLoading(true);
    try {
      const next = await client.request<CuaState>(base);
      if (generation === live.current && request === version.current) {
        accept(next);
        setError("");
      }
    } catch (e) {
      if (generation === live.current && request === version.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation === live.current && request === version.current)
        setLoading(false);
    }
  }, [client, base, accept]);
  useEffect(() => {
    live.current++;
    stateRef.current = null;
    setState(null);
    setFrame(null);
    setReview(null);
    setReviewed(false);
    blocked.current = false;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!blocked.current && document.visibilityState !== "hidden")
        await refresh();
      if (!stopped) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      stopped = true;
      live.current++;
      version.current++;
      clearTimeout(timer);
    };
  }, [refresh]);
  const begin = (owner: Owner) => {
    if (!state?.turn_id) return;
    blocked.current = true;
    version.current++;
    setLoading(false);
    setReviewed(false);
    setReview({ owner, snapshot: state });
  };
  const close = () => {
    setReview(null);
    setReviewed(false);
    blocked.current = false;
  };
  const control = async () => {
    if (!review?.snapshot.turn_id) return;
    if (review.owner === "assistant" && review.snapshot.unresolved && !reviewed)
      return;
    const generation = live.current;
    setBusy(true);
    setError("");
    version.current++;
    try {
      const next = await client.request<CuaState>(`${base}/control`, "POST", {
        owner: review.owner,
        revision: review.snapshot.revision,
        turn_id: review.snapshot.turn_id,
        ...(review.owner === "assistant" && review.snapshot.unresolved
          ? { reviewed_call_id: review.snapshot.unresolved.call_id }
          : {}),
      });
      if (generation === live.current) {
        accept(next);
        close();
      }
    } catch (e) {
      if (generation === live.current) {
        close();
        // Refresh state only. A failed write is never automatically replayed.
        await refresh();
        setError(
          e instanceof ApiError && e.status === 409
            ? `控制状态已变化或暂时不能交接，请核对最新状态后重新操作。${e.message}`
            : e instanceof Error
              ? e.message
              : String(e),
        );
      }
    } finally {
      if (generation === live.current) setBusy(false);
    }
  };
  const capture = async () => {
    const generation = live.current;
    blocked.current = true;
    version.current++;
    setBusy(true);
    setFrame(null);
    setFrameNote("");
    try {
      const before = await client.request<CuaState>(base);
      if (!before.active || !before.available || before.used === false)
        throw new Error("当前没有正在使用电脑的任务画面");
      const image = await client.request<Frame>(`${base}/frame`);
      const after = await client.request<CuaState>(base);
      if (generation !== live.current) return;
      accept(after);
      if (identity(before) !== identity(after) || !after.active) {
        setFrameNote("获取画面时任务状态已变化，请重新刷新画面。");
        return;
      }
      if (image.mime_type !== "image/jpeg" || typeof image.data !== "string")
        throw new Error("电脑返回的预览格式不可用");
      setFrame(image);
    } catch (e) {
      if (generation === live.current)
        setFrameNote(
          e instanceof ApiError && e.status === 404
            ? "当前没有可用画面；接管后请在电脑上查看和操作。"
            : e instanceof Error
              ? e.message
              : String(e),
        );
    } finally {
      if (generation === live.current) {
        blocked.current = false;
        setBusy(false);
      }
    }
  };
  const controllable =
    !!state?.available &&
    !!state.turn_id &&
    state.active &&
    state.used !== false;
  const resumable =
    !!state?.available &&
    !!state.turn_id &&
    ((controllable && (state.owner === "user" || state.paused)) ||
      !!state.unresolved);
  return (
    <section aria-label="电脑操作控制">
      <div className="resource-tabs">
        <h2>电脑控制</h2>
        <button disabled={busy || !!review} onClick={() => void refresh()}>
          刷新电脑状态
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!state && loading && <p className="empty">正在读取电脑任务状态…</p>}
      {state && (
        <article className="record-card">
          <h3>
            {!state.active
              ? "暂无电脑任务"
              : !state.available || state.used === false
                ? "本会话未使用电脑操作"
                : state.transferring
                  ? "正在交接控制权"
                  : state.owner === "user"
                    ? "已由你接管"
                    : state.paused
                      ? "电脑任务已暂停"
                      : state.waiting
                        ? "正在等待电脑控制权"
                        : "智能体正在操作电脑"}
          </h3>
          {state.surface?.app_id && (
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              当前应用：{state.surface.app_id}
            </p>
          )}
          {state.awaiting_permission && (
            <p>请在聊天中批准权限。</p>
          )}
          {state.human_reason && (
            <p style={{ whiteSpace: "pre-wrap" }}>{state.human_reason}</p>
          )}
          {state.owner === "user" && (
            <p>
              请到电脑操作，完成后交还智能体。
            </p>
          )}
          {state.unresolved && (
            <div className="action-card">
              <h3>有结果未确认的电脑操作</h3>
              <p style={{ overflowWrap: "anywhere" }}>
                操作编号：{state.unresolved.call_id}
              </p>
              <p>
                操作可能已生效。请核对电脑结果后再交还。
              </p>
            </div>
          )}
          <div className="actions">
            <button
              disabled={
                busy ||
                !!review ||
                !controllable ||
                state.owner === "user" ||
                state.transferring
              }
              onClick={() => begin("user")}
            >
              接管并暂停
            </button>
            <button
              disabled={busy || !!review || !resumable || state.transferring}
              onClick={() => begin("assistant")}
            >
              {state.active ? "交还智能体" : "核查未确认操作"}
            </button>
            <button
              disabled={busy || !!review || !controllable}
              onClick={() => begin("stopped")}
            >
              停止电脑任务
            </button>
          </div>
        </article>
      )}
      <button
        disabled={busy || !!review || !controllable}
        onClick={() => void capture()}
      >
        刷新电脑画面
      </button>
      {frameNote && (
        <p className="muted" role="status">
          {frameNote}
        </p>
      )}
      {frame && (
        <figure style={{ margin: "12px 0" }}>
          <img
            alt="当前电脑任务画面"
            src={`data:image/jpeg;base64,${frame.data}`}
            style={{ width: "100%", borderRadius: 12 }}
          />
          <figcaption className="muted">
            最近一次读取的画面，任务状态变化后需要刷新。
          </figcaption>
        </figure>
      )}
      {review && (
        <section
          className="action-card"
          role="dialog"
          aria-modal="true"
          aria-label={`${labels[review.owner]}确认`}
        >
          <h3>{labels[review.owner]}</h3>
          <p>
            {review.owner === "user"
              ? "将暂停智能体的电脑操作并等待输入停止。接管完成后，请到电脑上操作。"
              : review.owner === "stopped"
                ? "停止当前电脑任务。这会取消当前回合，不会撤销已经完成的操作。"
                : review.snapshot.active
                  ? "把电脑控制权交还给智能体，继续当前任务。"
                  : "确认这条历史操作的实际结果；不会重新启动已经结束的任务。"}
          </p>
          {review.owner === "assistant" && review.snapshot.unresolved && (
            <>
              <p style={{ overflowWrap: "anywhere", marginTop: 12 }}>
                待核查操作：{review.snapshot.unresolved.call_id}
              </p>
              <label style={{ flexDirection: "row", marginTop: 12 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                我已查看电脑实际状态及这条操作的记录，确认可以继续
              </label>
            </>
          )}
          <div className="actions">
            <button disabled={busy} onClick={close}>
              取消
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                (review.owner === "assistant" &&
                  !!review.snapshot.unresolved &&
                  !reviewed)
              }
              onClick={() => void control()}
            >
              确认{labels[review.owner]}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
