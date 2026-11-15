import { useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RuntimeClient } from "./protocol";

type RecordData = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const statusNames: Record<string, string> = {
  active: "已启用",
  paused: "已暂停",
  running: "执行中",
  queued: "排队中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
  timed_out: "超时",
  pending: "等待中",
  skipped: "已跳过",
};
const status = (v: unknown) => statusNames[text(v)] ?? text(v);
const date = (v: unknown) => {
  const value = text(v);
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString()
    : value || "—";
};
function Panel({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="sheet resource-dialog"
      style={{
        width: "min(600px, calc(100% - 16px))",
        maxHeight: "90dvh",
        border: 0,
        margin: "auto auto 0",
        color: "inherit",
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="关闭详情" onClick={close}>
          关闭
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Content({ value }: { value: unknown }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{text(value)}</Markdown>
    </div>
  );
}
export function ResourceTools({
  client,
  data,
  resource,
  action,
  refresh,
  openThread,
}: {
  client: RuntimeClient;
  data: unknown;
  resource: "tasks" | "automations";
  action: (id: string, action: string) => void | Promise<void>;
  refresh: () => void | Promise<void>;
  openThread?: (id: string) => void;
}) {
  const raw = Array.isArray(data)
    ? data
    : (data as RecordData | null)?.[resource];
  const rows = Array.isArray(raw) ? (raw as RecordData[]) : [];
  const [detail, setDetail] = useState<RecordData | null>(null);
  const [conversation, setConversation] = useState<RecordData[] | null>(null);
  const [runs, setRuns] = useState<RecordData[] | null>(null);
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [deleting, setDeleting] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function show(row: RecordData) {
    setDetail(row);
    setConversation(null);
    setRuns(null);
    await perform(async () => {
      const path = `/v1/${resource}/${encodeURIComponent(text(row.id))}`;
      const record = await client.request<RecordData>(path);
      setDetail(record);
      if (resource === "tasks") {
        const result = await client.request<{
          conversation: { blocks: RecordData[] } | null;
        }>(path + "/conversation");
        setConversation(result.conversation?.blocks ?? []);
      } else
        setRuns(await client.request<RecordData[]>(path + "/runs?limit=20"));
    });
  }
  const errorView = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );
  return (
    <>
      {resource === "automations" && (
        <button
          className="suggestion"
          onClick={() => {
            setError("");
            setEditing({});
          }}
        >
          新建自动化
        </button>
      )}
      {!detail && !editing && !deleting && errorView}
      <div className="record-list">
        {!rows.length && (
          <div className="empty">
            <h2>暂无{resource === "tasks" ? "任务" : "自动化"}</h2>
            <p>
              {resource === "tasks"
                ? "Agent 创建的后台任务会显示在这里。"
                : "创建定时任务后，由电脑 Runtime 执行。"}
            </p>
          </div>
        )}
        {rows.map((row) => (
          <article className="record-card" key={text(row.id)}>
            <h3>
              {text(row.name) ||
                text(row.title) ||
                text(row.prompt_summary) ||
                text(row.prompt) ||
                text(row.id)}
            </h3>
            <span className="status-pill">{status(row.status)}</span>
            {resource === "automations" ? (
              <p className="muted">
                {text(row.schedule) || "单次任务"} · {text(row.timezone)}
                <br />
                下次执行：{date(row.next_run_at)}
              </p>
            ) : (
              <p className="muted">
                {text(row.model)} · {date(row.created_at)}
              </p>
            )}
            {!!row.result_summary && <Content value={row.result_summary} />}
            {!!row.error && <p role="status">{text(row.error)}</p>}
            <div className="actions">
              <button disabled={busy} onClick={() => void show(row)}>
                {resource === "tasks" ? "查看任务" : "详情与运行记录"}
              </button>
              {resource === "tasks" &&
                ["queued", "running"].includes(text(row.status)) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await action(text(row.id), "cancel");
                      })
                    }
                  >
                    停止任务
                  </button>
                )}
              {resource === "tasks" &&
                ["failed", "canceled", "timed_out"].includes(
                  text(row.status),
                ) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await action(text(row.id), "resume");
                      })
                    }
                  >
                    恢复任务
                  </button>
                )}
              {resource === "automations" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await action(
                          text(row.id),
                          row.status === "paused" ? "resume" : "pause",
                        );
                      })
                    }
                  >
                    {row.status === "paused" ? "启用" : "暂停"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await action(text(row.id), "run");
                      })
                    }
                  >
                    立即运行
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {detail && (
        <Panel
          title={resource === "tasks" ? "任务详情" : "自动化详情"}
          close={() => {
            if (!busy) setDetail(null);
          }}
        >
          <div className="sheet-form">
            {errorView}
            <h3>
              {text(detail.name) || text(detail.prompt_summary) || "任务"}
            </h3>
            <span className="status-pill">{status(detail.status)}</span>
            <Content value={detail.prompt} />
            <p className="muted">
              工作目录：
              {text(detail.workspace) ||
                (Array.isArray(detail.cwds)
                  ? detail.cwds.map(text).join("、")
                  : "—")}
            </p>
            <p className="muted">创建：{date(detail.created_at)}</p>
            {!!detail.result_summary && (
              <>
                <h3>执行结果</h3>
                <Content value={detail.result_summary} />
              </>
            )}
            {!!detail.live_text && <Content value={detail.live_text} />}
            {!!detail.error && <p role="status">{text(detail.error)}</p>}
            {!!detail.thread_id && openThread && (
              <button
                onClick={() => {
                  openThread(text(detail.thread_id));
                  setDetail(null);
                }}
              >
                打开所属会话
              </button>
            )}
            <button disabled={busy} onClick={() => void show(detail)}>
              {busy ? "加载中…" : "刷新详情"}
            </button>
            {resource === "tasks" && (
              <>
                <h3>执行过程</h3>
                {conversation?.length === 0 && (
                  <p className="muted">这条任务还没有保存执行过程。</p>
                )}
                {conversation?.map((block, i) => (
                  <article className="record-card" key={text(block.id) || i}>
                    <strong>
                      {(
                        {
                          user: "用户",
                          assistant: "助手",
                          reasoning: "思考",
                          tool: "工具",
                          system: "系统",
                        } as Record<string, string>
                      )[text(block.kind)] ?? text(block.kind)}
                    </strong>
                    {block.kind === "tool" || block.kind === "reasoning" ? (
                      <details>
                        <summary>
                          {text(block.title) || text(block.text) || "展开详情"}
                        </summary>
                        <Content value={block.detail || block.text} />
                      </details>
                    ) : (
                      <Content value={block.text} />
                    )}
                  </article>
                ))}
              </>
            )}
            {resource === "automations" && (
              <>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(detail);
                      setDetail(null);
                    }}
                  >
                    编辑自动化
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDeleting(detail);
                      setDetail(null);
                    }}
                  >
                    删除自动化
                  </button>
                </div>
                <h3>最近运行记录</h3>
                {runs?.length === 0 && <p className="muted">尚未执行过。</p>}
                {runs?.map((run) => (
                  <article className="record-card" key={text(run.id)}>
                    <strong>{status(run.status)}</strong>
                    <p>{date(run.started_at || run.scheduled_for)}</p>
                    {!!run.error && <p>{text(run.error)}</p>}
                    {!!run.delivery_error && (
                      <p>投递失败：{text(run.delivery_error)}</p>
                    )}
                    {openThread && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const result = await client.request<{
                              thread_id: string;
                            }>(
                              `/v1/automations/${encodeURIComponent(text(detail.id))}/runs/${encodeURIComponent(text(run.id))}/discussion`,
                              "POST",
                            );
                            openThread(result.thread_id);
                            setDetail(null);
                          })
                        }
                      >
                        打开运行讨论
                      </button>
                    )}
                  </article>
                ))}
              </>
            )}
          </div>
        </Panel>
      )}
      {editing && (
        <Panel
          title={editing.id ? "编辑自动化" : "新建自动化"}
          close={() => {
            if (!busy) setEditing(null);
          }}
        >
          <AutomationForm
            initial={editing}
            busy={busy}
            error={errorView}
            save={(body) =>
              void perform(async () => {
                await client.request(
                  editing.id
                    ? `/v1/automations/${encodeURIComponent(text(editing.id))}`
                    : "/v1/automations",
                  editing.id ? "PATCH" : "POST",
                  body,
                );
                setEditing(null);
                await refresh();
              })
            }
          />
        </Panel>
      )}
      {deleting && (
        <Panel
          title="删除自动化"
          close={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <div className="sheet-form">
            {errorView}
            <p>删除“{text(deleting.name)}”及其运行记录？此操作不可撤销。</p>
            <button disabled={busy} onClick={() => setDeleting(null)}>
              保留自动化
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await client.request(
                    `/v1/automations/${encodeURIComponent(text(deleting.id))}`,
                    "DELETE",
                  );
                  setDeleting(null);
                  await refresh();
                })
              }
            >
              确认删除自动化
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}
function AutomationForm({
  initial,
  busy,
  error,
  save,
}: {
  initial: RecordData;
  busy: boolean;
  error: ReactNode;
  save: (body: RecordData) => void;
}) {
  const [name, setName] = useState(text(initial.name)),
    [prompt, setPrompt] = useState(text(initial.prompt));
  const [schedule, setSchedule] = useState(
      text(initial.schedule) || "0 9 * * *",
    ),
    [timezone, setTimezone] = useState(
      text(initial.timezone) ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  const [kind, setKind] = useState(
    initial.id && !initial.schedule ? "once" : "cron",
  );
  const [runAt, setRunAt] = useState(text(initial.next_run_at));
  const [cwds, setCwds] = useState(
    Array.isArray(initial.cwds) ? initial.cwds.map(text).join("\n") : "",
  );
  const [localError, setLocalError] = useState("");
  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        setLocalError("");
        const body: RecordData = {
          name: name.trim(),
          prompt: prompt.trim(),
          timezone: timezone.trim(),
          ...(initial.id ? {} : { status: "paused" }),
        };
        if (cwds.trim())
          body.cwds = cwds
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        if (kind === "cron") body.schedule = schedule.trim();
        else {
          if (
            !/(Z|[+-]\d{2}:\d{2})$/.test(runAt) ||
            Number.isNaN(Date.parse(runAt))
          ) {
            setLocalError("请输入带时区的时间，例如 2027-01-01T09:00:00+08:00");
            return;
          }
          body.run_at = runAt;
        }
        save(body);
      }}
    >
      {error}
      {localError && <p role="alert">{localError}</p>}
      <label>
        名称
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        任务指令
        <textarea
          required
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <label>
        执行频率
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="cron">重复执行</option>
          <option value="once">仅一次</option>
        </select>
      </label>
      {kind === "cron" ? (
        <label>
          Cron 表达式
          <input
            required
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          />
          <small>分钟 小时 日期 月份 星期；0 9 * * * 表示每天 09:00。</small>
        </label>
      ) : (
        <label>
          执行时间（含时区）
          <input
            required
            placeholder="2027-01-01T09:00:00+08:00"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
          />
        </label>
      )}
      <label>
        时区
        <input
          required
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </label>
      <label>
        电脑工作目录（每行一个）
        <textarea
          rows={2}
          value={cwds}
          onChange={(e) => setCwds(e.target.value)}
          placeholder={
            initial.id ? "留空保留当前目录" : "留空使用电脑服务的默认目录"
          }
        />
      </label>
      {!initial.id && (
        <p className="muted">
          保存后默认暂停。检查任务后点“启用”开始调度；执行会消耗电脑上配置的模型额度。
        </p>
      )}
      <button
        className="primary"
        disabled={busy || !name.trim() || !prompt.trim()}
        type="submit"
      >
        {busy ? "保存中…" : "保存自动化"}
      </button>
    </form>
  );
}
