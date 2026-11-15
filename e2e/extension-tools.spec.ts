import { navigate } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
async function settings(page: Page) {
  await page.goto("/");
  await page.getByText("高级连接（地址与令牌）", { exact: true }).click();
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台" }).click();
  await navigate(page, "设置");
}
test("plugin trust requires explicit permissions review and installation never auto-trusts", async ({
  page,
}) => {
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/v1/plugins", (route) =>
    route.fulfill({
      json: {
        plugins: [
          {
            name: "review-plugin",
            scope: "user",
            version: "1",
            description: "插件权限验收",
            enabled: false,
            trusted: false,
            permissions: ["process.execute"],
            components: { tools: ["review"] },
          },
        ],
      },
    }),
  );
  await page.route("**/v1/plugins/review-plugin/action", async (route) => {
    writes.push({ path: "action", body: route.request().postDataJSON() });
    await route.fulfill({ json: { message: "插件操作成功" } });
  });
  await page.route("**/v1/plugins/install", async (route) => {
    writes.push({ path: "install", body: route.request().postDataJSON() });
    await route.fulfill({ json: { outcome: "installed", message: "已安装" } });
  });
  await settings(page);
  await page.getByRole("button", { name: "插件", exact: true }).click();
  await page.getByRole("button", { name: "信任插件", exact: true }).click();
  const confirm = page.getByRole("region", { name: "确认扩展操作" });
  await expect(
    confirm.getByText("process.execute", { exact: true }),
  ).toBeVisible();
  await expect(
    confirm.getByRole("button", { name: "确认信任插件" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
  await confirm.getByLabel("我已查看上述范围并确认操作").check();
  await confirm.getByRole("button", { name: "确认信任插件" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ scope: "user", action: "trust" });
  await page.getByText("安装与检查插件", { exact: true }).click();
  await page.getByLabel("插件来源").fill("github:example/review-plugin");
  await page.getByRole("button", { name: "安装插件", exact: true }).click();
  await confirm.getByLabel("我已查看上述范围并确认操作").check();
  await confirm.getByRole("button", { name: "确认安装插件" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toEqual({
    spec: "github:example/review-plugin",
    scope: "user",
    trust: false,
  });
});
test("MCP tools use mounted legacy route and partial startup failures remain visible", async ({
  page,
}) => {
  await page.route("**/v1/mcp/servers", (route) =>
    route.fulfill({
      json: {
        ok: true,
        servers: [
          { name: "docs", status: "failed", enabled: true, transport: "stdio" },
        ],
      },
    }),
  );
  await page.route("**/legacy/apps/mcp/tools", (route) =>
    route.fulfill({
      json: {
        ok: true,
        tools: [
          {
            name: "read_docs",
            server: "docs",
            model_name: "docs__read_docs",
            description: "读取项目文档",
          },
        ],
      },
    }),
  );
  let starts = 0;
  await page.route("**/v1/mcp/startup", (route) => {
    starts++;
    return route.fulfill({
      json: {
        ok: false,
        error: "连接器启动失败",
        summary: {
          servers: [{ name: "docs", status: "failed", error: "进程未就绪" }],
        },
      },
    });
  });
  await settings(page);
  await page.getByRole("button", { name: "工具连接", exact: true }).click();
  await page.getByRole("button", { name: "读取 MCP 工具" }).click();
  await expect(page.getByText("读取项目文档", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "启动已配置的 MCP" }).click();
  expect(starts).toBe(0);
  const confirm = page.getByRole("region", { name: "确认扩展操作" });
  await confirm.getByLabel("我已查看上述范围并确认操作").check();
  await confirm.getByRole("button", { name: "确认启动 MCP 连接" }).click();
  await expect(page.getByRole("alert")).toContainText("连接器启动失败");
  expect(starts).toBe(1);
  await expect(
    page.getByText("docs：failed 进程未就绪", { exact: true }),
  ).toBeVisible();
});
