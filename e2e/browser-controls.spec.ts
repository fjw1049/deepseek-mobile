import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("browser control binds generation and scene; stale input is not replayed and native dialog is actionable", async ({
  page,
}) => {
  let view: any = {
    active: true,
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
    owner: "agent",
    generation: 3,
    scene: { scene_id: "scene-a" },
    viewport: { width: 800, height: 600 },
    url: "https://example.com",
    tabs: [],
  };
  const controls: any[] = [],
    inputs: any[] = [],
    actions: any[] = [];
  await page.route("**/browser/view", (r) => r.fulfill({ json: view }));
  await page.route("**/browser/control", (r) => {
    controls.push(r.request().postDataJSON());
    view = { ...view, owner: "user", generation: 4 };
    return r.fulfill({ json: view });
  });
  await page.route("**/browser/input", (r) => {
    inputs.push(r.request().postDataJSON());
    view = {
      ...view,
      scene: { scene_id: "scene-b" },
      dialog: { id: "dialog-5", type: "prompt", message: "输入测试标记" },
    };
    return r.fulfill({
      status: 409,
      json: { detail: "画面已变化，请重新确认" },
    });
  });
  await page.route("**/browser/action", (r) => {
    actions.push(r.request().postDataJSON());
    view = { ...view, dialog: null };
    return r.fulfill({ json: { success: true } });
  });
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await navigate(page, "新建会话");
  await page.getByRole("button", { name: "创建会话", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "工作区");
  await page.getByRole("button", { name: "工具", exact: true }).click();
  await page.getByRole("button", { name: "浏览器控制", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "输入文字", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "接管浏览器", exact: true }).click();
  await expect(page.getByText("由你控制", { exact: true })).toBeVisible();
  expect(controls).toEqual([{ owner: "user", generation: 3 }]);
  await page.getByText("手动操作网页", { exact: true }).click();
  await page.getByText("输入文字与快捷键", { exact: true }).click();
  await page.getByLabel("向网页输入文字").fill("hello");
  await page.getByRole("button", { name: "输入文字", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("画面已变化");
  expect(inputs).toEqual([
    { kind: "text", text: "hello", generation: 4, scene_id: "scene-a" },
  ]);
  await expect(page.getByRole("dialog", { name: "网页对话框" })).toBeVisible();
  await page.getByLabel("网页提示输入").fill("confirmed");
  await page
    .getByRole("button", { name: "确认网页对话框", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(actions).toEqual([
    {
      action: "handle_dialog",
      dialog_id: "dialog-5",
      accept: true,
      text: "confirmed",
      generation: 4,
    },
  ]);
  expect(inputs).toHaveLength(1);
});
