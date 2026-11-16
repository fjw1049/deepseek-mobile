import { expect, it, vi } from "vitest";
import { RuntimeClient } from "../src/protocol";
import { sendBrowserClick, sendBrowserKey } from "../src/browser-input";
const binding = { generation: 7, scene_id: "displayed-scene" };
it("stale release cleans held inputs without retrying click or adopting a new scene", async () => {
  const client = new RuntimeClient("/runtime", "offline");
  const stale = new Error("page changed");
  const request = vi
    .spyOn(client, "request")
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(stale)
    .mockResolvedValueOnce({});
  await expect(
    sendBrowserClick(client, "/browser", binding, 80, 90),
  ).rejects.toBe(stale);
  expect(request.mock.calls.map((call) => call[2])).toEqual([
    {
      kind: "mouse",
      event: "mousePressed",
      button: "left",
      buttons: 1,
      x: 80,
      y: 90,
      ...binding,
    },
    {
      kind: "mouse",
      event: "mouseReleased",
      button: "left",
      buttons: 0,
      x: 80,
      y: 90,
      ...binding,
    },
    { kind: "release", generation: 7 },
  ]);
});
it("keyboard shortcuts carry the same displayed scene and generation on down/up", async () => {
  const client = new RuntimeClient("/runtime", "offline");
  const request = vi.spyOn(client, "request").mockResolvedValue({});
  await sendBrowserKey(client, "/browser", binding, "Enter");
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map((call) => call[2])).toEqual([
    {
      kind: "key",
      key: "Enter",
      code: "Enter",
      key_code: 13,
      event: "keyDown",
      ...binding,
    },
    {
      kind: "key",
      key: "Enter",
      code: "Enter",
      key_code: 13,
      event: "keyUp",
      ...binding,
    },
  ]);
});
it("unknown down outcome only releases; it never dispatches a second action", async () => {
  const client = new RuntimeClient("/runtime", "offline");
  const request = vi
    .spyOn(client, "request")
    .mockRejectedValueOnce(new Error("disconnected"))
    .mockRejectedValueOnce(new Error("owner changed"));
  await expect(
    sendBrowserKey(client, "/browser", binding, "Tab"),
  ).rejects.toThrow("disconnected");
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][2]).toEqual({ kind: "release", generation: 7 });
});
