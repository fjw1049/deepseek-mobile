import { RuntimeClient } from "./protocol";
export type BrowserBinding = { generation: number; scene_id: string };

/** Keep down/up bound to the displayed scene; cleanup releases outside the page. */
async function pair(
  client: RuntimeClient,
  base: string,
  binding: BrowserBinding,
  down: object,
  up: object,
) {
  try {
    await client.request(`${base}/input`, "POST", { ...down, ...binding });
    await client.request(`${base}/input`, "POST", { ...up, ...binding });
  } catch (error) {
    // This is not a replay. Runtime's release clears pressed inputs at (-1,-1)
    // and refuses the cleanup if control has changed to someone else.
    await client
      .request(`${base}/input`, "POST", {
        kind: "release",
        generation: binding.generation,
      })
      .catch(() => {});
    throw error;
  }
}
export function sendBrowserClick(
  client: RuntimeClient,
  base: string,
  binding: BrowserBinding,
  x: number,
  y: number,
) {
  return pair(
    client,
    base,
    binding,
    { kind: "mouse", event: "mousePressed", button: "left", buttons: 1, x, y },
    { kind: "mouse", event: "mouseReleased", button: "left", buttons: 0, x, y },
  );
}
export function sendBrowserKey(
  client: RuntimeClient,
  base: string,
  binding: BrowserBinding,
  key: "Enter" | "Tab" | "Escape",
) {
  const value = {
    kind: "key",
    key,
    code: key,
    key_code: { Enter: 13, Tab: 9, Escape: 27 }[key],
  };
  return pair(
    client,
    base,
    binding,
    { ...value, event: "keyDown" },
    { ...value, event: "keyUp" },
  );
}
