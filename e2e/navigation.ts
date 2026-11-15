import type { Page } from "@playwright/test";
export async function navigate(page: Page, name: string) {
  if (name === "新建会话") {
    const drawer = page.locator(".drawer");
    if (!(await drawer.isVisible())) await page.getByRole("button", { name: "打开会话", exact: true }).click();
    await drawer.getByRole("button", { name: "指定项目新建…", exact: true }).click();
    return;
  }
  const names: Record<string, string> = { 活动: "任务", 工作区: "项目" };
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: names[name] ?? name, exact: true }).click();
}
