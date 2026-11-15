import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("workspace uses thread-specific differences and browser frames, with no control writes", async ({
  page,
  request,
}) => {
  const headers = { Authorization: "Bearer mobile-offline-test" };
  const created = await request.post("/runtime/v1/threads", {
    headers,
    data: { title: "工作区功能验收", mode: "ask" },
  });
  expect(created.ok()).toBeTruthy();
  const t = await created.json();
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /工作区功能验收/ }).click();
  await navigate(page, "工作区");
  await page.getByRole("button", { name: "执行变更", exact: true }).click();
  await expect(page.getByText("当前会话工作区")).toBeVisible();
  await expect(page.getByText("此会话还没有记录文件变更。")).toBeVisible();
  await page.getByRole("button", { name: "浏览器", exact: true }).click();
  await expect(
    page.getByText("此会话还没有可预览的电脑浏览器画面。"),
  ).toBeVisible();
  // Actual empty-state contracts above; fixtures below exercise nonempty rendering without invoking tools.
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/browser/"))
      writes.push(r.url());
  });
  await page.route(`**/v1/threads/${t.id}`, async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.turns = [
      {
        id: "diff-turn",
        input_summary: "更新说明文档",
        diff_snapshot: {
          complete: true,
          files: [
            {
              path: "README.md",
              op: "update",
              additions: 1,
              deletions: 1,
              unified_diff:
                "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new",
            },
          ],
        },
      },
    ];
    await route.fulfill({ json: detail });
  });
  await page.getByRole("button", { name: "文件变更", exact: true }).click();
  await page.getByText("README.md", { exact: true }).click();
  await expect(page.getByLabel("README.md 差异")).toContainText("+new");
  await page.route(`**/v1/threads/${t.id}/browser/view`, (r) =>
    r.fulfill({
      json: {
        active: true,
        owner: "agent",
        url: "https://example.com",
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=",
        tabs: [{ id: "tab1", title: "验收页面", url: "https://example.com" }],
      },
    }),
  );
  await page.getByRole("button", { name: "浏览器", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "电脑浏览器当前画面" }),
  ).toBeVisible();
  await expect(page.getByText("验收页面", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("paused automation create, edit and deletion persist through the real Runtime", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "活动");
  await page.getByRole("button", { name: "自动化", exact: true }).click();
  await page.getByRole("button", { name: "新建自动化" }).click();
  await page.getByLabel("名称", { exact: true }).fill("真实调度存储验收");
  await page.getByLabel("任务指令").fill("离线验收，不启用调度");
  await page.getByRole("button", { name: "保存自动化" }).click();
  await expect(
    page.getByRole("heading", { name: "真实调度存储验收" }),
  ).toBeVisible();
  const headers = { Authorization: "Bearer mobile-offline-test" };
  let rows = await (
    await request.get("/runtime/v1/automations", { headers })
  ).json();
  const stored = rows.find(
    (r: { name: string }) => r.name === "真实调度存储验收",
  );
  expect(stored.status).toBe("paused");
  await page.getByRole("button", { name: "详情与运行记录" }).click();
  await page.getByRole("button", { name: "编辑自动化" }).click();
  await page.getByLabel("Cron 表达式").fill("0 10 * * *");
  await page.getByRole("button", { name: "保存自动化" }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/runtime/v1/automations/${stored.id}`, {
              headers,
            })
          ).json()
        ).schedule,
    )
    .toBe("0 10 * * *");
  await page.getByRole("button", { name: "详情与运行记录" }).click();
  await page.getByRole("button", { name: "删除自动化", exact: true }).click();
  await page.getByRole("button", { name: "确认删除自动化" }).click();
  await expect(page.getByRole("heading", { name: "暂无自动化" })).toBeVisible();
  rows = await (
    await request.get("/runtime/v1/automations", { headers })
  ).json();
  expect(rows.some((r: { id: string }) => r.id === stored.id)).toBe(false);
});
