import type { Page } from "@playwright/test";
export async function navigate(page: Page, name: string) {
  const drawer = page.locator(".drawer");
  if (!(await drawer.isVisible()))
    await page.getByRole("button", { name: "打开会话", exact: true }).click();
  await drawer.getByRole("button", { name, exact: true }).click();
}
