import { test, expect } from "@playwright/test";
import { navigate } from "./navigation";

test("mobile shell matches reference geometry and retains drawer, result, model and budget actions", async ({
  page,
  request,
}) => {
  let credits = 0;
  await page.route("**/v1/preview-status", (r) =>
    r.fulfill({
      json: {
        model: "deepseek-flash",
        remaining_requests: credits ? 6 : 0,
        max_requests: 6,
        manual_enabled: credits > 0,
      },
    }),
  );
  await page.route("**/v1/preview-status/manual", (r) => {
    credits++;
    return r.fulfill({
      json: {
        model: "deepseek-flash",
        remaining_requests: 6,
        max_requests: 6,
        manual_enabled: true,
      },
    });
  });
  const created = await request.post("/runtime/v1/threads", {
    headers: { Authorization: "Bearer mobile-offline-test" },
    data: { title: "手机布局验收", mode: "ask" },
  });
  const thread = await created.json();
  await page.goto("/");
  await page
    .getByLabel("访问令牌", { exact: true })
    .fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /手机布局验收/ }).click();
  await expect(page.getByLabel("消息", { exact: true })).toBeEnabled();
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(async () => (await page.locator(".chat-surface").boundingBox())!.x)
      .toBe(12);
    const main = await page.locator(".chat-surface").boundingBox(),
      composer = await page.locator(".input-box").boundingBox();
    expect(main!.x).toBe(12);
    expect(main!.width).toBe(width - 24);
    expect(composer!.height).toBe(52);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(credits).toBe(0);
  await expect(
    page.getByRole("button", { name: "开始手动验证（再开放 6 次调用）" }),
  ).toBeHidden();
  await page.locator(".preview-status > summary").click();
  await page
    .getByRole("button", { name: "开始手动验证（再开放 6 次调用）" })
    .click();
  expect(credits).toBe(1);
  await page.locator(".preview-status > summary").click();
  await page.getByRole("button", { name: "打开会话" }).click();
  await expect
    .poll(async () => (await page.locator(".chat-surface").boundingBox())!.x)
    .toBe(284);
  expect((await page.locator(".drawer").boundingBox())!.width).toBe(260);
  await expect(page.locator(".thread-group > summary").first()).toBeVisible();
  await page.getByRole("button", { name: "关闭会话列表" }).click();
  await page.route(`**/v1/threads/${thread.id}`, async (route) => {
    const upstream = await route.fetch();
    const detail = await upstream.json();
    detail.turns = [
      {
        id: "geometry-diff",
        input_summary: "很长的真实任务说明，折叠后不能挤走文件差异。".repeat(
          30,
        ),
        diff_snapshot: {
          complete: true,
          files: [
            {
              path: "src/example.ts",
              op: "update",
              additions: 1,
              deletions: 1,
              unified_diff:
                "--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-const old = 1;\n+const next = 2;",
            },
          ],
        },
      },
    ];
    await route.fulfill({ json: detail });
  });
  await page.getByRole("button", { name: "结果", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "执行结果" });
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(378);
  await expect(page.getByLabel("src/example.ts 差异")).toBeVisible();
  await expect(
    page.locator(".compact-results .environment-details"),
  ).not.toHaveAttribute("open");
  expect(
    (await page.locator(".turn-change-title").boundingBox())!.height,
  ).toBeLessThan(40);
  await panel.getByRole("button", { name: "关闭", exact: true }).click();
  await page.locator(".model-chip").click();
  const quick = page.getByRole("dialog", { name: "快速选择模型" });
  await expect(quick).toBeVisible();
  expect((await quick.boundingBox())!.height).toBeLessThan(470);
  await page.getByRole("button", { name: "高级模型配置" }).click();
  await expect(page.getByRole("dialog", { name: "模型与推理" })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  for (const destination of ["活动", "工作区", "设置", "对话"])
    await navigate(page, destination);
});
