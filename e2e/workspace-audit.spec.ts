import { test, expect, type Page } from "@playwright/test";
import { navigate } from "./navigation";
async function workspace(page: Page, tab: string) {
  await page.goto("/");
  await page.getByLabel("访问令牌").fill("mobile-offline-test");
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await navigate(page, "新建会话");
  await page.getByRole("button", { name: "创建会话", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "工作区");
  await page.getByRole("button", { name: tab, exact: true }).click();
}
test("partial Git changes show exact staged and unstaged layers; failed write closes stale confirmation", async ({
  page,
}) => {
  const scopes: string[] = [],
    writes: string[] = [];
  await page.route("**/git/changes", (r) =>
    r.fulfill({
      json: {
        files: [{ path: "partial.txt", stage: "partial", status: "modified" }],
        stagedFiles: [
          { path: "partial.txt", stage: "staged", status: "modified" },
        ],
      },
    }),
  );
  await page.route("**/git/branches", (r) =>
    r.fulfill({
      json: {
        currentBranch: "main",
        branches: [],
        ahead: 0,
        behind: 0,
        hasRemote: false,
      },
    }),
  );
  await page.route("**/git/diff?*", (r) => {
    const scope = new URL(r.request().url()).searchParams.get("scope")!;
    scopes.push(scope);
    return r.fulfill({
      json: { patch: scope === "staged" ? "+staged-only" : "-unstaged-only" },
    });
  });
  await page.route("**/git/commit", (r) => {
    writes.push(r.request().method());
    return r.fulfill({ status: 504, json: { detail: "Result unknown" } });
  });
  await workspace(page, "Git");
  await page
    .getByRole("button", { name: "查看已暂存差异", exact: true })
    .click();
  await expect(page.getByText("+staged-only", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "查看未暂存差异", exact: true })
    .click();
  await expect(page.getByText("-unstaged-only", { exact: true })).toBeVisible();
  expect(scopes).toEqual(["staged", "unstaged"]);
  await page.getByLabel("提交说明").fill("reviewed content");
  await page.getByRole("button", { name: "提交暂存区", exact: true }).click();
  await page
    .getByRole("button", { name: "确认提交暂存区", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/操作结果未确认/)).toBeVisible();
  expect(writes).toEqual(["POST"]);
});
test("terminal uncertain input pauses controls and explicit read-only reconnection never replays it", async ({
  page,
}) => {
  const inputs: string[] = [];
  await page.route("**/terminal", (r) =>
    r.fulfill({ json: [{ id: "audit-terminal", exited: false }] }),
  );
  await page.route("**/terminal/audit-terminal?*", (r) =>
    r.fulfill({
      json: { text: "", offset: 0, truncated: false, exited: false },
    }),
  );
  await page.route("**/terminal/audit-terminal/resize", (r) =>
    r.fulfill({ json: { resized: true } }),
  );
  await page.route("**/terminal/audit-terminal/input", (r) => {
    inputs.push(r.request().postDataJSON().data);
    return inputs.length === 1
      ? r.fulfill({ status: 503, json: { detail: "input delivery unknown" } })
      : r.fulfill({ json: { written: true } });
  });
  await workspace(page, "终端");
  await page.getByLabel("终端输入", { exact: true }).fill("do-once");
  await page.getByRole("button", { name: "输入并回车", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("后续输入已暂停");
  await expect(
    page.getByRole("button", { name: "输入并回车", exact: true }),
  ).toBeDisabled();
  expect(inputs).toEqual(["do-once\r"]);
  await page.getByRole("button", { name: "重新连接终端", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "输入并回车", exact: true }),
  ).toBeEnabled();
  expect(inputs).toEqual(["do-once\r"]);
  await page.getByLabel("终端输入", { exact: true }).fill("next-input");
  await page.getByRole("button", { name: "输入并回车", exact: true }).click();
  await expect.poll(() => inputs).toEqual(["do-once\r", "next-input\r"]);
});
