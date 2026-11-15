import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  check: vi.fn(async () => ({ display: "granted" })),
  request: vi.fn(),
  schedule: vi.fn(async () => ({})),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.native },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: mocks.check,
    requestPermissions: mocks.request,
    schedule: mocks.schedule,
  },
}));
import { notifyRuntimeEvent, notificationContent } from "../src/notifications";
const approval = {
  event: "approval.required",
  seq: 11,
  thread_id: "thread",
  turn_id: "turn",
  payload: {
    approval_id: "approval",
    description: "private user message",
    token: "never-send-token",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.check.mockReset().mockResolvedValue({ display: "granted" });
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
  });
});
it("defaults off and never prompts for permission when receiving events", async () => {
  expect(await notifyRuntimeEvent(approval)).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.schedule).not.toHaveBeenCalled();
});
it("deduplicates concurrent/replayed approvals and excludes every private payload field", async () => {
  localStorage.setItem("mobile-local-notifications-enabled", "true");
  const results = await Promise.all([
    notifyRuntimeEvent(approval),
    notifyRuntimeEvent(approval),
  ]);
  expect(results).toEqual([true, false]);
  expect(mocks.schedule).toHaveBeenCalledTimes(1);
  const payload = JSON.stringify(mocks.schedule.mock.calls);
  expect(payload).not.toContain("private user message");
  expect(payload).not.toContain("never-send-token");
  expect(
    await notifyRuntimeEvent({ ...approval, seq: 999 }, { replay: true }),
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("does not schedule when OS permission is denied or client is Web", async () => {
  localStorage.setItem("mobile-local-notifications-enabled", "true");
  mocks.check.mockResolvedValueOnce({ display: "denied" });
  expect(
    await notifyRuntimeEvent({
      ...approval,
      payload: { approval_id: "permission-denied" },
    }),
  ).toBe(false);
  mocks.native.mockReturnValue(false);
  expect(await notifyRuntimeEvent(approval)).toBe(false);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
it("distinguishes successful, failed and user-interrupted turns without showing errors", () => {
  expect(
    notificationContent({
      event: "turn.completed",
      payload: { turn: { status: "completed" } },
    })?.title,
  ).toBe("执行已完成");
  expect(
    notificationContent({
      event: "turn.completed",
      payload: { turn: { status: "failed", error: "private" } },
    })?.title,
  ).toBe("执行未完成");
  expect(
    notificationContent({
      event: "turn.completed",
      payload: { turn: { status: "interrupted" } },
    }),
  ).toBeNull();
  expect(
    notificationContent({ event: "item.delta", payload: { delta: "private" } }),
  ).toBeNull();
});

it("does not repeat a delivered notification if persistence runs out of space", async () => {
  localStorage.setItem("mobile-local-notifications-enabled", "true");
  const original = localStorage.setItem;
  vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
    if (key === "mobile-local-notifications-seen")
      throw new Error("Quota exceeded");
    original(key, value);
  });
  const event = { ...approval, payload: { approval_id: "quota-approval" } };
  expect(await notifyRuntimeEvent(event, { source: "quota-test" })).toBe(true);
  expect(await notifyRuntimeEvent(event, { source: "quota-test" })).toBe(false);
  expect(mocks.schedule).toHaveBeenCalledOnce();
});
