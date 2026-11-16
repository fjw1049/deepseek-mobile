import { useState } from "react";
import { RuntimeClient } from "./protocol";
type Data = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const array = (v: unknown): Data[] => (Array.isArray(v) ? v : []);
async function checked<T extends Data>(
  client: RuntimeClient,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const value = await client.request<T>(path, method, body);
  if (value.ok === false || value.outcome === "failed")
    throw new Error(text(value.error) || text(value.message) || "操作失败");
  return value;
}
export function ExtensionTools({
  client,
  data,
  resource,
  onChanged,
}: {
  client: RuntimeClient;
  data: unknown;
  resource: "plugins" | "mcp" | "skills";
  onChanged: () => void | Promise<void>;
}) {
  const payload = (data ?? {}) as Data,
    rows = array(
      Array.isArray(data)
        ? data
        : payload[resource === "mcp" ? "servers" : resource],
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [source, setSource] = useState(""),
    [scope, setScope] = useState("user"),
    [inspection, setInspection] = useState<Data | null>(null),
    [selected, setSelected] = useState("");
  const [pending, setPending] = useState<{
      action: string;
      row?: Data;
      source?: string;
      scope?: string;
      candidate?: Data;
    } | null>(null),
    [ack, setAck] = useState(false);
  const [tools, setTools] = useState<Data[] | null>(null),
    [startup, setStartup] = useState<Data | null>(null),
    [filter, setFilter] = useState("");
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
  function confirm(action: string, row?: Data) {
    setAck(false);
    setPending({ action, row });
  }
  const filteredRows = rows.filter(row => `${text(row.name)} ${text(row.description)}`.toLowerCase().includes(filter.toLowerCase()));
  const candidates = array(inspection?.packages),
    candidate = candidates[Number(selected)];
  const compatibility = candidate?.compatibility as Data | undefined;
  const installBlocked =
    !!compatibility &&
    (compatibility.can_install === false ||
      compatibility.can_activate === false ||
      ["blocked", "unsupported"].includes(text(compatibility.status)));
  const actionNames: Record<string, string> = {
    enable: "启用插件",
    disable: "停用插件",
    trust: "信任插件",
    untrust: "撤销信任",
    delete: "删除插件",
    update: "更新插件",
    install: "安装插件",
    startup: "启动 MCP 连接",
  };
  return (
    <div className="sheet-form">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {payload.ok === false && (
        <details><summary>电脑尚未启用此能力</summary><p>{text(payload.error)}</p></details>
      )}
      <label>
        搜索
        {resource === "skills"
          ? "技能"
          : resource === "plugins"
            ? "插件"
            : "连接器"}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      {resource === "plugins" && (
        <details>
          <summary>安装与检查插件</summary>
          <div className="sheet-form">
            <label>
              插件来源
              <input
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setInspection(null);
                  setSelected("");
                }}
                placeholder="github:owner/repo 或电脑上的插件目录"
              />
            </label>
            <label>
              安装范围
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="user">电脑用户</option>
                <option value="project">当前电脑工作区</option>
              </select>
            </label>
            <p className="muted">
              安装前检查权限，默认不授信。
            </p>
            <button
              disabled={busy || !source.trim()}
              onClick={() =>
                void run(async () => {
                  setInspection(null);
                  setSelected("");
                  const result = await checked(
                    client,
                    "/v1/plugins/inspect",
                    "POST",
                    { source: source.trim() },
                  );
                  setInspection(result);
                  if (array(result.packages).length === 1) setSelected("0");
                })
              }
            >
              检查本机插件目录
            </button>
            {inspection && (
              <>
                <label>
                  选择检查结果
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">选择插件</option>
                    {candidates.map((p, i) => (
                      <option key={i} value={String(i)}>
                        {text(p.plugin_id)} ·{" "}
                        {text((p.source as Data)?.relative_root)}
                      </option>
                    ))}
                  </select>
                </label>
                {selected !== "" && candidate && (
                  <article className="record-card">
                    <h3>{text(candidate.plugin_id)}</h3>
                    <p>{text(candidate.description)}</p>
                    <p>兼容性：{text(compatibility?.status)}</p>
                    <Permissions values={candidate.permission_claims} />
                    <ul>
                      {array(candidate.contributions).map((item, i) => (
                        <li key={i}>
                          {text(item.kind)} · {text(item.name)} —{" "}
                          {text(item.summary)}
                        </li>
                      ))}
                    </ul>
                    {array(compatibility?.diagnostics).map((d, i) => (
                      <p key={i}>{text(d.message)}</p>
                    ))}
                  </article>
                )}
                {array(inspection.diagnostics).map((d, i) => (
                  <p key={i}>{text(d.message)}</p>
                ))}
              </>
            )}
            <button
              disabled={
                busy ||
                !source.trim() ||
                (!!inspection && (selected === "" || installBlocked))
              }
              onClick={() => {
                setAck(false);
                setPending({
                  action: "install",
                  source: source.trim(),
                  scope,
                  candidate: selected !== "" ? candidate : undefined,
                });
              }}
            >
              安装插件
            </button>
          </div>
        </details>
      )}
      {resource === "mcp" && (
        <>
          <p className="muted">在电脑完成配置与认证。</p>
          <div className="actions">
            <button disabled={busy} onClick={() => confirm("startup")}>
              启动已配置的 MCP
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await checked(
                    client,
                    "/legacy/apps/mcp/tools",
                  );
                  setTools(array(response.tools));
                })
              }
            >
              读取 MCP 工具
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setStartup(await checked(client, "/v1/mcp/preload-status"));
                })
              }
            >
              查看预加载状态
            </button>
          </div>
          {startup && (
            <article className="record-card">
              <p>
                {startup.phase
                  ? `预加载状态：${text(startup.phase)}`
                  : text((startup.summary as Data)?.note) || "启动结果"}
              </p>
              {startup.tools_count !== undefined && (
                <p>工具数量：{Number(startup.tools_count)}</p>
              )}
              {array((startup.summary as Data)?.servers).map((s, i) => (
                <p key={i}>
                  {text(s.name)}：{text(s.status)} {text(s.error)}
                </p>
              ))}
            </article>
          )}
          {tools && (
            <details open>
              <summary>可用工具（{tools.length}）</summary>
              {tools.length === 0 && <p>尚未发现工具。</p>}
              {tools.map((tool, i) => (
                <article className="record-card" key={i}>
                  <h3>{text(tool.name)}</h3>
                  <p className="muted">
                    {text(tool.server)} · {text(tool.model_name)}
                  </p>
                  <p>{text(tool.description)}</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
      {filteredRows
        .map((row, i) => (
          <article
            className="record-card"
            key={`${text(row.scope)}-${text(row.name)}-${i}`}
          >
            <h3>{text(row.name)}</h3>
            {text(row.description) && <details className="extension-description"><summary>简介</summary><p>{text(row.description)}</p></details>}
            {resource === "plugins" && (
              <>
                <p className="muted">
                  {text(row.version)} ·{" "}
                  {row.scope === "project" ? "项目插件" : "用户插件"} ·{" "}
                  {row.enabled ? "已启用" : "已停用"} ·{" "}
                  {row.trusted ? "已信任" : "未信任"}
                </p>
                <Permissions values={row.permissions} />
                <details>
                  <summary>插件组件与来源</summary>
                  <p style={{ overflowWrap: "anywhere" }}>{text(row.path)}</p>
                  {!!row.components &&
                    typeof row.components === "object" &&
                    Object.entries(row.components as Data).map(
                      ([kind, value]) => (
                        <p key={kind}>
                          {kind}：
                          {Array.isArray(value)
                            ? value.join("、")
                            : String(value)}
                        </p>
                      ),
                    )}
                </details>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirm(row.enabled ? "disable" : "enable", row)
                    }
                  >
                    {row.enabled ? "停用插件" : "启用插件"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirm(row.trusted ? "untrust" : "trust", row)
                    }
                  >
                    {row.trusted ? "撤销信任" : "信任插件"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => confirm("update", row)}
                  >
                    更新插件
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => confirm("delete", row)}
                  >
                    删除插件
                  </button>
                </div>
              </>
            )}
            {resource === "mcp" && (
              <>
                <p className="status-pill">
                  {(
                    {
                      connected: "已连接",
                      connecting: "连接中",
                      failed: "连接失败",
                      disabled: "已停用",
                      idle: "未连接",
                    } as Record<string, string>
                  )[text(row.status)] ?? text(row.status)}
                </p>
                <p className="muted">
                  {text(row.transport)} · {text(row.load_policy)}
                </p>
                {!!row.error && <p>{text(row.error)}</p>}
              </>
            )}
            {resource === "skills" && (
              <>
                <p className="muted">
                  {row.user_invocable ? "可手动调用" : "由模型按需发现"} ·{" "}
                  {row.disable_model_invocation
                    ? "禁止模型主动调用"
                    : "允许模型发现"}
                </p>
                <details>
                  <summary>电脑技能路径</summary>
                  <p style={{ overflowWrap: "anywhere" }}>{text(row.path)}</p>
                </details>
              </>
            )}
          </article>
        ))}
      {!filteredRows.length && <p className="empty">{filter ? "无匹配结果" : "暂无已配置项目"}</p>}
      {Array.isArray(payload.warnings) &&
        payload.warnings.map((warning, i) => <p key={i}>{text(warning)}</p>)}
      {pending && (
        <section
          role="region"
          aria-label="确认扩展操作"
          className="record-card"
        >
          <h3>{actionNames[pending.action]}</h3>
          <p style={{ overflowWrap: "anywhere" }}>
            {pending.source || text(pending.row?.name)}
          </p>
          {pending.action === "install" && (
            <p>
              下载或复制到电脑的
              {pending.scope === "project" ? "当前工作区" : "用户"}
              插件目录。此操作不会自动信任插件。
            </p>
          )}
          {pending.action === "trust" && (
            <>
              <Permissions values={pending.row?.permissions} />
              <p>
                信任后，插件的可执行组件可能在电脑运行。仅对你认可的来源授权。
              </p>
            </>
          )}
          {pending.action === "enable" && (
            <p>启用后，插件可被电脑 Runtime 发现；已授信组件可能开始运行。</p>
          )}
          {pending.action === "update" && (
            <p>
              更新将下载新版本，插件内容和权限可能变化。更新后请重新检查权限。
            </p>
          )}
          {pending.action === "delete" && (
            <p>这会从电脑删除插件并撤销其授权。</p>
          )}
          {pending.action === "startup" && (
            <p>
              启动电脑配置中所有已启用的 MCP，可能启动本机进程或连接远程服务。
            </p>
          )}
          <label style={{ display: "flex", gap: 8 }}>
            <input
              style={{ width: 20 }}
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            我已查看上述范围并确认操作
          </label>
          <button disabled={busy} onClick={() => setPending(null)}>
            取消操作
          </button>
          <button
            className="primary"
            disabled={busy || !ack}
            onClick={() =>
              void run(async () => {
                let result: Data;
                if (pending.action === "install") {
                  const body: Data = {
                    spec: pending.source,
                    scope: pending.scope,
                    trust: false,
                  };
                  if (pending.candidate) {
                    body.plugin_id = pending.candidate.plugin_id;
                    body.candidate_root = (pending.candidate.source as Data)
                      ?.relative_root;
                  }
                  result = await checked(
                    client,
                    "/v1/plugins/install",
                    "POST",
                    body,
                  );
                } else if (pending.action === "startup") {
                  result = await client.request<Data>(
                    "/v1/mcp/startup",
                    "POST",
                  );
                  setStartup(result);
                  if (result.ok === false)
                    throw new Error(
                      text(result.error) || "部分 MCP 启动失败，请查看启动结果",
                    );
                } else {
                  const row = pending.row!;
                  if (!["user", "project"].includes(text(row.scope)))
                    throw new Error("此来源不支持移动端修改");
                  const path = `/v1/plugins/${encodeURIComponent(text(row.name))}`;
                  result = await checked(
                    client,
                    pending.action === "delete" ? path : path + "/action",
                    pending.action === "delete" ? "DELETE" : "POST",
                    {
                      scope: row.scope,
                      ...(pending.action === "delete"
                        ? {}
                        : { action: pending.action }),
                    },
                  );
                }
                setPending(null);
                setAck(false);
                await onChanged();
                setNotice(text(result.message) || "操作完成");
              })
            }
          >
            确认{actionNames[pending.action]}
          </button>
        </section>
      )}
    </div>
  );
}
function Permissions({ values }: { values: unknown }) {
  const permissions = Array.isArray(values) ? values : [];
  return (
    <div>
      <h4>声明权限</h4>
      {permissions.length ? (
        <ul>
          {permissions.map((p, i) => (
            <li key={i}>
              {typeof p === "string"
                ? p
                : `${text((p as Data).capability)}${(p as Data).reason ? "：" + text((p as Data).reason) : ""}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">
          未声明权限，仍需确认来源可信。
        </p>
      )}
    </div>
  );
}
