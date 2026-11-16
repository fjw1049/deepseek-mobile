import { navigate } from "./navigation";
import { test, expect } from "@playwright/test";
test("MCP structured configuration preserves unspecified secrets and saves without startup", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  let starts = 0;
  await page.route("**/v1/mobile-settings/mcp", (route) =>
    route.fulfill({
      json: {
        revision: "config-v1",
        servers: [
          {
            name: "docs",
            enabled: false,
            transport: "streamablehttp",
            url_origin: "https://docs.example.test",
            has_headers: true,
            has_env: false,
            args_count: 0,
            load_policy: "progressive",
          },
        ],
      },
    }),
  );
  await page.route("**/v1/mobile-settings/mcp/docs", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({
      json: { restart_required: true, revision: "config-v2", servers: [] },
    });
  });
  await page.route("**/v1/mcp/startup", (route) => {
    starts++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "设置");
  await page.getByRole("button", { name: "工具连接", exact: true }).click();
  await page.getByText("管理 MCP 配置", { exact: true }).click();
  await page.getByRole("button", { name: "编辑 docs", exact: true }).click();
  await page.getByLabel("配置为启用（重启 Runtime 时可能自动启动）").check();
  await expect(
    page.getByRole("button", { name: "确认保存 MCP 配置" }),
  ).toBeDisabled();
  await page.getByLabel("确认将这些设置保存到电脑").check();
  await page.getByRole("button", { name: "确认保存 MCP 配置" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    revision: "config-v1",
    confirm: true,
    enabled: true,
    transport: "streamablehttp",
    load_policy: "progressive",
  });
  expect(starts).toBe(0);
  await expect(
    page.getByRole("status").filter({ hasText: "MCP 配置已保存" }),
  ).toContainText("重启电脑 Runtime 后生效");
});
test("user skill document is readable and deletion requires explicit action", async ({
  page,
}) => {
  let removed = false;
  await page.route("**/v1/mobile-settings/skills", (route) =>
    route.fulfill({
      json: {
        skills: removed
          ? []
          : [
              {
                id: "sample",
                name: "Sample",
                description: "用户技能",
                can_delete: true,
                builtin: false,
              },
            ],
      },
    }),
  );
  await page.route("**/v1/mobile-settings/skills/sample", (route) => {
    if (route.request().method() === "DELETE") {
      expect(route.request().postDataJSON()).toEqual({ confirm: true });
      removed = true;
      return route.fulfill({ json: { message: "Uninstalled sample" } });
    }
    return route.fulfill({
      json: {
        id: "sample",
        name: "Sample",
        content: "# 技能说明\n\n先运行离线检查。",
      },
    });
  });
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "设置");
  await page.getByRole("button", { name: "技能", exact: true }).click();
  await page.getByText("管理电脑用户技能", { exact: true }).click();
  await page.getByRole("button", { name: "阅读 Sample" }).click();
  await expect(
    page.getByText("先运行离线检查。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除 Sample" }).click();
  expect(removed).toBe(false);
  await page.getByRole("button", { name: "确认删除技能" }).click();
  await expect.poll(() => removed).toBe(true);
});
