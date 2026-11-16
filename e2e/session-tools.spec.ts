import { test, expect } from "@playwright/test";

test("session rename, context, archive restoration and confirmed deletion use the real Runtime", async ({
  page,
  request,
}) => {
  const headers = { Authorization: "Bearer mobile-offline-test" };
  const created = await request.post("/runtime/v1/threads", {
    headers,
    data: { title: "会话管理验收", mode: "ask" },
  });
  expect(created.ok()).toBeTruthy();
  const thread = await created.json();
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await page.getByRole("button", { name: /会话管理验收/ }).click();
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page.getByLabel("会话名称").fill("已重命名验收会话");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/runtime/v1/threads/${thread.id}`, { headers })
          ).json()
        ).thread.title,
    )
    .toBe("已重命名验收会话");
  if (
    !(await page
      .getByRole("button", { name: "查看上下文用量", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page
    .getByRole("button", { name: "查看上下文用量", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "上下文用量" })).toContainText(
    "估算已用",
  );
  // Opening/cancelling compression must not invoke a model.
  const compactions: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/compact")) compactions.push(r.method());
  });
  await page.getByRole("button", { name: "压缩上下文", exact: true }).click();
  await page
    .getByRole("region", { name: "确认压缩上下文" })
    .getByRole("button", { name: "取消", exact: true })
    .click();
  expect(compactions).toEqual([]);
  await page.getByRole("button", { name: "归档会话", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/runtime/v1/threads/${thread.id}`, { headers })
          ).json()
        ).thread.archived,
    )
    .toBe(true);
  if (await page.getByRole("dialog").count())
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
  await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await page.getByRole("button", { name: "已归档", exact: true }).click();
  await page.getByRole("button", { name: /已重命名验收会话/ }).click();
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page.getByRole("button", { name: "恢复会话", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/runtime/v1/threads/${thread.id}`, { headers })
          ).json()
        ).thread.archived,
    )
    .toBe(false);
  if (
    !(await page
      .getByRole("button", { name: "删除会话", exact: true })
      .isVisible())
  )
    await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page.getByRole("button", { name: "删除会话", exact: true }).click();
  expect(
    (await request.get(`/runtime/v1/threads/${thread.id}`, { headers })).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "确认永久删除", exact: true }).click();
  await expect
    .poll(async () =>
      (
        await request.get(`/runtime/v1/threads/${thread.id}`, { headers })
      ).status(),
    )
    .toBe(404);
});
