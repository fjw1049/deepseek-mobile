import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const headers = { Authorization: "Bearer mobile-offline-test" };
async function create(request: APIRequestContext, title: string) {
  const response = await request.post("/runtime/v1/threads", {
    headers,
    data: {
      title: `${title}-${Date.now()}`,
      mode: "ask",
      provider: "deepseek",
      model: "deepseek-flash",
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string; title: string };
}
async function connect(page: Page) {
  // All model calls are forbidden: these tests exercise local state and Runtime metadata only.
  await page.route("**/v1/threads/*/turns", (route) => {
    if (route.request().method() === "POST")
      throw new Error("Unexpected model invocation");
    return route.continue();
  });
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
}
async function choose(page: Page, title: string) {
  await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(
    page.getByRole("textbox", { name: "消息", exact: true }),
  ).toBeVisible();
}
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

test("late steer completion preserves the other thread draft and clears only the accepted instruction", async ({
  page,
  request,
}) => {
  const a = await create(request, "追加A"),
    b = await create(request, "追加B");
  await page.route(`**/v1/threads/${a.id}`, async (route) => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.turns = [{ id: "offline-running-turn", status: "in_progress" }];
    await route.fulfill({ json: detail });
  });
  const deferred = gate(),
    started = gate();
  await page.route(
    `**/v1/threads/${a.id}/turns/offline-running-turn/steer`,
    async (route) => {
      started.release();
      await deferred.wait;
      await route.fulfill({ json: { ok: true } });
    },
  );
  await connect(page);
  await choose(page, b.title);
  const input = page.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("B 尚未发送的草稿");
  await choose(page, a.title);
  await input.fill("A 已接受的追加指令");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await started.wait;
  await choose(page, b.title);
  await expect(input).toHaveValue("B 尚未发送的草稿");
  deferred.release();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("B 尚未发送的草稿");
  await choose(page, a.title);
  await expect(input).toHaveValue("");
});

test("late session rename cannot replace the currently selected thread", async ({
  page,
  request,
}) => {
  const a = await create(request, "重命名A"),
    b = await create(request, "重命名B");
  const deferred = gate(),
    started = gate();
  await page.route(`**/v1/threads/${a.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    started.release();
    await deferred.wait;
    await route.fulfill({ response });
  });
  await connect(page);
  await choose(page, a.title);
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page.getByLabel("会话名称", { exact: true }).fill("A 慢速重命名完成");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await started.wait;
  await page.keyboard.press("Escape");
  await choose(page, b.title);
  const input = page.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("B 的当前内容");
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/v1/threads/${a.id}`) &&
      response.request().method() === "GET",
  );
  deferred.release();
  await (await refreshed).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/runtime/v1/threads/${a.id}`, { headers })
          ).json()
        ).thread.title,
    )
    .toBe("A 慢速重命名完成");
  // Wait until the delayed onChanged fetch has finished, not an arbitrary sleep.
  await expect(page.locator(".breadcrumb")).toContainText(b.title);
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await expect(page.getByLabel("会话名称", { exact: true })).toHaveValue(
    b.title,
  );
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("B 的当前内容");
});

test("late confirmed deletion does not clear another thread or its drafts", async ({
  page,
  request,
}) => {
  const a = await create(request, "删除A"),
    b = await create(request, "删除B");
  const deferred = gate(),
    started = gate();
  await page.route(`**/v1/threads/${a.id}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    const response = await route.fetch();
    started.release();
    await deferred.wait;
    await route.fulfill({ response });
  });
  await connect(page);
  await choose(page, b.title);
  const input = page.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("删除 A 时保留 B");
  await choose(page, a.title);
  await page.getByRole("button", { name: "会话操作", exact: true }).click();
  await page.getByRole("button", { name: "删除会话", exact: true }).click();
  await page.getByRole("button", { name: "确认永久删除", exact: true }).click();
  await started.wait;
  await page.keyboard.press("Escape");
  await choose(page, b.title);
  const refreshed = page.waitForResponse((response) =>
    response.url().includes("/v1/threads?include_archived=true"),
  );
  deferred.release();
  await (await refreshed).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(input).toHaveValue("删除 A 时保留 B");
  await expect(page.locator(".breadcrumb")).toContainText(b.title);
});

test("model editing cancels cleanly, modal keyboard and native Back stay inside overlays, multiline drafts restore height", async ({
  page,
  request,
}) => {
  const a = await create(request, "键盘A"),
    b = await create(request, "键盘B");
  await page.route("**/v1/voice/status", (route) =>
    route.fulfill({ json: { configured: false } }),
  );
  await connect(page);
  await choose(page, a.title);
  const input = page.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("第一行\n第二行\n第三行\n第四行");
  await choose(page, b.title);
  await choose(page, a.title);
  await expect(input).toHaveValue("第一行\n第二行\n第三行\n第四行");
  expect(
    await input.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThan(60);
  await page.locator(".model-chip").click();
  await page.getByRole("button", { name: "高级模型配置", exact: true }).click();
  await page.getByLabel("模型 ID", { exact: true }).fill("unsaved-model");
  const dialog = page.getByRole("dialog", { name: "模型与推理" });
  await dialog.getByRole("button", { name: "关闭", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "完成", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "关闭", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".model-chip")).toContainText("deepseek-flash");
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "语音输入" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.dispatchEvent(
        new Event("mobile-dismiss-overlay", { cancelable: true }),
      ),
    ),
  ).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("添加附件", { exact: true }).click();
  await expect(page.locator(".composer-add")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".composer-add")).not.toHaveAttribute("open", "");
});

test("microphone permission finishing after dismissal cannot change a reopened voice dialog", async ({
  page,
  request,
}) => {
  const a = await create(request, "语音权限边界");
  await page.route("**/v1/voice/status", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () =>
        new Promise((_resolve, reject) => {
          (
            window as unknown as { denyOldMicrophone: () => void }
          ).denyOldMicrophone = () =>
            reject(
              new DOMException(
                "offline permission rejection",
                "NotAllowedError",
              ),
            );
        }),
    });
  });
  await connect(page);
  await choose(page, a.title);
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "等待麦克风权限…", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始录音", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    (
      window as unknown as { denyOldMicrophone: () => void }
    ).denyOldMicrophone();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await expect(
    page.getByRole("dialog", { name: "语音输入" }).getByRole("alert"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "开始录音", exact: true }),
  ).toBeEnabled();
});

test("a late upload response never inserts another thread's attachment", async ({
  page,
  request,
}) => {
  const a = await create(request, "慢上传A"),
    b = await create(request, "慢上传B");
  const deferred = gate(),
    started = gate();
  await page.route(`**/v1/threads/${a.id}/attachments`, async (route) => {
    const response = await route.fetch();
    started.release();
    await deferred.wait;
    await route.fulfill({ response });
  });
  await connect(page);
  await choose(page, b.title);
  const input = page.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("B 的附件和草稿隔离");
  await choose(page, a.title);
  await page.getByLabel("选择上传附件", { exact: true }).setInputFiles({
    name: "offline-upload.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("synthetic upload data"),
  });
  await started.wait;
  await choose(page, b.title);
  const response = page.waitForResponse((r) =>
    r.url().endsWith(`/v1/threads/${a.id}/attachments`),
  );
  deferred.release();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(input).toHaveValue("B 的附件和草稿隔离");
  await expect(input).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "移除附件 offline-upload.txt",
      exact: true,
    }),
  ).toHaveCount(0);
  await choose(page, a.title);
  await expect(
    page.getByRole("button", {
      name: "移除附件 offline-upload.txt",
      exact: true,
    }),
  ).toBeVisible();
});
