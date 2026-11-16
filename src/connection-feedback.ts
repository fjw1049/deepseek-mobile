import { ApiError } from "./protocol";
export function connectionFeedback(error: unknown, stage: "credentials" | "network") {
  if (stage === "credentials") return { title: "无法读取保存的连接", detail: "本机安全存储暂不可用。请解锁手机后重试，或重新配对电脑。" };
  if (error instanceof ApiError && [401, 403].includes(error.status)) return { title: "电脑授权已失效", detail: "请在电脑上生成新的配对码，重新连接这台手机。" };
  return { title: "暂时连不上电脑", detail: "请确认电脑工作台正在运行，并检查 Wi-Fi 或远程网络。保存的连接不会被清除。" };
}
