import { useEffect, useState } from "react";
import { RuntimeClient } from "./protocol";

type State = { capabilities: Record<string, boolean>; voice: boolean | null; failed: boolean };
/** Read-only readiness checks. Never start tools, request microphone access or generate text. */
export function ServiceStatus({ client }: { client: RuntimeClient }) {
  const [state, setState] = useState<State | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setState(null);
    const timer = setTimeout(() => controller.abort(), 8000);
    void Promise.allSettled([
      client.request<{ capabilities?: Record<string, boolean> }>("/legacy/app", "POST", { op: "capabilities" }, controller.signal),
      client.request<{ configured: boolean }>("/v1/voice/status", "GET", undefined, controller.signal),
    ]).then(([capabilities, voice]) => {
      if (live) setState({
        capabilities: capabilities.status === "fulfilled" ? capabilities.value.capabilities ?? {} : {},
        voice: voice.status === "fulfilled" && typeof voice.value.configured === "boolean" ? voice.value.configured : null,
        failed: capabilities.status === "rejected" || voice.status === "rejected",
      });
    }).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [client, revision]);
  const availability = (value: boolean | undefined | null) => value === true ? "已配置" : value === false ? "未启用" : "未能确认";
  return <section className="record-card service-status" aria-label="服务能力">
    <h2>服务能力</h2>
    <p className="muted">配置状态</p>
    {!state ? <p role="status">正在检查服务配置…</p> : <>
      {state.failed && <p role="status">部分状态读取失败。</p>}
      <dl>
        <div><dt>后台任务</dt><dd>{availability(state.capabilities.tasks)}</dd></div>
        <div><dt>工具连接（MCP）</dt><dd>{availability(state.capabilities.mcp)}</dd></div>
        <div><dt>语音转写</dt><dd>{availability(state.voice)}</dd></div>
      </dl>
      {state.voice === false && <p>语音尚未配置，请在电脑设置 ASR。</p>}
      {state.capabilities.tasks === false && <p>请在电脑启用后台任务。</p>}
      {state.capabilities.mcp === false && <p>请在电脑启用 MCP。</p>}

    </>}
    <button disabled={!state} onClick={() => setRevision(n => n + 1)}>重新检查</button>
  </section>;
}
