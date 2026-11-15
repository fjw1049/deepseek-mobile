import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("text attachments, reusable messages, per-code copy, model effort and theme work in the mobile app", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "新建会话");
  await page.getByLabel("会话名称").fill("附件与消息功能验收");
  await page.getByRole("button", { name: "创建会话" }).click();
  await page.getByLabel("选择文本附件").setInputFiles({
    name: "requirements.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("离线验证：复用原 Runtime，不重写引擎。"),
  });
  await expect(page.getByText("requirements.md · 1 KB")).toBeVisible();
  await page.getByLabel("消息", { exact: true }).fill("请阅读附件");
  const turnRequest = page.waitForRequest(
    (r) => r.url().endsWith("/turns") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "发送消息" }).click();
  const sent = (await turnRequest).postDataJSON();
  expect(sent.prompt).toContain("requirements.md");
  expect(sent.prompt).toContain("复用原 Runtime");
  await expect(page.locator(".assistant-message")).toContainText(
    "Mobile connected",
  );
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('print("Mobile connected")');
  await page.getByRole("button", { name: "编辑为新消息" }).click();
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue(
    /requirements.md/,
  );
  await page.getByLabel("选择文本附件").setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await expect(page.getByRole("alert")).toContainText(
    "请使用「添加文件或图片」",
  );
  await page.locator(".model-chip").click();
  await page.getByLabel("推理强度").selectOption("off");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await navigate(page, "设置");
  await page.getByLabel("外观", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("draft and attachments stay with the session when switching", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  for (const name of ["草稿A", "草稿B"]) {
    await navigate(page, "新建会话");
    await page.getByLabel("会话名称").fill(name);
    await page.getByRole("button", { name: "创建会话" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".breadcrumb")).toContainText(name);
  }
  await page.getByLabel("消息", { exact: true }).fill("尚未发送的草稿 B");
  await page.getByLabel("选择文本附件").setInputFiles({
    name: "draft.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("draft B"),
  });
  await expect(page.getByText("draft.txt · 1 KB")).toBeVisible();
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /草稿A/ }).click();
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue("");
  await expect(page.getByText("draft.txt · 1 KB")).toHaveCount(0);
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /草稿B/ }).click();
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue(
    "尚未发送的草稿 B",
  );
  await expect(page.getByText("draft.txt · 1 KB")).toBeVisible();
});

test("late send response never clears another session draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  for (const name of ["延迟响应A", "延迟响应B"]) {
    await navigate(page, "新建会话");
    await page.getByLabel("会话名称").fill(name);
    await page.getByRole("button", { name: "创建会话" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".breadcrumb")).toContainText(name);
  }
  await page.getByLabel("消息", { exact: true }).fill("保留 B 的草稿");
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /延迟响应A/ }).click();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/v1/threads/*/turns", async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByLabel("消息", { exact: true }).fill("离线延迟响应验证");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /延迟响应B/ }).click();
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue(
    "保留 B 的草稿",
  );
  release();
  await expect(page.getByLabel("消息", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("消息", { exact: true })).toHaveValue(
    "保留 B 的草稿",
  );
});
