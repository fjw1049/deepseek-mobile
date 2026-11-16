import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { type RuntimeEvent } from "./protocol";

const ENABLED_KEY = "mobile-local-notifications-enabled";
const SEEN_KEY = "mobile-local-notifications-seen";
let queue: Promise<unknown> = Promise.resolve();
const delivered = new Set<string>();

export function notificationContent(
  event: RuntimeEvent,
): { title: string; body: string } | null {
  if (
    event.event === "approval.required" ||
    event.event === "elevation.required"
  )
    return {
      title: "需要你的审批",
      body: "电脑正在等待确认，请打开 App 查看。",
    };
  if (event.event === "user_input.required")
    return {
      title: "需要你的回答",
      body: "电脑正在等待你的回答，请打开 App 查看。",
    };
  if (event.event === "turn.completed" || event.event === "task.completed") {
    const turn = event.payload?.turn as { status?: string } | undefined;
    const status = turn?.status ?? event.payload?.status;
    if (status === "completed" || status === "complete")
      return {
        title: "执行已完成",
        body: "电脑已完成一次执行，请打开 App 查看结果。",
      };
    if (status === "failed")
      return {
        title: "执行未完成",
        body: "电脑执行时遇到问题，请打开 App 查看。",
      };
  }
  return null;
}

function eventKey(event: RuntimeEvent, source: string): string | null {
  const payload = event.payload ?? {};
  const identity =
    payload.approval_id ??
    payload.elevation_id ??
    payload.request_id ??
    event.turn_id ??
    event.seq;
  if (identity === undefined) return null;
  return JSON.stringify([source, event.thread_id, event.event, identity]);
}
function notificationId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++)
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 2147483646) + 1;
}

// Call only after stream validation. Pass replay:true for explicitly historical frames.
// No permission request is made here, including while the App is in the background.
export function notifyRuntimeEvent(
  event: RuntimeEvent,
  {
    source = "runtime",
    replay = false,
  }: {
    source?: string;
    replay?: boolean;
  } = {},
): Promise<boolean> {
  const result = queue
    .then(async () => {
      if (
        replay ||
        !Capacitor.isNativePlatform() ||
        localStorage.getItem(ENABLED_KEY) !== "true"
      )
        return false;
      const content = notificationContent(event);
      const key = eventKey(event, source);
      if (!content || !key) return false;
      let seen: string[] = [];
      try {
        const value: unknown = JSON.parse(
          localStorage.getItem(SEEN_KEY) || "[]",
        );
        if (Array.isArray(value))
          seen = value
            .filter((x): x is string => typeof x === "string")
            .slice(-255);
      } catch {
        /* Reset invalid preference data. */
      }
      if (delivered.has(key) || seen.includes(key)) return false;
      if ((await LocalNotifications.checkPermissions()).display !== "granted")
        return false;
      if (localStorage.getItem(ENABLED_KEY) !== "true") return false;
      await LocalNotifications.schedule({
        notifications: [{ id: notificationId(key), ...content }],
      });
      delivered.add(key);
      if (delivered.size > 256)
        delivered.delete(delivered.values().next().value!);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key]));
      } catch {
        /* Keep in-memory deduplication when browser storage is full. */
      }
      return true;
    })
    .catch(() => false);
  queue = result;
  return result;
}

export function NativeNotificationSettings() {
  const native = Capacitor.isNativePlatform();
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(ENABLED_KEY) === "true",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="record-card" aria-label="本地通知设置">
      <h3>本地通知</h3>
      <p className="muted">
        App 挂起或电脑离线时，可能收不到提醒。
      </p>
      {!native && (
        <p className="muted">请在 iOS 或 Android App 中启用本地通知。</p>
      )}
      <button
        disabled={!native || busy}
        aria-pressed={enabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (enabled) {
              localStorage.setItem(ENABLED_KEY, "false");
              setEnabled(false);
              return;
            }
            const permission = await LocalNotifications.requestPermissions();
            if (permission.display !== "granted") {
              setError("通知权限未开启，请在系统设置中允许通知后重试。");
              return;
            }
            localStorage.setItem(ENABLED_KEY, "true");
            setEnabled(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "无法设置通知权限");
          } finally {
            setBusy(false);
          }
        }}
      >
        {enabled ? "关闭本地通知" : "开启本地通知"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
