import { navigate } from "./navigation";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const adminHeaders = { Authorization: "Bearer mobile-offline-test" };
const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
async function createThread(
  request: APIRequestContext,
  title: string,
  model = "deepseek-flash",
) {
  const response = await request.post("/runtime/v1/threads", {
    headers: adminHeaders,
    data: { title, provider: "deepseek", model, mode: "ask" },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    id: string;
    title: string;
    workspace: string;
    model: string;
  };
}
async function connect(page: Page) {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "打开会话", exact: true }),
  ).toBeVisible();
}
async function choose(page: Page, title: string) {
  await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toBeVisible();
}

test("real Runtime uploads synthetic image and DOCX, persists bytes and isolates per-thread attachment drafts", async ({
  page,
  request,
}) => {
  const a = await createThread(request, "附件草稿A-" + Date.now()),
    b = await createThread(request, "附件草稿B-" + Date.now());
  let turns = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/turns$/.test(new URL(r.url()).pathname))
      turns++;
  });
  await connect(page);
  await choose(page, a.title);
  await page
    .getByRole("textbox", { name: "消息", exact: true })
    .fill("仅属于附件会话 A 的草稿");
  const imageResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/v1/threads/${a.id}/attachments`) &&
      r.request().postDataJSON()?.name === "synthetic.png",
  );
  const documentResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/v1/threads/${a.id}/attachments`) &&
      r.request().postDataJSON()?.name === "synthetic.docx",
  );
  await page
    .getByLabel("选择上传附件")
    .setInputFiles([fixture("synthetic.png"), fixture("synthetic.docx")]);
  const responses = await Promise.all([imageResponse, documentResponse]);
  const uploads = [];
  for (const response of responses) {
    expect(response.ok()).toBeTruthy();
    uploads.push(await response.json());
  }
  expect(uploads[0].kind).toBe("image");
  expect(uploads[1].parser_available).toBe(true);
  expect(uploads[1].text_preview).toContain("SYNTHETIC_DOCUMENT_BODY");
  await expect(
    page.getByRole("button", { name: "移除附件 synthetic.png" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除附件 synthetic.docx" }),
  ).toBeVisible();
  await page.getByText("查看提取正文", { exact: true }).click();
  await expect(page.locator(".attachments pre")).toContainText(
    "SYNTHETIC_DOCUMENT_BODY",
  );
  for (const upload of uploads) {
    const saved = await request.get(
      `/runtime/v1/threads/${a.id}/files/content?path=${encodeURIComponent(upload.path)}`,
      { headers: adminHeaders },
    );
    expect(saved.ok()).toBeTruthy();
    const file = await saved.json();
    expect(
      Buffer.from(file.data_base64, "base64").equals(
        readFileSync(fixture(upload.name)),
      ),
    ).toBe(true);
  }
  await choose(page, b.title);
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: /移除附件 synthetic/ }),
  ).toHaveCount(0);
  // Files saved under another thread's upload prefix cannot be read from B.
  const forbidden = await request.get(
    `/runtime/v1/threads/${b.id}/files/content?path=${encodeURIComponent(uploads[0].path)}`,
    { headers: adminHeaders },
  );
  expect(forbidden.status()).toBe(403);
  await choose(page, a.title);
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toHaveValue("仅属于附件会话 A 的草稿");
  await expect(
    page.getByRole("button", { name: "移除附件 synthetic.png" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "移除附件 synthetic.docx" }),
  ).toBeVisible();
  expect(turns).toBe(0);
});

