import { test, expect, type Page } from '@playwright/test';
async function connect(page: Page) {
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
}
async function chat(page: Page) {
  await connect(page);
  await page.getByRole('button', { name: '打开会话', exact: true }).click();
  await page.locator('.new-thread').click();
  await expect(page.getByLabel('消息', { exact: true })).toBeEnabled();
}
test('service readiness distinguishes unconfigured voice and refreshes without generation', async ({ page }) => {
  let configured = false, generations = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/turns')) generations++; });
  await page.route('**/v1/voice/status', r => r.fulfill({ json: { configured } }));
  await connect(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '连接信息', exact: true }).click();
  const status = page.getByRole('region', { name: '服务能力' });
  await expect(status).toContainText('语音尚未配置');
  configured = true;
  await status.getByRole('button', { name: '重新检查' }).click();
  await expect(status.locator('dl > div').filter({ hasText: '语音转写' })).toContainText('已配置');
  await page.route('**/v1/voice/status', r => r.fulfill({ status: 503, json: { detail: 'offline' } }));
  await status.getByRole('button', { name: '重新检查' }).click();
  await expect(status).toContainText('部分状态读取失败');
  await expect(status.locator('dl > div').filter({ hasText: '语音转写' })).toContainText('未能确认');
  expect(generations).toBe(0);
});
test('task settings explains modes and only affects explicitly sent messages', async ({ page }) => {
  let sends = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/turns')) sends++; });
  await chat(page);
  await page.getByRole('button', { name: '任务设置', exact: true }).click();
  await page.getByRole('combobox', { name: '运行模式', exact: true }).selectOption('ask');
  await expect(page.getByRole('dialog', { name: '任务设置' })).toContainText('下条消息生效。');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  expect(sends).toBe(0);
  await page.getByLabel('消息', { exact: true }).fill('普通问题');
  const sent = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/turns'));
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  expect((await sent).postDataJSON().mode).toBe('ask');
});
test('web keyboard reserves writing space and restores navigation on blur', async ({ page }) => {
  await chat(page);
  await page.getByLabel('消息', { exact: true }).focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: window.innerHeight - 300 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.getByRole('navigation', { name: '主导航', includeHidden: true })).toBeHidden();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await page.getByLabel('消息', { exact: true }).focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'scale', { configurable: true, value: 2 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
});

test('an ended event stream shows recovery and never replays the draft', async ({ page }) => {
  let reconnecting = false, writes = 0;
  await page.route('**/v1/threads/*/events?*', route => {
    reconnecting = true;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  });
  await page.route(/\/v1\/threads\/[^/?]+$/, route => {
    if (reconnecting && route.request().method() === 'GET') return route.fulfill({ status: 503, json: { detail: 'offline' } });
    return route.continue();
  });
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/turns')) writes++; });
  await chat(page);
  await page.getByLabel('消息', { exact: true }).fill('需要保留的草稿');
  await expect(page.getByRole('status', { name: '连接提示' })).toContainText('不会自动重发');
  reconnecting = false;
  await page.unroute('**/v1/threads/*/events?*');
  await page.getByRole('button', { name: '重新连接', exact: true }).click();
  await expect(page.getByRole('status', { name: '连接提示' })).toHaveCount(0);
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('需要保留的草稿');
  expect(writes).toBe(0);
});
