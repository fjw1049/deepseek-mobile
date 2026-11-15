import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("confirmed mobile xterm uses the shared real PTY in an isolated workspace", async ({
  page,
  request,
}) => {
  const workspace = await mkdtemp(join(tmpdir(), "mobile-terminal-ui-"));
  const headers = { Authorization: "Bearer mobile-offline-test" };
  const created = await request.post("/runtime/v1/threads", {
    headers,
    data: { title: "手机终端验收", workspace, mode: "ask" },
  });
  expect(created.ok()).toBeTruthy();
  const thread = await created.json();
  let terminalId = "";
  try {
    await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
    await page.getByLabel("访问令牌").fill("mobile-offline-test");
    await page.getByRole("button", { name: "连接工作台" }).click();
    await page.getByRole("button", { name: "打开会话", exact: true }).click();
    await page.getByRole("button", { name: /手机终端验收/ }).click();
    await navigate(page, "工作区");
    await page.getByRole("button", { name: "工具", exact: true }).click();
  await page.getByRole("button", { name: "终端", exact: true }).click();
    await page.getByRole("button", { name: "打开终端", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "终端权限确认" }),
    ).toContainText("不经过 Agent 工具审批");
    const before = await request.get(
      `/runtime/v1/threads/${thread.id}/terminal`,
      { headers },
    );
    expect(await before.json()).toEqual([]);
    const creation = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/threads/${thread.id}/terminal`) &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "确认打开终端", exact: true })
      .click();
    terminalId = (await (await creation).json()).id;
    expect(terminalId).toBeTruthy();
    await expect(page.locator(".xterm-screen")).toBeVisible();
    await page
      .getByLabel("终端输入", { exact: true })
      .fill("echo UI_PTY_OK; pwd");
    await page.getByRole("button", { name: "输入并回车", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(
                `/runtime/v1/threads/${thread.id}/terminal/${terminalId}`,
                { headers },
              )
            ).json()
          ).text,
      )
      .toContain("UI_PTY_OK");
    await page.screenshot({ path: "test-results/mobile-terminal.png" });
    const input = page.waitForRequest(
      (r) =>
        r.url().endsWith(`/terminal/${terminalId}/input`) &&
        r.postDataJSON().data === "\x03",
    );
    await page.getByRole("button", { name: "Ctrl+C", exact: true }).click();
    await input;
    await page
      .getByRole("button", { name: "关闭终端进程", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "打开终端", exact: true }),
    ).toBeVisible();
    const after = await request.get(
      `/runtime/v1/threads/${thread.id}/terminal`,
      { headers },
    );
    expect(await after.json()).toEqual([]);
    terminalId = "";
  } finally {
    if (terminalId)
      await request.delete(
        `/runtime/v1/threads/${thread.id}/terminal/${terminalId}`,
        { headers },
      );
    await request.delete(`/runtime/v1/threads/${thread.id}`, { headers });
    await rm(workspace, { recursive: true, force: true });
  }
});
