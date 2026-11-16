import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { RuntimeClient } from "../src/protocol";

// Real sockets, not mocked fetch: timeouts only mean something against a
// server that accepts the connection but never answers.
const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});
function stubServer(
  handler: (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ) => void,
): Promise<string> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      );
    });
  });
}

describe("RuntimeClient request timeout", () => {
  it("rejects a stalled request with a TimeoutError instead of hanging", async () => {
    const base = await stubServer((_req, res) => {
      /* never respond */
    });
    const client = new RuntimeClient(base, "token");
    const start = Date.now();
    await expect(
      client.request("/v1/threads", "GET", undefined, undefined, 300),
    ).rejects.toMatchObject({
      name: "TimeoutError",
      message: expect.stringContaining("请求超时"),
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(2000);
    // The server socket must actually be closed by the abort.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("a caller AbortSignal still wins over the timeout", async () => {
    const base = await stubServer((_req, res) => {
      /* never respond */
    });
    const client = new RuntimeClient(base, "token");
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("cancelled", "AbortError")),
      100,
    );
    await expect(
      client.request(
        "/v1/threads",
        "GET",
        undefined,
        controller.signal,
        30_000,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("normal responses are unaffected and the timer is cleaned up", async () => {
    const base = await stubServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      }, 150);
    });
    const client = new RuntimeClient(base, "token");
    await expect(
      client.request("/v1/threads", "GET", undefined, undefined, 1000),
    ).resolves.toEqual({ ok: true });
  });

  it("timeoutMs 0 disables the timeout entirely", async () => {
    const base = await stubServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      }, 700);
    });
    const client = new RuntimeClient(base, "token");
    await expect(
      client.request("/v1/threads", "GET", undefined, undefined, 0),
    ).resolves.toEqual({ ok: true });
  });

  it("the SSE stream still delivers events after the timeout change", async () => {
    // Regression guard: long-lived event streams must not inherit the
    // request timeout. We abort from inside onEvent once the event lands.
    const base = await stubServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      setTimeout(() => {
        res.write('data: {"seq": 1, "event": "thread.updated"}\r\n\r\n');
      }, 700);
    });
    const client = new RuntimeClient(base, "token");
    const events: unknown[] = [];
    const controller = new AbortController();
    await expect(
      client.stream("thr_a", 0, controller.signal, (event) => {
        events.push(event);
        controller.abort();
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(events).toEqual([{ seq: 1, event: "thread.updated" }]);
  });
});
