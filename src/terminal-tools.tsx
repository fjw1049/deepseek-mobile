import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { ApiError, RuntimeClient } from "./protocol";

type Session = { id: string; exited?: boolean; cwd?: string; shell?: string };
type Output = {
  text: string;
  offset: number;
  truncated: boolean;
  exited: boolean;
  exit_code?: number;
};
export function TerminalTools({
  client,
  threadId,
}: {
  client: RuntimeClient;
  threadId: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [line, setLine] = useState("");
  const [exited, setExited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputBlocked, setInputBlocked] = useState(false);
  const [reload, setReload] = useState(0),
    [attachment, setAttachment] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const writeRef = useRef<(data: string) => void>(() => {});
  const path = `/v1/threads/${encodeURIComponent(threadId)}/terminal`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void client
      .request<Session[]>(path, "GET", undefined, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        const next = rows.find((row) => !row.exited) ?? rows[0] ?? null;
        setSession(next);
        setExited(!!next?.exited);
        setInputBlocked(false);
        setConfirm(false);
        setError("");
        setAttachment((n) => n + 1);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, path, reload]);
  useEffect(() => {
    if (!session || !host.current) return;
    const term = new Terminal({
      cols: 80,
      rows: 24,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true,
      scrollback: 3000,
      theme: { background: "#111827", foreground: "#e5e7eb" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    terminalRef.current = term;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let offset = 0,
      stopped = false;
    let writes = Promise.resolve();
    writeRef.current = (data) => {
      writes = writes
        .then(async () => {
          if (controller.signal.aborted || stopped) return;
          await client.request(
            `${path}/${session.id}/input`,
            "POST",
            { data },
            controller.signal,
          );
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            stopped = true;
            setInputBlocked(true);
            setError(
              `输入结果未确认，后续输入已暂停。请重新连接并核对输出；不会自动重发：${e.message}`,
            );
          }
        });
    };
    const input = term.onData((data) => writeRef.current(data));
    async function read() {
      try {
        const result = await client.request<Output>(
          `${path}/${session!.id}?offset=${offset}`,
          "GET",
          undefined,
          controller.signal,
        );
        if (!stopped) setError("");
        if (result.truncated) term.write("\r\n[较早输出已超出缓存]\r\n");
        term.write(result.text);
        offset = result.offset;
        if (result.exited) {
          stopped = true;
          setExited(true);
          term.write(`\r\n[进程已退出：${result.exit_code ?? ""}]\r\n`);
          return;
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "终端读取失败");
          if (
            e instanceof ApiError &&
            [401, 403, 404, 409].includes(e.status)
          ) {
            stopped = true;
            setInputBlocked(true);
            return;
          }
        }
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void read(), 500);
    }
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (controller.signal.aborted) return;
        fit.fit();
        void client
          .request(
            `${path}/${session.id}/resize`,
            "POST",
            {
              cols: Math.min(240, Math.max(2, term.cols)),
              rows: Math.min(100, Math.max(1, term.rows)),
            },
            controller.signal,
          )
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          });
      }, 150);
    });
    observer.observe(host.current);
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(resizeTimer);
      observer.disconnect();
      input.dispose();
      term.dispose();
      terminalRef.current = null;
      writeRef.current = () => {};
    };
  }, [client, path, session?.id, attachment]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      setSession(
        await client.request<Session>(path, "POST", {
          confirm: true,
          cols: 80,
          rows: 24,
        }),
      );
      setExited(false);
      setInputBlocked(false);
      setConfirm(false);
    } catch (e) {
      setConfirm(false);
      setInputBlocked(true);
      setError(
        `终端创建结果未确认，请先重新连接查看是否已经创建。${e instanceof Error ? e.message : "终端启动失败"}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sheet-form" aria-label="电脑终端">
      <h3>电脑终端</h3>
      <details><summary>终端说明</summary><p className="muted">关闭面板后继续运行，闲置 15 分钟自动关闭。</p></details>
      {loading && <p role="status">正在查询终端…</p>}
      {error && (
        <button
          disabled={busy || loading}
          onClick={() => setReload((n) => n + 1)}
        >
          重新连接终端
        </button>
      )}
      {!loading && !session && (
        <button
          disabled={busy || inputBlocked}
          onClick={() => setConfirm(true)}
        >
          打开终端
        </button>
      )}
      {confirm && (
        <section className="record-card" aria-label="终端权限确认">
          <p>
            终端直接以电脑用户权限执行 Shell 命令，不经过 Agent
            工具审批。仅在你信任这台电脑和当前连接时打开。
          </p>
          <button onClick={() => setConfirm(false)}>取消</button>
          <button disabled={busy} onClick={() => void create()}>
            确认打开终端
          </button>
        </section>
      )}
      {session && (
        <>
          <div
            ref={host}
            aria-label="终端输出"
            style={{
              height: "min(48dvh, 420px)",
              minHeight: 220,
              background: "#111827",
              overflow: "hidden",
              borderRadius: 8,
              padding: 4,
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              ["Ctrl+C", "\x03"],
              ["Ctrl+D", "\x04"],
              ["Tab", "\t"],
              ["Esc", "\x1b"],
              ["↑", "\x1b[A"],
              ["↓", "\x1b[B"],
              ["←", "\x1b[D"],
              ["→", "\x1b[C"],
            ].map(([name, data]) => (
              <button
                key={name}
                disabled={exited || inputBlocked || loading}
                onClick={() => {
                  writeRef.current(data);
                  terminalRef.current?.focus();
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!exited && !inputBlocked && !loading) {
                writeRef.current(line + "\r");
                setLine("");
              }
            }}
          >
            <label>
              终端输入
              <input
                value={line}
                disabled={exited || inputBlocked || loading}
                onChange={(e) => setLine(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
            <button disabled={exited || inputBlocked || loading}>
              输入并回车
            </button>
          </form>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await client.request(`${path}/${session.id}`, "DELETE");
                setSession(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "关闭失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            关闭终端进程
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
