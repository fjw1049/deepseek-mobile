import { navigate } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
async function connect(page: Page) {
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await expect(page.getByText("想做点什么？")).toBeVisible();
  await navigate(page, "活动");
}
test("automation editor persists paused schedule, edits without activating, and requires delete confirmation", async ({
  page,
}) => {
  let records: Record<string, unknown>[] = [];
  const writes: { method: string; body: Record<string, unknown> | null }[] = [];
  await page.route("**/v1/automations", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push({ method: "POST", body });
      records = [{ id: "auto-edit", ...body }];
      await route.fulfill({ status: 201, json: records[0] });
    } else await route.fulfill({ json: records });
  });
  await page.route("**/v1/automations/auto-edit", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      writes.push({ method, body });
      records = [{ ...records[0], ...body }];
    }
    if (method === "DELETE") {
      writes.push({ method, body: null });
      records = [];
    }
    await route.fulfill({ json: records[0] ?? { id: "auto-edit" } });
  });
  await page.route("**/v1/automations/auto-edit/runs?limit=20", (route) =>
    route.fulfill({
      json: [
        {
          id: "run-1",
          status: "completed",
          scheduled_for: "2026-11-15T01:00:00Z",
        },
      ],
    }),
  );
  await connect(page);
  await page.getByRole("button", { name: "自动化", exact: true }).click();
  await page.getByRole("button", { name: "新建自动化" }).click();
  await page.getByLabel("名称", { exact: true }).fill("每日检查");
  await page.getByLabel("任务指令").fill("检查工作目录并汇报");
  await page.getByRole("button", { name: "保存自动化" }).click();
  await expect(page.getByRole("heading", { name: "每日检查" })).toBeVisible();
  expect(writes[0].body).toMatchObject({
    name: "每日检查",
    prompt: "检查工作目录并汇报",
    status: "paused",
    schedule: "0 9 * * *",
  });
  await page.getByRole("button", { name: "详情与运行记录" }).click();
  await expect(
    page.getByRole("heading", { name: "最近运行记录" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑自动化" }).click();
  await page.getByLabel("重复", { exact: true }).selectOption("custom");
  await page.getByLabel("Cron 表达式").fill("0 10 * * *");
  await page.getByRole("button", { name: "保存自动化" }).click();
  expect(writes[1].body).toMatchObject({ schedule: "0 10 * * *" });
  expect(writes[1].body).not.toHaveProperty("status");
  await page.getByRole("button", { name: "详情与运行记录" }).click();
  await page.getByRole("button", { name: "删除自动化", exact: true }).click();
  expect(writes).toHaveLength(2);
  await page.getByRole("button", { name: "保留自动化" }).click();
  expect(writes).toHaveLength(2);
  await page.getByRole("button", { name: "详情与运行记录" }).click();
  await page.getByRole("button", { name: "删除自动化", exact: true }).click();
  await page.getByRole("button", { name: "确认删除自动化" }).click();
  await expect(page.getByRole("heading", { name: "暂无自动化" })).toBeVisible();
  expect(writes[2].method).toBe("DELETE");
});
test("task detail loads persisted conversation and displays readable results", async ({
  page,
}) => {
  const task = {
    id: "task-detail",
    prompt_summary: "检查项目",
    prompt: "检查项目文件",
    status: "completed",
    result_summary: "检查结束",
    workspace: "/tmp/project",
  };
  await page.route("**/v1/tasks", (route) =>
    route.fulfill({ json: { tasks: [task] } }),
  );
  await page.route("**/v1/tasks/task-detail", (route) =>
    route.fulfill({ json: task }),
  );
  await page.route("**/v1/tasks/task-detail/conversation", (route) =>
    route.fulfill({
      json: {
        conversation: {
          blocks: [
            { id: "u", kind: "user", text: "检查项目文件" },
            { id: "a", kind: "assistant", text: "找到 **三个** 文件。" },
            {
              id: "t",
              kind: "tool",
              title: "读取项目文件",
              text: "read_file",
              detail: "README.md",
            },
          ],
        },
      },
    }),
  );
  await connect(page);
  await page.getByRole("button", { name: "查看任务" }).click();
  const dialog = page.getByRole("dialog", { name: "任务详情" });
  await expect(dialog.getByText("找到 三个 文件。")).toBeVisible();
  await dialog.getByText("读取项目文件", { exact: true }).click();
  await expect(dialog.getByText("README.md", { exact: true })).toBeVisible();
});
