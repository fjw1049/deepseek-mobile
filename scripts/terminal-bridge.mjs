import { createInterface } from "node:readline";

export function runTerminalBridge(createTerminalCore) {
  const sessions = new Map();
  const owners = new Map();
  let nextOwner = 1;
  const maxSessions = 4,
    maxOutput = 65536,
    idleMs = 15 * 60 * 1000;
  const core = createTerminalCore({
    ownerId: (owner) => owner,
    expandPath: (path) => path,
    send: (_owner, channel, payload) => {
      const state = sessions.get(payload.sessionId);
      if (!state) return false;
      if (channel === "terminal:data") {
        state.output = (state.output + payload.data).slice(-maxOutput);
        state.offset += payload.data.length;
      } else {
        state.exited = true;
        state.exitCode = payload.exitCode;
      }
      return true;
    },
  });
  function close(id) {
    core.closeTerminalSession({ sessionId: id });
    sessions.delete(id);
  }
  function cleanup() {
    for (const id of sessions.keys()) close(id);
  }
  const ttl = setInterval(() => {
    const now = Date.now();
    for (const [id, state] of sessions)
      if (now - state.touched > idleMs) close(id);
    for (const [owner, id] of owners)
      if (![...sessions.values()].some((state) => state.owner === owner))
        owners.delete(owner);
  }, 10000);
  ttl.unref();
  async function rpc(input) {
    const owner = input.thread_id;
    if (typeof owner !== "string" || !owner || owner.length > 200)
      throw new Error("Invalid terminal owner");
    if (input.action === "create") {
      if (input.confirm !== true)
        throw new Error("Direct shell access requires explicit confirmation");
      if (sessions.size >= maxSessions)
        throw new Error("最多同时打开 4 个终端");
      if (
        [...sessions.values()].some(
          (state) => state.owner === owner && !state.exited,
        )
      )
        throw new Error("该会话已有终端，请先关闭");
      if (!owners.has(owner)) owners.set(owner, nextOwner++);
      const result = await core.createTerminalSession(owners.get(owner), {
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
      });
      if (!result.ok) throw new Error(result.message);
      sessions.set(result.session.id, {
        owner,
        output: "",
        offset: 0,
        touched: Date.now(),
        exited: false,
      });
      return result.session;
    }
    if (input.action === "list")
      return [...sessions]
        .filter(([, s]) => s.owner === owner)
        .map(([id, s]) => ({ id, exited: s.exited }));
    const state = sessions.get(input.session_id);
    if (!state || state.owner !== owner)
      throw new Error("Terminal not found for this conversation");
    state.touched = Date.now();
    if (input.action === "close") {
      close(input.session_id);
      return { closed: true };
    }
    if (input.action === "read") {
      const start = state.offset - state.output.length;
      const cursor =
        Number.isSafeInteger(input.offset) && input.offset >= 0
          ? input.offset
          : 0;
      return {
        text: state.output.slice(Math.max(0, cursor - start)),
        offset: state.offset,
        truncated: cursor < start,
        exited: state.exited,
        exit_code: state.exitCode,
      };
    }
    if (state.exited) throw new Error("Terminal process has exited");
    if (input.action === "write") {
      if (typeof input.data !== "string" || input.data.length > 8192)
        throw new Error("Terminal input exceeds limit");
      core.writeTerminalSession({
        sessionId: input.session_id,
        data: input.data,
      });
      return { written: true };
    }
    if (input.action === "resize") {
      core.resizeTerminalSession({
        sessionId: input.session_id,
        cols: Math.max(2, Math.min(240, input.cols)),
        rows: Math.max(1, Math.min(100, input.rows)),
      });
      return { resized: true };
    }
    throw new Error("Unsupported terminal operation");
  }
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain = Promise.resolve();
  input.on("line", (line) => {
    chain = chain.then(async () => {
      let message;
      try {
        if (line.length > 20000) throw new Error("Request exceeds limit");
        message = JSON.parse(line);
        const result = await rpc(message);
        process.stdout.write(
          JSON.stringify({ id: message.id, ok: true, result }) + "\n",
        );
      } catch (error) {
        process.stdout.write(
          JSON.stringify({
            id: message?.id,
            ok: false,
            message: error.message,
          }) + "\n",
        );
      }
    });
  });
  input.on("close", () => {
    void chain.finally(() => {
      cleanup();
      clearInterval(ttl);
    });
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      cleanup();
      process.exit(0);
    });
}