test("real device pairing in another browser context is revocable and never writes a token to localStorage", async ({
  page,
  browser,
  baseURL,
}) => {
  await connect(page);
  await navigate(page, "设置");
  const codeResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/v1/mobile/devices/pair-codes") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "生成手机配对码" }).click();
  const code = (await (await codeResponse).json()).code;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  try {
    const phone = await context.newPage();
    await phone.goto("/");
    await phone.getByLabel("配对服务地址").fill("/runtime");
    await phone
      .getByLabel("设备名称", { exact: true })
      .fill("离线配对验收手机");
    await phone.getByLabel("一次性配对码").fill(code);
    const pairResponse = phone.waitForResponse(
      (r) =>
        r.url().endsWith("/v1/mobile/devices/pair") &&
        r.request().method() === "POST",
    );
    await phone.getByRole("button", { name: "配对并连接" }).click();
    const pairedResponse = await pairResponse;
    expect(pairedResponse.ok()).toBeTruthy();
    const paired = await pairedResponse.json();
    await expect(
      phone.getByRole("button", { name: "打开会话", exact: true }),
    ).toBeVisible();
    await navigate(phone, "设置");
    await expect(
      phone.getByRole("heading", { name: "离线配对验收手机", exact: true }),
    ).toBeVisible();
    const storage = await phone.evaluate(() =>
      JSON.stringify({ ...localStorage }),
    );
    expect(storage).not.toContain(paired.token);
    expect(storage).not.toMatch(/dsd_|runtime-token|device-token/);
    const before = await phone.evaluate(
      async (token) =>
        (
          await fetch("/runtime/v1/threads", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      paired.token,
    );
    expect(before).toBe(200);
    await page.getByRole("button", { name: "刷新设备列表" }).click();
    const card = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "离线配对验收手机",
        exact: true,
      }),
    });
    await card.getByRole("button", { name: "撤销此设备" }).click();
    const dialog = page.getByRole("dialog", { name: "撤销设备确认" });
    await expect(dialog).toBeVisible();
    const revoke = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/v1/mobile/devices/${paired.device.id}`) &&
        r.request().method() === "DELETE",
    );
    await dialog.getByRole("button", { name: "确认撤销设备" }).click();
    expect((await revoke).ok()).toBeTruthy();
    const after = await phone.evaluate(
      async (token) =>
        (
          await fetch("/runtime/v1/threads", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      paired.token,
    );
    expect(after).toBe(401);
    const again = await context.request.post(
      "/runtime/v1/mobile/devices/pair",
      { data: { code, name: "重复配对" } },
    );
    expect(again.status()).toBe(400);
  } finally {
    await context.close();
  }
});

test("model catalog reads local configuration, refreshes only on explicit click and persists the selected thread model", async ({
  page,
  request,
}) => {
  const thread = await createThread(
    request,
    "模型目录验收-" + Date.now(),
    "offline-before-selection",
  );
  let refreshes = 0,
    catalogReads = 0,
    turns = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/turns$/.test(new URL(r.url()).pathname))
      turns++;
  });
  await page.route("**/v1/model-catalog", (route) => {
    catalogReads++;
    return route.fulfill({
      json: {
        active_provider: "deepseek",
        providers: [
          {
            id: "deepseek",
            configured: true,
            discoverable: true,
            models: ["offline-before-selection"],
            source: "电脑配置",
          },
        ],
      },
    });
  });
  await page.route("**/v1/model-catalog/deepseek/refresh", (route) => {
    refreshes++;
    return route.fulfill({ json: { models: ["deepseek-flash"] } });
  });
  await connect(page);
  await choose(page, thread.title);
  await page.locator(".model-chip").click();
  await page.getByRole("button", { name: "高级模型配置" }).click();
  await expect(page.getByLabel("电脑模型目录中的模型")).toContainText(
    "offline-before-selection",
  );
  expect(catalogReads).toBeGreaterThan(0);
  expect(refreshes).toBe(0);
  await page.getByRole("button", { name: "刷新模型列表", exact: true }).click();
  await expect(page.getByLabel("电脑模型目录中的模型")).toContainText(
    "deepseek-flash",
  );
  expect(refreshes).toBe(1);
  await page.getByLabel("电脑模型目录中的模型").selectOption("deepseek-flash");
  await expect(page.getByLabel("模型 ID", { exact: true })).toHaveValue(
    "deepseek-flash",
  );
  const patch = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/v1/threads/${thread.id}`) &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "完成", exact: true }).click();
  expect((await patch).ok()).toBeTruthy();
  const saved = await request.get(`/runtime/v1/threads/${thread.id}`, {
    headers: adminHeaders,
  });
  expect((await saved.json()).thread).toMatchObject({
    provider: "deepseek",
    model: "deepseek-flash",
  });
  expect(refreshes).toBe(1);
  expect(turns).toBe(0);
});
