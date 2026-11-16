import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RuntimeClient } from "./protocol";
type Data = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const api = "/v1/mobile-settings";
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
export function SkillManagement({
  client,
  onChanged,
}: {
  client: RuntimeClient;
  onChanged: () => void | Promise<void>;
}) {
  const a = useAction(),
    [rows, setRows] = useState<Data[]>([]),
    [doc, setDoc] = useState<Data | null>(null),
    [source, setSource] = useState(""),
    [name, setName] = useState(""),
    [ack, setAck] = useState(false),
    [removing, setRemoving] = useState<Data | null>(null);
  async function load() {
    const result = await client.request<{ skills: Data[] }>(api + "/skills");
    setRows(result.skills);
  }
  useEffect(() => {
    void a.run(load);
  }, [client]);
  return (
    <details>
      <summary>管理电脑用户技能</summary>
      <div className="sheet-form">
        {a.messages}
        <button disabled={a.busy} onClick={() => void a.run(load)}>
          刷新用户技能
        </button>
        {rows.map((row) => (
          <article className="record-card" key={text(row.id)}>
            <h3>{text(row.name)}</h3>
            <p>{text(row.description)}</p>
            <p>{row.builtin ? "内置技能" : "用户技能"}</p>
            <button
              disabled={a.busy}
              onClick={() =>
                void a.run(async () =>
                  setDoc(
                    await client.request<Data>(
                      api + "/skills/" + encodeURIComponent(text(row.id)),
                    ),
                  ),
                )
              }
            >
              阅读 {text(row.name)}
            </button>
            <button
              disabled={a.busy || !row.can_delete}
              onClick={() => setRemoving(row)}
            >
              删除 {text(row.name)}
            </button>
          </article>
        ))}
        {doc && (
          <section className="record-card">
            <h3>{text(doc.name)}</h3>
            <div className="markdown">
              <Markdown remarkPlugins={[remarkGfm]}>
                {text(doc.content)}
              </Markdown>
            </div>
            <button onClick={() => setDoc(null)}>收起技能文档</button>
          </section>
        )}
        {removing && (
          <section className="record-card" aria-label="确认删除技能">
            <p>从电脑删除 {text(removing.name)}？</p>
            <button disabled={a.busy} onClick={() => setRemoving(null)}>
              保留技能
            </button>
            <button
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  await client.request(
                    api + "/skills/" + encodeURIComponent(text(removing.id)),
                    "DELETE",
                    { confirm: true },
                  );
                  setRemoving(null);
                  setDoc(null);
                  await load();
                  await onChanged();
                })
              }
            >
              确认删除技能
            </button>
          </section>
        )}
        <form
          className="sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (a.busy || !ack) return;
            void a.run(async () => {
              const result = await client.request<Data>(
                api + "/skills/install",
                "POST",
                {
                  source: source.trim(),
                  name: name.trim() || undefined,
                  confirm: true,
                },
              );
              setAck(false);
              await load();
              await onChanged();
              a.setNotice(text(result.message));
            });
          }}
        >
          <h3>安装用户技能</h3>
          <label>
            技能来源
            <input
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setAck(false);
              }}
              placeholder="github:owner/repo 或电脑本机目录"
              required
            />
          </label>
          <label>
            安装目录名称（可选）
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAck(false);
              }}
            />
          </label>
          <p className="muted">
            安装到电脑用户目录，默认不授信。
          </p>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            确认下载或复制此技能到电脑
          </label>
          <button disabled={a.busy || !ack || !source.trim()}>
            确认安装技能
          </button>
        </form>
      </div>
    </details>
  );
}
export function ProjectMemory({
  client,
  threadId,
}: {
  client: RuntimeClient;
  threadId: string;
}) {
  const a = useAction(),
    [rows, setRows] = useState<Data[]>([]),
    [offset, setOffset] = useState(0),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Data | null>(null),
    [content, setContent] = useState(""),
    [kind, setKind] = useState("preference"),
    [applicability, setApplicability] = useState(""),
    [removing, setRemoving] = useState<Data | null>(null);
  const path = `${api}/threads/${encodeURIComponent(threadId)}/memories`;
  async function load(next = offset) {
    const result = await client.request<{ entries: Data[] }>(
      `${path}?offset=${next}&query=${encodeURIComponent(query)}`,
    );
    setRows(result.entries);
    setOffset(next);
  }
  useEffect(() => {
    setEditing(null);
    setContent("");
    setOffset(0);
    void a.run(() => load(0));
  }, [client, threadId]);
  return (
    <details>
      <summary>项目记忆</summary>
      <div className="sheet-form">
        {a.messages}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(() => load(0));
          }}
        >
          <label>
            搜索项目记忆
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button disabled={a.busy}>搜索记忆</button>
        </form>
        {rows.map((row) => (
          <article className="record-card" key={text(row.id)}>
            <p>{text(row.content)}</p>
            <p className="muted">
              {text(row.kind)} · 版本 {Number(row.revision)} ·{" "}
              {text(row.status)}
            </p>
            {!!row.applicability && <p>适用范围：{text(row.applicability)}</p>}
            {!!row.stale_reason && <p>当前不适用：{text(row.stale_reason)}</p>}
            <button
              disabled={a.busy}
              onClick={() => {
                setEditing(row);
                setContent(text(row.content));
                setKind(text(row.kind));
                setApplicability(text(row.applicability));
              }}
            >
              编辑记忆
            </button>
            <button disabled={a.busy} onClick={() => setRemoving(row)}>
              删除记忆
            </button>
          </article>
        ))}
        {!rows.length && <p className="muted">当前没有匹配的项目记忆。</p>}
        <div className="actions">
          <button
            disabled={a.busy || offset === 0}
            onClick={() => void a.run(() => load(Math.max(0, offset - 20)))}
          >
            上一页记忆
          </button>
          <button
            disabled={a.busy || rows.length < 20}
            onClick={() => void a.run(() => load(offset + 20))}
          >
            下一页记忆
          </button>
        </div>
        {removing && (
          <div className="record-card">
            <p>忘记这条记忆：{text(removing.content)}？</p>
            <button onClick={() => setRemoving(null)}>保留记忆</button>
            <button
              disabled={a.busy}
              onClick={() =>
                void a.run(async () => {
                  await client.request(
                    path + "/" + encodeURIComponent(text(removing.id)),
                    "DELETE",
                    { revision: removing.revision, confirm: true },
                  );
                  setRemoving(null);
                  await load();
                })
              }
            >
              确认删除记忆
            </button>
          </div>
        )}
        <form
          className="sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(async () => {
              await client.request(
                editing
                  ? path + "/" + encodeURIComponent(text(editing.id))
                  : path,
                editing ? "PATCH" : "POST",
                {
                  content: content.trim(),
                  kind,
                  applicability,
                  revision: editing?.revision,
                },
              );
              setEditing(null);
              setContent("");
              setApplicability("");
              await load(0);
              a.setNotice("项目记忆已保存");
            });
          }}
        >
          <h3>{editing ? "编辑项目记忆" : "新增项目记忆"}</h3>
          <label>
            记忆内容
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              required
            />
          </label>
          <label>
            记忆类型
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="preference">偏好</option>
              <option value="constraint">约束</option>
              <option value="decision">决策</option>
              <option value="lesson">经验</option>
            </select>
          </label>
          <label>
            适用范围
            <textarea
              value={applicability}
              onChange={(e) => setApplicability(e.target.value)}
              maxLength={500}
            />
          </label>
          <button disabled={a.busy || !content.trim()}>保存项目记忆</button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setContent("");
                setApplicability("");
              }}
            >
              取消记忆编辑
            </button>
          )}
        </form>
      </div>
    </details>
  );
}
export function McpManagement({
  client,
  onChanged,
}: {
  client: RuntimeClient;
  onChanged: () => void | Promise<void>;
}) {
  const a = useAction(),
    [rows, setRows] = useState<Data[]>([]),
    [revision, setRevision] = useState(""),
    [name, setName] = useState(""),
    [transport, setTransport] = useState("streamablehttp"),
    [url, setUrl] = useState(""),
    [command, setCommand] = useState(""),
    [args, setArgs] = useState(""),
    [env, setEnv] = useState(""),
    [headers, setHeaders] = useState(""),
    [enabled, setEnabled] = useState(false),
    [policy, setPolicy] = useState("progressive"),
    [ack, setAck] = useState(false);
  async function load() {
    const result = await client.request<{ servers: Data[]; revision: string }>(
      api + "/mcp",
    );
    setRows(result.servers);
    setRevision(result.revision);
    setAck(false);
  }
  useEffect(() => {
    void a.run(load);
  }, [client]);
  function choose(row?: Data) {
    setName(text(row?.name));
    setTransport(text(row?.transport) || "streamablehttp");
    setEnabled(row?.enabled === true);
    setPolicy(text(row?.load_policy) || "progressive");
    setUrl("");
    setCommand("");
    setArgs("");
    setEnv("");
    setHeaders("");
    setAck(false);
  }
  function pairs(value: string) {
    const result: Record<string, string> = {};
    for (const line of value.split("\n").filter((s) => s.trim())) {
      const at = line.indexOf("=");
      if (at < 1) throw new Error("环境变量和请求头使用每行 名称=值");
      result[line.slice(0, at).trim()] = line.slice(at + 1);
    }
    return result;
  }
  return (
    <details>
      <summary>管理 MCP 配置</summary>
      <div className="sheet-form">
        {a.messages}
        <p className="muted">
          保存后需重启电脑服务，再启动连接器。
        </p>
        <button disabled={a.busy} onClick={() => void a.run(load)}>
          刷新 MCP 配置
        </button>
        {rows.map((row) => (
          <article className="record-card" key={text(row.name)}>
            <h3>{text(row.name)}</h3>
            <p>
              {text(row.transport)} · {row.enabled ? "启用" : "停用"} ·{" "}
              {text(row.url_origin)}
            </p>
            <p className="muted">
              {row.has_env ? "已有环境变量 · " : ""}
              {row.has_headers ? "已有请求头 · " : ""}
              {Number(row.args_count)} 个参数
            </p>
            <button disabled={a.busy} onClick={() => choose(row)}>
              编辑 {text(row.name)}
            </button>
          </article>
        ))}
        <button disabled={a.busy} onClick={() => choose()}>
          新建 MCP 配置
        </button>
        <form
          className="sheet-form"
          onChange={() => setAck(false)}
          onSubmit={(e) => {
            e.preventDefault();
            if (a.busy || !ack) return;
            void a.run(async () => {
              const body: Data = {
                revision,
                confirm: true,
                enabled,
                transport,
                load_policy: policy,
              };
              if (url.trim()) body.url = url.trim();
              if (command.trim()) body.command = command.trim();
              if (args) body.args = args.split("\n");
              if (env.trim()) body.env = pairs(env);
              if (headers.trim()) body.headers = pairs(headers);
              await client.request(
                api + "/mcp/" + encodeURIComponent(name.trim()),
                "PATCH",
                body,
              );
              setEnv("");
              setHeaders("");
              setUrl("");
              setCommand("");
              setArgs("");
              await load();
              await onChanged();
              a.setNotice(
                "MCP 配置已保存；重启电脑 Runtime 后生效，尚未启动连接器。",
              );
            });
          }}
        >
          <label>
            连接器名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              pattern="[\w.-]{1,120}"
              required
            />
          </label>
          <label>
            连接方式
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
            >
              <option value="streamablehttp">HTTP</option>
              <option value="sse">SSE</option>
              <option value="stdio">电脑命令 stdio</option>
            </select>
          </label>
          {transport === "stdio" ? (
            <>
              <label>
                启动命令
                <input
                  autoComplete="off"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="留空保留已有命令"
                />
              </label>
              <label>
                命令参数（每行一个）
                <textarea
                  autoComplete="off"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="留空保留已有参数"
                />
              </label>
              <label>
                环境变量（仅写入，每行 KEY=value）
                <textarea
                  autoComplete="off"
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  placeholder="留空保留已有秘密"
                />
              </label>
            </>
          ) : (
            <>
              <label>
                服务 URL（仅写入）
                <input
                  type="url"
                  autoComplete="off"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="留空保留完整 URL"
                />
              </label>
              <label>
                请求头（仅写入，每行 Name=value）
                <textarea
                  autoComplete="off"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder="留空保留已有秘密"
                />
              </label>
            </>
          )}
          <label>
            发现策略
            <select value={policy} onChange={(e) => setPolicy(e.target.value)}>
              <option value="progressive">按需发现</option>
              <option value="on_focus">激活后发现</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            配置为启用（重启 Runtime 时可能自动启动）
          </label>
          <p>
            保存不会执行命令；后续重启 Runtime 或启动 MCP
            可能在电脑执行上述命令。
          </p>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={ack}
              onChange={(e) => {
                e.stopPropagation();
                setAck(e.target.checked);
              }}
            />
            确认将这些设置保存到电脑
          </label>
          <button disabled={a.busy || !ack || !revision || !name.trim()}>
            确认保存 MCP 配置
          </button>
        </form>
      </div>
    </details>
  );
}
