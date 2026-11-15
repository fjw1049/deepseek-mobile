import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SseParser,
  applyEvent,
  runtimeBase,
  RuntimeClient,
  type Detail,
} from "../src/protocol";
const detail = (): Detail => ({
  thread: {
    id: "thr_a",
    workspace: "/project",
    model: "test",
    provider: "test",
    mode: "agent",
    archived: false,
  },
  items: [],
  turns: [],
  latest_seq: 2,
});
afterEach(() => vi.unstubAllGlobals());
describe("Runtime stream contract", () => {
  it("parses split frames, CRLF and comments", () => {
    const p = new SseParser();
    expect(
      p.push(': keepalive\r\n\r\nevent: item.delta\r\ndata: {"seq":'),
    ).toEqual([]);
    expect(p.push('4,"payload":{"delta":"你"}}\r\n\r\n')[0]).toMatchObject({
      event: "item.delta",
      seq: 4,
      payload: { delta: "你" },
    });
  });
  it("retains resync events without a seq", () => {
    expect(
      new SseParser().push(
        'event: stream.resync_required\ndata: {"thread_id":"thr_a"}\n\n',
      )[0].event,
    ).toBe("stream.resync_required");
  });
  it("accepts global seq gaps and ignores replay duplicates", () => {
    const e = {
      event: "item.delta",
      seq: 8,
      thread_id: "thr_a",
      item_id: "item_a",
      payload: { kind: "agent_message", delta: "hello" },
    };
    const d = applyEvent(detail(), e);
    expect(d.items[0].detail).toBe("hello");
    expect(applyEvent(d, e)).toBe(d);
  });
  it("does not apply another thread event", () => {
    const d = detail();
    expect(
      applyEvent(d, { event: "item.delta", seq: 5, thread_id: "thr_b" }),
    ).toBe(d);
  });
  it("replaces streamed text with the canonical completed item", () => {
    const d = applyEvent(detail(), {
      event: "item.delta",
      seq: 5,
      item_id: "a",
      payload: { delta: "part", kind: "agent_message" },
    });
    const done = applyEvent(d, {
      event: "item.completed",
      seq: 6,
      payload: {
        item: {
          id: "a",
          kind: "agent_message",
          detail: "whole",
          status: "completed",
        },
      },
    });
    expect(done.items).toHaveLength(1);
    expect(done.items[0].detail).toBe("whole");
  });
  it("uses auth headers without query tokens, never retries a mutation", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("connection lost"));
    vi.stubGlobal("fetch", fetch);
    const c = new RuntimeClient("https://host.example", "secret");
    await expect(
      c.request("/v1/threads/a/turns", "POST", { prompt: "hello" }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://host.example/v1/threads/a/turns",
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  });
  it("rejects URL-embedded secrets and non HTTP endpoints", () => {
    for (const value of [
      "file:///tmp",
      "https://user:pass@host",
      "https://host?token=x",
    ])
      expect(() => runtimeBase(value)).toThrow();
    expect(runtimeBase("https://host/")).toBe("https://host");
  });
});
