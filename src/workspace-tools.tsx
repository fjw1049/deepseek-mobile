import { useEffect, useState } from "react";
import { Code2, Globe, RefreshCw, Folder, GitBranch } from "lucide-react";
import { RuntimeClient } from "./protocol";

type DiffFile = {
  path: string;
  op?: string;
  additions?: number;
  deletions?: number;
  unified_diff?: string;
  patch?: string;
  detail_truncated?: boolean;
};
type TurnChanges = {
  id: string;
  input_summary?: string;
  diff_snapshot?: { complete: boolean; files: DiffFile[] } | null;
};
type Environment = {
  workspace: string;
  execution_root: string;
  env_mode: string;
  worktree_branch?: string;
  publish_pending: boolean;
  publish_blocked: boolean;
  worktree_pending: boolean;
};
type BrowserView = {
  active: boolean;
  owner?: string;
  url?: string;
  image?: string | null;
  frame_status?: string;
  error?: string | null;
  tabs?: Array<{ title?: string; url?: string; id?: string }>;
};
const opNames: Record<string, string> = {
  create: "新增",
  update: "修改",
  delete: "删除",
  rename: "重命名",
  added: "新增",
  modified: "修改",
  deleted: "删除",
};

function FileDiff({
  file,
  expanded = false,
}: {
  file: DiffFile;
  expanded?: boolean;
}) {
  const patch = file.unified_diff ?? file.patch;
  return (
    <details className="record-card file-diff" open={expanded}>
      <summary style={{ cursor: "pointer", overflowWrap: "anywhere" }}>
        <b>{file.path}</b>
        <span style={{ display: "block", marginTop: 6, fontSize: 12 }}>
          {opNames[file.op ?? ""] ?? "变更"}{" "}
          {typeof file.additions === "number" && (
            <span style={{ color: "#479467" }}>+{file.additions} </span>
          )}
          {typeof file.deletions === "number" && (
            <span style={{ color: "#c15b57" }}>−{file.deletions}</span>
          )}
        </span>
      </summary>
      {patch ? (
        <pre
          aria-label={`${file.path} 差异`}
          style={{ overflow: "auto", whiteSpace: "pre", maxHeight: "45vh" }}
        >
          {patch.split("\n").map((line, index) => (
            <span
              key={index}
              style={{
                display: "block",
                color: line.startsWith("+")
                  ? "#479467"
                  : line.startsWith("-")
                    ? "#c15b57"
                    : undefined,
              }}
            >
              <i className="diff-line-number" aria-hidden="true">
                {index + 1}
              </i>
              {line || " "}
            </span>
          ))}
        </pre>
      ) : (
        <p className="muted">该文件没有可显示的文本差异，可能是二进制文件。</p>
      )}
      {file.detail_truncated && (
        <p className="muted">差异较长，电脑仅返回了部分内容。</p>
      )}
    </details>
  );
}

