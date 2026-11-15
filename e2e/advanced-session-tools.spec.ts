import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
async function setup(page: Page, request: APIRequestContext) {
  const headers = { Authorization: "Bearer mobile-offline-test" };
  const response = await request.post("/runtime/v1/threads", {
    headers,
    data: { title: "高级会话测试", mode: "ask" },
  });
  const thread = await response.json();
  thread.goal = {
    goal_id: "goal-reviewed",
    objective: "完成项目审查",
    status: "paused",
    tokens_used: 10,
    turns_used: 1,
    budget_limits: { token_budget: 1000 },
  };
  thread.goal_queue = [{ item_id: "next-1", objective: "整理结论" }];
  const detail = {
    thread,
    turns: [],
    latest_seq: 0,
    items: [
      {
        id: "message-before",
        kind: "user_message",
        summary: "最初的问题",
        detail: "最初的问题",
        status: "completed",
        turn_id: "turn-before",
      },
    ],
  };
  await page.route(`**/v1/threads/${thread.id}`, (route) =>
    route.fulfill({ json: detail }),
  );
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await page
    .getByRole("button", { name: /高级会话测试/ })
    .first()
    .click();
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  return thread.id as string;
}
test("goal budget carries expected goal identity and never resumes implicitly", async ({
  page,
  request,
}) => {
  const id = await setup(page, request),
    bodies: Record<string, unknown>[] = [];
  await page.route(`**/v1/threads/${id}/goal`, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.getByText("目标预算与队列", { exact: true }).click();
  await page.getByLabel("Token 总预算").fill("2500");
  await page.getByLabel("总轮次预算").fill("4");
  await page.getByRole("button", { name: "保存目标预算" }).click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toEqual({
    args: "budget tokens 2500 turns 4",
    expected_goal_id: "goal-reviewed",
    resume_after_budget: false,
  });
});
test("file restore requires preview and explicit confirmation, never forces conflicts", async ({
  page,
  request,
}) => {
  const id = await setup(page, request),
    writes: Record<string, unknown>[] = [];
  await page.route(
    `**/v1/threads/${id}/rewind-preview?before_item_id=message-before`,
    (route) =>
      route.fulfill({
        json: {
          turns: 1,
          files: ["src/main.py"],
          conflicts: ["README.md"],
          skipped: [],
          missing_roots: [],
          no_checkpoint: 0,
        },
      }),
  );
  await page.route(`**/v1/threads/${id}/restore-code`, async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({
      json: { restored: ["src/main.py"], skipped: ["README.md"] },
    });
  });
  await page.getByText("回退对话与恢复文件", { exact: true }).click();
  await page.getByLabel("回退位置").selectOption("message-before");
  await page.getByLabel("回退范围").selectOption("files");
  await expect(page.getByRole("button", { name: "确认执行回退" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "预览回退影响" }).click();
  await expect(page.getByText("README.md", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认执行回退" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
  await page.getByLabel("我已查看影响范围，确认执行所选回退操作。").check();
  await page.getByRole("button", { name: "确认执行回退" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    before_item_id: "message-before",
    force_conflicts: false,
  });
});
test("share creation and import require content acknowledgement and safe file default", async ({
  page,
  request,
}) => {
  const id = await setup(page, request),
    writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/v1/sharing/settings", (route) =>
    route.fulfill({
      json: { service_url: "https://shares.example.test", ready: true },
    }),
  );
  await page.route("**/v1/sharing/shares", async (route) => {
    writes.push({ path: "shares", body: route.request().postDataJSON() });
    await route.fulfill({
      json: {
        url: "https://shares.example.test/s/test",
        expires_at: "2027-01-01",
      },
    });
  });
  await page.route("**/v1/sharing/preview", (route) =>
    route.fulfill({
      json: {
        title: "导入测试",
        turn_count: 2,
        model: "deepseek-flash",
        files: ["main.py"],
        messages: [],
      },
    }),
  );
  await page.route("**/v1/sharing/restore", async (route) => {
    writes.push({ path: "restore", body: route.request().postDataJSON() });
    await route.fulfill({ json: { id } });
  });
  await page.getByText("分享与导入会话", { exact: true }).click();
  await page.getByRole("button", { name: "检查分享服务" }).click();
  await expect(
    page.getByRole("button", { name: "创建分享链接", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("确认将当前会话上传至上述服务").check();
  await page.getByRole("button", { name: "创建分享链接", exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({
    thread_id: id,
    include_project: false,
    expires_in_days: 7,
  });
  await page
    .getByLabel("分享链接", { exact: true })
    .fill("https://shares.example.test/s/test");
  await page.getByRole("button", { name: "预览分享内容" }).click();
  await expect(
    page.getByRole("button", { name: "确认导入分享" }),
  ).toBeDisabled();
  await page.getByLabel("已查看内容，确认导入会话", { exact: true }).check();
  await page.getByRole("button", { name: "确认导入分享" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    path: "restore",
    body: { restore_project: false, workspace: null },
  });
});
