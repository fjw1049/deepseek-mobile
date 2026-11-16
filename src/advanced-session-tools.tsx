import { useState } from "react";
import { RuntimeClient, type Detail } from "./protocol";

type Data = Record<string, unknown>;
type Props = {
  client: RuntimeClient;
  detail: Detail;
  onChanged: () => void | Promise<void>;
  onOpenThread: (id: string) => void | Promise<void>;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    run,
    setNotice,
    messages: (
      <>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </>
    ),
  };
}
export function AdvancedSessionTools(props: Props) {
  return (
    <div className="sheet-form">
      <details>
        <summary>目标预算与队列</summary>
        <GoalTools {...props} />
      </details>
      <details>
        <summary>回退对话与恢复文件</summary>
        <RewindTools {...props} />
      </details>
      <details>
        <summary>分享与导入会话</summary>
        <SharingTools {...props} />
      </details>
    </div>
  );
}
export function GoalTools({ client, detail, onChanged }: Props) {
  const a = useAction(),
    goal = detail.thread.goal;
  const queue =
    (detail.thread as typeof detail.thread & { goal_queue?: Data[] })
      .goal_queue ?? [];
  const limits = (goal?.budget_limits ?? {}) as Data;
  const [tokens, setTokens] = useState(""),
    [turns, setTurns] = useState(""),
    [seconds, setSeconds] = useState(""),
    [objective, setObjective] = useState("");
  const [cancel, setCancel] = useState(false);
  const path = `/v1/threads/${encodeURIComponent(detail.thread.id)}/goal`;
  async function command(args: string) {
    if (!str(goal?.goal_id)) throw new Error("请先刷新目标状态");
    await client.request(path, "POST", {
      args,
      expected_goal_id: goal!.goal_id,
      resume_after_budget: false,
    });
    await onChanged();
    a.setNotice("目标已更新");
  }
  return (
    <div className="sheet-form">
      {a.messages}
      {!goal ? (
        <p>暂无目标。在输入框选择「目标」开始。</p>
      ) : (
        <>
          <p>{str(goal.objective)}</p>
          <p className="muted">
            状态：{str(goal.status)} · 已用 Token：
            {Number(goal.tokens_used ?? 0)} · 已用轮次：
            {Number(goal.turns_used ?? 0)}
          </p>
          <p className="muted">
            当前上限：Token {String(limits.token_budget ?? "不限")} / 轮次{" "}
            {String(limits.turn_budget ?? "不限")} / 秒{" "}
            {limits.wall_clock_budget_ms
              ? Number(limits.wall_clock_budget_ms) / 1000
              : "不限"}
          </p>
          <form
            className="sheet-form"
            onSubmit={(e) => {
              e.preventDefault();
              void a.run(async () => {
                const values = [
                  ["tokens", tokens],
                  ["turns", turns],
                  ["seconds", seconds],
                ].filter(([, v]) => v.trim());
                if (
                  !values.length ||
                  values.some(
                    ([, v]) =>
                      !/^[1-9]\d*$/.test(v.trim()) ||
                      !Number.isSafeInteger(Number(v)),
                  )
                )
                  throw new Error("至少填写一项正整数预算");
                await command(
                  "budget " +
                    values.map(([k, v]) => `${k} ${v.trim()}`).join(" "),
                );
              });
            }}
          >
            <label>
              Token 总预算
              <input
                inputMode="numeric"
                value={tokens}
                onChange={(e) => setTokens(e.target.value)}
                placeholder="留空保留当前上限"
              />
            </label>
            <label>
              总轮次预算
              <input
                inputMode="numeric"
                value={turns}
                onChange={(e) => setTurns(e.target.value)}
                placeholder="留空保留当前上限"
              />
            </label>
            <label>
              总时长预算（秒）
              <input
                inputMode="numeric"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                placeholder="留空保留当前上限"
              />
            </label>
            <p className="muted">
              预算是累计上限，包含已经使用的额度。修改预算不会自动恢复暂停的目标。
            </p>
            <button className="primary" disabled={a.busy}>
              保存目标预算
            </button>
          </form>
          {goal.status !== "complete" &&
            goal.status !== "cancelled" &&
            goal.status !== "canceled" && (
              <button disabled={a.busy} onClick={() => setCancel(true)}>
                取消当前目标
              </button>
            )}
          {cancel && (
            <div className="record-card">
              <p>取消当前目标并中断其正在进行的轮次？</p>
              <button disabled={a.busy} onClick={() => setCancel(false)}>
                保留目标
              </button>
              <button
                disabled={a.busy}
                onClick={() =>
                  void a.run(async () => {
                    await command("cancel");
                    setCancel(false);
                  })
                }
              >
                确认取消目标
              </button>
            </div>
          )}
          <h3>后续目标队列</h3>
          {queue.length === 0 && <p className="muted">暂无后续目标。</p>}
          {queue.map((item, index) => (
            <article className="record-card" key={str(item.item_id) || index}>
              <p>
                {index + 1}. {str(item.objective)}
              </p>
              <div className="actions">
                <button
                  disabled={a.busy || index === 0}
                  onClick={() =>
                    void a.run(() =>
                      command(`next manage move ${index + 1} ${index}`),
                    )
                  }
                >
                  上移
                </button>
                <button
                  disabled={a.busy || index === queue.length - 1}
                  onClick={() =>
                    void a.run(() =>
                      command(`next manage move ${index + 1} ${index + 2}`),
                    )
                  }
                >
                  下移
                </button>
                <button
                  disabled={a.busy}
                  onClick={() =>
                    void a.run(() => command(`next manage delete ${index + 1}`))
                  }
                >
                  移出队列
                </button>
              </div>
            </article>
          ))}
          {goal.status !== "complete" && (
            <form
              className="sheet-form"
              onSubmit={(e) => {
                e.preventDefault();
                void a.run(async () => {
                  if (!objective.trim()) return;
                  await command(`next -- ${objective.trim()}`);
                  setObjective("");
                });
              }}
            >
              <label>
                后续目标
                <textarea
                  required
                  maxLength={4000}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                />
              </label>
              <p className="muted">
                完成当前目标后继续执行，按模型用量计费。
              </p>
              <button disabled={a.busy || !objective.trim()}>
                加入目标队列
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
export function RewindTools({ client, detail, onChanged }: Props) {
  const a = useAction(),
    [itemId, setItemId] = useState(""),
    [mode, setMode] = useState("conversation"),
    [preview, setPreview] = useState<Data | null>(null),
    [result, setResult] = useState<Data | null>(null),
    [ack, setAck] = useState(false);
  const path = `/v1/threads/${encodeURIComponent(detail.thread.id)}`;
  const active = detail.turns.some((t) =>
    ["running", "in_progress", "queued"].includes(t.status),
  );
  const points = detail.items.filter((i) => i.kind === "user_message");
  return (
    <div className="sheet-form">
      {a.messages}
      <label>
        回退位置
        <select
          value={itemId}
          disabled={a.busy}
          onChange={(e) => {
            setItemId(e.target.value);
            setPreview(null);
            setAck(false);
            setResult(null);
          }}
        >
          <option value="">选择一条用户消息之前</option>
          {points.map((i) => (
            <option key={i.id} value={i.id}>
              {(i.summary || i.detail || i.id).slice(0, 100)}
            </option>
          ))}
        </select>
      </label>
      <label>
        回退范围
        <select
          value={mode}
          disabled={a.busy}
          onChange={(e) => {
            setMode(e.target.value);
            setAck(false);
            setResult(null);
          }}
        >
          <option value="conversation">仅回退对话</option>
          <option value="files">仅恢复文件，保留对话</option>
          <option value="both">回退对话并恢复文件</option>
        </select>
      </label>
      {active && <p>请先停止当前轮次，再进行回退。</p>}
      <button
        disabled={!itemId || a.busy || active}
        onClick={() =>
          void a.run(async () => {
            setPreview(null);
            setAck(false);
            setResult(null);
            setPreview(
              await client.request<Data>(
                `${path}/rewind-preview?before_item_id=${encodeURIComponent(itemId)}`,
              ),
            );
          })
        }
      >
        预览回退影响
      </button>
      {preview && (
        <div className="sheet-form">
          <p>
            此位置之后涉及 {Number(preview.turns ?? 0)} 轮对话。
            {mode !== "files" && "所选消息及其后的对话记录将被移除。"}
          </p>
          {mode !== "conversation" && (
            <>
              <FileList title="待恢复文件" values={preview.files} />
              <FileList
                title="存在冲突，将保留当前内容"
                values={preview.conflicts}
              />
              <FileList title="将跳过的文件" values={preview.skipped} />
              <FileList title="缺失工作区" values={preview.missing_roots} />
              {Number(preview.no_checkpoint) > 0 && (
                <p>
                  {Number(preview.no_checkpoint)}{" "}
                  轮没有文件检查点，无法完整恢复。
                </p>
              )}
            </>
          )}
          <label style={{ display: "flex", gap: 8, alignItems: "start" }}>
            <input
              type="checkbox"
              style={{ width: 20 }}
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            我已查看影响范围，确认执行所选回退操作。
          </label>
          <button
            className="primary"
            disabled={a.busy || !ack || active}
            onClick={() =>
              void a.run(async () => {
                const response = await client.request<Data>(
                  `${path}/${mode === "files" ? "restore-code" : "rewind"}`,
                  "POST",
                  {
                    before_item_id: itemId,
                    force_conflicts: false,
                    ...(mode === "files"
                      ? {}
                      : { restore_files: mode === "both" }),
                  },
                );
                setResult((response.rewind_result as Data) ?? response);
                setPreview(null);
                setAck(false);
                await onChanged();
                a.setNotice("回退操作完成，请查看实际恢复结果");
              })
            }
          >
            确认执行回退
          </button>
        </div>
      )}
      {result && (
        <>
          <FileList
            title="已恢复文件"
            values={result.restored_files ?? result.restored}
          />
          <FileList title="已合并文件" values={result.merged_files} />
          <FileList title="冲突文件，未覆盖" values={result.conflicted_files} />
          <FileList
            title="跳过文件"
            values={result.skipped_files ?? result.skipped}
          />
          <FileList title="缺失工作区" values={result.missing_roots} />
        </>
      )}
    </div>
  );
}
function FileList({ title, values }: { title: string; values: unknown }) {
  const files = list(values);
  return files.length ? (
    <div>
      <h4>{title}</h4>
      <ul>
        {files.map((p) => (
          <li key={p} style={{ overflowWrap: "anywhere" }}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  ) : null;
}
export function SharingTools({ client, detail, onOpenThread }: Props) {
  const a = useAction(),
    [settings, setSettings] = useState<Data | null>(null),
    [project, setProject] = useState(false),
    [days, setDays] = useState("7"),
    [uploadAck, setUploadAck] = useState(false),
    [created, setCreated] = useState<Data | null>(null),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState<Data | null>(null),
    [workspace, setWorkspace] = useState(""),
    [restoreProject, setRestoreProject] = useState(false),
    [restoreAck, setRestoreAck] = useState(false),
    [revoke, setRevoke] = useState(false);
  return (
    <div className="sheet-form">
      {a.messages}
      <h3>创建分享链接</h3>
      <p className="muted">
        会话将上传至分享服务，持链接者可阅读。
      </p>
      <button
        disabled={a.busy}
        onClick={() =>
          void a.run(async () => {
            setSettings(await client.request<Data>("/v1/sharing/settings"));
            setUploadAck(false);
          })
        }
      >
        检查分享服务
      </button>
      {settings && (
        <>
          <p style={{ overflowWrap: "anywhere" }}>
            上传目标：{str(settings.service_url)}
          </p>
          {!settings.ready && <p>分享服务尚未就绪，请先在电脑配置。</p>}
          <label>
            链接有效期（天）
            <input
              type="number"
              min="1"
              max="30"
              value={days}
              onChange={(e) => {
                setDays(e.target.value);
                setUploadAck(false);
              }}
            />
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={project}
              onChange={(e) => {
                setProject(e.target.checked);
                setUploadAck(false);
              }}
            />
            包含项目文件快照
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={uploadAck}
              onChange={(e) => setUploadAck(e.target.checked)}
            />
            确认将当前会话{project ? "和项目文件" : ""}上传至上述服务
          </label>
          <button
            disabled={
              a.busy ||
              !settings.ready ||
              !uploadAck ||
              !Number.isInteger(Number(days)) ||
              Number(days) < 1 ||
              Number(days) > 30
            }
            onClick={() =>
              void a.run(async () => {
                setCreated(
                  await client.request<Data>("/v1/sharing/shares", "POST", {
                    thread_id: detail.thread.id,
                    include_project: project,
                    expires_in_days: Number(days),
                  }),
                );
                setUploadAck(false);
              })
            }
          >
            创建分享链接
          </button>
        </>
      )}
      {created && (
        <div className="record-card">
          <p style={{ overflowWrap: "anywhere" }}>{str(created.url)}</p>
          <p>到期：{str(created.expires_at)}</p>
          <button
            onClick={() =>
              void a.run(async () => {
                await navigator.clipboard.writeText(str(created.url));
                a.setNotice("分享链接已复制");
              })
            }
          >
            复制分享链接
          </button>
          <button
            onClick={() => {
              setUrl(str(created.url));
              setPreview(null);
              setRevoke(true);
            }}
          >
            撤销此链接
          </button>
        </div>
      )}
      <h3>导入或撤销分享</h3>
      <label>
        分享链接
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPreview(null);
            setRestoreAck(false);
            setRevoke(false);
          }}
        />
      </label>
      <button
        disabled={a.busy || !url.trim()}
        onClick={() =>
          void a.run(async () => {
            setPreview(null);
            setRestoreAck(false);
            setPreview(
              await client.request<Data>("/v1/sharing/preview", "POST", {
                url: url.trim(),
              }),
            );
          })
        }
      >
        预览分享内容
      </button>
      {preview && (
        <>
          <h4>{str(preview.title)}</h4>
          <p>
            {Number(preview.turn_count ?? 0)} 轮对话 · {str(preview.model)}
          </p>
          <FileList title="项目快照文件" values={preview.files} />
          {Array.isArray(preview.messages) &&
            preview.messages.map((message: Data, i) => (
              <details key={i}>
                <summary>
                  {message.role === "user_message" ? "用户" : "助手"}消息{" "}
                  {i + 1}
                </summary>
                <p style={{ whiteSpace: "pre-wrap" }}>{str(message.text)}</p>
              </details>
            ))}
          <label>
            导入到电脑目录
            <input
              value={workspace}
              onChange={(e) => {
                setWorkspace(e.target.value);
                setRestoreAck(false);
              }}
              placeholder="不恢复文件时可留空创建独立目录"
            />
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={restoreProject}
              onChange={(e) => {
                setRestoreProject(e.target.checked);
                setRestoreAck(false);
              }}
            />
            恢复项目快照到所选项目旁的新工作区
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={restoreAck}
              onChange={(e) => setRestoreAck(e.target.checked)}
            />
            已查看内容，确认导入会话{restoreProject ? "及文件" : ""}
          </label>
          <button
            disabled={
              a.busy || !restoreAck || (restoreProject && !workspace.trim())
            }
            onClick={() =>
              void a.run(async () => {
                const thread = await client.request<{ id: string }>(
                  "/v1/sharing/restore",
                  "POST",
                  {
                    url: url.trim(),
                    workspace: workspace.trim() || null,
                    restore_project: restoreProject,
                  },
                );
                setPreview(null);
                setRestoreAck(false);
                await onOpenThread(thread.id);
              })
            }
          >
            确认导入分享
          </button>
        </>
      )}
      <button disabled={a.busy || !url.trim()} onClick={() => setRevoke(true)}>
        撤销输入的分享链接
      </button>
      {revoke && (
        <div className="record-card">
          <p style={{ overflowWrap: "anywhere" }}>
            确认撤销 {url}？其他人将无法再读取该链接。
          </p>
          <button disabled={a.busy} onClick={() => setRevoke(false)}>
            保留链接
          </button>
          <button
            disabled={a.busy}
            onClick={() =>
              void a.run(async () => {
                await client.request("/v1/sharing/revoke", "POST", {
                  url: url.trim(),
                });
                setRevoke(false);
                if (created?.url === url) setCreated(null);
                a.setNotice("分享链接已撤销");
              })
            }
          >
            确认撤销分享
          </button>
        </div>
      )}
    </div>
  );
}
