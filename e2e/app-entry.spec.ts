import { test, expect } from '@playwright/test';
test('pairing first, advanced connection, direct new chat', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '配对并连接' })).toBeVisible();
  await expect(page.getByLabel('访问令牌', { exact: true })).toBeHidden();
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('button', { name: '打开会话' }).click();
  await page.locator('.new-thread').click();
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '新建会话' })).toHaveCount(0);
  await expect(page.locator('.chat-surface .preview-status')).toHaveCount(0);
});

test('writing space, failed send draft and restored conversation', async ({ page }) => {
  const connect = async () => {
    await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
    await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
    await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  };
  await page.goto('/');
  await connect();
  await page.getByRole('button', { name: '打开会话' }).click();
  await page.locator('.new-thread').click();
  const input = page.getByLabel('消息', { exact: true });
  await expect(input).toBeEnabled();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect((await input.boundingBox())!.width).toBeGreaterThan(width - 90);
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let sends = 0;
  await page.route('**/v1/threads/*/turns', route => {
    sends++;
    return route.fulfill({ status: 503, json: { detail: '电脑暂时不可用' } });
  });
  await input.fill('连接失败时保留我的消息');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('电脑暂时不可用');
  await expect(input).toHaveValue('连接失败时保留我的消息');
  expect(sends).toBe(1);
  await page.unroute('**/v1/threads/*/turns');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.locator('.assistant-message')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/app-polish-chat.png', fullPage: true });
  await page.reload();
  await connect();
  await expect(page.locator('.assistant-message')).toBeVisible();
  await expect(input).toBeEnabled();
});

test('pairing onboarding fits a small phone and advanced connection stays secondary', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '连接你的电脑' })).toBeVisible();
  await expect(page.getByLabel('设备名称', { exact: true })).toBeHidden();
  await expect(page.getByLabel('访问令牌', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/app-polish-onboarding.png', fullPage: true });
});
