import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
async function connect(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await expect(page.getByText("想做点什么？")).toBeVisible();
}
test("task scope change requires explicit review before sending the confirmation key (API fixture)", async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.route("**/v1/tasks", (route) =>
    route.fulfill({
      json: {
        tasks: [{ id: "task-review", title: "权限复核任务", status: "failed" }],
      },
    }),
  );
  await page.route("**/v1/tasks/task-review/resume", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      json:
        bodies.length === 1
          ? {
              code: "resume_confirmation_required",
              confirmation_key: "reviewed-scope",
              permission_changes: [
                { field: "auto_approve", current: false, target: true },
              ],
            }
          : { id: "task-review", status: "queued" },
    });
  });
  await connect(page);
  await navigate(page, "活动");
  await page.getByRole("button", { name: "恢复任务" }).click();
  await expect(
    page.getByRole("dialog", { name: "恢复任务前确认" }),
  ).toBeVisible();
  expect(bodies).toHaveLength(1);
  await expect(page.getByText("自动审批", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认恢复任务" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ confirmation_key: "reviewed-scope" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("paused automation uses resume, with status from the existing API (API fixture)", async ({
  page,
}) => {
  const actions: string[] = [];
  await page.route("**/v1/automations", (route) =>
    route.fulfill({
      json: [{ id: "auto-1", name: "暂停的自动化", status: "paused" }],
    }),
  );
  await page.route("**/v1/automations/auto-1/*", (route) => {
    actions.push(route.request().url().split("/").at(-1)!);
    return route.fulfill({ json: { id: "auto-1", status: "active" } });
  });
  await connect(page);
  await navigate(page, "活动");
  await page.getByRole("button", { name: "自动化", exact: true }).click();
  await page.getByRole("button", { name: "启用", exact: true }).click();
  await expect.poll(() => actions).toEqual(["resume"]);
});