/** Observes existing Runtime state. Never starts a browser or takes control. */
export function WorkspaceTools({
  client,
  threadId,
  onError,
  initialTab = "changes",
  compact = false,
}: {
  client: RuntimeClient;
  threadId: string;
  onError?: (error: unknown) => void;
  initialTab?: "changes" | "browser";
  compact?: boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [turns, setTurns] = useState<TurnChanges[]>([]);
  const [conflicts, setConflicts] = useState<DiffFile[]>([]);
  const [browser, setBrowser] = useState<BrowserView | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError("");
    // Do not retain a different thread's frame or file paths while loading.
    setBrowser(null);
    setEnvironment(null);
    setTurns([]);
    setConflicts([]);
    const base = `/v1/threads/${encodeURIComponent(threadId)}`;
    const read = async () => {
      if (tab === "browser") {
        const view = await client.request<BrowserView>(
          `${base}/browser/view`,
          "GET",
          undefined,
          controller.signal,
        );
        if (live) setBrowser(view);
      } else {
        const [env, detail, comparison] = await Promise.all([
          client.request<Environment>(
            `${base}/environment`,
            "GET",
            undefined,
            controller.signal,
          ),
          client.request<{ turns: TurnChanges[] }>(
            base,
            "GET",
            undefined,
            controller.signal,
          ),
          client.request<{ files: DiffFile[] }>(
            `${base}/worktree/compare`,
            "GET",
            undefined,
            controller.signal,
          ),
        ]);
        if (live) {
          setEnvironment(env);
          setTurns(
            detail.turns
              .filter((turn) => turn.diff_snapshot?.files?.length)
              .reverse(),
          );
          setConflicts(comparison.files);
        }
      }
    };
    void read()
      .catch((failure: unknown) => {
        if (live) {
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
          onError?.(failure);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
    // onError is a notification callback, not a data-loading dependency.
  }, [client, threadId, tab, refresh]);
  return (
    <section
      aria-label="工作区结果"
      className={compact ? "compact-results" : undefined}
    >
      <div className="resource-tabs">
        <button
          className={tab === "changes" ? "selected" : ""}
          aria-pressed={tab === "changes"}
          onClick={() => setTab("changes")}
        >
          <Code2 size={14} /> 文件变更
        </button>
        <button
          className={tab === "browser" ? "selected" : ""}
          aria-pressed={tab === "browser"}
          onClick={() => setTab("browser")}
        >
          <Globe size={14} /> 浏览器
        </button>
        <button
          className="icon-button"
          aria-label="刷新工作区结果"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw size={17} className={loading ? "spin" : ""} />
        </button>
      </div>
      {loading ? (
        <p className="empty">正在读取会话的工作区…</p>
      ) : error ? (
        <div role="alert" className="error">
          <p>
            暂时无法读取{tab === "changes" ? "文件变更" : "浏览器画面"}：{error}
          </p>
          <button onClick={() => setRefresh((v) => v + 1)}>重试</button>
        </div>
      ) : tab === "changes" ? (
        <>
          {environment && (
            <details
              className="record-card environment-details"
              open={!compact}
            >
              <summary>
                <Folder size={14} /> 工作区信息
              </summary>
              <div className="card-label">
                <Folder size={16} /> 当前会话工作区
              </div>
              <p style={{ overflowWrap: "anywhere" }}>
                {environment.workspace}
              </p>
              <p className="muted" style={{ marginTop: 10 }}>
                {environment.env_mode === "worktree"
                  ? "隔离工作区"
                  : "项目目录"}
                {environment.worktree_pending ? " · 等待准备" : ""}
              </p>
              {environment.execution_root !== environment.workspace && (
                <p
                  className="muted"
                  style={{ overflowWrap: "anywhere", marginTop: 6 }}
                >
                  执行目录：{environment.execution_root}
                </p>
              )}
              {environment.worktree_branch && (
                <p style={{ marginTop: 8 }}>
                  <GitBranch size={13} /> {environment.worktree_branch}
                </p>
              )}
              {environment.publish_pending && (
                <p style={{ marginTop: 8 }}>
                  {environment.publish_blocked
                    ? "有变更等待解决版本冲突，请在电脑端处理。"
                    : "有变更尚未同步到项目目录。"}
                </p>
              )}
            </details>
          )}
          {conflicts.length > 0 && (
            <section>
              <h3>待选择版本的差异</h3>
              <p className="muted">项目文件 → 任务版本</p>
              {conflicts.map((file) => (
                <FileDiff key={file.path} file={file} />
              ))}
            </section>
          )}
          {turns.length === 0 ? (
            <div className="empty">
              <Code2 size={25} />
              <p>此会话还没有记录文件变更。</p>
              <p>这里显示每轮任务记录的差异，不代表整个仓库的 Git 状态。</p>
            </div>
          ) : (
            turns.map((turn, turnIndex) => (
              <section key={turn.id} style={{ marginTop: 20 }}>
                <h3
                  className="turn-change-title"
                  title={turn.input_summary}
                  style={{ fontSize: 14, overflowWrap: "anywhere" }}
                >
                  {turn.input_summary || "任务文件变更"}
                </h3>
                <p className="muted" style={{ marginTop: 7 }}>
                  {turn.diff_snapshot!.files.length} 个文件 ·{" "}
                  {turn.diff_snapshot!.complete
                    ? "本轮已完成"
                    : "本轮差异尚未收齐"}
                </p>
                {turn.diff_snapshot!.files.map((file, fileIndex) => (
                  <FileDiff
                    key={file.path}
                    file={file}
                    expanded={compact && turnIndex === 0 && fileIndex === 0}
                  />
                ))}
              </section>
            ))
          )}
        </>
      ) : (
        browser && (
          <>
            <article className="record-card">
              <div className="card-label">
                <Globe size={16} /> 电脑浏览器
              </div>
              <p>
                {browser.active ? "已连接" : "尚未打开或已断开"} ·{" "}
                {browser.owner === "user"
                  ? "由你控制"
                  : browser.owner === "stopped"
                    ? "已停止"
                    : "由智能体控制"}
              </p>
              {browser.url && (
                <p style={{ overflowWrap: "anywhere", marginTop: 10 }}>
                  {browser.url}
                </p>
              )}
            </article>
            {browser.error && (
              <p role="alert" className="error">
                {browser.error}
              </p>
            )}
            {browser.image?.startsWith("data:image/") ? (
              <figure style={{ margin: "12px 0" }}>
                <img
                  src={browser.image}
                  alt="电脑浏览器当前画面"
                  style={{ display: "block", width: "100%", borderRadius: 12 }}
                />
                <figcaption className="muted" style={{ marginTop: 9 }}>
                  最近一次获取的画面 · 点击刷新获取最新状态
                </figcaption>
              </figure>
            ) : (
              <div className="empty">
                <Globe size={26} />
                <p>
                  {browser.active
                    ? "浏览器正在操作或画面发生变化，稍后刷新。"
                    : "此会话还没有可预览的电脑浏览器画面。"}
                </p>
              </div>
            )}
            {!!browser.tabs?.length && (
              <article className="record-card">
                <h3 style={{ fontSize: 14 }}>已打开的标签页</h3>
                {browser.tabs.map((item, i) => (
                  <div
                    key={item.id ?? i}
                    style={{ marginTop: 13, overflowWrap: "anywhere" }}
                  >
                    <p>{item.title || "未命名标签页"}</p>
                    <small>{item.url}</small>
                  </div>
                ))}
              </article>
            )}
          </>
        )
      )}
    </section>
  );
}
