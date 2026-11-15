import { useState } from "react";
import { exportTextFile } from "./native-files";
import { Archive, Download, GitFork, RefreshCw, Trash2 } from "lucide-react";
import { type Detail, type Thread, RuntimeClient } from "./protocol";

const contextLabels: Record<string, string> = {
  system_prompt: "系统提示",
  tools: "内置工具",
  mcp: "MCP 工具",
  skills: "技能",
  rules: "项目规则",
  conversation: "对话",
};

export function SessionTools({
  client,
  detail,
  active,
  onChanged,
  onDeleted,
  onFork,
  onSync,
}: {
  client: RuntimeClient;
  detail: Detail;
  active: boolean;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  onFork: (thread: Thread) => void | Promise<void>;
  onSync: () => void;
}) {
  const [title, setTitle] = useState(detail.thread.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "compact" | null>(null);
  const [context, setContext] = useState<Record<string, number> | null>(null);
  const path = `/v1/threads/${encodeURIComponent(detail.thread.id)}`;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function exportMarkdown() {
    const text =
      `# ${detail.thread.title || "会话"}\n\n` +
      detail.items
        .filter((item) =>
          ["user_message", "agent_message", "assistant_message"].includes(
            item.kind,
          ),
        )
        .map(
          (item) =>
            `## ${item.kind === "user_message" ? "用户" : "助手"}\n\n${item.detail || item.summary || ""}`,
        )
        .join("\n\n");
    const result = await exportTextFile({
      name: `${detail.thread.id}.md`,
      text,
      mimeType: "text/markdown;charset=utf-8",
    });
    if (result !== "cancelled")
      setNotice(
        result === "shared"
          ? "已打开系统保存或分享"
          : "已生成 Markdown 下载文件",
      );
  }
  return (
    <div className="sheet-form">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await client.request(path, "PATCH", { title: title.trim() });
            await onChanged();
            setNotice("会话名称已保存");
          });
        }}
      >
        <label>
          会话名称
          <input
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={
            busy || !title.trim() || title.trim() === detail.thread.title
          }
        >
          保存名称
        </button>
      </form>
      <button
        className="menu-row"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const thread = await client.request<Thread>(
              `${path}/fork`,
              "POST",
              {},
            );
            await onFork(thread);
          })
        }
      >
        <GitFork size={18} />
        分叉会话
      </button>
      <button
        className="menu-row"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await client.request(path, "PATCH", {
              archived: !detail.thread.archived,
            });
            await onChanged();
            setNotice(
              detail.thread.archived
                ? "会话已恢复"
                : "会话已归档，可从已归档会话中恢复",
            );
          })
        }
      >
        <Archive size={18} />
        {detail.thread.archived ? "恢复会话" : "归档会话"}
      </button>
      <button
        className="menu-row"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            setContext(
              await client.request<Record<string, number>>(`${path}/context`),
            );
          })
        }
      >
        查看上下文用量
      </button>
      {context && (
        <section aria-label="上下文用量" className="record-card">
          <p>
            估算已用 {context.total.toLocaleString()} /{" "}
            {context.window.toLocaleString()} tokens
          </p>
          <progress
            max={context.window || 1}
            value={Math.min(context.total, context.window)}
            aria-label="上下文占用"
          />
          <dl>
            {Object.entries(contextLabels).map(([key, name]) => (
              <div
                key={key}
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <dt>{name}</dt>
                <dd>{(context[key] ?? 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">这是 Runtime 的上下文估算，不是账户计费金额。</p>
          <button
            disabled={busy || active}
            onClick={() => setConfirm("compact")}
          >
            压缩上下文
          </button>
          {active && <p className="muted">当前执行结束后可以压缩。</p>}
        </section>
      )}
      <button
        className="menu-row"
        disabled={busy}
        onClick={() => void run(exportMarkdown)}
      >
        <Download size={18} />
        导出对话 Markdown
      </button>
      <button className="menu-row" disabled={busy} onClick={onSync}>
        <RefreshCw size={18} />
        重新同步
      </button>
      <button
        className="menu-row"
        disabled={busy || active}
        onClick={() => setConfirm("delete")}
      >
        <Trash2 size={18} />
        删除会话
      </button>
      {confirm && (
        <section
          className="record-card"
          aria-label={confirm === "delete" ? "确认删除会话" : "确认压缩上下文"}
        >
          <p>
            {confirm === "delete"
              ? "永久删除该会话及其历史记录，无法撤销。工作区有未发布变更时，服务端会拒绝删除。"
              : "压缩会由电脑上的 Runtime 生成摘要，可能消耗模型额度。原始会话记录仍保留。"}
          </p>
          <button disabled={busy} onClick={() => setConfirm(null)}>
            取消
          </button>
          <button
            disabled={busy || active}
            onClick={() =>
              void run(async () => {
                if (confirm === "delete") {
                  await client.request(path, "DELETE");
                  await onDeleted();
                } else {
                  const turn = await client.request<{ id: string }>(
                    `${path}/compact`,
                    "POST",
                    {},
                  );
                  const updated = await client.request<Detail>(path);
                  const result = updated.items.find(
                    (item) =>
                      item.turn_id === turn.id &&
                      item.kind === "context_compaction",
                  );
                  setNotice(
                    result?.detail ||
                      result?.summary ||
                      "压缩请求已结束，请查看会话中的执行记录",
                  );
                  await onChanged();
                  setContext(
                    await client.request<Record<string, number>>(
                      `${path}/context`,
                    ),
                  );
                }
                setConfirm(null);
              })
            }
          >
            {confirm === "delete" ? "确认永久删除" : "确认压缩"}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
