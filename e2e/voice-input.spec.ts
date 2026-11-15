import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";

test("ASR missing credentials is shown explicitly without offering paid transcription", async ({
  page,
}) => {
  await page.route("**/v1/voice/status", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "新建会话");
  await page.getByRole("button", { name: "创建会话", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await expect(page.getByText(/电脑尚未配置 ASR/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始录音", exact: true }),
  ).toBeDisabled();
});

test("shared recorder captures WAV; only explicit transcription uploads and fills draft (offline synthetic audio)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            void context.close();
          };
        }
        return destination.stream;
      },
    });
  });
  const uploads: Record<string, unknown>[] = [];
  await page.route("**/v1/voice/status", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await page.route("**/v1/voice/transcribe", (route) => {
    uploads.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: "离线语音草稿" } });
  });
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "新建会话");
  await page.getByRole("button", { name: "创建会话", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /正在录音 0:01/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "结束录音", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "转写录音", exact: true }),
  ).toBeVisible();
  expect(uploads).toHaveLength(0);
  await page.getByRole("button", { name: "转写录音", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toHaveValue("离线语音草稿");
  expect(uploads).toHaveLength(1);
  expect(Object.keys(uploads[0])).toEqual(["audio"]);
  expect(
    Buffer.from(String(uploads[0].audio), "base64").subarray(0, 4).toString(),
  ).toBe("RIFF");
  await expect(page.locator(".user-message")).toHaveCount(0);
});
