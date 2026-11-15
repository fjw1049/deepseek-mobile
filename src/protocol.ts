export type Thread = {
  id: string;
  title?: string | null;
  workspace: string;
  model: string;
  provider: string;
  mode: string;
  archived: boolean;
  latest_turn_id?: string | null;
  latest_turn_status?: string;
  activity_waiting?: boolean;
  goal?: Record<string, unknown> | null;
};
export type Item = {
  id: string;
  turn_id: string;
  kind: string;
  status: string;
  summary: string;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
};
export type Turn = { id: string; status: string; error?: string | null };
export type Detail = {
  thread: Thread;
  items: Item[];
  turns: Turn[];
  latest_seq: number;
};
export type RuntimeEvent = {
  event: string;
  seq?: number;
  thread_id?: string;
  turn_id?: string;
  item_id?: string;
  payload?: Record<string, unknown>;
};
export type Approval = {
  approval_id: string;
  tool_name: string;
  description: string;
  input_summary?: string;
  thread_id: string;
};
export type Question = {
  id?: string;
  header?: string;
  question?: string;
  options?: Array<{ label: string; description?: string }>;
};
export type InputRequest = {
  request_id: string;
  thread_id: string;
  questions: Question[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Handles split UTF-8/chunks, CRLF, comments, and multiline data. Resync frames
// intentionally have no seq and must not be rejected as malformed delta frames.
export class SseParser {
  private pending = "";
  push(chunk: string): RuntimeEvent[] {
    this.pending += chunk;
    const events: RuntimeEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.pending))) {
      const frame = this.pending.slice(0, match.index);
      this.pending = this.pending.slice(match.index + match[0].length);
      let name = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) {
        const value = JSON.parse(data.join("\n"));
        events.push({ ...value, event: value.event ?? name });
      }
    }
    return events;
  }
}
export function applyEvent(detail: Detail, event: RuntimeEvent): Detail {
  if (event.thread_id && event.thread_id !== detail.thread.id) return detail;
  if (typeof event.seq !== "number" || event.seq <= detail.latest_seq)
    return detail;
  const next = { ...detail, latest_seq: event.seq, items: [...detail.items] };
  const p = event.payload ?? {};
  const item = (p.item ?? (p.id ? p : null)) as Item | null;
  if (item && typeof item.id === "string" && typeof item.kind === "string") {
    const i = next.items.findIndex((x) => x.id === item.id);
    if (i < 0) next.items.push(item);
    else next.items[i] = item;
  } else if (
    event.event === "item.delta" &&
    typeof p.delta === "string" &&
    event.item_id
  ) {
    const i = next.items.findIndex((x) => x.id === event.item_id);
    if (i >= 0) {
      const old = next.items[i];
      next.items[i] = { ...old, detail: (old.detail ?? "") + p.delta };
    } else
      next.items.push({
        id: event.item_id,
        turn_id: event.turn_id ?? "",
        kind: String(p.kind ?? "agent_message"),
        status: "in_progress",
        summary: "",
        detail: p.delta,
      });
  }
  return next;
}
export function runtimeBase(input: string): string {
  if (input === "/runtime") return input;
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("请输入 HTTP(S) 服务地址，不包含密码或查询参数");
  return url.href.replace(/\/$/, "");
}
export class RuntimeClient {
  readonly base: string;
  constructor(
    base: string,
    private token: string,
  ) {
    this.base = runtimeBase(base);
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      let message = `请求失败 (${response.status})`;
      try {
        const b = await response.json();
        message =
          (typeof b.detail === "string" ? b.detail : b.detail?.message) ??
          b.message ??
          b.error ??
          message;
      } catch {}
      throw new ApiError(response.status, String(message));
    }
    return response.status === 204 ? (undefined as T) : response.json();
  }
  async stream(
    threadId: string,
    since: number,
    signal: AbortSignal,
    onEvent: (event: RuntimeEvent) => void,
  ) {
    const response = await fetch(
      `${this.base}/v1/threads/${encodeURIComponent(threadId)}/events?since_seq=${since}`,
      { headers: { Authorization: `Bearer ${this.token}` }, signal },
    );
    if (!response.ok)
      throw new ApiError(response.status, `事件连接失败 (${response.status})`);
    if (!response.body) throw new Error("当前环境不支持流式连接");
    const reader = response.body.getReader(),
      decoder = new TextDecoder(),
      parser = new SseParser();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.push(
          decoder.decode(value, { stream: true }),
        ))
          onEvent(event);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

export type Elevation = {
  elevation_id: string;
  thread_id: string;
  tool_name: string;
  reason: string;
  command_preview: string;
};
