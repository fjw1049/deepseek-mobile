import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("mobile uses the real Runtime for chat, replay, interruption, questions and decisions", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("wrong-token");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await expect(page.getByText("想做点什么？")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-home.png" });
  await navigate(page, "新建会话");
  await page.getByLabel("会话名称").fill("手机真实 Runtime 联调");
  await page.getByRole("button", { name: "创建会话" }).click();
  await page
    .getByRole("textbox", { name: "消息", exact: true })
    .fill("手机连接测试");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".assistant-message")).toContainText(
    "Mobile connected",
    { timeout: 30000 },
  );
  await expect(page.getByRole("button", { name: "发送消息" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-chat.png" });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page
    .getByRole("textbox", { name: "消息", exact: true })
    .fill("追问测试");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("需要你的回答")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "提交回答" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/mobile-question.png" });
  await page.getByRole("button", { name: "先跑通 App", exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().includes("/user-inputs/") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提交回答" }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText("需要你的回答")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "发送消息" })).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByRole("textbox", { name: "消息", exact: true })
    .fill("停止测试");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByRole("button", { name: "发送消息" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "会话操作" }).click();
  await page.getByRole("button", { name: "重新同步" }).click();
  await expect(page.locator(".assistant-message").first()).toContainText(
    "Mobile connected",
  );
  await page.getByRole("button", { name: "打开会话" }).click();
  await page.getByRole("button", { name: /授权联调/ }).click();
  await expect(page.getByText("需要你的授权", { exact: true })).toBeVisible();
  await expect(page.getByText("请求扩大执行权限")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-approval.png" });
  await page.getByRole("button", { name: "允许本次", exact: true }).click();
  await expect(page.getByText("需要你的授权", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "拒绝提权" }).click();
  await expect(page.getByText("请求扩大执行权限")).toHaveCount(0);
  expect(
    JSON.parse(
      readFileSync("/tmp/deepseek-mobile-fixture-receipts.json", "utf8"),
    ),
  ).toEqual({ approval: true, elevation: false });
  await navigate(page, "活动");
  await expect(page.getByText("正在读取电脑数据…")).toHaveCount(0);
  await navigate(page, "设置");
  await expect(page.getByText("已连接工作台")).toBeVisible();
  expect(errors).toEqual([]);
  const unauthorized = await request.get("/runtime/v1/threads");
  expect(unauthorized.status()).toBe(401);
});
