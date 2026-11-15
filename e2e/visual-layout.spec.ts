import { test, expect } from '@playwright/test';

test('mobile navigation, settings hierarchy and full-width writing work across screen sizes', async ({ page, request }) => {
  const created = await request.post('/runtime/v1/threads', {
    headers: { Authorization: 'Bearer mobile-offline-test' },
    data: { title: '日常工作', mode: 'ask', model: 'deepseek-flash' },
  });
  const thread = await created.json();
  await page.goto('/');
  await page.getByText('高级连接（地址与令牌）', { exact: true }).click();
  await page.getByLabel('访问令牌', { exact: true }).fill('mobile-offline-test');
  await page.getByRole('button', { name: '连接工作台', exact: true }).click();
  await page.getByRole('button', { name: '打开会话', exact: true }).click();
  await page.getByRole('button', { name: /日常工作/ }).click();
  const tabs = page.getByRole('navigation', { name: '主导航' });
  await expect(tabs).toBeVisible();
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const input = page.getByLabel('消息', { exact: true });
    await expect(input).toBeEnabled();
    expect((await input.boundingBox())!.width).toBeGreaterThan(width - 90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(tabs.getByRole('button')).toHaveCount(4);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator('.chat-surface').boundingBox())!.x).toBe(0);
  await page.screenshot({ path: 'artifacts/apple-app/chat.png' });
  await tabs.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: '工具', exact: true }).click();
  await expect(page.getByRole('button', { name: '终端', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/apple-app/project-tools.png' });
  await tabs.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '技能', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '生成手机配对码' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/apple-app/settings.png' });
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.getByRole('region', { name: '本地通知设置' })).toBeVisible();
  await page.getByRole('button', { name: '‹ 返回设置' }).click();
  await page.getByLabel('外观', { exact: true }).selectOption('dark');
  await page.screenshot({ path: 'artifacts/apple-app/settings-dark.png' });
  await tabs.getByRole('button', { name: '对话', exact: true }).click();
  await page.locator('.model-chip').click();
  const model = page.getByRole('dialog', { name: '快速选择模型' });
  await expect(model).toBeVisible();
  await page.screenshot({ path: 'artifacts/apple-app/model-dark.png' });
  await model.getByRole('button', { name: '关闭', exact: true }).click();
  await page.route(`**/v1/threads/${thread.id}`, async route => {
    const response = await route.fetch();
    const detail = await response.json();
    detail.turns = [{ id: 'diff', input_summary: '更新项目说明', diff_snapshot: { complete: true, files: [{ path: 'README.md', additions: 1, deletions: 1, unified_diff: '-before\n+after' }] } }];
    await route.fulfill({ json: detail });
  });
  await page.getByRole('button', { name: '结果', exact: true }).click();
  await expect(page.getByLabel('README.md 差异')).toBeVisible();
  await expect.poll(async () => (await page.getByRole('dialog', { name: '执行结果' }).boundingBox())!.x).toBe(0);
  await page.screenshot({ path: 'artifacts/apple-app/results-dark.png' });
});
