import { navigate } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
const initial = {
  active: true,
  available: true,
  used: true,
  connected: true,
  owner: "assistant",
  revision: 7,
  turn_id: "cua-turn",
  paused: false,
  waiting: false,
  transferring: false,
  unresolved: null as null | {
    call_id: string;
    turn_id: string;
    outcome: string;
  },
  surface: { kind: "app", app_id: "com.example.editor" },
};
async function openCua(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("访问令牌", { exact: true })
    .fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await navigate(page, "新建会话");
  await page.getByLabel("会话名称").fill("CUA contract fixture");
  await page.getByRole("button", { name: "创建会话", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toBeVisible();
  await navigate(page, "工作区");
  await page.getByRole("button", { name: "电脑控制", exact: true }).click();
}
test("CUA takeover binds revision and turn; uncertain resume needs explicit review and never replays 409", async ({
  page,
}) => {
  let state = { ...initial };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/v1/threads/*/cua", (route) =>
    route.fulfill({ json: state }),
  );
  await page.route("**/v1/threads/*/cua/control", async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    if (body.owner === "user")
      state = {
        ...state,
        owner: "user",
        paused: true,
        revision: 8,
        unresolved: {
          call_id: "uncertain-click",
          turn_id: "cua-turn",
          outcome: "unknown",
        },
      };
    else if (writes.length === 2) {
      state = { ...state, revision: 9 };
      await route.fulfill({
        status: 409,
        json: { detail: "Computer control changed" },
      });
      return;
    } else
      state = {
        ...state,
        owner: "assistant",
        paused: false,
        revision: 10,
        unresolved: null,
      };
    await route.fulfill({ json: state });
  });
  await openCua(page);
  await page.getByRole("button", { name: "接管并暂停", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "接管并暂停确认" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "确认接管并暂停" }).click();
  await expect(page.getByText("已由你接管", { exact: true })).toBeVisible();
  expect(writes[0]).toEqual({
    owner: "user",
    revision: 7,
    turn_id: "cua-turn",
  });
  await page.getByRole("button", { name: "交还智能体", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认交还智能体" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "我已查看电脑实际状态及这条操作的记录，确认可以继续",
    })
    .check();
  await page.getByRole("button", { name: "确认交还智能体" }).click();
  await expect(page.getByRole("alert")).toContainText("控制状态已变化");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual({
    owner: "assistant",
    revision: 8,
    turn_id: "cua-turn",
    reviewed_call_id: "uncertain-click",
  });
  // A new human confirmation is required; the first checkbox cannot carry forward.
  await page.getByRole("button", { name: "交还智能体", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认交还智能体" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(2);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "确认交还智能体" }).click();
  await expect(
    page.getByText("智能体正在操作电脑", { exact: true }),
  ).toBeVisible();
  expect(writes[2]).toMatchObject({
    revision: 9,
    turn_id: "cua-turn",
    reviewed_call_id: "uncertain-click",
  });
});
test("CUA discards a frame whose task identity changes and confirms stop explicitly", async ({
  page,
}) => {
  let state = { ...initial };
  const writes: unknown[] = [];
  await page.route("**/v1/threads/*/cua", (route) =>
    route.fulfill({ json: state }),
  );
  await page.route("**/v1/threads/*/cua/frame", async (route) => {
    state = { ...state, revision: 8, turn_id: "new-turn" };
    await route.fulfill({
      json: {
        mime_type: "image/jpeg",
        data: "fake-frame-not-to-be-shown",
        width: 10,
        height: 10,
      },
    });
  });
  await page.route("**/v1/threads/*/cua/control", async (route) => {
    writes.push(route.request().postDataJSON());
    state = { ...state, active: false, available: false };
    await route.fulfill({ json: state });
  });
  await openCua(page);
  await page.getByRole("button", { name: "刷新电脑画面" }).click();
  await expect(page.getByRole("status")).toContainText("任务状态已变化");
  await expect(page.getByRole("img", { name: "当前电脑任务画面" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "停止电脑任务", exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "确认停止电脑任务" }).click();
  await expect(
    page.getByText("当前没有运行中的电脑任务", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([
    { owner: "stopped", revision: 8, turn_id: "new-turn" },
  ]);
  await expect(
    page.getByRole("button", { name: "接管并暂停", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "刷新电脑画面" }),
  ).toBeDisabled();
});
