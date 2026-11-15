import { useEffect, useState } from "react";
import { RuntimeClient } from "./protocol";

type Change = { path: string; stage: string; status: string };
type Changes = {
  files: Change[];
  stagedFiles?: Change[];
  unstagedFiles?: Change[];
  has_hidden_files?: boolean;
  session_only?: boolean;
};
type Branches = {
  currentBranch: string | null;
  branches: { name: string }[];
  ahead: number;
  behind: number;
  upstream: string | null;
  hasRemote: boolean;
};
type Action = {
  name: string;
  label: string;
  body: Record<string, unknown>;
  detail: string;
};
export function GitTools({
  client,
  threadId,
}: {
  client: RuntimeClient;
  threadId: string;
}) {
  const [scope, setScope] = useState<"session" | "repository">("session");
  const [changes, setChanges] = useState<Changes | null>(null),
    [branches, setBranches] = useState<Branches | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [patch, setPatch] = useState<{ path: string; value: string } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState(""),
    [branch, setBranch] = useState("");
  const [review, setReview] = useState<Action | null>(null),
    [notice, setNotice] = useState("");
  const base = `/v1/threads/${encodeURIComponent(threadId)}/git`;
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setBusy(true);
    setError("");
    setChanges(null);
    setBranches(null);
    setSelected([]);
    setPatch(null);
    setReview(null);
    void Promise.all([
      client.request<Changes>(
        `${base}/changes${scope === "session" ? "?session_only=true" : ""}`,
        "GET",
        undefined,
        controller.signal,
      ),
      client.request<Branches>(
        `${base}/branches`,
        "GET",
        undefined,
        controller.signal,
      ),
    ])
      .then(([c, b]) => {
        if (live) {
          if (scope === "session" && c.session_only !== true) { setError("电脑服务尚未支持按会话筛选 Git，请更新服务后重试。"); return; }
          setChanges(c);
          setBranches(b);
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
  }, [client, base, refresh, scope]);
  return (
    <section aria-label="Git 工作区">
      <div className="resource-tabs">
        <strong>Git</strong>
        <button disabled={busy} onClick={() => setRefresh((v) => v + 1)}>
          刷新状态
        </button>
      </div>
      <label>变更范围<select aria-label="Git 变更范围" value={scope} disabled={busy} onChange={e => setScope(e.target.value as "session" | "repository")}><option value="session">当前会话</option><option value="repository">整个仓库</option></select></label>
      <p className="muted">{scope === "session" ? "本会话文件的当前变更" : "整个仓库 · 分支与远端操作影响全库"}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p className="muted">正在处理 Git…</p>}
      {branches && scope === "repository" && (
        <article className="record-card">
          <h3>{branches.currentBranch || "分离的 HEAD"}</h3>
          <p className="muted">
            领先 {branches.ahead} · 落后 {branches.behind}
            {branches.upstream ? ` · ${branches.upstream}` : " · 尚无上游分支"}
          </p>
          <label>
            切换分支
            <select
              value=""
              disabled={busy}
              onChange={(e) =>
                setReview({
                  name: "switch",
                  label: "切换分支",
                  body: { branch: e.target.value },
                  detail: `切换到 ${e.target.value}，会改变电脑工作区文件。`,
                })
              }
            >
              <option value="">选择已有分支</option>
              {branches.branches
                .filter((b) => b.name !== branches.currentBranch)
                .map((b) => (
                  <option key={b.name}>{b.name}</option>
                ))}
            </select>
          </label>
          <label>
            新分支名称
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="feature/my-change"
            />
          </label>
          <div className="actions">
            <button
              disabled={busy || !branch.trim()}
              onClick={() =>
                setReview({
                  name: "createBranch",
                  label: "创建并切换分支",
                  body: { branch: branch.trim() },
                  detail: `创建 ${branch.trim()} 并切换到它。`,
                })
              }
            >
              创建分支
            </button>
          </div>
          <div className="actions">
            <button
              disabled={busy || !branches.hasRemote}
              onClick={() =>
                setReview({
                  name: "pull",
                  label: "拉取远端更新",
                  body: {},
                  detail:
                    "从电脑已配置的远端拉取并更新当前分支，可能产生合并冲突。",
                })
              }
            >
              拉取
            </button>
            <button
              disabled={busy || !branches.hasRemote}
              onClick={() =>
                setReview({
                  name: "push",
                  label: "推送当前分支",
                  body: {},
                  detail:
                    "将电脑当前分支的提交发布到已配置远端。确认提交内容后继续。",
                })
              }
            >
              推送
            </button>
          </div>
        </article>
      )}
      {changes && (
        <>
          {changes.has_hidden_files && (
            <p className="muted">
              部分敏感文件或符号链接已隐藏；若暂存区包含这些文件，请在电脑端处理后提交。
            </p>
          )}
          {!changes.files.length && (
            <p className="empty">工作区没有可显示的变更。</p>
          )}
          {changes.files.map((file) => (
            <article className="record-card" key={file.path}>
              <label style={{ flexDirection: "row", alignItems: "center" }}>
                <input
                  style={{ width: "auto" }}
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(file.path)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, file.path]
                        : selected.filter((p) => p !== file.path),
                    )
                  }
                />
                <span style={{ overflowWrap: "anywhere" }}>{file.path}</span>
              </label>
              <p className="muted">
                {file.stage === "staged"
                  ? "已暂存"
                  : file.stage === "partial"
                    ? "部分暂存"
                    : "未暂存"}{" "}
                · {file.status}
              </p>
              {(file.stage === "partial"
                ? ["staged", "unstaged"]
                : [file.stage === "staged" ? "staged" : "unstaged"]
              ).map((scope) => (
                <button
                  key={scope}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const result = await client.request<{ patch: string }>(
                        `${base}/diff?path=${encodeURIComponent(file.path)}&scope=${scope}&untracked=${file.status === "untracked"}&session_only=${changes.session_only === true}`,
                      );
                      setPatch({
                        path: `${file.path} · ${scope === "staged" ? "已暂存" : "未暂存"}`,
                        value: result.patch,
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {scope === "staged" ? "查看已暂存差异" : "查看未暂存差异"}
                </button>
              ))}
            </article>
          ))}
          <div className="actions">
            <button
              disabled={busy || !selected.length}
              onClick={() =>
                setReview({
                  name: "stage",
                  label: "暂存选中文件",
                  body: { paths: selected, session_only: scope === "session" },
                  detail: selected.join("\n"),
                })
              }
            >
              暂存选中
            </button>
            <button
              disabled={busy || !selected.length}
              onClick={() =>
                setReview({
                  name: "unstage",
                  label: "取消暂存",
                  body: { paths: selected, session_only: scope === "session" },
                  detail: selected.join("\n"),
                })
              }
            >
              取消暂存
            </button>
          </div>
          <article className="record-card">
            <label>
              提交说明
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={4000}
              />
            </label>
            <div className="actions">
              <button
                disabled={
                  busy || !message.trim() || !selected.length
                }
                onClick={() =>
                  setReview({
                    name: "commit",
                    label: "提交选中文件",
                    body: { message: message.trim(), paths: selected, session_only: scope === "session" },
                    detail: `提交说明：${message.trim()}\n仅提交以下文件的当前完整内容（包含未暂存修改），其他已暂存文件不会随此次提交：\n${selected.join("\n")}\n若同一文件还包含其他人的修改，也会一并提交，请先查看差异。`,
                  })
                }
              >
                提交选中文件
              </button>
            </div>
          </article>
        </>
      )}
      {patch && (
        <article className="record-card">
          <h3 style={{ overflowWrap: "anywhere" }}>{patch.path}</h3>
          <button onClick={() => setPatch(null)}>关闭差异</button>
          <pre
            style={{ maxHeight: "50vh", overflow: "auto", whiteSpace: "pre" }}
          >
            {patch.value || "没有文本差异（可能仅文件模式发生变化）。"}
          </pre>
        </article>
      )}
      {review && (
        <section
          className="action-card"
          role="dialog"
          aria-modal="true"
          aria-label={review.label}
        >
          <h3>{review.label}</h3>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {review.detail}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => setReview(null)}>
              取消
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  await client.request(`${base}/${review.name}`, "POST", {
                    ...review.body,
                    confirm: true,
                  });
                  setNotice(`${review.label}完成`);
                  if (review.name === "commit") setMessage("");
                  setReview(null);
                  setRefresh((v) => v + 1);
                } catch (e) {
                  setReview(null);
                  setNotice(
                    `操作结果未确认，请核对刷新后的状态再操作。${e instanceof Error ? e.message : String(e)}`,
                  );
                  setRefresh((v) => v + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认{review.label}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
